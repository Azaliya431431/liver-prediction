// doctor.js - полная версия
console.log('doctor.js загружен');

let currentPredictionId = null;
let currentCirrhosisPredictionId = null;
let currentPredictionResult = null;
let currentCirrhosisResult = null;

// Данные для истории (4 таблицы)
let doctorHistoryData = {
    liverConfirmed: [],
    liverUnconfirmed: [],
    cirrhosisConfirmed: [],
    cirrhosisUnconfirmed: []
};
let historySearchTerms = {
    liverConfirmed: '',
    liverUnconfirmed: '',
    cirrhosisConfirmed: '',
    cirrhosisUnconfirmed: ''
};

// ============ ИНИЦИАЛИЗАЦИЯ ============
window.initDoctorPanel = function() {
    console.log('initDoctorPanel вызвана');

    if (!authToken) {
        const token = localStorage.getItem('token');
        if (token) {
            authToken = token;
        } else {
            alert('Ошибка авторизации');
            handleLogout();
            return;
        }
    }

    const form = document.getElementById('prediction-form');
    if (form) {
        form.addEventListener('submit', handlePredictionSubmit);
    }

    const cirrhosisForm = document.getElementById('cirrhosis-form');
    if (cirrhosisForm) {
        cirrhosisForm.addEventListener('submit', handleCirrhosisSubmit);
    }

    const exportCsv = document.getElementById('export-csv');
    const exportExcel = document.getElementById('export-excel');
    if (exportCsv) exportCsv.addEventListener('click', () => exportHistory('csv'));
    if (exportExcel) exportExcel.addEventListener('click', () => exportHistory('xlsx'));

    const fileInput = document.getElementById('doctor-file-input');
    if (fileInput) {
        fileInput.addEventListener('change', handleFileUpload);
    }

    const cirrhosisFileInput = document.getElementById('cirrhosis-file-input');
    if (cirrhosisFileInput) {
        cirrhosisFileInput.addEventListener('change', handleCirrhosisFileUpload);
    }

    loadDoctorHistory();

    const tabs = document.querySelectorAll('#doctor-page .tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', async () => {
            const tabId = tab.getAttribute('data-tab');
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('#doctor-page .tab-content').forEach(content => {
                content.classList.remove('active');
            });
            const activeTab = document.getElementById(`${tabId}-tab`);
            if (activeTab) {
                activeTab.classList.add('active');
                if (tabId === 'history') {
                    await loadDoctorHistory();
                }
            }
        });
    });
};

