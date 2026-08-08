const { EventEmitter } = require("node:events");
const { SerialPort } = require("serialport");

/**
 * Driver for the Omega HH42 thermocouple thermometer (HH40 series).
 *
 * Protocol reference: Omega manual M2031, "HH42 SERIAL INTERFACE OPERATION"
 * (pages 4-6). Summary of the parts that matter here:
 *
 *   - 9600 baud, 8 data bits, no parity, 1 stop bit.
 *   - RTS TRUE puts the meter into HOST mode; it answers with the prompt "> "
 *     (greater-than + space, with NO trailing CRLF).
 *   - Holding RTS FALSE for at least 600 ms and then raising it again makes the
 *     meter re-enter HOST mode. This is the ONLY way back to the prompt once
 *     the meter is streaming.
 *   - "T\r\n" at the prompt enters Output mode. The meter then emits a reading
 *     every 524 ms *on its own* - the command is not re-sent per reading.
 *   - "SC\r\n" / "SF\r\n" select Celsius / Fahrenheit, and are accepted in HOST
 *     mode only (i.e. at the prompt, not while streaming).
 *   - Readings are fixed-width, CRLF terminated, e.g. " 12.34 C", "-01.23 C",
 *     "223.34 F". Out-of-range readings come through as " L0. C" / " H1. C".
 */

const BAUD_RATE = 9600;

/** The meter emits one reading per this interval once in Output mode. */
const READING_INTERVAL_MS = 524;

/** Manual requires RTS held false for >= 600 ms to force a HOST mode re-entry. */
const RTS_RESET_MS = 700;

/** How long to wait for the "> " prompt before giving up on a command. */
const PROMPT_TIMEOUT_MS = 2000;

/**
 * After "T" is sent, wait this long for a reading before re-sending it, up to
 * FIRST_READING_ATTEMPTS times. The manual says one "T" is enough, and it is
 * once the link is settled - but a "T" issued while the meter is still coming
 * out of the RTS transition can be dropped, and a lone missed command looks
 * exactly like a dead cable.
 */
const FIRST_READING_STEP_MS = READING_INTERVAL_MS * 3;
const FIRST_READING_ATTEMPTS = 3;

/** No readings for this long while streaming means something went wrong. */
const STALL_TIMEOUT_MS = READING_INTERVAL_MS * 8;

/** Give up auto-recovery after this many consecutive stalls. */
const MAX_RECOVERY_ATTEMPTS = 3;

/** Guard against a runaway device filling memory with junk. */
const MAX_BUFFER_BYTES = 4096;

/**
 * A reading line, once the "> " prompt and surrounding whitespace are stripped.
 * Group 1 is the signed magnitude, group 2 the scale letter.
 */
const READING_RE = /^(-?\d+(?:\.\d+)?)\s*([CF])$/;

/** Out-of-range indications ("L0." = under range, "H1." = over range). */
const RANGE_RE = /^([LH])[0-9]?\.?\s*([CF])$/;

/** macOS dial-in device node, e.g. "/dev/tty.usbserial-1420". */
const MACOS_DIALIN_RE = /^\/dev\/tty\./;

/** USB-serial bridges commonly used with the HH42's DB9 cable. */
const KNOWN_ADAPTER_VENDOR_IDS = new Set([
  "0403", // FTDI
  "067b", // Prolific
  "10c4", // Silicon Labs CP210x
  "1a86", // QinHeng CH340/CH341
  "2341", // Arduino (some USB-serial cables enumerate this way)
]);

class HH42 extends EventEmitter {
  constructor() {
    super();
    this.port = null;
    this.portName = null;
    this.buffer = "";
    this.unit = "C";
    this.stallTimer = null;
    this.pendingPrompt = null;
    this.closing = false;
    this.recoveryAttempts = 0;
    // Serializes multi-step protocol exchanges. Each one toggles RTS and then
    // writes "T", so two running at once (a stall recovery landing on top of a
    // user's unit change) would interleave into a state neither expects.
    this.opChain = Promise.resolve();
  }

  /** Queue `fn` so protocol exchanges never overlap. */
  #exclusive(fn) {
    // `opChain` is always the error-swallowing tail, so one failed exchange
    // does not poison every exchange queued behind it.
    const result = this.opChain.then(fn);
    this.opChain = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  get isOpen() {
    return Boolean(this.port && this.port.isOpen);
  }

