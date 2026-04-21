// admin.js - исправленная версия
console.log('admin.js загружен');

// Глобальные переменные - объявляем только один раз
let allUsers = [];
let usersSearchTerm = '';
let trainingHistory = [];
let currentTrainingResults = null;

// Переменные для истории - другие имена, чтобы избежать конфликта
let adminHistorySearchTerms = {
    confirmed: '',
    unconfirmed: ''
};
let adminHistoryData = {
    confirmed: [],
    unconfirmed: []
};

// ============ ОСНОВНАЯ ФУНКЦИЯ ИНИЦИАЛИЗАЦИИ ============
window.initAdminPanel = async function() {
    console.log('>>> initAdminPanel вызвана');
    console.log('Текущий токен:', authToken ? 'есть' : 'нет');

    // Проверяем наличие токена
    if (!authToken) {
        const token = localStorage.getItem('token');
        if (token) {
            authToken = token;
            console.log('Токен восстановлен из localStorage');
        } else {
            console.error('Нет токена авторизации');
            return;
        }
    }

    const tabs = document.querySelectorAll('#admin-page .tab');
    console.log('Найдено табов:', tabs.length);

    tabs.forEach(tab => {
        tab.addEventListener('click', async () => {
            const tabId = tab.getAttribute('data-tab');
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            document.querySelectorAll('#admin-page .tab-content').forEach(content => {
                content.classList.remove('active');
            });

            if (tabId === 'history') {
                document.getElementById('admin-history-tab').classList.add('active');
                await loadAdminHistory();
            } else if (tabId === 'users') {
                document.getElementById('users-tab').classList.add('active');
                await loadUsers();
            } else if (tabId === 'data') {
                document.getElementById('data-tab').classList.add('active');
                await loadAdminData();
            } else if (tabId === 'train') {
                document.getElementById('train-tab').classList.add('active');
            }
        });
    });

    await loadAdminData();
    await loadUsers();
    await loadAdminHistory();
    setupFileUpload();

    const trainBtn = document.getElementById('train-btn');
    if (trainBtn) trainBtn.onclick = trainModel;

    const saveModelBtn = document.getElementById('save-model-btn');
    if (saveModelBtn) saveModelBtn.onclick = saveModelToHistory;

    loadTrainingHistory();
    const clearHistoryBtn = document.getElementById('clear-training-history');
    if (clearHistoryBtn) clearHistoryBtn.onclick = clearTrainingHistory;

    setupMethodTabs();

    const datasetSelect = document.getElementById('dataset-type');
    if (datasetSelect) {
        datasetSelect.onchange = function() {
            loadAdminData();
        };
    }

    console.log('>>> initAdminPanel завершена');
};

// ============ АВТОМАТИЧЕСКАЯ ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ ============
// Функция для проверки готовности и инициализации
function autoInitAdmin() {
    console.log('autoInitAdmin вызвана');
    // Проверяем, что мы на странице админа
    const adminPage = document.getElementById('admin-page');
    if (adminPage && adminPage.classList.contains('active')) {
        console.log('Страница админа активна, инициализируем...');
        if (typeof window.initAdminPanel === 'function') {
            window.initAdminPanel();
        } else {
            console.error('initAdminPanel все еще не определена');
        }
    }
}

// Ждем загрузки DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        console.log('DOMContentLoaded - проверка инициализации админа');
        // Небольшая задержка для загрузки других скриптов
        setTimeout(autoInitAdmin, 100);
    });
} else {
    console.log('DOM уже загружен');
    setTimeout(autoInitAdmin, 100);
}

// Также экспортируем функцию для вызова из app.js
window.forceInitAdmin = function() {
    console.log('forceInitAdmin вызвана принудительно');
    if (typeof window.initAdminPanel === 'function') {
        window.initAdminPanel();
    } else {
        console.error('initAdminPanel не определена');
    }
};