// ============ ПРОГНОЗ ЗАБОЛЕВАНИЯ ПЕЧЕНИ ============
async function handlePredictionSubmit(event) {
    event.preventDefault();

    const hepatitisData = {
        Age: parseInt(document.getElementById('Age').value),
        Sex: document.getElementById('Sex').value,
        ALB: parseFloat(document.getElementById('ALB').value),
        ALP: parseFloat(document.getElementById('ALP').value),
        ALT: parseFloat(document.getElementById('ALT').value),
        AST: parseFloat(document.getElementById('AST').value),
        BIL: parseFloat(document.getElementById('BIL').value),
        CHE: parseFloat(document.getElementById('CHE').value),
        CHOL: parseFloat(document.getElementById('CHOL').value),
        CREA: parseFloat(document.getElementById('CREA').value),
        GGT: parseFloat(document.getElementById('GGT').value),
        PROT: parseFloat(document.getElementById('PROT').value)
    };

    const predictBtn = document.getElementById('predict-btn');
    predictBtn.textContent = 'Прогнозирование...';
    predictBtn.disabled = true;

    try {
        const response = await fetch(`${API_URL}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ hepatitis_data: hepatitisData })
        });

        if (!response.ok) throw new Error('Ошибка прогнозирования');

        const result = await response.json();
        currentPredictionId = result.prediction_id;
        currentPredictionResult = result;

        displayPredictionResult(result);

        if (result.diagnosis_category === 4) {
            document.getElementById('cirrhosis-form-container').style.display = 'block';
            document.getElementById('cirrhosis-form-container').scrollIntoView({ behavior: 'smooth' });
        }

    } catch (err) {
        alert('Ошибка: ' + err.message);
    } finally {
        predictBtn.textContent = 'Выполнить прогноз';
        predictBtn.disabled = false;
    }
}

function displayPredictionResult(result) {
    const container = document.getElementById('prediction-result');
    if (!container) return;

    const diagnosisMap = {0: 'Здоровый донор', 1: 'Подозрительный донор', 2: 'Гепатит', 3: 'Фиброз', 4: 'Цирроз печени'};
    const diagnosisName = result.diagnosis_name || diagnosisMap[result.diagnosis_category];
    const diagnosisColor = result.diagnosis_category === 4 ? '#c62828' : (result.diagnosis_category === 3 ? '#ed6c02' : '#2e7d32');

    container.style.display = 'block';
    container.innerHTML = `
        <div style="margin-top:25px;padding:20px;background:linear-gradient(135deg,#f5f7fa,#e8ecf1);border-radius:12px;">
            <h3>Результат прогноза заболеваний печени</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
                <div style="background:white;border-radius:10px;padding:15px;">
                    <h4>Диагноз</h4>
                    <div style="font-size:1.8rem;font-weight:bold;color:${diagnosisColor}">${diagnosisName}</div>
                    <p><strong>ID:</strong> ${result.prediction_id}</p>
                    <p><strong>Дата:</strong> ${new Date(result.created_at).toLocaleString()}</p>
                </div>
                <div style="background:white;border-radius:10px;padding:15px;">
                    <h4>Уверенность моделей</h4>
                    <p><strong>XGBoost:</strong> ${result.xgboost_prediction} (${(result.xgboost_confidence*100).toFixed(1)}%)</p>
                    <div style="background:#e0e0e0;border-radius:10px;height:10px;"><div style="background:#4a6a8a;width:${result.xgboost_confidence*100}%;height:10px;border-radius:10px;"></div></div>
                    <p><strong>KNN:</strong> ${result.knn_prediction} (${(result.knn_confidence*100).toFixed(1)}%)</p>
                    <div style="background:#e0e0e0;border-radius:10px;height:10px;"><div style="background:#764ba2;width:${result.knn_confidence*100}%;height:10px;border-radius:10px;"></div></div>
                </div>
            </div>
            <div style="background:white;border-radius:10px;padding:15px;margin-top:20px;">
                <h4>Рекомендации</h4>
                <ul>${result.recommendations.map(r => `<li>${r}</li>`).join('')}</ul>
            </div>
            <div style="display:flex;gap:10px;margin-top:20px;justify-content:center;">
                <button onclick="confirmLiverPrediction(true)" class="btn btn-success">Подтвердить диагноз</button>
                <button onclick="exportPredictionResult('txt')" class="btn btn-primary">Скачать TXT</button>
                <button onclick="exportPredictionResult('pdf')" class="btn btn-primary">Скачать PDF</button>
            </div>
        </div>
    `;
}

// ============ ПРОГНОЗ СТАДИИ ЦИРРОЗА ============
async function handleCirrhosisSubmit(event) {
    event.preventDefault();

    const cirrhosisData = {
        N_Days: parseInt(document.getElementById('N_Days').value),
        Status: document.getElementById('Status').value,
        Drug: document.getElementById('Drug').value,
        Ascites: document.getElementById('Ascites').value,
        Hepatomegaly: document.getElementById('Hepatomegaly').value,
        Spiders: document.getElementById('Spiders').value,
        Edema: document.getElementById('Edema').value,
        Copper: parseFloat(document.getElementById('Copper').value),
        Alk_Phos: parseFloat(document.getElementById('Alk_Phos').value),
        Tryglicerides: parseFloat(document.getElementById('Tryglicerides').value),
        Platelets: parseFloat(document.getElementById('Platelets').value),
        Prothrombin: parseFloat(document.getElementById('Prothrombin').value)
    };

    const submitBtn = event.target.querySelector('button[type="submit"]');
    submitBtn.textContent = 'Определение стадии...';
    submitBtn.disabled = true;

    try {
        const response = await fetch(`${API_URL}/predict/cirrhosis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({
                prediction_id: currentPredictionId,
                cirrhosis_data: cirrhosisData
            })
        });

        if (!response.ok) throw new Error('Ошибка');

        const result = await response.json();
        currentCirrhosisPredictionId = result.prediction_id;
        currentCirrhosisResult = result;

        displayCirrhosisResult(result);

    } catch (err) {
        alert('Ошибка: ' + err.message);
    } finally {
        submitBtn.textContent = 'Определить стадию цирроза';
        submitBtn.disabled = false;
    }
}