  /**
   * Open `portName` and start streaming readings.
   * Resolves once the port is open and the meter has acknowledged HOST mode.
   */
  async connect(portName) {
    await this.disconnect();

    this.closing = false;
    // A path saved by an older build, or typed by hand, can still be a macOS
    // dial-in node; normalise here too so it is fixed wherever it came from.
    this.portName = calloutPath(portName);
    this.buffer = "";

    this.port = new SerialPort({
      path: this.portName,
      baudRate: BAUD_RATE,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      // Open explicitly below so failures surface as a rejected promise rather
      // than an unobservable 'error' event.
      autoOpen: false,
    });

    this.port.on("data", (chunk) => this.#onData(chunk));
    this.port.on("error", (err) => this.#emitError(err));
    this.port.on("close", () => {
      this.#clearStallTimer();
      if (!this.closing) {
        this.emit("status", { state: "disconnected", port: this.portName });
      }
    });

    await new Promise((resolve, reject) => {
      this.port.open((err) => (err ? reject(err) : resolve()));
    });

    this.emit("status", { state: "connecting", port: this.portName });

    try {
      await this.#exclusive(async () => {
        const waiter = this.#firstReadingWaiter();
        // Pre-handled so it cannot surface as an unhandled rejection if an
        // earlier step throws before we get to await it.
        waiter.promise.catch(() => {});
        await this.#enterHostMode();
        await this.#startStreaming();
        await this.#awaitFirstReading(waiter);
      });
    } catch (error) {
      // Leave no half-open port behind: on Windows the COM port stays claimed
      // by this process until it is closed, which would block a retry.
      await this.disconnect();
      throw error;
    }

    this.recoveryAttempts = 0;
    this.emit("status", { state: "connected", port: this.portName, unit: this.unit });
  }

  async disconnect() {
    this.closing = true;
    this.#clearStallTimer();
    this.#rejectPendingPrompt(new Error("Port closed"));

    const port = this.port;
    this.port = null;
    this.portName = null;
    this.buffer = "";

    if (!port) return;
    port.removeAllListeners();
    if (port.isOpen) {
      await new Promise((resolve) => port.close(() => resolve()));
    }
  }

  /** Switch the meter to Celsius. Requires dropping out of Output mode first. */
  setCelsius() {
    return this.#setScale("SC", "C");
  }

  /** Switch the meter to Fahrenheit. */
  setFahrenheit() {
    return this.#setScale("SF", "F");
  }

  /**
   * List candidate serial ports. Returns every port rather than filtering to a
   * single vendor - HH42 cables ship with FTDI, Prolific, CP210x and CH340
   * bridges depending on vintage, and on Windows the manufacturer string is
   * often the driver vendor rather than the chip vendor.
   */
  static async listPorts() {
    const ports = await SerialPort.list();
    return ports.map((port) => {
      const path = calloutPath(port.path);
      return {
        path,
        label: HH42.#describePort(port, path),
        manufacturer: port.manufacturer || null,
        // A hint for the UI, not a filter.
        likely: KNOWN_ADAPTER_VENDOR_IDS.has((port.vendorId || "").toLowerCase()),
      };
    });
  }