// ============ УПРАВЛЕНИЕ ДАННЫМИ ============
async function loadAdminData() {
    console.log('loadAdminData вызвана');
    const datasetType = document.getElementById('dataset-type')?.value || 'hepatitis';
    const container = document.getElementById('data-table-container');
    const statsContainer = document.getElementById('dataset-stats');
    const targetContainer = document.getElementById('target-distribution');
    const infoContainer = document.getElementById('dataset-info');

    if (container) container.innerHTML = '<div class="loading">Загрузка данных...</div>';
    if (statsContainer) statsContainer.innerHTML = '<div class="loading">Загрузка статистики...</div>';
    if (targetContainer) targetContainer.innerHTML = '<div class="loading">Загрузка графика...</div>';
    if (infoContainer) infoContainer.innerHTML = '<div class="loading">Загрузка информации...</div>';

    try {
        const response = await fetch(`${API_URL}/admin/dataset/${datasetType}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (container) {
            if (data.length === 0) {
                container.innerHTML = '<p>Нет данных. Загрузите CSV файл.</p>';
            } else {
                const columns = Object.keys(data[0]).filter(c => c !== 'id');
                let html = `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                        <h3>Данные датасета (${data.length} записей)</h3>
                        <button class="btn btn-success btn-sm" onclick="showAddRowModal()">Добавить строку</button>
                    </div>
                    <div style="overflow-x: auto; max-height: 400px;">
                        <table style="width:100%; font-size:12px;">
                            <thead style="position:sticky;top:0;background:#f0f2f5;">
                                <tr>${columns.map(c => `<th>${c}</th>`).join('')}<th>Действия</th></tr>
                            </thead>
                            <tbody>
                `;
                for (const row of data) {
                    html += '<tr>';
                    for (const col of columns) {
                        let val = row[col];
                        if (val === null || val === undefined) val = '-';
                        html += `<td>${String(val).substring(0, 30)}${String(val).length > 30 ? '...' : ''}</td>`;
                    }
                    html += `<td><button class="btn btn-warning btn-sm" onclick="editRow(${row.id})">Редактировать</button> <button class="btn btn-danger btn-sm" onclick="deleteRow(${row.id})">Удалить</button></td></tr>`;
                }
                html += `</tbody></table></div>`;
                container.innerHTML = html;
            }
        }

        if (infoContainer && data.length > 0) {
            const columns = Object.keys(data[0]).filter(c => c !== 'id');
            let missingCount = 0, totalCells = 0;
            for (const row of data) {
                for (const col of columns) {
                    totalCells++;
                    if (row[col] === null || row[col] === undefined || row[col] === '') missingCount++;
                }
            }
            const missingPercent = totalCells > 0 ? ((missingCount / totalCells) * 100).toFixed(1) : 0;
            infoContainer.innerHTML = `
                <div style="background: #e8ecf1; border-radius: 8px; padding: 15px; margin-top: 20px;">
                    <h4>Информация о датасете</h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px;">
                        <div><strong>Количество строк:</strong> ${data.length}</div>
                        <div><strong>Количество признаков:</strong> ${columns.length}</div>
                        <div><strong>Пропущенные значения:</strong> ${missingCount} (${missingPercent}%)</div>
                    </div>
                </div>
            `;
        }

        if (statsContainer && data.length > 0) {
            const columns = Object.keys(data[0]).filter(c => c !== 'id');
            let statsHtml = '<h3 style="margin-top: 20px;">Статистика признаков</h3><div style="overflow-x: auto;"><table style="width:100%; font-size:12px; border-collapse: collapse;">';
            statsHtml += `<thead><tr><th style="padding: 8px; border-bottom: 1px solid #ddd;">Признак</th><th style="padding: 8px; border-bottom: 1px solid #ddd;">Среднее</th><th style="padding: 8px; border-bottom: 1px solid #ddd;">Медиана</th><th style="padding: 8px; border-bottom: 1px solid #ddd;">Мин</th><th style="padding: 8px; border-bottom: 1px solid #ddd;">Макс</th></tr></thead><tbody>`;
            for (const col of columns) {
                const values = data.map(row => parseFloat(row[col])).filter(v => !isNaN(v));
                if (values.length > 0) {
                    const mean = values.reduce((a, b) => a + b, 0) / values.length;
                    const sorted = [...values].sort((a, b) => a - b);
                    const median = sorted[Math.floor(sorted.length / 2)];
                    const min = Math.min(...values);
                    const max = Math.max(...values);
                    statsHtml += `<tr><td style="padding: 8px;"><strong>${col}</strong></td><td style="padding: 8px;">${mean.toFixed(2)}</td><td style="padding: 8px;">${median.toFixed(2)}</td><td style="padding: 8px;">${min.toFixed(2)}</td><td style="padding: 8px;">${max.toFixed(2)}</td></tr>`;
                }
            }
            statsHtml += `</tbody></table></div>`;
            statsContainer.innerHTML = statsHtml;
        }

        if (targetContainer && data.length > 0) {
            let categoryCol = null;
            if (datasetType === 'hepatitis') {
                for (const key of Object.keys(data[0])) {
                    if (key.toLowerCase().includes('category')) {
                        categoryCol = key;
                        break;
                    }
                }
            } else if (datasetType === 'cirrhosis') {
                for (const key of Object.keys(data[0])) {
                    if (key.toLowerCase() === 'stage') {
                        categoryCol = key;
                        break;
                    }
                }
            }
            if (categoryCol) {
                const distribution = {};
                for (const row of data) {
                    let cat = row[categoryCol];
                    if (cat === null || cat === undefined) cat = 'Unknown';
                    let name = String(cat);
                    if (name.includes('=')) name = name.split('=')[1];
                    distribution[name] = (distribution[name] || 0) + 1;
                }
                const labels = Object.keys(distribution);
                const counts = labels.map(l => distribution[l]);
                const total = data.length;
                targetContainer.innerHTML = `<h4>Распределение целевой переменной</h4><canvas id="target-chart" style="max-height:300px;"></canvas><table style="margin-top:15px;"><thead><tr><th>Категория</th><th>Количество</th><th>Процент</th></tr></thead><tbody>${labels.map((l,i)=>`<tr><td>${l}</td><td>${counts[i]}</td><td>${((counts[i]/total)*100).toFixed(1)}%</td>`).join('')}</tbody></table></div>`;
                setTimeout(() => {
                    const canvas = document.getElementById('target-chart');
                    if (canvas && window.targetChart) window.targetChart.destroy();
                    if (canvas) {
                        window.targetChart = new Chart(canvas, {
                            type: 'bar',
                            data: { labels, datasets: [{ label: 'Количество', data: counts, backgroundColor: '#4a6a8a' }] },
                            options: { responsive: true, maintainAspectRatio: true, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
                        });
                    }
                }, 100);
            }
        }
    } catch (err) {
        console.error('Ошибка loadAdminData:', err);
        if (container) container.innerHTML = '<p style="color:red;">Ошибка загрузки данных</p>';
    }
}

function setupFileUpload() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    if (!dropzone) return;
    dropzone.onclick = () => fileInput.click();
    dropzone.ondrop = async (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) await uploadFile(file);
    };
    dropzone.ondragover = (e) => e.preventDefault();
    if (fileInput) {
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) await uploadFile(file);
            fileInput.value = '';
        };
    }
}

async function uploadFile(file) {
    const datasetType = document.getElementById('dataset-type')?.value || 'hepatitis';
    const formData = new FormData();
    formData.append('file', file);
    try {
        const response = await fetch(`${API_URL}/admin/upload-dataset/${datasetType}`, {
            method: 'POST', headers: { 'Authorization': `Bearer ${authToken}` }, body: formData
        });
        const result = await response.json();
        alert(result.message || 'Файл загружен');
        await loadAdminData();
    } catch (err) {
        alert('Ошибка: ' + err.message);
    }
}

// ============ ДОБАВЛЕНИЕ/РЕДАКТИРОВАНИЕ/УДАЛЕНИЕ СТРОК ============
window.showAddRowModal = async function() {
    const datasetType = document.getElementById('dataset-type')?.value || 'hepatitis';
    const response = await fetch(`${API_URL}/admin/dataset/${datasetType}`, { headers: { 'Authorization': `Bearer ${authToken}` } });
    const data = await response.json();
    if (!data || data.length === 0) { alert('Нет данных для определения структуры'); return; }
    const columns = Object.keys(data[0]).filter(c => c !== 'id');
    let formHtml = '<div style="max-height:400px;overflow-y:auto;">' + columns.map(col => `<div style="margin-bottom:10px;"><label>${col}</label><input type="text" id="input_${col}" style="width:100%;padding:8px;"></div>`).join('') + '</div>';
    const modalHtml = `<div id="add-row-modal" class="modal" style="display:flex;"><div class="modal-content"><h3>Добавить строку</h3>${formHtml}<div style="display:flex;gap:10px;margin-top:20px;"><button id="modal-submit" class="btn btn-primary">Добавить</button><button id="modal-cancel" class="btn btn-secondary">Отмена</button></div></div></div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('add-row-modal');
    document.getElementById('modal-submit').onclick = async () => {
        const newRow = {};
        for (const col of columns) {
            let val = document.getElementById(`input_${col}`).value;
            if (!isNaN(val) && val !== '') val = parseFloat(val);
            newRow[col] = val;
        }
        try {
            const res = await fetch(`${API_URL}/admin/dataset/${datasetType}/add`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                body: JSON.stringify(newRow)
            });
            if (res.ok) { alert('Строка добавлена'); modal.remove(); await loadAdminData(); }
            else alert('Ошибка');
        } catch (err) { alert('Ошибка: ' + err.message); }
    };
    document.getElementById('modal-cancel').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
};

window.editRow = async function(rowId) {
    const datasetType = document.getElementById('dataset-type')?.value || 'hepatitis';
    const res = await fetch(`${API_URL}/admin/dataset/${datasetType}`, { headers: { 'Authorization': `Bearer ${authToken}` } });
    const data = await res.json();
    const row = data.find(r => r.id === rowId);
    if (!row) { alert('Строка не найдена'); return; }
    const columns = Object.keys(row).filter(c => c !== 'id');
    let formHtml = '<div style="max-height:400px;overflow-y:auto;">' + columns.map(col => `<div style="margin-bottom:10px;"><label>${col}</label><input type="text" id="edit_${col}" value="${row[col] || ''}" style="width:100%;padding:8px;"></div>`).join('') + '</div>';
    const modalHtml = `<div id="edit-row-modal" class="modal" style="display:flex;"><div class="modal-content"><h3>Редактировать строку</h3>${formHtml}<div style="display:flex;gap:10px;margin-top:20px;"><button id="modal-submit" class="btn btn-primary">Сохранить</button><button id="modal-cancel" class="btn btn-secondary">Отмена</button></div></div></div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('edit-row-modal');
    document.getElementById('modal-submit').onclick = async () => {
        const updatedRow = {};
        for (const col of columns) {
            let val = document.getElementById(`edit_${col}`).value;
            if (!isNaN(val) && val !== '') val = parseFloat(val);
            updatedRow[col] = val;
        }
        try {
            const res2 = await fetch(`${API_URL}/admin/dataset/${datasetType}/${rowId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                body: JSON.stringify(updatedRow)
            });
            if (res2.ok) { alert('Строка обновлена'); modal.remove(); await loadAdminData(); }
            else alert('Ошибка');
        } catch (err) { alert('Ошибка: ' + err.message); }
    };
    document.getElementById('modal-cancel').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
};

