const { SerialPort } = require('serialport');

class HH42 {
    constructor(mainWindow) {
        this.mainWindow = mainWindow;
        this.portTemperature = null;
        this.buffer = '';
        this.readingInterval = null;
    }

    initializeSerialPort(portName) {
        this.stopTemperatureReading();
        if (this.portTemperature && this.portTemperature.isOpen) {
            this.portTemperature.close();
        }
        this.portTemperature = new SerialPort({
            path: portName,
            baudRate: 9600,
            dataBits: 8,
            stopBits: 1,
            parity: 'none',
        }, false);

        this.portTemperature.on('data', (data) => {
            this.buffer += data.toString('ascii');
            this.processBuffer(data);
        });

        this.portTemperature.on('open', () => {
            console.log('Port opened successfully');
            this.enterHostMode();
            this.requestTemperatureReading();
        });

        this.portTemperature.on('error', (err) => {
            console.error('Feedback:', err.message);
            this.mainWindow.webContents.send('serialErrorTemperature', err.message);
        });

        this.portTemperature.open((err) => {
            if (err) {
                console.error('Error opening port:', err.message);
                this.mainWindow.webContents.send('serialErrorTemperature', err.message);
                return;
            }
            this.mainWindow.webContents.send('portOpenedTemperature', portName);
        });
    }

    processBuffer(data) {
        if (!this.portTemperature || !this.portTemperature.isOpen) {
            return;
        }

        try {
            let lines = this.buffer.split('\r\n');
            this.buffer = lines.pop();

            for (let line of lines) {
                line = line.trim();
                if (line === '>' || line === 'T') continue;
                if (/^[-\s]?\d+\.\d+\s?[CF]?$/.test(line)) {   // Check if the data is a valid temperature reading
                    let temperatureValue = parseFloat(line);
                    let unit = line.charAt(line.length - 1);

                    this.mainWindow.webContents.send('serialDataTemperature', temperatureValue, unit);
                }
            }
        } catch (error) {
            console.error('Error processing buffer:', error);
        }
    }

    enterHostMode() {
        if (this.portTemperature && this.portTemperature.isOpen) {
            this.portTemperature.set({ rts: true }); // Set RTS to TRUE to enter HOST mode
        }
    }

    requestTemperatureReading() {
        if (this.portTemperature && this.portTemperature.isOpen) {
            this.setOutputMode();
            this.readingInterval = setInterval(() => {
                this.setOutputMode();
            }, 524); // Send command every 524 ms as per HH42 documentation
        }
    }

    stopTemperatureReading() {
        if (this.readingInterval) {
            clearInterval(this.readingInterval);
            this.readingInterval = null;
        }
    }

    static async getAvailablePorts() {
        try {
            const ports = await SerialPort.list();
            return ports.filter(port => port.manufacturer === 'FTDI').map(port => port.path);
        } catch (err) {
            console.error('Error getting available ports:', err);
            return [];
        }
    }

    setOutputMode() {
        if (this.portTemperature && this.portTemperature.isOpen) {
            this.portTemperature.write('T\r\n');
        }
    }

    setFahrenheitMode() {
        if (this.portTemperature && this.portTemperature.isOpen) {
            this.portTemperature.write('SF\r\n');
        }
    }

    setCelsiusMode() {
        if (this.portTemperature && this.portTemperature.isOpen) {
            this.portTemperature.write('SC\r\n');
        }
    }
}

module.exports = HH42;