  static #describePort(port, path) {
    // Windows reports a useful "USB Serial Port (COM3)" style name; other
    // platforms usually only have the manufacturer.
    const detail = port.friendlyName || port.manufacturer || port.pnpId;
    if (!detail || detail === path) return path;
    return `${path} - ${detail.replace(` (${port.path})`, "")}`;
  }

  // --- protocol -----------------------------------------------------------

  /**
   * Force a clean HOST mode entry: drop RTS for longer than the manual's 600 ms
   * minimum, raise it, and wait for the "> " prompt. Doing this on every
   * connect means we get a known state even if the meter was left streaming by
   * a previous session.
   *
   * A missing prompt is not treated as fatal. Some USB-serial cables sold for
   * the HH42 do not wire pin 7 (RTS), and a meter on such a cable simply stays
   * in HOST mode permanently - it still answers "T". The caller decides
   * whether the connection worked based on whether readings actually arrive.
   *
   * @returns {Promise<boolean>} whether the prompt was seen
   */
  async #enterHostMode() {
    const prompt = this.#waitForPrompt();
    await this.#setSignals({ rts: false, dtr: true });
    await delay(RTS_RESET_MS);
    await this.#setSignals({ rts: true, dtr: true });
    try {
      await prompt;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Start listening for the meter's first reading. Subscribed before "T" is
   * sent so a prompt reply cannot arrive before we are watching; the timeout
   * is applied separately by #awaitFirstReading so the clock measures from
   * when "T" actually went out, not from when the handshake began.
   */
  #firstReadingWaiter() {
    let settle;
    let settled = false;
    const promise = new Promise((resolve, reject) => {
      settle = (err) => {
        if (settled) return;
        settled = true;
        this.off("reading", onData);
        this.off("outOfRange", onData);
        if (err) reject(err);
        else resolve();
      };
    });
    const onData = () => settle(null);
    this.on("reading", onData);
    this.on("outOfRange", onData);

    return {
      promise,
      finish: (err) => settle(err),
      get settled() {
        return settled;
      },
    };
  }

  async #awaitFirstReading(waiter) {
    for (let attempt = 0; attempt < FIRST_READING_ATTEMPTS; attempt++) {
      await Promise.race([
        waiter.promise.then(
          () => {},
          () => {},
        ),
        delay(FIRST_READING_STEP_MS),
      ]);
      if (waiter.settled) break;
      if (attempt < FIRST_READING_ATTEMPTS - 1 && this.isOpen) {
        await this.#write("T\r\n");
      }
    }

    if (!waiter.settled) {
      waiter.finish(
        new Error(
          "No temperature data received. Check that the meter is switched on " +
            "(it powers off by itself after 10 minutes), that a probe is " +
            "fitted, and that this is the right port. Run `npm run diagnose` " +
            "to test each port directly.",
        ),
      );
    }
    return waiter.promise;
  }

  async #startStreaming() {
    // A single "T" puts the meter into Output mode; it then emits a reading
    // every 524 ms until RTS drops. Re-sending "T" on a timer (as an obvious
    // reading of the docs suggests) just injects bytes the meter ignores.
    await this.#write("T\r\n");
    this.#armStallTimer();
  }

  #setScale(command, unit) {
    if (!this.isOpen) {
      this.unit = unit;
      return Promise.resolve();
    }
    return this.#exclusive(async () => {
      if (!this.isOpen) return;
      // Scale commands are only accepted at the prompt, so leave Output mode.
      this.#clearStallTimer();
      await this.#enterHostMode();
      await this.#write(`${command}\r\n`);
      this.unit = unit;
      await this.#startStreaming();
      this.emit("status", { state: "connected", port: this.portName, unit });
    });
  }

  #onData(chunk) {
    this.buffer += chunk.toString("ascii");

    if (this.buffer.length > MAX_BUFFER_BYTES) {
      this.buffer = this.buffer.slice(-MAX_BUFFER_BYTES);
    }

    // The prompt is "> " with no CRLF, so it can only be detected inline.
    if (this.pendingPrompt && this.buffer.includes(">")) {
      this.buffer = this.buffer.slice(this.buffer.lastIndexOf(">") + 1);
      this.#resolvePendingPrompt();
    }

    const lines = this.buffer.split(/\r\n|\r|\n/);
    this.buffer = lines.pop();
    for (const line of lines) {
      this.#handleLine(line);
    }
  }

  /** A live reading means the link is healthy again. */
  #noteHealthy() {
    this.recoveryAttempts = 0;
    this.#armStallTimer();
  }

  #handleLine(rawLine) {
    const parsed = parseLine(rawLine);
    if (!parsed) return;

    this.unit = parsed.unit;
    this.#noteHealthy();

    if (parsed.type === "reading") {
      this.emit("reading", {
        value: parsed.value,
        unit: parsed.unit,
        timestamp: new Date().toISOString(),
      });
    } else {
      this.emit("outOfRange", { direction: parsed.direction, unit: parsed.unit });
    }
  }

  #armStallTimer() {
    this.#clearStallTimer();
    this.stallTimer = setTimeout(() => {
      if (this.recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
        // Stop retrying rather than emitting a stall warning every few seconds
        // for the rest of the session.
        this.emit("status", {
          state: "error",
          port: this.portName,
          message:
            "Lost contact with the meter. Check the cable and reconnect, or " +
            "select the port again to retry.",
        });
        return;
      }
      this.recoveryAttempts++;
      this.emit("status", {
        state: "stalled",
        port: this.portName,
        message: `No reading for ${STALL_TIMEOUT_MS} ms - reconnecting (attempt ${this.recoveryAttempts}/${MAX_RECOVERY_ATTEMPTS})`,
      });
      // Try to nudge the meter back into Output mode.
      this.#recover();
    }, STALL_TIMEOUT_MS);
  }

  #clearStallTimer() {
    if (this.stallTimer) {
      clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
  }

  #recover() {
    if (!this.isOpen) return Promise.resolve();
    return this.#exclusive(async () => {
      if (!this.isOpen) return;
      await this.#enterHostMode();
      await this.#startStreaming();
      this.emit("status", {
        state: "connected",
        port: this.portName,
        unit: this.unit,
      });
    }).catch((err) => this.#emitError(err));
  }

  #waitForPrompt() {
    this.#rejectPendingPrompt(new Error("Superseded by a newer request"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingPrompt = null;
        reject(
          new Error(
            "The meter did not respond. Check that it is powered on and that " +
              "the cable is connected to the correct port.",
          ),
        );
      }, PROMPT_TIMEOUT_MS);
      this.pendingPrompt = { resolve, reject, timer };
    });
  }

  #resolvePendingPrompt() {
    const pending = this.pendingPrompt;
    if (!pending) return;
    this.pendingPrompt = null;
    clearTimeout(pending.timer);
    pending.resolve();
  }

  #rejectPendingPrompt(err) {
    const pending = this.pendingPrompt;
    if (!pending) return;
    this.pendingPrompt = null;
    clearTimeout(pending.timer);
    pending.reject(err);
  }

  #setSignals(signals) {
    return new Promise((resolve, reject) => {
      if (!this.isOpen) return reject(new Error("Port is not open"));
      this.port.set(signals, (err) => (err ? reject(err) : resolve()));
    });
  }

  #write(data) {
    return new Promise((resolve, reject) => {
      if (!this.isOpen) return reject(new Error("Port is not open"));
      this.port.write(data, (err) => (err ? reject(err) : resolve()));
    });
  }

  #emitError(err) {
    this.emit("status", {
      state: "error",
      port: this.portName,
      message: err?.message || String(err),
    });
  }
}