window.deleteRow = async function(rowId) {
    if (!confirm('Удалить эту строку?')) return;
    const datasetType = document.getElementById('dataset-type')?.value || 'hepatitis';
    try {
        const res = await fetch(`${API_URL}/admin/dataset/${datasetType}/${rowId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${authToken}` } });
        if (res.ok) { alert('Строка удалена'); await loadAdminData(); }
        else alert('Ошибка');
    } catch (err) { alert('Ошибка: ' + err.message); }
};

// ============ ИСТОРИЯ ПРОГНОЗОВ (АДМИН) ==========
let adminHistoryDataObj = {
    liverConfirmed: [],
    liverUnconfirmed: [],
    cirrhosisConfirmed: [],
    cirrhosisUnconfirmed: []
};
let adminCurrentHistoryType = 'liver';
let adminCurrentHistoryStatus = 'confirmed';
let adminHistorySearchTerm = '';

// Загрузка истории для админа
async function loadAdminHistory() {
    const container = document.getElementById('admin-history-container');
    if (!container) return;

    container.innerHTML = '<div class="loading">Загрузка истории...</div>';

    try {
        const [confirmed, unconfirmed] = await Promise.all([
            fetch(`${API_URL}/history/confirmed`, { headers: { 'Authorization': `Bearer ${authToken}` } }).then(r => r.json()),
            fetch(`${API_URL}/history/unconfirmed`, { headers: { 'Authorization': `Bearer ${authToken}` } }).then(r => r.json())
        ]);

        adminHistoryDataObj = {
            liverConfirmed: (confirmed || []).filter(p => !p.cirrhosis_stage),
            liverUnconfirmed: (unconfirmed || []).filter(p => !p.cirrhosis_stage),
            cirrhosisConfirmed: (confirmed || []).filter(p => p.cirrhosis_stage),
            cirrhosisUnconfirmed: (unconfirmed || []).filter(p => p.cirrhosis_stage)
        };

        renderAdminHistoryTable();
        setupAdminHistoryFilters();
    } catch (err) {
        console.error(err);
        container.innerHTML = '<p>Ошибка загрузки истории</p>';
    }
}

