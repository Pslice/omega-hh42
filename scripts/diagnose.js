#!/usr/bin/env node
/**
 * HH42 serial link diagnostic.
 *
 *   npm run diagnose            test every serial port
 *   npm run diagnose -- COM4    test one port
 *
 * The app follows the procedure in manual M2031 exactly: raise RTS, wait for
 * the "> " prompt, send "T\r\n" once. If that produces nothing, the useful
 * question is which part of the chain is silent. This script tries several
 * strategies against each port and prints every byte received, so a working
 * strategy (or a total absence of bytes) is visible rather than inferred.
 */
const { SerialPort } = require("serialport");
// Same /dev/tty.* -> /dev/cu.* mapping the app applies, so the diagnostic
// tests the node the app will actually open rather than its dial-in twin.
const { calloutPath } = require("../src/device/hh42");

const BAUD = 9600;
const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));

/**
 * Each strategy is a sequence of steps run against a freshly opened port.
 * `listen` marks how long to keep collecting after the step.
 */
const STRATEGIES = [
  {
    name: "A: passive listen (RTS as opened)",
    why: "Detects a meter already streaming, and confirms the port receives anything at all.",
    steps: [{ listen: 3000 }],
  },
  {
    name: "B: RTS true, then T (documented procedure)",
    why: "What the app does. RTS true should yield '> ', then T starts the 524 ms stream.",
    steps: [
      { set: { rts: true, dtr: true }, listen: 1500 },
      { write: "T\r\n", listen: 3000 },
    ],
  },
  {
    name: "C: RTS false 700ms -> true -> T (forced host mode)",
    why: "Manual: hold RTS false >=600 ms then raise it to force a HOST mode re-entry.",
    steps: [
      { set: { rts: false, dtr: true }, listen: 800 },
      { set: { rts: true, dtr: true }, listen: 1500 },
      { write: "T\r\n", listen: 3000 },
    ],
  },
  {
    name: "D: RTS false (inverted polarity)",
    why: "Some USB-serial adapters and cables invert RTS; this tests the opposite sense.",
    steps: [
      { set: { rts: true, dtr: false }, listen: 500 },
      { set: { rts: false, dtr: false }, listen: 1500 },
      { write: "T\r\n", listen: 3000 },
    ],
  },
  {
    name: "E: RTS true, poll T every 524ms",
    why: "The original implementation re-sent T on a timer; proves whether polling matters.",
    steps: [
      { set: { rts: true, dtr: true }, listen: 500 },
      { poll: "T\r\n", every: 524, listen: 4000 },
    ],
  },
  {
    name: "F: RTS+DTR true, CR-only terminator",
    why: "Tests a meter or adapter that wants a bare CR instead of CRLF.",
    steps: [
      { set: { rts: true, dtr: true }, listen: 500 },
      { write: "T\r", listen: 3000 },
    ],
  },
];

const READING_RE = /^\s*>?\s*(-?\d+(?:\.\d+)?)\s*([CF])\s*$/;

function hex(buf) {
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join(" ");
}