function displayCirrhosisResult(result) {
    const container = document.getElementById('cirrhosis-result');
    if (!container) return;

    container.style.display = 'block';
    container.innerHTML = `
        <div style="margin-top:25px;padding:20px;background:linear-gradient(135deg,#f5f7fa,#e8ecf1);border-radius:12px;">
            <h3>Результат определения стадии цирроза</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
                <div style="background:white;border-radius:10px;padding:15px;">
                    <h4>Стадия цирроза</h4>
                    <div style="font-size:1.8rem;font-weight:bold;color:#c62828">Стадия ${result.cirrhosis_stage}</div>
                    <p><strong>Уверенность:</strong> ${(result.cirrhosis_stage_confidence*100).toFixed(1)}%</p>
                    <p><strong>ID прогноза:</strong> ${result.prediction_id}</p>
                </div>
                <div style="background:white;border-radius:10px;padding:15px;">
                    <h4>Рекомендации при циррозе</h4>
                    <ul>
                        <li>Немедленная консультация гепатолога</li>
                        <li>Строгая диета №5</li>
                        <li>Полный отказ от алкоголя</li>
                        <li>Регулярный контроль функции печени</li>
                    </ul>
                </div>
            </div>
            <div style="display:flex;gap:10px;margin-top:20px;justify-content:center;">
                <button onclick="confirmCirrhosisPrediction(true)" class="btn btn-success">Подтвердить стадию</button>
                <button onclick="exportCirrhosisResult('txt')" class="btn btn-primary">Скачать TXT</button>
                <button onclick="exportCirrhosisResult('pdf')" class="btn btn-primary">Скачать PDF</button>
            </div>
        </div>
    `;
}

// ============ ПОДТВЕРЖДЕНИЕ ПРОГНОЗОВ ============
async function confirmLiverPrediction(agreed) {
    if (!currentPredictionId) return;
    const comment = prompt('Комментарий:');
    try {
        const r = await fetch(`${API_URL}/feedback`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ prediction_id: currentPredictionId, doctor_agreed: agreed, doctor_comment: comment })
        });
        if (r.ok) {
            alert('Прогноз подтвержден');
            await loadDoctorHistory();
        }
    } catch(e) { alert('Ошибка'); }
}

async function confirmCirrhosisPrediction(agreed) {
    if (!currentCirrhosisPredictionId) return;
    const comment = prompt('Комментарий:');
    try {
        const r = await fetch(`${API_URL}/feedback`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ prediction_id: currentCirrhosisPredictionId, doctor_agreed: agreed, doctor_comment: comment })
        });
        if (r.ok) {
            alert('Стадия цирроза подтверждена');
            await loadDoctorHistory();
        }
    } catch(e) { alert('Ошибка'); }
}

// ============ ИСТОРИЯ ПРОГНОЗОВ ==========
let historyData = {
    liverConfirmed: [],
    liverUnconfirmed: [],
    cirrhosisConfirmed: [],
    cirrhosisUnconfirmed: []
};
let currentHistoryType = 'liver';
let currentHistoryStatus = 'confirmed';
let historySearchTerm = '';

