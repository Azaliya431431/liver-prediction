// api.js - исправленная версия

const API_URL = 'https://liver-prediction-production.up.railway.app/api';

let authToken = null;
let currentUser = null;

function loadAuthToken() {
    const token = localStorage.getItem('token');
    if (token) {
        authToken = token;
        console.log('Токен загружен из localStorage');
        return true;
    }
    console.log('Токен не найден в localStorage');
    return false;
}

loadAuthToken();

async function apiRequest(endpoint, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
        }
    };

    if (!authToken) {
        loadAuthToken();
    }

    if (authToken) {
        defaultOptions.headers['Authorization'] = `Bearer ${authToken}`;
    }

    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        });

        if (response.status === 401) {
            console.log('Токен истёк, требуется повторный вход');
            logout();
            if (typeof showLoginPage === 'function') {
                showLoginPage();
            }
            throw new Error('Сессия истекла. Пожалуйста, войдите снова.');
        }

        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}`;
            try {
                const error = await response.json();
                errorMessage = error.detail || errorMessage;
            } catch (e) {}
            throw new Error(errorMessage);
        }

        return response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// ============ ИСПРАВЛЕННАЯ ФУНКЦИЯ LOGIN ============
async function login(username, password) {
    console.log('=== НАЧАЛО ЛОГИНА ===');
    console.log('Username:', username);
    console.log('Password length:', password.length);

    const url = `${API_URL}/login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    console.log('URL запроса:', url);

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    console.log('Статус ответа:', response.status);
    console.log('Status text:', response.statusText);

    // Пытаемся получить тело ответа в любом случае
    let responseText = '';
    try {
        responseText = await response.text();
        console.log('Тело ответа (сырое):', responseText);
    } catch(e) {
        console.error('Не удалось прочитать тело ответа:', e);
    }

    // Парсим JSON если возможно
    let errorData = null;
    try {
        errorData = JSON.parse(responseText);
        console.log('Распарсенный JSON:', errorData);
    } catch(e) {
        console.log('Не JSON ответ');
    }

    // Обработка статуса 403 (заблокирован)
    if (response.status === 403) {
        let errorMessage = 'Ваша учетная запись заблокирована. Обратитесь к администратору.';
        if (errorData && errorData.detail) {
            errorMessage = errorData.detail;
        }
        console.log('Бросаем ошибку 403:', errorMessage);
        throw new Error(errorMessage);
    }

    // Обработка статуса 401 (неверные данные)
    if (response.status === 401) {
        let errorMessage = 'Неверное имя пользователя или пароль';
        if (errorData && errorData.detail) {
            errorMessage = errorData.detail;
        }
        console.log('Бросаем ошибку 401:', errorMessage);
        throw new Error(errorMessage);
    }

    // Другие ошибки
    if (!response.ok) {
        let errorMessage = `Ошибка сервера: ${response.status}`;
        if (errorData && errorData.detail) {
            errorMessage = errorData.detail;
        }
        console.log('Бросаем ошибку:', errorMessage);
        throw new Error(errorMessage);
    }

    // Успешный вход
    const data = JSON.parse(responseText);
    console.log('Успешный вход, данные:', data);

    authToken = data.access_token;
    currentUser = {
        role: data.role,
        userId: data.user_id,
        username: username
    };

    localStorage.setItem('token', authToken);
    localStorage.setItem('user', JSON.stringify(currentUser));

    console.log('=== ЛОГИН ЗАВЕРШЕН УСПЕШНО ===');
    return data;
}

function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    console.log('Выход выполнен');
}

function loadSession() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');

    if (token && user) {
        authToken = token;
        currentUser = JSON.parse(user);
        console.log('Сессия загружена, role:', currentUser.role);
        return true;
    }
    return false;
}

async function exportHistory(format) {
    const response = await fetch(`${API_URL}/history/export/${format}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `history_${new Date().toISOString().slice(0,19)}.${format}`;
    a.click();
    window.URL.revokeObjectURL(url);
}
