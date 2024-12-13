document.addEventListener('DOMContentLoaded', async () => {
    try {
        const dbViewButton = document.getElementById('db-view-button');
        const dbTableButton = document.getElementById('db-table-button');
        const dbTableContainerModal = document.getElementById('db-table-container-modal');
        const dbTable = document.getElementById('db-table');
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

            // Save data to database
            window.API.saveTemperature({
                temperature: data,
                timestamp: new Date().toISOString()
            });

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
            // pull data from db
            const data = await window.API.getTemperatures();
            console.log(data);
            // dbTable.innerHTML = '';
            // data.forEach(row => {
            //     const tr = document.createElement('tr');
            //     tr.innerHTML = `<td>${row.temperature}</td><td>${row.timestamp}</td>`;
            //     dbTable.appendChild(tr);
            // });
        });

    } catch (error) {
        console.error('Error initializing OmegaHH42:', error);
    }
});