// Загрузка истории
async function loadDoctorHistory() {
    const container = document.getElementById('history-table-container');
    if (!container) return;

    container.innerHTML = '<div class="loading">Загрузка истории...</div>';

    try {
        const [confirmed, unconfirmed] = await Promise.all([
            fetch(`${API_URL}/history/confirmed`, { headers: { 'Authorization': `Bearer ${authToken}` } }).then(r => r.json()),
            fetch(`${API_URL}/history/unconfirmed`, { headers: { 'Authorization': `Bearer ${authToken}` } }).then(r => r.json())
        ]);

        console.log('Confirmed data:', confirmed);
        console.log('Unconfirmed data:', unconfirmed);

        // Проверяем, есть ли в confirmed данные с cirrhosis_stage
        const hasCirrhosis = confirmed.some(p => p.cirrhosis_stage);
        console.log('Has cirrhosis in confirmed:', hasCirrhosis);

        historyData = {
            liverConfirmed: (confirmed || []).filter(p => !p.cirrhosis_stage),
            liverUnconfirmed: (unconfirmed || []).filter(p => !p.cirrhosis_stage),
            cirrhosisConfirmed: (confirmed || []).filter(p => p.cirrhosis_stage),
            cirrhosisUnconfirmed: (unconfirmed || []).filter(p => p.cirrhosis_stage)
        };

        console.log('History data after filter:', {
            liverConfirmed: historyData.liverConfirmed.length,
            liverUnconfirmed: historyData.liverUnconfirmed.length,
            cirrhosisConfirmed: historyData.cirrhosisConfirmed.length,
            cirrhosisUnconfirmed: historyData.cirrhosisUnconfirmed.length
        });

        // Детально выводим данные цирроза
        if (historyData.cirrhosisConfirmed.length > 0) {
            console.log('Cirrhosis confirmed sample:', historyData.cirrhosisConfirmed[0]);
        }

        renderHistoryTable();
        setupHistoryFilters();
    } catch (err) {
        console.error('Error loading history:', err);
        container.innerHTML = '<p>Ошибка загрузки истории</p>';
    }
}