/**
 * Parse one CRLF-delimited line from the meter.
 *
 * Exported so the frame formats in Table 3 of the manual can be tested without
 * hardware attached.
 *
 * @param {string} rawLine
 * @returns {{type:"reading", value:number, unit:"C"|"F"}
 *          |{type:"range", direction:"under"|"over", unit:"C"|"F"}
 *          |null} null for prompts, echoes and partial frames
 */
function parseLine(rawLine) {
  // A prompt emitted just before a reading leaves "> " glued to the front of
  // the line, so strip any leading prompt and padding.
  const line = String(rawLine).replace(/^[\s>]+/, "").trim();
  if (!line || line === "T") return null;

  const reading = READING_RE.exec(line);
  if (reading) {
    const value = Number.parseFloat(reading[1]);
    if (!Number.isFinite(value)) return null;
    return { type: "reading", value, unit: reading[2] };
  }

  const range = RANGE_RE.exec(line);
  if (range) {
    return {
      type: "range",
      direction: range[1] === "L" ? "under" : "over",
      unit: range[2],
    };
  }

  // Anything else is noise from a half-open frame; drop it silently.
  return null;
}

/**
 * Map a macOS dial-in device node to its callout twin: /dev/tty.X -> /dev/cu.X.
 *
 * macOS publishes two nodes per serial port. SerialPort.list() reports the
 * dial-in one because its IOKit query asks for kIODialinDeviceKey, but dial-in
 * nodes are for *answering* an incoming call: the tty layer holds the line
 * until DCD is asserted, and a meter on a 3-wire USB-serial cable never
 * asserts it. Apple's guidance is to use the callout node whenever the host
 * opens the connection - which is exactly what this driver does, and it is the
 * only node on which our RTS toggle (the meter's HOST-mode trigger) is
 * reliably ours to drive.
 *
 * No-op on Windows and Linux, whose paths never match.
 */
function calloutPath(portPath) {
  const text = String(portPath || "");
  return MACOS_DIALIN_RE.test(text) ? text.replace(MACOS_DIALIN_RE, "/dev/cu.") : text;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = HH42;
module.exports.parseLine = parseLine;
module.exports.calloutPath = calloutPath;
module.exports.READING_INTERVAL_MS = READING_INTERVAL_MS;
