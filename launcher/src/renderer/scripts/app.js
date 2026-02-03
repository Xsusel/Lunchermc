/**
 * XsusLauncher - Główna logika aplikacji
 * Obsługa interfejsu użytkownika i integracja z API
 */

// ============================================
// STAN APLIKACJI
// ============================================
const state = {
    user: null,
    token: null,
    config: null,
    isLoggedIn: false,
    isLoading: false,
    serverOnline: true
};

// ============================================
// ELEMENTY DOM
// ============================================
const elements = {
    // Przyciski okna
    btnMinimize: document.getElementById('btn-minimize'),
    btnMaximize: document.getElementById('btn-maximize'),
    btnClose: document.getElementById('btn-close'),

    // Nawigacja
    navItems: document.querySelectorAll('.nav-item'),
    pages: document.querySelectorAll('.page'),

    // Użytkownik
    userInfo: document.getElementById('user-info'),
    userAvatar: document.getElementById('user-avatar'),
    userName: document.getElementById('user-name'),
    userStatus: document.getElementById('user-status'),

    // Strona główna
    broadcastsContainer: document.getElementById('broadcasts-container'),
    serverStatusIndicator: document.getElementById('server-status-indicator'),
    serverAddress: document.getElementById('server-address'),
    gameVersion: document.getElementById('game-version'),
    progressContainer: document.getElementById('progress-container'),
    progressText: document.getElementById('progress-text'),
    progressPercent: document.getElementById('progress-percent'),
    progressFill: document.getElementById('progress-fill'),
    progressSize: document.getElementById('progress-size'),
    progressSpeed: document.getElementById('progress-speed'),
    progressDetails: document.getElementById('progress-details'),
    btnPlay: document.getElementById('btn-play'),
    playSubtext: document.getElementById('play-subtext'),

    // Ustawienia
    ramMin: document.getElementById('ram-min'),
    ramMax: document.getElementById('ram-max'),
    ramMinValue: document.getElementById('ram-min-value'),
    ramMaxValue: document.getElementById('ram-max-value'),
    ramHint: document.getElementById('ram-hint'),
    javaPath: document.getElementById('java-path'),
    btnJavaBrowse: document.getElementById('btn-java-browse'),
    customJavaArgs: document.getElementById('custom-java-args'),
    resWidth: document.getElementById('res-width'),
    resHeight: document.getElementById('res-height'),
    fullscreen: document.getElementById('fullscreen'),
    closeOnLaunch: document.getElementById('close-on-launch'),
    autoUpdate: document.getElementById('auto-update'),
    gamePath: document.getElementById('game-path'),
    btnGameBrowse: document.getElementById('btn-game-browse'),
    btnOpenFolder: document.getElementById('btn-open-folder'),
    btnResetSettings: document.getElementById('btn-reset-settings'),
    btnSaveSettings: document.getElementById('btn-save-settings'),
    launcherVersion: document.getElementById('launcher-version'),

    // Modale
    loginModal: document.getElementById('login-modal'),
    loginForm: document.getElementById('login-form'),
    loginUsername: document.getElementById('login-username'),
    loginPassword: document.getElementById('login-password'),
    rememberMe: document.getElementById('remember-me'),
    loginError: document.getElementById('login-error'),
    btnLogin: document.getElementById('btn-login'),
    modalClose: document.getElementById('modal-close'),
    linkRegister: document.getElementById('link-register'),

    registerModal: document.getElementById('register-modal'),
    registerForm: document.getElementById('register-form'),
    registerUsername: document.getElementById('register-username'),
    registerPassword: document.getElementById('register-password'),
    registerPasswordConfirm: document.getElementById('register-password-confirm'),
    registerError: document.getElementById('register-error'),
    registerModalClose: document.getElementById('register-modal-close'),
    linkLogin: document.getElementById('link-login'),

    // Toast
    toastContainer: document.getElementById('toast-container')
};

// ============================================
// INICJALIZACJA
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('XsusLauncher inicjalizacja...');

    // Inicjalizuj przyciski okna
    initWindowControls();

    // Inicjalizuj nawigację
    initNavigation();

    // Inicjalizuj modale
    initModals();

    // Inicjalizuj ustawienia
    await initSettings();

    // Załaduj zapisaną sesję
    await loadSavedSession();

    // Pobierz konfigurację serwera
    await loadServerConfig();

    // Pobierz wersję launchera
    await loadLauncherVersion();

    // Inicjalizuj przycisk graj
    initPlayButton();

    console.log('XsusLauncher gotowy!');
});

