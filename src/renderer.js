document.addEventListener('DOMContentLoaded', async () => {
    try {
        const portSelect = document.getElementById('portSelect');
        const ports = await window.API.getPorts();
        ports.forEach(port => {
            const option = document.createElement('option');
            option.value = port;
            option.textContent = port;
            portSelect.appendChild(option);
        });

        portSelect.addEventListener('change', async () => {
            console.log('port changed');
            await window.API.updatePort(portSelect.value);
            await window.API.onSerialData(onSerialData);
        });
        function onSerialData(data, unit) {
            return data;
        }
        portSelect.dispatchEvent(new Event('change'));


        document.getElementById('setFahrenheit').addEventListener('click', () => {
            console.log('set fahrenheit');
            window.API.setFahrenheitMode();
        });

        document.getElementById('setCelsius').addEventListener('click', () => {
            console.log('set celsius');
            window.API.setCelsiusMode();
        });

    } catch (error) {
        console.error('Error initializing OmegaHH42:', error);
    }
});
