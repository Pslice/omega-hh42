// Run with: npm test
//
// Frame formats are taken verbatim from Table 3 ("HOST PROTOCOL OF OPERATION")
// of Omega manual M2031, where 'b' denotes a space character.
const test = require("node:test");
const assert = require("node:assert/strict");

const { parseLine, calloutPath } = require("../src/device/hh42");
const { normalizeTimestamp } = require("../src/database");

test("parses the reading formats documented in Table 3", () => {
  // "b12.34bC" - positive value under 99.99, leading space
  assert.deepEqual(parseLine(" 12.34 C"), {
    type: "reading",
    value: 12.34,
    unit: "C",
  });

  // "-01.23bC" - negative values are preceded by "-"
  assert.deepEqual(parseLine("-01.23 C"), {
    type: "reading",
    value: -1.23,
    unit: "C",
  });

  // "223.34bF" - above 99.99 the leading space is replaced by a digit
  assert.deepEqual(parseLine("223.34 F"), {
    type: "reading",
    value: 223.34,
    unit: "F",
  });

  // "156.23bF" - Fahrenheit after an SF command
  assert.deepEqual(parseLine("156.23 F"), {
    type: "reading",
    value: 156.23,
    unit: "F",
  });
});

test("strips a leading '> ' prompt glued to a reading", () => {
  // The prompt carries no CRLF, so it lands at the head of the next frame.
  // Discarding the whole line here dropped the first reading after every
  // connect and every scale change.
  assert.deepEqual(parseLine(">  12.34 C"), {
    type: "reading",
    value: 12.34,
    unit: "C",
  });
  assert.deepEqual(parseLine("> -01.23 C"), {
    type: "reading",
    value: -1.23,
    unit: "C",
  });
});

test("reports out-of-range indications instead of dropping them", () => {
  // "bL0.bCcrlf" / "bH1.bCcrlf"
  assert.deepEqual(parseLine(" L0. C"), {
    type: "range",
    direction: "under",
    unit: "C",
  });
  assert.deepEqual(parseLine(" H1. C"), {
    type: "range",
    direction: "over",
    unit: "C",
  });
  assert.deepEqual(parseLine(" H1. F"), {
    type: "range",
    direction: "over",
    unit: "F",
  });
});

test("ignores prompts, echoes and partial frames", () => {
  for (const line of ["", "   ", ">", "> ", "T", "12.34", "garbage", "SC", "-"]) {
    assert.equal(parseLine(line), null, `expected null for ${JSON.stringify(line)}`);
  }
});

test("never mistakes a digit for the scale letter", () => {
  // The old parser took the last character of the line as the unit, so a frame
  // with no trailing letter yielded a unit of "4".
  const parsed = parseLine(" 12.34");
  assert.equal(parsed, null);
});

test("opens the macOS callout node, not the dial-in node", () => {
  // SerialPort.list() reports kIODialinDeviceKey, i.e. /dev/tty.*, whose open
  // waits on a carrier the meter's 3-wire cable never raises.
  assert.equal(calloutPath("/dev/tty.usbserial-1420"), "/dev/cu.usbserial-1420");
  assert.equal(calloutPath("/dev/tty.usbmodem14201"), "/dev/cu.usbmodem14201");

  // Already-callout paths and non-macOS names must pass through untouched.
  assert.equal(calloutPath("/dev/cu.usbserial-1420"), "/dev/cu.usbserial-1420");
  assert.equal(calloutPath("COM4"), "COM4");
  // Linux has no dot after "tty", so it must not be rewritten to /dev/cu.USB0.
  assert.equal(calloutPath("/dev/ttyUSB0"), "/dev/ttyUSB0");
  assert.equal(calloutPath("/dev/ttyS0"), "/dev/ttyS0");
  assert.equal(calloutPath("/dev/ttyACM0"), "/dev/ttyACM0");
});

test("normalizes legacy CURRENT_TIMESTAMP rows as UTC", () => {
  // SQLite's CURRENT_TIMESTAMP is UTC but carries no zone marker, so
  // `new Date(...)` in the renderer read it as local time.
  assert.equal(
    normalizeTimestamp("2026-08-07 20:45:49"),
    "2026-08-07T20:45:49.000Z",
  );
  assert.equal(
    normalizeTimestamp("2026-08-07T20:45:49.737Z"),
    "2026-08-07T20:45:49.737Z",
  );
  assert.equal(normalizeTimestamp(null), null);
  assert.equal(normalizeTimestamp("not a date"), null);
});
