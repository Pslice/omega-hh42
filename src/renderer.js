import { recordTemperature, getTemperatures } from './db.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const dbViewButton = document.getElementById('db-view-button');
        const dbTableButton = document.getElementById('db-table-button');

        const portSelect = document.getElementById('portSelect');
        const temperature = document.getElementById('temperature');
        const unit = document.getElementById('unit');
        const testButton = document.getElementById('test-button');
        const ports = await window.API.getPorts();
        testButton.addEventListener('click', () => {
            recordTemperature(100, 'C');
        });
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
            console.log('onSerialData', data);
            temperature.textContent = data;
            unit.textContent = '°C';

            return data;
        }
        portSelect.dispatchEvent(new Event('change'));

        const modal = document.getElementById('db-table-container-modal');
        const modalClose = document.getElementById('modal-close');

        dbViewButton.addEventListener('click', () => {
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.add('opacity-100');
            }, 10);
        });

        modalClose.addEventListener('click', () => {
            modal.classList.remove('opacity-100');
            setTimeout(() => {
                modal.classList.add('hidden');
            }, 300);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modalClose.click();
            }
        });

        dbTableButton.addEventListener('click', async () => {
            const data = await getTemperatures();
            console.log(data);
        });

    } catch (error) {
        console.error('Error initializing OmegaHH42:', error);
    }


});