// Рендер таблицы истории для админа
function renderAdminHistoryTable() {
    const container = document.getElementById('admin-history-container');
    if (!container) return;

    let dataKey = '';
    if (adminCurrentHistoryType === 'liver') {
        dataKey = adminCurrentHistoryStatus === 'confirmed' ? 'liverConfirmed' : 'liverUnconfirmed';
    } else {
        dataKey = adminCurrentHistoryStatus === 'confirmed' ? 'cirrhosisConfirmed' : 'cirrhosisUnconfirmed';
    }

    let data = adminHistoryDataObj[dataKey] || [];

    // Фильтрация по поиску
    if (adminHistorySearchTerm && adminHistorySearchTerm.trim()) {
        const searchId = parseInt(adminHistorySearchTerm);
        if (!isNaN(searchId)) {
            data = data.filter(item => item.id === searchId);
        }
    }

    const typeName = adminCurrentHistoryType === 'liver' ? 'Заболевания печени' : 'Стадии цирроза';
    const statusName = adminCurrentHistoryStatus === 'confirmed' ? 'Подтвержденные' : 'Неподтвержденные';

    if (data.length === 0) {
        container.innerHTML = `<p style="text-align:center; padding:40px;">Нет записей в разделе "${typeName} - ${statusName}"</p>`;
        return;
    }

    let html = `
        <div style="background: ${adminCurrentHistoryStatus === 'confirmed' ? '#e8f5e9' : '#fff3e0'}; border-radius: 12px; padding: 15px;">
            <h3 style="color: ${adminCurrentHistoryStatus === 'confirmed' ? '#2e7d32' : '#ed6c02'}; margin-bottom: 15px;">
                ${typeName} - ${statusName} (${data.length} записей)
            </h3>
            <div style="overflow-x: auto;">
                <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                    <thead style="position: sticky; top: 0; background: #f0f2f5;">
                        <tr>
                            <th style="padding: 10px;">ID</th>
                            <th style="padding: 10px;">Врач</th>
                            <th style="padding: 10px;">Диагноз</th>
                            <th style="padding: 10px;">Стадия</th>
                            <th style="padding: 10px;">XGBoost</th>
                            <th style="padding: 10px;">KNN</th>
                            <th style="padding: 10px;">Дата</th>
                            <th style="padding: 10px;">Детали</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    for (const item of data) {
        const date = item.created_at ? new Date(item.created_at).toLocaleString() : '-';
        const stage = item.cirrhosis_stage ? `ст.${item.cirrhosis_stage}` : '-';
        const xgbText = `${item.xgboost_prediction} (${(item.xgboost_confidence * 100).toFixed(1)}%)`;
        const knnText = `${item.knn_prediction} (${(item.knn_confidence * 100).toFixed(1)}%)`;
        const doctorInfo = `${item.user_role || 'doctor'} (ID: ${item.user_id})`;

        html += `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px;">${item.id}</td>
                <td style="padding: 10px;">${doctorInfo}</td>
                <td style="padding: 10px;">${item.diagnosis || '-'}${item.cirrhosis_stage ? ' (цирроз)' : ''}</td>
                <td style="padding: 10px; text-align: center;">${stage}</td>
                <td style="padding: 10px; text-align: center;">${xgbText}</td>
                <td style="padding: 10px; text-align: center;">${knnText}</td>
                <td style="padding: 10px;">${date}</td>
                <td style="padding: 10px; text-align: center;">
                    <button class="btn btn-info btn-sm" onclick="showAdminHistoryDetails(${item.id})">Подробнее</button>
                </td>
            </tr>
        `;
    }

    html += `
                    </tbody>
                </table>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

// Настройка фильтров для админа
function setupAdminHistoryFilters() {
    const typeSelect = document.getElementById('admin-history-type-select');
    const statusSelect = document.getElementById('admin-history-status-select');
    const searchInput = document.getElementById('admin-history-search-input');
    const searchBtn = document.getElementById('admin-history-search-btn');
    const resetBtn = document.getElementById('admin-history-reset-btn');
    const exportBtn = document.getElementById('admin-history-export-btn');

    if (typeSelect) {
        typeSelect.onchange = () => {
            adminCurrentHistoryType = typeSelect.value;
            adminHistorySearchTerm = '';
            if (searchInput) searchInput.value = '';
            renderAdminHistoryTable();
        };
    }

    if (statusSelect) {
        statusSelect.onchange = () => {
            adminCurrentHistoryStatus = statusSelect.value;
            adminHistorySearchTerm = '';
            if (searchInput) searchInput.value = '';
            renderAdminHistoryTable();
        };
    }

    if (searchBtn) {
        searchBtn.onclick = () => {
            adminHistorySearchTerm = searchInput?.value || '';
            renderAdminHistoryTable();
        };
    }

    if (resetBtn) {
        resetBtn.onclick = () => {
            adminHistorySearchTerm = '';
            if (searchInput) searchInput.value = '';
            renderAdminHistoryTable();
        };
    }

    if (searchInput) {
        searchInput.onkeypress = (e) => {
            if (e.key === 'Enter') {
                adminHistorySearchTerm = searchInput.value;
                renderAdminHistoryTable();
            }
        };
    }

    if (exportBtn) {
        exportBtn.onclick = () => exportAdminHistory();
    }
}

// Экспорт истории для админа
async function exportAdminHistory() {
    let dataKey = '';
    if (adminCurrentHistoryType === 'liver') {
        dataKey = adminCurrentHistoryStatus === 'confirmed' ? 'liverConfirmed' : 'liverUnconfirmed';
    } else {
        dataKey = adminCurrentHistoryStatus === 'confirmed' ? 'cirrhosisConfirmed' : 'cirrhosisUnconfirmed';
    }

    let data = adminHistoryDataObj[dataKey] || [];

    if (adminHistorySearchTerm && adminHistorySearchTerm.trim()) {
        const searchId = parseInt(adminHistorySearchTerm);
        if (!isNaN(searchId)) {
            data = data.filter(item => item.id === searchId);
        }
    }

    if (data.length === 0) {
        alert('Нет данных для экспорта');
        return;
    }

    const exportData = [];
    const typeName = adminCurrentHistoryType === 'liver' ? 'liver' : 'cirrhosis';
    const filename = `${typeName}_${adminCurrentHistoryStatus}_${new Date().toISOString().slice(0, 19)}.csv`;

    for (const item of data) {
        try {
            const response = await fetch(`${API_URL}/history/prediction/${item.id}`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (!response.ok) continue;

            const fullData = await response.json();
            let patientData = {};
            try {
                patientData = typeof fullData.patient_data === 'string'
                    ? JSON.parse(fullData.patient_data)
                    : (fullData.patient_data || {});
            } catch(e) {}

            if (adminCurrentHistoryType === 'liver') {
                const hepData = patientData.hepatitis_data || {};

                let category = '';
                if (fullData.diagnosis_category === 0) category = '0=Blood Donor';
                else if (fullData.diagnosis_category === 1) category = '0s=suspect Blood Donor';
                else if (fullData.diagnosis_category === 2) category = '1=Hepatitis';
                else if (fullData.diagnosis_category === 3) category = '2=Fibrosis';
                else if (fullData.diagnosis_category === 4) category = '3=Cirrhosis';

                exportData.push({
                    'Category': category,
                    'Age': hepData.Age !== undefined ? hepData.Age : '',
                    'Sex': hepData.Sex || '',
                    'ALB': hepData.ALB !== undefined ? hepData.ALB : '',
                    'ALP': hepData.ALP !== undefined ? hepData.ALP : '',
                    'ALT': hepData.ALT !== undefined ? hepData.ALT : '',
                    'AST': hepData.AST !== undefined ? hepData.AST : '',
                    'BIL': hepData.BIL !== undefined ? hepData.BIL : '',
                    'CHE': hepData.CHE !== undefined ? hepData.CHE : '',
                    'CHOL': hepData.CHOL !== undefined ? hepData.CHOL : '',
                    'CREA': hepData.CREA !== undefined ? hepData.CREA : '',
                    'GGT': hepData.GGT !== undefined ? hepData.GGT : '',
                    'PROT': hepData.PROT !== undefined ? hepData.PROT : ''
                });
            } else {
                const cirrhosisData = patientData.cirrhosis_data || {};
                exportData.push({
                    'Stage': fullData.cirrhosis_stage || '',
                    'N_Days': cirrhosisData.N_Days !== undefined ? cirrhosisData.N_Days : '',
                    'Status': cirrhosisData.Status || '',
                    'Drug': cirrhosisData.Drug || '',
                    'Ascites': cirrhosisData.Ascites || '',
                    'Hepatomegaly': cirrhosisData.Hepatomegaly || '',
                    'Spiders': cirrhosisData.Spiders || '',
                    'Edema': cirrhosisData.Edema || '',
                    'Copper': cirrhosisData.Copper !== undefined ? cirrhosisData.Copper : '',
                    'Alk_Phos': cirrhosisData.Alk_Phos !== undefined ? cirrhosisData.Alk_Phos : '',
                    'Tryglicerides': cirrhosisData.Tryglicerides !== undefined ? cirrhosisData.Tryglicerides : '',
                    'Platelets': cirrhosisData.Platelets !== undefined ? cirrhosisData.Platelets : '',
                    'Prothrombin': cirrhosisData.Prothrombin !== undefined ? cirrhosisData.Prothrombin : ''
                });
            }
        } catch(e) {
            console.error('Error fetching data for prediction', item.id, e);
        }
    }

    if (exportData.length === 0) {
        alert('Нет данных для экспорта');
        return;
    }

    const headers = Object.keys(exportData[0]);
    const rows = [headers.join(',')];
    for (const row of exportData) {
        const values = headers.map(header => {
            let val = row[header];
            if (val === undefined || val === null) val = '';
            return `"${String(val).replace(/"/g, '""')}"`;
        });
        rows.push(values.join(','));
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    alert(`Экспортировано ${exportData.length} записей в файл ${filename}`);
}

// Показать детали прогноза для админа
async function showAdminHistory() {
    await loadAdminHistory();
}

// Показать детали прогноза для админа (модальное окно)
window.showAdminHistoryDetails = async function(predictionId) {
    try {
        const response = await fetch(`${API_URL}/history/prediction/${predictionId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!response.ok) throw new Error('Ошибка загрузки');

        const prediction = await response.json();

        let patientData = {};
        try {
            patientData = typeof prediction.patient_data === 'string'
                ? JSON.parse(prediction.patient_data)
                : (prediction.patient_data || {});
        } catch(e) {}

        const hepData = patientData.hepatitis_data || {};
        const cirrhosisData = patientData.cirrhosis_data || {};

        let detailsHtml = `
            <div id="admin-details-modal" class="modal" style="display: flex;">
                <div class="modal-content" style="max-width: 700px; max-height: 80vh; overflow-y: auto;">
                    <h3>Детали прогноза #${prediction.id}</h3>
                    <p><strong>Диагноз:</strong> ${prediction.diagnosis}</p>
                    ${prediction.cirrhosis_stage ? `<p><strong>Стадия цирроза:</strong> ${prediction.cirrhosis_stage}</p>` : ''}
                    <p><strong>XGBoost:</strong> ${prediction.xgboost_prediction} (${(prediction.xgboost_confidence * 100).toFixed(1)}%)</p>
                    <p><strong>KNN:</strong> ${prediction.knn_prediction} (${(prediction.knn_confidence * 100).toFixed(1)}%)</p>
                    ${prediction.doctor_comment ? `<p><strong>Комментарий врача:</strong> ${prediction.doctor_comment}</p>` : ''}
                    <p><strong>Дата:</strong> ${new Date(prediction.created_at).toLocaleString()}</p>

                    <hr style="margin: 15px 0;">
                    <h4>Входные данные пациента:</h4>
                    <div style="overflow-x: auto;">
                        <table style="width:100%; font-size:12px; border-collapse:collapse;">
                            <thead>
                                <tr style="background:#f0f2f5;">
                                    <th style="padding:8px; border:1px solid #ddd;">Параметр</th>
                                    <th style="padding:8px; border:1px solid #ddd;">Значение</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr style="background:#e8ecf1;">
                                    <td colspan="2" style="padding:8px; border:1px solid #ddd;"><strong>Заболевания печени:</strong></td>
                                </tr>
                                ${renderAdminDataRow('Age', hepData.Age)}
                                ${renderAdminDataRow('Sex', hepData.Sex)}
                                ${renderAdminDataRow('ALB', hepData.ALB)}
                                ${renderAdminDataRow('ALP', hepData.ALP)}
                                ${renderAdminDataRow('ALT', hepData.ALT)}
                                ${renderAdminDataRow('AST', hepData.AST)}
                                ${renderAdminDataRow('BIL', hepData.BIL)}
                                ${renderAdminDataRow('CHE', hepData.CHE)}
                                ${renderAdminDataRow('CHOL', hepData.CHOL)}
                                ${renderAdminDataRow('CREA', hepData.CREA)}
                                ${renderAdminDataRow('GGT', hepData.GGT)}
                                ${renderAdminDataRow('PROT', hepData.PROT)}
        `;

        if (prediction.cirrhosis_stage || Object.keys(cirrhosisData).length > 0) {
            detailsHtml += `
                                <tr style="background:#e8ecf1;">
                                    <td colspan="2" style="padding:8px; border:1px solid #ddd;"><strong>Цирроз:</strong></td>
                                </tr>
                                ${renderAdminDataRow('N_Days', cirrhosisData.N_Days)}
                                ${renderAdminDataRow('Status', cirrhosisData.Status)}
                                ${renderAdminDataRow('Drug', cirrhosisData.Drug)}
                                ${renderAdminDataRow('Ascites', cirrhosisData.Ascites)}
                                ${renderAdminDataRow('Hepatomegaly', cirrhosisData.Hepatomegaly)}
                                ${renderAdminDataRow('Spiders', cirrhosisData.Spiders)}
                                ${renderAdminDataRow('Edema', cirrhosisData.Edema)}
                                ${renderAdminDataRow('Copper', cirrhosisData.Copper)}
                                ${renderAdminDataRow('Alk_Phos', cirrhosisData.Alk_Phos)}
                                ${renderAdminDataRow('Tryglicerides', cirrhosisData.Tryglicerides)}
                                ${renderAdminDataRow('Platelets', cirrhosisData.Platelets)}
                                ${renderAdminDataRow('Prothrombin', cirrhosisData.Prothrombin)}
            `;
        }

        detailsHtml += `
                            </tbody>
                        </table>
                    </div>
                    <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
                        <button onclick="closeAdminHistoryModal()" class="btn btn-primary">Закрыть</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', detailsHtml);
    } catch(e) {
        console.error('Error loading prediction details:', e);
        alert('Ошибка загрузки деталей прогноза');
    }
};

function renderAdminDataRow(label, value) {
    const displayValue = (value !== undefined && value !== null && value !== '') ? value : '-';
    return `
        <tr>
            <td style="padding:6px; border:1px solid #ddd;">${label}:</td>
            <td style="padding:6px; border:1px solid #ddd;">${displayValue}</td>
        </tr>
    `;
}

function closeAdminHistoryModal() {
    const modal = document.getElementById('admin-details-modal');
    if (modal) modal.remove();
}

// ============ ОБУЧЕНИЕ МОДЕЛЕЙ ============
async function trainModel() {
    const datasetType = document.getElementById('train-dataset-type')?.value;
    const methodXGB = document.getElementById('train-method-xgb')?.checked;
    const methodKNN = document.getElementById('train-method-knn')?.checked;
    if (!datasetType) { alert('Выберите датасет'); return; }
    const methods = [];
    if (methodXGB) methods.push('xgboost');
    if (methodKNN) methods.push('knn');
    if (methods.length === 0) { alert('Выберите метод обучения'); return; }
    const trainBtn = document.getElementById('train-btn');
    const originalText = trainBtn.textContent;
    trainBtn.textContent = 'Обучение...';
    trainBtn.disabled = true;
    const container = document.getElementById('training-results');
    container.innerHTML = '<div class="loading">Обучение модели...</div>';
    try {
        const response = await fetch(`${API_URL}/admin/train`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ dataset_type: datasetType, methods: methods })
        });
        if (!response.ok) { const error = await response.json(); throw new Error(error.detail || 'Ошибка обучения'); }
        const result = await response.json();
        currentTrainingResults = result;
        displayTrainingResults(result);
        document.getElementById('save-model-btn').style.display = 'inline-block';
    } catch (err) {
        container.innerHTML = `<div style="background:#ffebee;padding:15px;color:red;"><h4>Ошибка</h4><p>${err.message}</p></div>`;
        alert('Ошибка: ' + err.message);
    } finally {
        trainBtn.textContent = originalText;
        trainBtn.disabled = false;
    }
}

function displayTrainingResults(result) {
    const container = document.getElementById('training-results');
    if (!container) return;

    const datasetName = result.dataset_type === 'hepatitis' ? 'Гепатит C' : 'Цирроз печени';
    const methods = result.methods;

    let html = `
        <div style="margin-top: 25px; padding: 20px; background: linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%); border-radius: 12px;">
            <h3 style="color: #2c3e76; margin-bottom: 15px;">Результаты обучения</h3>
            <p><strong>Датасет:</strong> ${datasetName}</p>
            <p><strong>Количество образцов:</strong> ${result.samples}</p>
            <p><strong>Классы:</strong> ${result.class_names.join(', ')}</p>
    `;

    for (const [methodName, metrics] of Object.entries(methods)) {
        const methodTitle = methodName === 'xgboost' ? 'XGBoost' : 'KNN';
        html += `
            <div style="background: white; border-radius: 10px; padding: 15px; margin-top: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <h4 style="color: #4a6a8a; margin-bottom: 15px; border-bottom: 2px solid #4a6a8a; padding-bottom: 8px;">${methodTitle}</h4>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 15px;">
                    <div><strong>Accuracy:</strong></div><div style="color: #2e7d32;">${(metrics.accuracy * 100).toFixed(2)}%</div>
                    <div><strong>Precision:</strong></div><div>${(metrics.precision * 100).toFixed(2)}%</div>
                    <div><strong>Recall:</strong></div><div>${(metrics.recall * 100).toFixed(2)}%</div>
                    <div><strong>F1-score:</strong></div><div>${(metrics.f1 * 100).toFixed(2)}%</div>
                    <div><strong>ROC-AUC:</strong></div><div>${(metrics.roc_auc * 100).toFixed(2)}%</div>
                </div>
                <h5 style="margin-top: 15px; margin-bottom: 10px;">Матрица ошибок:</h5>
                ${renderConfusionMatrix(metrics.confusion_matrix, result.class_names)}
            </div>
        `;
    }

    html += `</div>`;
    container.innerHTML = html;
}

function renderConfusionMatrix(matrix, classNames) {
    if (!matrix || !matrix.length) return '<p>Нет данных для матрицы ошибок</p>';

    let html = '<div style="overflow-x: auto; margin-top: 10px;">';
    html += '<table style="border-collapse: collapse; margin: 0 auto; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">';

    // Заголовок
    html += '<thead>';
    html += '<tr>';
    html += '<th style="padding: 10px; border: 1px solid #ddd; background: #4a6a8a; color: white;">Факт \\ Прогноз</th>';
    for (let j = 0; j < matrix[0].length; j++) {
        const className = classNames && classNames[j] ? classNames[j] : `Класс ${j}`;
        html += `<th style="padding: 10px; border: 1px solid #ddd; text-align: center; background: #4a6a8a; color: white;">${className}</th>`;
    }
    html += '</tr>';
    html += '</thead>';

    // Тело таблицы
    html += '<tbody>';
    for (let i = 0; i < matrix.length; i++) {
        const className = classNames && classNames[i] ? classNames[i] : `Класс ${i}`;
        html += '<tr>';
        html += `<th style="padding: 10px; border: 1px solid #ddd; background: #e8ecf1;">${className}</th>`;
        for (let j = 0; j < matrix[i].length; j++) {
            const isCorrect = (i === j);
            const bgColor = isCorrect ? 'background: #c8e6c9;' : 'background: #ffebee;';
            html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: center; ${bgColor} font-weight: bold;">${matrix[i][j]}${isCorrect ? '' : ''}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody>';
    html += '</table>';
    html += '</div>';

    return html;
}

function saveModelToHistory() {
    if (!currentTrainingResults) { alert('Сначала обучите модель'); return; }
    for (const [methodName, metrics] of Object.entries(currentTrainingResults.methods)) {
        addTrainingRecord({
            model_type: currentTrainingResults.dataset_type,
            dataset_name: currentTrainingResults.dataset_type === 'hepatitis' ? 'Гепатит C' : 'Цирроз печени',
            method_name: methodName === 'xgboost' ? 'XGBoost' : 'KNN',
            samples: currentTrainingResults.samples,
            accuracy: metrics.accuracy,
            precision: metrics.precision,
            recall: metrics.recall,
            f1: metrics.f1,
            roc_auc: metrics.roc_auc
        });
    }
    alert('Модели сохранены в историю');
    document.getElementById('save-model-btn').style.display = 'none';
}

// ============ ИСТОРИЯ ОБУЧЕНИЯ ============
function loadTrainingHistory() {
    const saved = localStorage.getItem('training_history');
    trainingHistory = saved ? JSON.parse(saved) : [];
    renderTrainingHistory();
}

function saveTrainingHistoryToStorage() {
    localStorage.setItem('training_history', JSON.stringify(trainingHistory));
}

function addTrainingRecord(record) {
    trainingHistory.unshift({ ...record, id: Date.now(), timestamp: new Date().toISOString() });
    saveTrainingHistoryToStorage();
    renderTrainingHistory();
}

function renderTrainingHistory() {
    const container = document.getElementById('training-history-container');
    if (!container) return;

    if (trainingHistory.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px; color:#666;">История обучения пуста</p>';
        return;
    }

    let html = `
        <div style="overflow-x: auto;">
            <table style="width:100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="background: #f0f2f5; border-bottom: 2px solid #ddd;">
                        <th style="padding: 10px; text-align: left;">Дата</th>
                        <th style="padding: 10px; text-align: left;">Датасет</th>
                        <th style="padding: 10px; text-align: left;">Метод</th>
                        <th style="padding: 10px; text-align: center;">Образцов</th>
                        <th style="padding: 10px; text-align: center;">Accuracy</th>
                        <th style="padding: 10px; text-align: center;">Precision</th>
                        <th style="padding: 10px; text-align: center;">Recall</th>
                        <th style="padding: 10px; text-align: center;">F1</th>
                        <th style="padding: 10px; text-align: center;">ROC-AUC</th>
                        <th style="padding: 10px; text-align: center;">Действия</th>
                    </tr>
                </thead>
                <tbody>
    `;

    for (const r of trainingHistory) {
        const date = new Date(r.timestamp).toLocaleString();
        const accuracyColor = r.accuracy > 0.8 ? '#2e7d32' : (r.accuracy > 0.6 ? '#ed6c02' : '#c62828');

        html += `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px;">${date}</td>
                <td style="padding: 8px;">${r.dataset_name}</td>
                <td style="padding: 8px;">${r.method_name}</td>
                <td style="padding: 8px; text-align: center;">${r.samples}</td>
                <td style="padding: 8px; text-align: center; color: ${accuracyColor}; font-weight: bold;">${(r.accuracy * 100).toFixed(2)}%</td>
                <td style="padding: 8px; text-align: center;">${(r.precision * 100).toFixed(2)}%</td>
                <td style="padding: 8px; text-align: center;">${(r.recall * 100).toFixed(2)}%</td>
                <td style="padding: 8px; text-align: center;">${(r.f1 * 100).toFixed(2)}%</td>
                <td style="padding: 8px; text-align: center;">${(r.roc_auc * 100).toFixed(2)}%</td>
                <td style="padding: 8px; text-align: center;">
                    <button onclick="window.deleteTrainingRecord(${r.id})" style="padding: 4px 10px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">Удалить</button>
                </td>
            </tr>
        `;
    }

    html += `
                </tbody>
            </table>
        </div>
    `;
    container.innerHTML = html;
}

window.deleteTrainingRecord = function(id) {
    trainingHistory = trainingHistory.filter(r => r.id !== id);
    saveTrainingHistoryToStorage();
    renderTrainingHistory();
};

function clearTrainingHistory() {
    if (confirm('Очистить историю?')) {
        trainingHistory = [];
        saveTrainingHistoryToStorage();
        renderTrainingHistory();
    }
}

// ============ УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ ============
async function loadUsers() {
    const container = document.getElementById('users-table-container');
    if (!container) {
        console.error('users-table-container не найден');
        return;
    }

    container.innerHTML = '<div class="loading">Загрузка пользователей...</div>';

    try {
        if (!authToken) {
            const token = localStorage.getItem('token');
            if (token) {
                authToken = token;
            } else {
                throw new Error('Нет токена авторизации');
            }
        }

        const response = await fetch(`${API_URL}/admin/users`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Сессия истекла');
            }
            throw new Error('Ошибка загрузки');
        }

        allUsers = await response.json();
        console.log('Загружено пользователей:', allUsers.length);
        renderUsersTable();
    } catch (err) {
        console.error('Ошибка загрузки пользователей:', err);
        container.innerHTML = `<p style="color: red;">Ошибка загрузки пользователей: ${err.message}</p>`;
        if (err.message === 'Сессия истекла') {
            if (typeof handleLogout === 'function') handleLogout();
        }
    }
}

function renderUsersTable() {
    const container = document.getElementById('users-table-container');
    if (!container) return;

    let filteredUsers = [...allUsers];
    if (usersSearchTerm && usersSearchTerm.trim() !== '') {
        const searchLower = usersSearchTerm.toLowerCase().trim();
        filteredUsers = allUsers.filter(user =>
            user.username.toLowerCase().includes(searchLower) ||
            (user.full_name && user.full_name.toLowerCase().includes(searchLower))
        );
    }

    let html = `
        <div style="margin-bottom: 15px; display: flex; gap: 10px; align-items: center;">
            <input type="text" id="users-search" placeholder="Поиск по логину или ФИО..."
                   style="flex: 1; padding: 8px; border: 1px solid #d0d0d0; border-radius: 6px;">
            <button id="search-btn" class="btn btn-primary" style="padding: 8px 16px;">Найти</button>
            <button id="reset-search-btn" class="btn btn-secondary" style="padding: 8px 16px;">Сброс</button>
        </div>
    `;

    if (filteredUsers.length === 0 && usersSearchTerm) {
        html += `<p style="text-align:center; padding:20px;">По запросу "${usersSearchTerm}" ничего не найдено</p>`;
        html += `<button class="btn btn-success" onclick="window.showAddUserModal()">Добавить пользователя</button>`;
        container.innerHTML = html;
        setupUsersSearch();
        return;
    }

    if (filteredUsers.length === 0 && !usersSearchTerm) {
        html += `<p style="text-align:center; padding:20px;">Нет пользователей</p>`;
        html += `<button class="btn btn-success" onclick="window.showAddUserModal()">Добавить пользователя</button>`;
        container.innerHTML = html;
        setupUsersSearch();
        return;
    }

    html += `
        <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f0f2f5; border-bottom: 1px solid #ddd;">
                        <th style="padding: 10px; text-align: left;">ID</th>
                        <th style="padding: 10px; text-align: left;">Логин</th>
                        <th style="padding: 10px; text-align: left;">Роль</th>
                        <th style="padding: 10px; text-align: left;">ФИО</th>
                        <th style="padding: 10px; text-align: left;">Статус</th>
                        <th style="padding: 10px; text-align: left;">Дата создания</th>
                        <th style="padding: 10px; text-align: left;">Действия</th>
                    </tr>
                </thead>
                <tbody>
    `;

    for (const user of filteredUsers) {
        const date = user.created_at ? new Date(user.created_at).toLocaleString() : '-';
        const roleName = user.role === 'admin' ? 'Администратор' : 'Врач';
        const isActive = user.is_active !== false;
        const status = isActive ? 'Активен' : 'Заблокирован';
        const statusColor = isActive ? '#5a8a6a' : '#9a5a5a';

        html += `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px;">${user.id}${!isActive ? ' (заблокирован)' : ''}</td>
                <td style="padding: 8px;">${user.username}${!isActive ? '' : ''}</td>
                <td style="padding: 8px;">${roleName}</td>
                <td style="padding: 8px;">${user.full_name || '-'}</td>
                <td style="padding: 8px; color: ${statusColor};">${status}</td>
                <td style="padding: 8px;">${date}</td>
                <td style="padding: 8px;">
                    <button onclick="window.editUser(${user.id})" class="btn btn-warning btn-sm" style="margin-right: 5px;">Редактировать</button>
                    ${isActive ?
                        `<button onclick="window.blockUser(${user.id})" class="btn btn-secondary btn-sm" style="margin-right: 5px;">Блокировать</button>` :
                        `<button onclick="window.unblockUser(${user.id})" class="btn btn-success btn-sm" style="margin-right: 5px;">Разблокировать</button>`
                    }
                    <button onclick="window.deleteUser(${user.id})" class="btn btn-danger btn-sm">Удалить</button>
                </td>
            </tr>
        `;
    }

    html += `
                </tbody>
            </table>
        </div>
        <button class="btn btn-success" style="margin-top: 15px;" onclick="window.showAddUserModal()">Добавить пользователя</button>
    `;

    container.innerHTML = html;
    setupUsersSearch();
}

function setupUsersSearch() {
    const searchInput = document.getElementById('users-search');
    const searchBtn = document.getElementById('search-btn');
    const resetBtn = document.getElementById('reset-search-btn');

    if (searchInput) {
        searchInput.value = usersSearchTerm;
        searchInput.onkeypress = (e) => {
            if (e.key === 'Enter') {
                usersSearchTerm = searchInput.value;
                renderUsersTable();
            }
        };
    }

    if (searchBtn) {
        searchBtn.onclick = () => {
            usersSearchTerm = searchInput ? searchInput.value : '';
            renderUsersTable();
        };
    }

    if (resetBtn) {
        resetBtn.onclick = () => {
            usersSearchTerm = '';
            if (searchInput) searchInput.value = '';
            renderUsersTable();
        };
    }
}

window.blockUser = async function(userId) {
    if (!confirm('Заблокировать пользователя?')) return;
    try {
        const res = await fetch(`${API_URL}/admin/users/${userId}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ is_active: false })
        });
        if (res.ok) {
            const idx = allUsers.findIndex(u => u.id === userId);
            if(idx !== -1) allUsers[idx].is_active = false;
            alert('Пользователь заблокирован');
            renderUsersTable();
        }
        else alert('Ошибка');
    } catch(e) { alert('Ошибка: ' + e.message); }
};

window.unblockUser = async function(userId) {
    if (!confirm('Разблокировать пользователя?')) return;
    try {
        const res = await fetch(`${API_URL}/admin/users/${userId}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ is_active: true })
        });
        if (res.ok) {
            const idx = allUsers.findIndex(u => u.id === userId);
            if(idx !== -1) allUsers[idx].is_active = true;
            alert('Пользователь разблокирован');
            renderUsersTable();
        }
        else alert('Ошибка');
    } catch(e) { alert('Ошибка: ' + e.message); }
};