// Рендер таблицы на основе выбранных фильтров
function renderHistoryTable() {
    const container = document.getElementById('history-table-container');
    if (!container) return;

    let dataKey = '';
    if (currentHistoryType === 'liver') {
        dataKey = currentHistoryStatus === 'confirmed' ? 'liverConfirmed' : 'liverUnconfirmed';
    } else {
        dataKey = currentHistoryStatus === 'confirmed' ? 'cirrhosisConfirmed' : 'cirrhosisUnconfirmed';
    }

    let data = historyData[dataKey] || [];

    if (historySearchTerm && historySearchTerm.trim()) {
        const searchId = parseInt(historySearchTerm);
        if (!isNaN(searchId)) {
            data = data.filter(item => item.id === searchId);
        }
    }

    const typeName = currentHistoryType === 'liver' ? 'Заболевания печени' : 'Стадии цирроза';
    const statusName = currentHistoryStatus === 'confirmed' ? 'Подтвержденные' : 'Неподтвержденные';

    if (data.length === 0) {
        container.innerHTML = `<p style="text-align:center; padding:40px;">Нет записей в разделе "${typeName} - ${statusName}"</p>`;
        return;
    }

    let html = `
        <div style="background: ${currentHistoryStatus === 'confirmed' ? '#e8f5e9' : '#fff3e0'}; border-radius: 12px; padding: 15px;">
            <h3 style="color: ${currentHistoryStatus === 'confirmed' ? '#2e7d32' : '#ed6c02'}; margin-bottom: 15px;">
                ${typeName} - ${statusName} (${data.length} записей)
            </h3>
            <div style="overflow-x: auto;">
                <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                    <thead style="position: sticky; top: 0; background: #f0f2f5;">
                        <tr>
                            <th style="padding: 10px;">ID</th>
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

        html += `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px;">${item.id}</td>
                <td style="padding: 10px;">${item.diagnosis || '-'}${item.cirrhosis_stage ? ' (цирроз)' : ''}</td>
                <td style="padding: 10px; text-align: center;">${stage}</td>
                <td style="padding: 10px; text-align: center;">${xgbText}</td>
                <td style="padding: 10px; text-align: center;">${knnText}</td>
                <td style="padding: 10px;">${date}</td>
                <td style="padding: 10px; text-align: center;">
                    <button class="btn btn-info btn-sm" onclick="showHistoryDetails(${item.id})">Подробнее</button>
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

// Настройка фильтров
function setupHistoryFilters() {
    const typeSelect = document.getElementById('history-type-select');
    const statusSelect = document.getElementById('history-status-select');
    const searchInput = document.getElementById('history-search-input');
    const searchBtn = document.getElementById('history-search-btn');
    const resetBtn = document.getElementById('history-reset-btn');
    const exportBtn = document.getElementById('history-export-btn');

    if (typeSelect) {
        typeSelect.onchange = () => {
            currentHistoryType = typeSelect.value;
            historySearchTerm = '';
            if (searchInput) searchInput.value = '';
            renderHistoryTable();
        };
    }

    if (statusSelect) {
        statusSelect.onchange = () => {
            currentHistoryStatus = statusSelect.value;
            historySearchTerm = '';
            if (searchInput) searchInput.value = '';
            renderHistoryTable();
        };
    }

    if (searchBtn) {
        searchBtn.onclick = () => {
            historySearchTerm = searchInput?.value || '';
            renderHistoryTable();
        };
    }

    if (resetBtn) {
        resetBtn.onclick = () => {
            historySearchTerm = '';
            if (searchInput) searchInput.value = '';
            renderHistoryTable();
        };
    }

    if (searchInput) {
        searchInput.onkeypress = (e) => {
            if (e.key === 'Enter') {
                historySearchTerm = searchInput.value;
                renderHistoryTable();
            }
        };
    }

    if (exportBtn) {
        exportBtn.onclick = () => exportCurrentHistory();
    }
}

// Экспорт текущей таблицы в формате датасета
async function exportCurrentHistory() {
    let dataKey = '';
    if (currentHistoryType === 'liver') {
        dataKey = currentHistoryStatus === 'confirmed' ? 'liverConfirmed' : 'liverUnconfirmed';
    } else {
        dataKey = currentHistoryStatus === 'confirmed' ? 'cirrhosisConfirmed' : 'cirrhosisUnconfirmed';
    }

    let data = historyData[dataKey] || [];

    // Фильтрация по поиску
    if (historySearchTerm && historySearchTerm.trim()) {
        const searchId = parseInt(historySearchTerm);
        if (!isNaN(searchId)) {
            data = data.filter(item => item.id === searchId);
        }
    }

    if (data.length === 0) {
        alert('Нет данных для экспорта');
        return;
    }

    // Для каждого прогноза получаем полные данные через API
    const exportData = [];
    const typeName = currentHistoryType === 'liver' ? 'liver' : 'cirrhosis';
    const filename = `${typeName}_${currentHistoryStatus}_${new Date().toISOString().slice(0, 19)}.csv`;

    for (const item of data) {
        try {
            // Получаем детальные данные через API
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
            } catch(e) {
                console.error('Parse error:', e);
            }

            if (currentHistoryType === 'liver') {
                const hepData = patientData.hepatitis_data || {};

                // Определяем категорию
                let category = '';
                if (fullData.diagnosis_category === 0) category = '0=Blood Donor';
                else if (fullData.diagnosis_category === 1) category = '0s=suspect Blood Donor';
                else if (fullData.diagnosis_category === 2) category = '1=Hepatitis';
                else if (fullData.diagnosis_category === 3) category = '2=Fibrosis';
                else if (fullData.diagnosis_category === 4) category = '3=Cirrhosis';
                else category = '';

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

    // Получаем заголовки
    const headers = Object.keys(exportData[0]);

    // Создаем CSV
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

// Показать детали прогноза
window.showHistoryDetails = async function(predictionId) {
    // Сначала ищем в已有的 данных
    let prediction = [...historyData.liverConfirmed, ...historyData.liverUnconfirmed,
                      ...historyData.cirrhosisConfirmed, ...historyData.cirrhosisUnconfirmed]
                      .find(p => p.id === predictionId);

    // Если не нашли или нет patient_data, делаем прямой запрос
    if (!prediction || !prediction.patient_data) {
        try {
            // Прямой запрос к API для получения полных данных
            const response = await fetch(`${API_URL}/history/prediction/${predictionId}`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (response.ok) {
                prediction = await response.json();
                console.log('Fetched prediction details:', prediction);
            }
        } catch(e) {
            console.error('Error fetching prediction details:', e);
        }
    }

    if (!prediction) {
        alert('Прогноз не найден');
        return;
    }

    console.log('Final prediction object:', prediction);

    let patientData = {};
    try {
        if (prediction.patient_data) {
            patientData = typeof prediction.patient_data === 'string'
                ? JSON.parse(prediction.patient_data)
                : prediction.patient_data;
        }
    } catch(e) {
        console.error('Parse error:', e);
    }

    const hepData = patientData.hepatitis_data || {};
    const cirrhosisData = patientData.cirrhosis_data || {};

    console.log('Extracted hepatitis data:', hepData);
    console.log('Extracted cirrhosis data:', cirrhosisData);

    let detailsHtml = `
        <div id="history-details-modal" class="modal" style="display: flex;">
            <div class="modal-content" style="max-width: 700px; max-height: 80vh; overflow-y: auto;">
                <h3>Детали прогноза #${prediction.id}</h3>
                <p><strong>Диагноз:</strong> ${prediction.diagnosis}</p>
                ${prediction.cirrhosis_stage ? `<p><strong>Стадия цирроза:</strong> ${prediction.cirrhosis_stage}</p>` : ''}
                <p><strong>XGBoost:</strong> ${prediction.xgboost_prediction} (${(prediction.xgboost_confidence * 100).toFixed(1)}%)</p>
                <p><strong>KNN:</strong> ${prediction.knn_prediction} (${(prediction.knn_confidence * 100).toFixed(1)}%)</p>
                ${prediction.doctor_comment ? `<p><strong>Комментарий:</strong> ${prediction.doctor_comment}</p>` : ''}
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
                            ${renderDataRow('Age', hepData.Age)}
                            ${renderDataRow('Sex', hepData.Sex)}
                            ${renderDataRow('ALB', hepData.ALB)}
                            ${renderDataRow('ALP', hepData.ALP)}
                            ${renderDataRow('ALT', hepData.ALT)}
                            ${renderDataRow('AST', hepData.AST)}
                            ${renderDataRow('BIL', hepData.BIL)}
                            ${renderDataRow('CHE', hepData.CHE)}
                            ${renderDataRow('CHOL', hepData.CHOL)}
                            ${renderDataRow('CREA', hepData.CREA)}
                            ${renderDataRow('GGT', hepData.GGT)}
                            ${renderDataRow('PROT', hepData.PROT)}
    `;

    if (prediction.cirrhosis_stage || Object.keys(cirrhosisData).length > 0) {
        detailsHtml += `
                            <tr style="background:#e8ecf1;">
                                <td colspan="2" style="padding:8px; border:1px solid #ddd;"><strong>Цирроз:</strong></td>
                            </tr>
                            ${renderDataRow('N_Days', cirrhosisData.N_Days)}
                            ${renderDataRow('Status', cirrhosisData.Status)}
                            ${renderDataRow('Drug', cirrhosisData.Drug)}
                            ${renderDataRow('Ascites', cirrhosisData.Ascites)}
                            ${renderDataRow('Hepatomegaly', cirrhosisData.Hepatomegaly)}
                            ${renderDataRow('Spiders', cirrhosisData.Spiders)}
                            ${renderDataRow('Edema', cirrhosisData.Edema)}
                            ${renderDataRow('Copper', cirrhosisData.Copper)}
                            ${renderDataRow('Alk_Phos', cirrhosisData.Alk_Phos)}
                            ${renderDataRow('Tryglicerides', cirrhosisData.Tryglicerides)}
                            ${renderDataRow('Platelets', cirrhosisData.Platelets)}
                            ${renderDataRow('Prothrombin', cirrhosisData.Prothrombin)}
        `;
    }

    detailsHtml += `
                        </tbody>
                    </table>
                </div>
                <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
                    <button onclick="closeHistoryModal()" class="btn btn-primary">Закрыть</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', detailsHtml);
};

function renderDataRow(label, value) {
    const displayValue = (value !== undefined && value !== null && value !== '') ? value : '-';
    return `
        <tr>
            <td style="padding:6px; border:1px solid #ddd;">${label}:</td>
            <td style="padding:6px; border:1px solid #ddd;">${displayValue}</td>
        </tr>
    `;
}

function renderPatientData(patientData, hasCirrhosisStage) {
    const hepData = patientData.hepatitis_data || {};
    const cirrhosisData = patientData.cirrhosis_data || {};

    let html = '<table style="width:100%; font-size:12px; border-collapse:collapse;">';
    html += '<thead><tr style="background:#f0f2f5;"><th style="padding:8px;">Параметр</th><th style="padding:8px;">Значение</th></tr></thead><tbody>';

    // Данные Гепатита C
    html += '<tr style="background:#e8ecf1;"><td colspan="2" style="padding:8px;"><strong>Заболевания печени:</strong></td></tr>';
    const hepFields = ['Age', 'Sex', 'ALB', 'ALP', 'ALT', 'AST', 'BIL', 'CHE', 'CHOL', 'CREA', 'GGT', 'PROT'];
    for (const field of hepFields) {
        html += `<tr><td style="padding:6px;">${field}:</td><td style="padding:6px;">${hepData[field] || '-'}</td></tr>`;
    }

    // Данные цирроза (если есть)
    if (hasCirrhosisStage) {
        html += '<tr style="background:#e8ecf1;"><td colspan="2" style="padding:8px;"><strong>Цирроз:</strong></td></tr>';
        const cirrFields = ['N_Days', 'Status', 'Drug', 'Ascites', 'Hepatomegaly', 'Spiders', 'Edema', 'Copper', 'Alk_Phos', 'Tryglicerides', 'Platelets', 'Prothrombin'];
        for (const field of cirrFields) {
            html += `<tr><td style="padding:6px;">${field}:</td><td style="padding:6px;">${cirrhosisData[field] || '-'}</td></tr>`;
        }
    }

    html += '</tbody></table>';
    return html;
}

function closeHistoryModal() {
    const modal = document.getElementById('history-details-modal');
    if (modal) modal.remove();
}


//  =====================================================

async function exportAllHistory() {
    const all = [...doctorHistoryData.liverConfirmed.map(p=>({...p,type:'Заболевание печени',status:'Подтвержденный'})), ...doctorHistoryData.liverUnconfirmed.map(p=>({...p,type:'Заболевание печени',status:'Неподтвержденный'})), ...doctorHistoryData.cirrhosisConfirmed.map(p=>({...p,type:'Стадия цирроза',status:'Подтвержденный'})), ...doctorHistoryData.cirrhosisUnconfirmed.map(p=>({...p,type:'Стадия цирроза',status:'Неподтвержденный'}))];
    if(!all.length){alert('Нет данных');return;}
    const data = all.map(p=>({'ID':p.id,'Тип':p.type,'Диагноз':p.diagnosis,'Стадия':p.cirrhosis_stage||'-','XGBoost':p.xgboost_prediction,'XGBoost %':(p.xgboost_confidence*100).toFixed(1),'KNN':p.knn_prediction,'KNN %':(p.knn_confidence*100).toFixed(1),'Статус':p.status,'Дата':new Date(p.created_at).toLocaleString()}));
    const headers = Object.keys(data[0]);
    const rows = [headers.join(',')];
    for(const row of data) rows.push(headers.map(h=>`"${String(row[h]||'').replace(/"/g,'""')}"`).join(','));
    const blob = new Blob([rows.join('\n')],{type:'text/csv'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`history_${Date.now()}.csv`;a.click();URL.revokeObjectURL(a.href);
}

function handleFileUpload(e) {
    const file=e.target.files[0];if(!file)return;
    const r=new FileReader();
    r.onload=function(ev){
        const content=ev.target.result;
        let data={};
        if(file.name.endsWith('.csv')){
            const lines=content.split(/\r?\n/);
            const headers=lines[0].split(',').map(h=>h.trim());
            const values=lines[1]?.split(',').map(v=>v.trim());
            if(headers&&values) headers.forEach((h,i)=>{data[h]=values[i];});
        }
        fillPredictionForm(data);
        alert('Загружено');
    };
    r.readAsText(file,'UTF-8');
    e.target.value='';
}

function handleCirrhosisFileUpload(e) {
    const file=e.target.files[0];if(!file)return;
    const r=new FileReader();
    r.onload=function(ev){
        const content=ev.target.result;
        let data={};
        if(file.name.endsWith('.csv')){
            const lines=content.split(/\r?\n/);
            const headers=lines[0].split(',').map(h=>h.trim());
            const values=lines[1]?.split(',').map(v=>v.trim());
            if(headers&&values) headers.forEach((h,i)=>{data[h]=values[i];});
        }
        fillCirrhosisForm(data);
        alert('Загружено');
    };
    r.readAsText(file,'UTF-8');
    e.target.value='';
}

function fillPredictionForm(data){
    const map={'Age':'Age','Sex':'Sex','ALB':'ALB','ALP':'ALP','ALT':'ALT','AST':'AST','BIL':'BIL','CHE':'CHE','CHOL':'CHOL','CREA':'CREA','GGT':'GGT','PROT':'PROT'};
    for(const [k,v] of Object.entries(data)){
        const id=map[k]||map[k.toLowerCase()];
        if(id){
            const el=document.getElementById(id);
            if(el && v && v!=='NA') el.value=v;
        }
    }
}

function fillCirrhosisForm(data){
    const map={'N_Days':'N_Days','Status':'Status','Drug':'Drug','Ascites':'Ascites','Hepatomegaly':'Hepatomegaly','Spiders':'Spiders','Edema':'Edema','Copper':'Copper','Alk_Phos':'Alk_Phos','Tryglicerides':'Tryglicerides','Platelets':'Platelets','Prothrombin':'Prothrombin'};
    for(const [k,v] of Object.entries(data)){
        const id=map[k]||map[k.toLowerCase()];
        if(id){
            const el=document.getElementById(id);
            if(el && v && v!=='NA') el.value=v;
        }
    }
}

function exportPredictionResult(format){
    const div=document.getElementById('prediction-result');
    if(!div)return;
    let text=''; for(const el of div.querySelectorAll('h3,h4,p,li')) text += el.tagName==='LI' ? `  - ${el.innerText}\n` : `${el.innerText}\n`;
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/plain'}));a.download=`prediction_${currentPredictionId}.txt`;a.click();
}

function exportCirrhosisResult(format){
    const div=document.getElementById('cirrhosis-result');
    if(!div)return;
    let text=''; for(const el of div.querySelectorAll('h3,h4,p,li')) text += el.tagName==='LI' ? `  - ${el.innerText}\n` : `${el.innerText}\n`;
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/plain'}));a.download=`cirrhosis_${currentCirrhosisPredictionId}.txt`;a.click();
}

async function exportHistory(format) {
    try {
        const response = await fetch(`${API_URL}/history/export/${format}`, { headers: { 'Authorization': `Bearer ${authToken}` } });
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `history_${Date.now()}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
    } catch(e) { alert('Ошибка экспорта'); }
}