// ============================================
// KONTROLKI OKNA
// ============================================
function initWindowControls() {
    elements.btnMinimize?.addEventListener('click', () => {
        window.electronAPI?.minimizeWindow();
    });

    elements.btnMaximize?.addEventListener('click', () => {
        window.electronAPI?.maximizeWindow();
    });

    elements.btnClose?.addEventListener('click', () => {
        window.electronAPI?.closeWindow();
    });
}

// ============================================
// NAWIGACJA
// ============================================
function initNavigation() {
    elements.navItems.forEach(item => {
        item.addEventListener('click', () => {
            const pageName = item.dataset.page;
            switchPage(pageName);
        });
    });
}

function switchPage(pageName) {
    // Aktualizuj nawigację
    elements.navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.page === pageName);
    });

    // Aktualizuj strony
    elements.pages.forEach(page => {
        page.classList.toggle('active', page.id === `page-${pageName}`);
    });
}

// ============================================
// MODALE
// ============================================
function initModals() {
    // Kliknięcie w user info otwiera modal logowania
    elements.userInfo?.addEventListener('click', () => {
        if (state.isLoggedIn) {
            // Pokaż opcje użytkownika (wyloguj)
            if (confirm('Czy chcesz się wylogować?')) {
                logout();
            }
        } else {
            openModal('login');
        }
    });

    // Zamykanie modali
    elements.modalClose?.addEventListener('click', () => closeModal('login'));
    elements.registerModalClose?.addEventListener('click', () => closeModal('register'));

    // Przełączanie między logowaniem a rejestracją
    elements.linkRegister?.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal('login');
        openModal('register');
    });

    elements.linkLogin?.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal('register');
        openModal('login');
    });

    // Zamykanie po kliknięciu w tło
    elements.loginModal?.addEventListener('click', (e) => {
        if (e.target === elements.loginModal) closeModal('login');
    });

    elements.registerModal?.addEventListener('click', (e) => {
        if (e.target === elements.registerModal) closeModal('register');
    });

    // Formularze
    elements.loginForm?.addEventListener('submit', handleLogin);
    elements.registerForm?.addEventListener('submit', handleRegister);
}

function openModal(name) {
    const modal = name === 'login' ? elements.loginModal : elements.registerModal;
    modal?.classList.add('active');
}

function closeModal(name) {
    const modal = name === 'login' ? elements.loginModal : elements.registerModal;
    modal?.classList.remove('active');

    // Wyczyść błędy
    if (name === 'login') {
        elements.loginError.classList.remove('active');
        elements.loginError.textContent = '';
    } else {
        elements.registerError.classList.remove('active');
        elements.registerError.textContent = '';
    }
}

// ============================================
// AUTORYZACJA
// ============================================
async function handleLogin(e) {
    e.preventDefault();

    const username = elements.loginUsername.value.trim();
    const password = elements.loginPassword.value;
    const rememberMe = elements.rememberMe.checked;

    if (!username || !password) {
        showLoginError('Wypełnij wszystkie pola');
        return;
    }

    elements.btnLogin.disabled = true;
    elements.btnLogin.textContent = 'Logowanie...';

    try {
        const response = await api.login(username, password);

        if (response.success) {
            state.user = response.data.user;
            state.token = response.data.token;
            state.isLoggedIn = true;

            // Zapisz sesję
            if (rememberMe) {
                await window.electronAPI?.setStore('username', username);
                await window.electronAPI?.setStore('token', state.token);
                await window.electronAPI?.setStore('rememberMe', true);
            }

            updateUserUI();
            closeModal('login');
            showToast('Zalogowano pomyślnie!', 'success');

            // Wyczyść formularz
            elements.loginForm.reset();
        }
    } catch (error) {
        showLoginError(error.message);
    } finally {
        elements.btnLogin.disabled = false;
        elements.btnLogin.textContent = 'Zaloguj się';
    }
}