function printable(buf) {
  return [...buf]
    .map((b) => (b === 13 ? "\\r" : b === 10 ? "\\n" : b >= 32 && b < 127 ? String.fromCharCode(b) : "."))
    .join("");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runStrategy(path, strategy) {
  const received = [];
  let port;

  try {
    port = new SerialPort({
      path,
      baudRate: BAUD,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      autoOpen: false,
    });
    await new Promise((res, rej) => port.open((e) => (e ? rej(e) : res())));
  } catch (err) {
    return { error: `could not open: ${err.message}` };
  }

  port.on("data", (chunk) => received.push(chunk));
  port.on("error", () => {});

  try {
    for (const step of strategy.steps) {
      if (step.set) {
        await new Promise((res, rej) => port.set(step.set, (e) => (e ? rej(e) : res())));
      }
      if (step.write) {
        await new Promise((res, rej) => port.write(step.write, (e) => (e ? rej(e) : res())));
      }
      if (step.poll) {
        const stop = Date.now() + step.listen;
        while (Date.now() < stop) {
          await new Promise((res) => port.write(step.poll, () => res()));
          await sleep(step.every);
        }
        continue;
      }
      if (step.listen) await sleep(step.listen);
    }
  } catch (err) {
    return { error: err.message, data: Buffer.concat(received) };
  } finally {
    await new Promise((res) => port.close(() => res()));
  }

  return { data: Buffer.concat(received) };
}

async function testPort(path) {
  console.log("\n" + "=".repeat(72));
  console.log(`PORT ${path}`);
  console.log("=".repeat(72));

  const working = [];

  for (const strategy of STRATEGIES) {
    process.stdout.write(`\n${strategy.name}\n  ${strategy.why}\n`);
    const { data, error } = await runStrategy(path, strategy);

    if (error) {
      console.log(`  RESULT: ERROR - ${error}`);
      if (!data || !data.length) continue;
    }
    if (!data || data.length === 0) {
      console.log("  RESULT: no bytes received");
      continue;
    }

    console.log(`  RESULT: ${data.length} bytes`);
    console.log(`  hex   : ${hex(data.subarray(0, 96))}${data.length > 96 ? " ..." : ""}`);
    console.log(`  ascii : "${printable(data.subarray(0, 160))}"`);

    const lines = data.toString("ascii").split(/\r\n|\r|\n/).filter((l) => l.trim());
    const readings = lines.filter((l) => READING_RE.test(l));
    const prompts = data.toString("ascii").split(">").length - 1;
    console.log(`  parsed: ${readings.length} reading(s), ${prompts} prompt char(s)`);
    if (readings.length) {
      console.log(`  sample: ${JSON.stringify(readings.slice(0, 3))}`);
      working.push(strategy.name);
    }
  }

  console.log("\n" + "-".repeat(72));
  if (working.length) {
    console.log(`VERDICT ${path}: readings received via -> ${working.join(", ")}`);
  } else {
    console.log(`VERDICT ${path}: no temperature readings from any strategy`);
  }
  return working.length > 0;
}

async function main() {
  const all = await SerialPort.list();

  console.log("Detected serial ports:");
  // Pad to the longest name present: "COM4" on Windows, but
  // "/dev/cu.usbserial-1420" on macOS, which an 8-column field left ragged.
  const width = Math.max(0, ...all.map((p) => calloutPath(p.path).length));
  for (const p of all) {
    console.log(
      `  ${calloutPath(p.path).padEnd(width)} vid=${p.vendorId || "-"} pid=${p.productId || "-"} ` +
        `mfr=${p.manufacturer || "-"} name=${p.friendlyName || "-"}`,
    );
  }
  if (!all.length) {
    console.log(
      process.platform === "darwin"
        ? "  (none) - check the USB-serial adapter's driver is loaded: `ls /dev/cu.*`"
        : "  (none) - check the USB-serial adapter driver in Device Manager",
    );
    return;
  }

  const targets = (args.length ? args : all.map((p) => p.path)).map(calloutPath);
  console.log(`\nTesting: ${targets.join(", ")}`);
  console.log("Make sure the meter is switched ON. It powers off after 10 minutes.");

  const good = [];
  for (const path of targets) {
    if (await testPort(path)) good.push(path);
  }

  console.log("\n" + "#".repeat(72));
  if (good.length) {
    console.log(`SUCCESS: the HH42 answered on ${good.join(", ")}.`);
    console.log("Select that port in the app.");
  } else {
    console.log("No port produced temperature readings. Things to check:");
    console.log("  1. Meter powered on? It auto-powers-off after 10 minutes (manual p3).");
    console.log("  2. Is a thermocouple probe fitted? Check the meter's own display.");
    console.log("  3. Any bytes at all above? Bytes but no readings = wrong baud or framing.");
    console.log("     No bytes on any strategy = wiring, wrong port, or a dead cable.");
    console.log("  4. Cable must be straight-through, not null-modem: meter pin 2 = RX to");
    console.log("     host, pin 3 = TX from host, pin 5 = GND, pin 7 = RTS from host.");
    console.log("  5. Close any other program holding the port (PuTTY, Device Manager).");
  }
  console.log("#".repeat(72));
}

main().catch((err) => {
  console.error("Diagnostic failed:", err);
  process.exit(1);
});
