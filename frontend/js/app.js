// app.js
console.log('app.js загружен');

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM загружен');

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    const logoutBtn = document.getElementById('logout-btn');
    const adminLogoutBtn = document.getElementById('admin-logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (adminLogoutBtn) adminLogoutBtn.addEventListener('click', handleLogout);

    // Показать/скрыть пароль с картинками
    setupPasswordToggle();

    // Забыли пароль
    const forgotLink = document.getElementById('forgot-password-link');
    const forgotModal = document.getElementById('forgot-password-modal');
    if (forgotLink && forgotModal) {
        forgotLink.onclick = (e) => {
            e.preventDefault();
            forgotModal.style.display = 'flex';
        };
        document.getElementById('close-forgot-modal')?.addEventListener('click', () => {
            forgotModal.style.display = 'none';
        });
        forgotModal.onclick = (e) => { if (e.target === forgotModal) forgotModal.style.display = 'none'; };
    }

    // Проверяем сохраненную сессию
    if (loadSession()) {
        showAppropriatePage();
    }
});


// Показать/скрыть пароль с картинками
function setupPasswordToggle() {
    const toggleImg = document.getElementById('toggle-password');
    const passwordInput = document.getElementById('password');

    if (toggleImg && passwordInput) {
        toggleImg.onclick = function() {
            const isPassword = passwordInput.type === 'password';
            passwordInput.type = isPassword ? 'text' : 'password';
            this.src = isPassword ? 'assets/open.png' : 'assets/close.png';
            this.alt = isPassword ? 'Скрыть пароль' : 'Показать пароль';
        };
    }
}

async function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('login-error');

    // Очищаем предыдущую ошибку
    errorDiv.style.display = 'none';
    errorDiv.textContent = '';
    errorDiv.className = 'error-message';

    if (!username || !password) {
        errorDiv.textContent = 'Введите логин и пароль';
        errorDiv.style.display = 'block';
        return;
    }

    // Блокируем кнопку на время входа
    const submitBtn = document.querySelector('#login-form button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Вход...';
    submitBtn.disabled = true;

    try {
        const result = await login(username, password);
        console.log('Login успешен:', result);
        showAppropriatePage();
    } catch (err) {
        console.error('Login error:', err);
        console.error('Сообщение ошибки:', err.message);

        // Проверяем, сообщение о блокировке
        const isBlocked = err.message.includes('заблокирована') ||
                          err.message.includes('администратор') ||
                          err.message.includes('блокирован');

        if (isBlocked) {
            errorDiv.classList.add('blocked');
            errorDiv.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center;">

                    <div style="font-weight: bold; margin-bottom: 10px;">${err.message}</div>
                    <hr style="width: 100%; margin: 10px 0;">
                    <div style="font-size: 13px; font-weight: normal;">
                        Контакты администратора: admin@mail.ru<br>
                        Телефон: +7 (927) 316-38-84
                    </div>
                </div>
            `;
        } else {
            errorDiv.textContent = err.message;
        }

        errorDiv.style.display = 'block';
        document.getElementById('password').value = '';
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

function handleLogout() {
    logout();
    showLoginPage();
}

function showAppropriatePage() {
    if (!currentUser) {
        showLoginPage();
        return;
    }

    console.log('Показ страницы для роли:', currentUser.role);

    if (currentUser.role === 'doctor') {
        showDoctorPage();
        if (typeof window.initDoctorPanel === 'function') {
            window.initDoctorPanel();
        }
    } else if (currentUser.role === 'admin') {
    showAdminPage();
    console.log('Проверка initAdminPanel:', typeof window.initAdminPanel);
    if (typeof window.initAdminPanel === 'function') {
        window.initAdminPanel();
    } else {
        console.error('initAdminPanel не найдена! Проверьте загрузку admin.js');
        // Принудительно загружаем
        setTimeout(() => {
            if (typeof window.initAdminPanel === 'function') {
                window.initAdminPanel();
            }
        }, 500);
    }
}
}

function showLoginPage() {
    document.getElementById('login-page').classList.add('active');
    document.getElementById('doctor-page').classList.remove('active');
    document.getElementById('admin-page').classList.remove('active');
}

function showDoctorPage() {
    document.getElementById('login-page').classList.remove('active');
    document.getElementById('doctor-page').classList.add('active');
    document.getElementById('admin-page').classList.remove('active');
}

function showAdminPage() {
    document.getElementById('login-page').classList.remove('active');
    document.getElementById('doctor-page').classList.remove('active');
    document.getElementById('admin-page').classList.add('active');

    console.log('Показана страница админа, проверка initAdminPanel:', typeof window.initAdminPanel);

    // Даем время на рендер DOM
    setTimeout(() => {
        if (typeof window.initAdminPanel === 'function') {
            window.initAdminPanel();
        } else if (typeof window.forceInitAdmin === 'function') {
            window.forceInitAdmin();
        } else {
            console.error('Ни initAdminPanel, ни forceInitAdmin не найдены');
            // Повторная попытка через 500 мс
            setTimeout(() => {
                if (typeof window.initAdminPanel === 'function') {
                    window.initAdminPanel();
                } else {
                    console.error('Окончательная неудача - admin.js не загрузился');
                }
            }, 500);
        }
    }, 100);
}