window.deleteUser = async function(userId) {
    if (!confirm('Удалить пользователя? Это действие необратимо!')) return;
    try {
        const res = await fetch(`${API_URL}/admin/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) {
            alert('Пользователь удален');
            await loadUsers();
        }
        else alert('Ошибка');
    } catch(e) { alert('Ошибка: ' + e.message); }
};

window.showAddUserModal = function() {
    const modalHtml = `
        <div id="add-user-modal" class="modal" style="display: flex;">
            <div class="modal-content">
                <h3>Добавить пользователя</h3>
                <div class="form-group">
                    <label>Логин</label>
                    <input type="text" id="new-username" placeholder="Введите логин">
                </div>
                <div class="form-group password-group">
                    <label>Пароль</label>
                    <div style="position: relative;">
                        <input type="password" id="new-password" placeholder="Введите пароль">
                        <img id="toggle-new-password" src="assets/close.png" alt="Показать пароль" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); cursor: pointer; width: 20px; height: 20px;">
                    </div>
                </div>
                <div class="form-group">
                    <label>Роль</label>
                    <select id="new-role">
                        <option value="doctor">Врач</option>
                        <option value="admin">Администратор</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>ФИО</label>
                    <input type="text" id="new-fullname" placeholder="Введите ФИО">
                </div>
                <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                    <button id="modal-submit" class="btn btn-primary">Добавить</button>
                    <button id="modal-cancel" class="btn btn-secondary">Отмена</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const toggleImg = document.getElementById('toggle-new-password');
    const pwdInput = document.getElementById('new-password');
    if (toggleImg && pwdInput) {
        toggleImg.onclick = () => {
            const isPassword = pwdInput.type === 'password';
            pwdInput.type = isPassword ? 'text' : 'password';
            toggleImg.src = isPassword ? 'assets/open.png' : 'assets/close.png';
            toggleImg.alt = isPassword ? 'Скрыть пароль' : 'Показать пароль';
        };
    }

    const modal = document.getElementById('add-user-modal');
    const submitBtn = document.getElementById('modal-submit');
    const cancelBtn = document.getElementById('modal-cancel');

    submitBtn.onclick = async () => {
        const username = document.getElementById('new-username').value;
        const password = document.getElementById('new-password').value;
        const role = document.getElementById('new-role').value;
        const full_name = document.getElementById('new-fullname').value;

        if (!username || !password) {
            alert('Заполните логин и пароль');
            return;
        }

        try {
            const res = await fetch(`${API_URL}/admin/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                body: JSON.stringify({ username, password, role, full_name })
            });

            if (res.ok) {
                alert('Пользователь добавлен');
                modal.remove();
                await loadUsers();
            } else {
                const err = await res.json();
                alert('Ошибка: ' + (err.detail || 'Неизвестная ошибка'));
            }
        } catch (err) {
            console.error('Ошибка:', err);
            alert('Ошибка при добавлении пользователя');
        }
    };

    cancelBtn.onclick = () => modal.remove();
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
};

window.editUser = async function(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    const modalHtml = `
        <div id="edit-user-modal" class="modal" style="display: flex;">
            <div class="modal-content">
                <h3>Редактировать пользователя</h3>
                <div class="form-group">
                    <label>Логин</label>
                    <input type="text" id="edit-username" value="${user.username}" readonly style="background: #f5f5f5;">
                </div>
                <div class="form-group password-group">
                    <label>Новый пароль (оставьте пустым, если не менять)</label>
                    <div style="position: relative;">
                        <input type="password" id="edit-password" placeholder="Введите новый пароль">
                        <img id="toggle-edit-password" src="assets/close.png" alt="Показать пароль" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); cursor: pointer; width: 20px; height: 20px;">
                    </div>
                </div>
                <div class="form-group">
                    <label>Роль</label>
                    <select id="edit-role">
                        <option value="doctor" ${user.role === 'doctor' ? 'selected' : ''}>Врач</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Администратор</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>ФИО</label>
                    <input type="text" id="edit-fullname" value="${user.full_name || ''}" placeholder="Введите ФИО">
                </div>
                <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                    <button id="modal-submit" class="btn btn-primary">Сохранить</button>
                    <button id="modal-cancel" class="btn btn-secondary">Отмена</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const toggleImg = document.getElementById('toggle-edit-password');
    const pwdInput = document.getElementById('edit-password');
    if (toggleImg && pwdInput) {
        toggleImg.onclick = () => {
            const isPassword = pwdInput.type === 'password';
            pwdInput.type = isPassword ? 'text' : 'password';
            toggleImg.src = isPassword ? 'assets/open.png' : 'assets/close.png';
            toggleImg.alt = isPassword ? 'Скрыть пароль' : 'Показать пароль';
        };
    }

    const modal = document.getElementById('edit-user-modal');
    const submitBtn = document.getElementById('modal-submit');
    const cancelBtn = document.getElementById('modal-cancel');

    submitBtn.onclick = async () => {
        const password = document.getElementById('edit-password').value;
        const role = document.getElementById('edit-role').value;
        const full_name = document.getElementById('edit-fullname').value;

        const updateData = { role, full_name };
        if (password && password.trim() !== '') {
            updateData.password = password;
        }

        try {
            const response = await fetch(`${API_URL}/admin/users/${userId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify(updateData)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            alert('Пользователь обновлен');
            modal.remove();
            await loadUsers();

        } catch (err) {
            console.error('Ошибка при обновлении:', err);
            alert('Ошибка при обновлении пользователя: ' + err.message);
        }
    };

    cancelBtn.onclick = () => modal.remove();
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
};

// ============ ЭКСПОРТ ============
async function exportHistory(format) {
    try {
        const response = await fetch(`${API_URL}/history/export/${format}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `history_${new Date().toISOString().slice(0,19)}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (err) {
        alert('Ошибка экспорта: ' + err.message);
    }
}

// ============ ВКЛАДКИ ОПИСАНИЯ МЕТОДОВ ============
function setupMethodTabs() {
    const tabs = document.querySelectorAll('.method-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const method = this.getAttribute('data-method');
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            document.querySelectorAll('.method-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`${method}-content`)?.classList.add('active');
        });
    });
}

console.log('admin.js загружен, initAdminPanel доступна:', typeof window.initAdminPanel);