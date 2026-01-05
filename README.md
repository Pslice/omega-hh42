# OmegaHH42

A desktop application for monitoring temperature readings from the Omega HH42 thermocouple thermometer.

![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Features

- **Real-time temperature display** - View live readings from your HH42 device
- **Temperature charting** - Visualize temperature trends over time
- **Data logging** - Automatically records readings to a local database
- **CSV export** - Export your data for analysis in Excel or other tools
- **Cross-platform** - Runs on Windows, macOS, and Linux

## Download

Download the latest release for your platform from the [Releases](https://github.com/Pslice/omega-hh42/releases) page:

| Platform | File |
|----------|------|
| Windows | `OmegaHH42 Setup x.x.x.exe` |
| macOS | `OmegaHH42-x.x.x.dmg` |
| Linux | `OmegaHH42-x.x.x.tar.gz` |

## Quick Start

1. Connect your Omega HH42 device via USB
2. Launch OmegaHH42
3. Select your device's COM port from the dropdown or use Simulate mode
4. Temperature readings will appear automatically

## Requirements

- Omega HH42 thermocouple thermometer
- USB cable for device connection
- Windows 10+, macOS 10.13+, or Linux

## macOS Security Note

Since the app is not signed with an Apple Developer certificate, you may need to right-click the app and select **Open**, then click **Open** in the security dialog.

## Building from Source

```bash
# Clone the repository
git clone https://github.com/Pslice/omega-hh42.git
cd omega-hh42

# Install dependencies
npm install

# Run in development mode
npm start

# Build for your platform
npm run dist:win    # Windows
npm run dist:mac    # macOS
npm run dist:linux  # Linux
```

## Getting Help

If you encounter issues or have questions, please [open an issue](https://github.com/Pslice/omega-hh42/issues) on GitHub.

## License

MIT
