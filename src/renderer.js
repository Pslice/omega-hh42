document.addEventListener('DOMContentLoaded', async () => {
    try {
        const portSelect = document.getElementById('portSelect');
        const temperature = document.getElementById('temperature');
        const unit = document.getElementById('unit');
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
        function onSerialData(data) {
            temperature.textContent = data;
            unit.textContent = '°C';
            return data;
        }
        portSelect.dispatchEvent(new Event('change'));


    } catch (error) {
        console.error('Error initializing OmegaHH42:', error);
    }
});
