# OmegaHH42

A desktop application for monitoring temperature readings from the Omega HH42
thermocouple thermometer.

![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Features

- **Live temperature display** — readings straight from the HH42 over RS-232
- **Rolling chart** — a two-minute window plotted against wall-clock time
- **Optional data logging** — recording to a local SQLite database is off until
  you press **Start Logging**, and you choose how often a row is written
- **CSV export** — write the full log to a file you pick
- **Simulation mode** — exercise the UI with no hardware attached
- **Cross-platform** — Windows, macOS and Linux

## Quick Start

1. Connect the HH42 to the PC with its RS-232 cable (plus a USB-serial adapter
   if the machine has no DB9 port) and switch the meter on.
2. Launch OmegaHH42.
3. Pick the meter's port from the **Port** dropdown. Ports on a known
   USB-serial chipset are listed first. Choose **Simulate** to try the app
   without hardware.
4. Readings appear within a second or two, and the status dot turns green.
5. Press **Start Logging** to begin saving to the database, and **View Data**
   to browse or export what you have saved.

Temperature units are switched from **File → Temperature Units**. The change is
sent to the meter itself, so the meter's own display follows.

## Where your data lives

The SQLite database is stored in the per-user application data directory, not
next to the program:

| Platform | Path |
|----------|------|
| Windows  | `%APPDATA%\OmegaHH42\temperatures.db` |
| macOS    | `~/Library/Application Support/OmegaHH42/temperatures.db` |
| Linux    | `~/.config/OmegaHH42/temperatures.db` |

**File → Open Data Folder** opens it. It is preserved across upgrades and
uninstalls, so back it up before deleting the folder by hand.

## Requirements

- Omega HH42 (or another HH40-series meter using the same serial protocol)
- RS-232 cable, and a USB-serial adapter on machines without a DB9 port
- Windows 10+, macOS 11+, or a current Linux distribution

### A note on cables

The meter enters its host mode when the RS-232 **RTS** line (DB9 pin 7) goes
true. Cheap adapters and cables occasionally leave pin 7 unwired. The app
handles this: if the meter never sends its `>` prompt, it asks for a reading
anyway and only reports a failure if no data arrives at all.

The cable must be **straight-through, not null-modem**. Per Table 1 of the
manual the meter's DB9 female presents pin 2 as RX *to* the host, pin 3 as TX
*from* the host, pin 5 as ground and pin 7 as RTS from the host — the same
sense as a PC's port, so crossing TX/RX will break it.

### A note on macOS port names

macOS creates two device nodes per serial port: a dial-in node
(`/dev/tty.usbserial-1420`) and a callout node (`/dev/cu.usbserial-1420`). The
app always opens the **callout** node, and that is the name shown in the
**Port** dropdown. The dial-in node is for answering an incoming call — its
open waits for carrier detect, which a 3-wire cable to the meter never raises.
`SerialPort.list()` reports the dial-in name, so the app rewrites it.

## Troubleshooting: no readings

Run the built-in diagnostic. It opens each port at 9600 8N1, tries six
different RTS and command strategies, and prints every byte received as hex
and ASCII:

```bash
npm run diagnose                            # test every serial port
npm run diagnose -- COM4                    # one port, Windows
npm run diagnose -- /dev/cu.usbserial-1420  # one port, macOS
```

Read the output like this:

| What you see | What it means |
|---|---|
| Readings under some strategy | That port works — select it in the app |
| Bytes arrive, but no readings parse | Right port, wrong framing — check baud/parity |
| No bytes on any strategy, any port | Meter off, wrong port, bad cable, or RTS not wired |

Two things in the manual catch people out:

- **The meter switches itself off after 10 minutes** (manual p3, item 6), and
  the battery saver keeps running in host mode while a temperature is being
  displayed (p4). For long logging runs, move the internal **H1** jumper to
  pins 2–3 ("Manual Off") to disable auto power-off — see manual p10.
- **The H2 jumper can lock the meter to C-only or F-only** (p10). If it is
  fitted, the `SC`/`SF` commands and the app's unit menu will not change the
  scale.

Also make sure nothing else is holding the port open — PuTTY, a terminal
emulator, or a second copy of the app.

## Building from source

```bash
git clone https://github.com/Pslice/omega-hh42.git
cd omega-hh42
npm install

npm start          # run in development
npm test           # protocol + timestamp unit tests
npm run dist:win   # Windows installer  -> dist/
npm run dist:mac   # macOS dmg + zip    -> dist/
npm run dist:linux # AppImage + deb     -> dist/
```

### Cross-platform builds

`serialport` and `sqlite3` are native modules, so **each platform's installer
must be produced on that platform.** Running `npm run dist:mac` on Windows
produces a bundle containing Windows `.node` binaries, which fails at runtime
the moment the app touches the serial port or the database.

`.github/workflows/build.yml` builds all three on native GitHub Actions runners.
Push a `v*` tag, or trigger it manually from the Actions tab, and the installers
appear as workflow artifacts.

### macOS security note

The app is not signed with an Apple Developer certificate, so on first launch
right-click it and choose **Open**, then **Open** again in the dialog.

## Device protocol

The driver in `src/device/hh42.js` implements the interface documented in Omega
manual `M2031.pdf` (included in this repository), pages 4–6:

| | |
|---|---|
| Serial settings | 9600 baud, 8 data bits, no parity, 1 stop bit |
| Enter host mode | RTS true — meter replies with `> ` (no CRLF) |
| Return to host mode | hold RTS false ≥ 600 ms, then raise it |
| Start readings | `T\r\n` **once**; the meter then streams every 524 ms |
| Select Celsius | `SC\r\n`, accepted at the prompt only |
| Select Fahrenheit | `SF\r\n`, accepted at the prompt only |
| Reading frame | `␣12.34␣C`, `-01.23␣C`, `223.34␣F`, CRLF-terminated |
| Out of range | `␣L0.␣C` (under) / `␣H1.␣C` (over) |

## Getting Help

If you run into problems, please
[open an issue](https://github.com/Pslice/omega-hh42/issues).

## License

MIT