async function handleRegister(e) {
    e.preventDefault();

    const username = elements.registerUsername.value.trim();
    const password = elements.registerPassword.value;
    const passwordConfirm = elements.registerPasswordConfirm.value;

    if (!username || !password || !passwordConfirm) {
        showRegisterError('Wypełnij wszystkie pola');
        return;
    }

    if (password !== passwordConfirm) {
        showRegisterError('Hasła nie są identyczne');
        return;
    }

    try {
        const response = await api.register(username, password);

        if (response.success) {
            state.user = response.data.user;
            state.token = response.data.token;
            state.isLoggedIn = true;

            // Zapisz sesję
            await window.electronAPI?.setStore('username', username);
            await window.electronAPI?.setStore('token', state.token);
            await window.electronAPI?.setStore('rememberMe', true);

            updateUserUI();
            closeModal('register');
            showToast('Konto utworzone! Witaj na serwerze!', 'success');

            elements.registerForm.reset();
        }
    } catch (error) {
        showRegisterError(error.message);
    }
}

async function loadSavedSession() {
    try {
        const rememberMe = await window.electronAPI?.getStore('rememberMe');
        if (!rememberMe) return;

        const username = await window.electronAPI?.getStore('username');
        const token = await window.electronAPI?.getStore('token');

        if (username && token) {
            api.setToken(token);

            // Weryfikuj token
            try {
                const response = await api.verifyToken();
                if (response.success) {
                    state.user = response.data.user;
                    state.token = token;
                    state.isLoggedIn = true;
                    updateUserUI();
                }
            } catch {
                // Token nieważny - wyczyść
                await window.electronAPI?.deleteStore('token');
            }
        }
    } catch (error) {
        console.error('Błąd ładowania sesji:', error);
    }
}

function logout() {
    state.user = null;
    state.token = null;
    state.isLoggedIn = false;

    api.setToken(null);

    window.electronAPI?.deleteStore('token');
    window.electronAPI?.deleteStore('username');

    updateUserUI();
    showToast('Wylogowano', 'info');
}

function updateUserUI() {
    if (state.isLoggedIn && state.user) {
        elements.userName.textContent = state.user.username;
        elements.userStatus.textContent = 'Kliknij aby się wylogować';
        elements.userAvatar.textContent = state.user.username[0].toUpperCase();
        elements.btnPlay.disabled = false;
        elements.playSubtext.textContent = 'Kliknij aby rozpocząć';
    } else {
        elements.userName.textContent = 'Niezalogowany';
        elements.userStatus.textContent = 'Kliknij aby się zalogować';
        elements.userAvatar.textContent = '?';
        elements.btnPlay.disabled = true;
        elements.playSubtext.textContent = 'Zaloguj się aby grać';
    }
}

function showLoginError(message) {
    elements.loginError.textContent = message;
    elements.loginError.classList.add('active');
}

function showRegisterError(message) {
    elements.registerError.textContent = message;
    elements.registerError.classList.add('active');
}

// ============================================
// KONFIGURACJA SERWERA
// ============================================
async function loadServerConfig() {
    try {
        const response = await api.getLauncherConfig();

        if (response.success) {
            state.config = response.data;

            // Aktualizuj UI
            const config = response.data.config;
            elements.serverAddress.textContent = `${config.serverIp}:${config.serverPort}`;

            let versionText = config.gameVersion;
            if (config.loaderType !== 'vanilla') {
                versionText += ` (${config.loaderType})`;
            }
            elements.gameVersion.textContent = versionText;

            // Status serwera
            if (config.maintenanceMode) {
                elements.serverStatusIndicator.className = 'status-indicator maintenance';
                state.serverOnline = false;
            } else {
                elements.serverStatusIndicator.className = 'status-indicator online';
                state.serverOnline = true;
            }

            // Wyświetl powiadomienia
            displayBroadcasts(response.data.broadcasts);
        }
    } catch (error) {
        console.error('Błąd ładowania konfiguracji:', error);
        elements.serverAddress.textContent = 'Brak połączenia';
        elements.serverStatusIndicator.className = 'status-indicator offline';
        state.serverOnline = false;

        showToast('Nie można połączyć z serwerem', 'error');
    }
}

function displayBroadcasts(broadcasts) {
    if (!broadcasts || broadcasts.length === 0) {
        elements.broadcastsContainer.innerHTML = '';
        return;
    }

    elements.broadcastsContainer.innerHTML = broadcasts.map(b => `
        <div class="broadcast-item ${b.type}">
            <h4 class="broadcast-title">${escapeHtml(b.title)}</h4>
            <p class="broadcast-message">${escapeHtml(b.message)}</p>
        </div>
    `).join('');
}

// ============================================
// PRZYCISK GRAJ
// ============================================
function initPlayButton() {
    elements.btnPlay?.addEventListener('click', handlePlay);
}

async function handlePlay() {
    if (!state.isLoggedIn) {
        openModal('login');
        return;
    }

    if (!state.serverOnline) {
        showToast('Serwer jest w trybie konserwacji', 'warning');
        return;
    }

    // Pobierz ustawienia
    const settings = await getSettings();

    // Pokaż progress
    elements.progressContainer.style.display = 'block';
    elements.btnPlay.disabled = true;

    // Reset statystyk
    elements.progressSize.textContent = '';
    elements.progressSpeed.textContent = '';

    try {
        await gameLauncher.launch(
            {
                username: state.user.username,
                token: state.token
            },
            settings,
            {
                onProgress: (percent, details, stats) => {
                    elements.progressFill.style.width = `${percent}%`;
                    elements.progressPercent.textContent = `${percent}%`;
                    elements.progressDetails.textContent = details || '';

                    // Wyświetl rozmiar i prędkość
                    if (stats && stats.downloadedBytes !== undefined) {
                        elements.progressSize.textContent = `${formatBytes(stats.downloadedBytes)} / ${formatBytes(stats.totalBytes)}`;
                    }
                    if (stats && stats.speed !== undefined) {
                        elements.progressSpeed.textContent = `${formatBytes(stats.speed)}/s`;
                    }
                },
                onStatusChange: (status) => {
                    elements.progressText.textContent = status;
                },
                onComplete: (result) => {
                    showToast('Łączenie z serwerem...', 'success');
                    elements.progressContainer.style.display = 'none';
                    elements.btnPlay.disabled = false;
                },
                onError: (error) => {
                    showToast(error, 'error');
                    elements.progressContainer.style.display = 'none';
                    elements.btnPlay.disabled = false;
                }
            }
        );
    } catch (error) {
        showToast(error.message, 'error');
        elements.progressContainer.style.display = 'none';
        elements.btnPlay.disabled = false;
    }
}

/**
 * Formatuje bajty do czytelnej formy (KB, MB, GB)
 */
function formatBytes(bytes) {
    if (bytes === 0 || bytes === undefined) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============================================
// USTAWIENIA
// ============================================
async function initSettings() {
    // Pobierz info o systemie
    const sysInfo = await window.electronAPI?.getSystemInfo();
    if (sysInfo) {
        const maxRam = Math.min(sysInfo.totalMemory - 2, 32); // Zostaw 2GB dla systemu
        elements.ramMax.max = maxRam;
        elements.ramHint.textContent = `Dostępne: ${sysInfo.totalMemory} GB RAM. Zalecane: 4-8 GB dla modów.`;
    }

    // Załaduj zapisane ustawienia
    const settings = await getSettings();

    elements.ramMin.value = settings.ram?.min || 2;
    elements.ramMax.value = settings.ram?.max || 4;
    elements.ramMinValue.textContent = `${elements.ramMin.value} GB`;
    elements.ramMaxValue.textContent = `${elements.ramMax.value} GB`;

    elements.javaPath.value = settings.javaPath || '';
    elements.customJavaArgs.value = settings.customJavaArgs || '';
    elements.resWidth.value = settings.resolution?.width || 1280;
    elements.resHeight.value = settings.resolution?.height || 720;
    elements.fullscreen.checked = settings.resolution?.fullscreen || false;
    elements.closeOnLaunch.checked = settings.closeOnLaunch || false;
    elements.autoUpdate.checked = settings.autoUpdate !== false;

    const gamePath = await window.electronAPI?.getGamePath();
    elements.gamePath.value = gamePath || '';

    // Event listeners
    elements.ramMin.addEventListener('input', () => {
        elements.ramMinValue.textContent = `${elements.ramMin.value} GB`;
        // Upewnij się że min <= max
        if (parseInt(elements.ramMin.value) > parseInt(elements.ramMax.value)) {
            elements.ramMax.value = elements.ramMin.value;
            elements.ramMaxValue.textContent = `${elements.ramMax.value} GB`;
        }
    });

    elements.ramMax.addEventListener('input', () => {
        elements.ramMaxValue.textContent = `${elements.ramMax.value} GB`;
        // Upewnij się że max >= min
        if (parseInt(elements.ramMax.value) < parseInt(elements.ramMin.value)) {
            elements.ramMin.value = elements.ramMax.value;
            elements.ramMinValue.textContent = `${elements.ramMin.value} GB`;
        }
    });

    elements.btnJavaBrowse?.addEventListener('click', async () => {
        const path = await window.electronAPI?.selectJavaPath();
        if (path) {
            elements.javaPath.value = path;
        }
    });

    elements.btnGameBrowse?.addEventListener('click', async () => {
        const path = await window.electronAPI?.selectGamePath();
        if (path) {
            elements.gamePath.value = path;
        }
    });

    elements.btnOpenFolder?.addEventListener('click', () => {
        window.electronAPI?.openGameFolder();
    });

    elements.btnResetSettings?.addEventListener('click', resetSettings);
    elements.btnSaveSettings?.addEventListener('click', saveSettings);
}

async function getSettings() {
    return {
        ram: {
            min: await window.electronAPI?.getStore('ram.min') || 2,
            max: await window.electronAPI?.getStore('ram.max') || 4
        },
        javaPath: await window.electronAPI?.getStore('javaPath') || '',
        customJavaArgs: await window.electronAPI?.getStore('customJavaArgs') || '',
        resolution: {
            width: await window.electronAPI?.getStore('resolution.width') || 1280,
            height: await window.electronAPI?.getStore('resolution.height') || 720,
            fullscreen: await window.electronAPI?.getStore('resolution.fullscreen') || false
        },
        closeOnLaunch: await window.electronAPI?.getStore('closeOnLaunch') || false,
        autoUpdate: await window.electronAPI?.getStore('autoUpdate') !== false
    };
}

async function saveSettings() {
    await window.electronAPI?.setStore('ram', {
        min: parseInt(elements.ramMin.value),
        max: parseInt(elements.ramMax.value)
    });
    await window.electronAPI?.setStore('javaPath', elements.javaPath.value);
    await window.electronAPI?.setStore('customJavaArgs', elements.customJavaArgs.value);
    await window.electronAPI?.setStore('resolution', {
        width: parseInt(elements.resWidth.value),
        height: parseInt(elements.resHeight.value),
        fullscreen: elements.fullscreen.checked
    });
    await window.electronAPI?.setStore('closeOnLaunch', elements.closeOnLaunch.checked);
    await window.electronAPI?.setStore('autoUpdate', elements.autoUpdate.checked);

    showToast('Ustawienia zapisane!', 'success');
}

async function resetSettings() {
    if (!confirm('Czy na pewno chcesz przywrócić domyślne ustawienia?')) return;

    elements.ramMin.value = 2;
    elements.ramMax.value = 4;
    elements.ramMinValue.textContent = '2 GB';
    elements.ramMaxValue.textContent = '4 GB';
    elements.javaPath.value = '';
    elements.customJavaArgs.value = '';
    elements.resWidth.value = 1280;
    elements.resHeight.value = 720;
    elements.fullscreen.checked = false;
    elements.closeOnLaunch.checked = false;
    elements.autoUpdate.checked = true;

    await saveSettings();
    showToast('Ustawienia przywrócone do domyślnych', 'info');
}

// ============================================
// WERSJA LAUNCHERA
// ============================================
async function loadLauncherVersion() {
    try {
        const version = await window.electronAPI?.getLauncherVersion();
        elements.launcherVersion.textContent = version || '1.0.0';
    } catch {
        elements.launcherVersion.textContent = '1.0.0';
    }
}

// ============================================
// POMOCNICZE
// ============================================
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    elements.toastContainer.appendChild(toast);

    // Usuń po 4 sekundach
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Odświeżaj konfigurację co 5 minut
setInterval(loadServerConfig, 5 * 60 * 1000);
