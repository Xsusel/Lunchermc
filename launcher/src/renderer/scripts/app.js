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
    serverOnline: true,
    currentTheme: 'dark',
    rulesAccepted: false,
    pendingRules: null
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
    serverPing: document.getElementById('server-ping'),
    playersOnline: document.getElementById('players-online'),
    gameVersion: document.getElementById('game-version'),
    modsCount: document.getElementById('mods-count'),
    progressContainer: document.getElementById('progress-container'),
    progressText: document.getElementById('progress-text'),
    progressPercent: document.getElementById('progress-percent'),
    progressFill: document.getElementById('progress-fill'),
    progressSize: document.getElementById('progress-size'),
    progressSpeed: document.getElementById('progress-speed'),
    progressEta: document.getElementById('progress-eta'),
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
    themeSelect: document.getElementById('theme-select'),
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

    // Changelog modal
    changelogModal: document.getElementById('changelog-modal'),
    changelogModalClose: document.getElementById('changelog-modal-close'),
    changelogVersion: document.getElementById('changelog-version'),
    changelogContent: document.getElementById('changelog-content'),
    btnChangelogClose: document.getElementById('btn-changelog-close'),

    // Rules modal
    rulesModal: document.getElementById('rules-modal'),
    rulesModalClose: document.getElementById('rules-modal-close'),
    rulesTitle: document.getElementById('rules-title'),
    rulesVersion: document.getElementById('rules-version'),
    rulesContent: document.getElementById('rules-content'),
    rulesAcceptCheckbox: document.getElementById('rules-accept-checkbox'),
    btnRulesAccept: document.getElementById('btn-rules-accept'),
    btnRulesDecline: document.getElementById('btn-rules-decline'),

    // Toast
    toastContainer: document.getElementById('toast-container')
};

// ============================================
// INICJALIZACJA
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('XsusLauncher inicjalizacja...');

    // Załaduj zapisany motyw przed inicjalizacją UI
    await initTheme();

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

    // Sprawdź czy pokazać changelog (nowa wersja)
    await checkChangelog();

    console.log('XsusLauncher gotowy!');
});

// ============================================
// MOTYWY
// ============================================

/**
 * Inicjalizuje system motywów
 */
async function initTheme() {
    try {
        const themeData = await window.electronAPI?.themes?.getCurrent();
        if (themeData && themeData.variables) {
            applyThemeVariables(themeData.variables);
            state.currentTheme = themeData.id;
        }
    } catch (e) {
        console.warn('Nie udało się załadować motywu:', e);
    }
}

/**
 * Aplikuje zmienne CSS motywu
 */
function applyThemeVariables(variables) {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(variables)) {
        root.style.setProperty(key, value);
    }
}

/**
 * Zmienia motyw
 */
async function changeTheme(themeId) {
    try {
        const result = await window.electronAPI?.themes?.setTheme(themeId);
        if (result && result.success) {
            applyThemeVariables(result.variables);
            state.currentTheme = themeId;
            showToast('Motyw zmieniony', 'success');
            return true;
        }
    } catch (e) {
        console.error('Błąd zmiany motywu:', e);
        showToast('Błąd zmiany motywu', 'error');
    }
    return false;
}

/**
 * Pobiera listę dostępnych motywów
 */
async function getAvailableThemes() {
    try {
        return await window.electronAPI?.themes?.getAvailable() || [];
    } catch (e) {
        console.error('Błąd pobierania motywów:', e);
        return [];
    }
}

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

    // Changelog modal
    elements.changelogModalClose?.addEventListener('click', () => closeModal('changelog'));
    elements.btnChangelogClose?.addEventListener('click', () => closeModal('changelog'));
    elements.changelogModal?.addEventListener('click', (e) => {
        if (e.target === elements.changelogModal) closeModal('changelog');
    });

    // Rules modal
    elements.rulesModalClose?.addEventListener('click', () => closeModal('rules'));
    elements.btnRulesDecline?.addEventListener('click', () => closeModal('rules'));
    elements.rulesModal?.addEventListener('click', (e) => {
        if (e.target === elements.rulesModal) closeModal('rules');
    });

    // Checkbox akceptacji
    elements.rulesAcceptCheckbox?.addEventListener('change', (e) => {
        if (elements.btnRulesAccept) {
            elements.btnRulesAccept.disabled = !e.target.checked;
        }
    });

    // Przycisk akceptacji
    elements.btnRulesAccept?.addEventListener('click', handleRulesAccept);

    // Formularze
    elements.loginForm?.addEventListener('submit', handleLogin);
    elements.registerForm?.addEventListener('submit', handleRegister);
}

function openModal(name) {
    let modal;
    if (name === 'login') modal = elements.loginModal;
    else if (name === 'register') modal = elements.registerModal;
    else if (name === 'changelog') modal = elements.changelogModal;
    else if (name === 'rules') modal = elements.rulesModal;

    modal?.classList.add('active');
}

function closeModal(name) {
    let modal;
    if (name === 'login') modal = elements.loginModal;
    else if (name === 'register') modal = elements.registerModal;
    else if (name === 'changelog') modal = elements.changelogModal;
    else if (name === 'rules') modal = elements.rulesModal;

    modal?.classList.remove('active');

    // Wyczyść błędy
    if (name === 'login') {
        elements.loginError.classList.remove('active');
        elements.loginError.textContent = '';
    } else if (name === 'register') {
        elements.registerError.classList.remove('active');
        elements.registerError.textContent = '';
    } else if (name === 'changelog') {
        // Oznacz changelog jako widziany przy zamknięciu
        window.electronAPI?.markChangelogSeen();
    } else if (name === 'rules') {
        // Reset checkboxa
        if (elements.rulesAcceptCheckbox) {
            elements.rulesAcceptCheckbox.checked = false;
        }
        if (elements.btnRulesAccept) {
            elements.btnRulesAccept.disabled = true;
        }
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
        elements.btnPlay.disabled = !state.serverOnline;

        if (state.serverOnline) {
            elements.playSubtext.textContent = 'Kliknij aby rozpocząć';
        } else {
            elements.playSubtext.textContent = 'Serwer niedostępny';
        }
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

            // Liczba modów - API zwraca tylko włączone mody, więc liczymy wszystkie
            // Plus pliki typu 'mod' z listy files
            const modsFromMods = response.data.mods?.length || 0;
            const modsFromFiles = response.data.files?.filter(f => f.type === 'mod').length || 0;
            // Użyj większej wartości (files zawiera mody, więc nie sumujemy)
            const modsCount = Math.max(modsFromMods, modsFromFiles);
            if (elements.modsCount) {
                elements.modsCount.textContent = modsCount;
            }

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

            // Pobierz status serwera MC (ping, gracze)
            loadServerStatus();
        }
    } catch (error) {
        console.error('Błąd ładowania konfiguracji:', error);
        elements.serverAddress.textContent = 'Brak połączenia';
        elements.serverStatusIndicator.className = 'status-indicator offline';
        state.serverOnline = false;

        showToast('Nie można połączyć z serwerem', 'error');
    }
}

/**
 * Pobiera status serwera MC (ping, gracze online)
 */
async function loadServerStatus() {
    try {
        const response = await api.getServerStatus();

        if (response.success && response.data) {
            const data = response.data;

            // Aktualizuj ping
            if (elements.serverPing) {
                const pingValue = elements.serverPing.querySelector('.ping-value');
                if (data.online && data.latency) {
                    pingValue.textContent = `${data.latency}ms`;
                    elements.serverPing.classList.remove('offline');
                    elements.serverPing.classList.add('online');
                } else {
                    pingValue.textContent = '--';
                    elements.serverPing.classList.remove('online');
                    elements.serverPing.classList.add('offline');
                }
            }

            // Aktualizuj liczbę graczy
            if (elements.playersOnline) {
                if (data.online && data.players) {
                    elements.playersOnline.textContent = `${data.players.online}/${data.players.max}`;
                } else {
                    elements.playersOnline.textContent = '0';
                }
            }

            // Aktualizuj status serwera
            if (data.maintenanceMode) {
                elements.serverStatusIndicator.className = 'status-indicator maintenance';
                state.serverOnline = false;
            } else if (data.online) {
                elements.serverStatusIndicator.className = 'status-indicator online';
                state.serverOnline = true;
            } else {
                elements.serverStatusIndicator.className = 'status-indicator offline';
                state.serverOnline = false;
            }

            // Aktualizuj przycisk graj
            updateUserUI();
        }
    } catch (error) {
        console.error('Błąd pobierania statusu serwera:', error);
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

    // Sprawdź czy użytkownik zaakceptował regulamin
    const rulesCheck = await checkRules();
    if (rulesCheck.needsAcceptance) {
        showRulesModal(rulesCheck.rules);
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
    if (elements.progressEta) elements.progressEta.textContent = '';

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
                    if (stats && stats.speed !== undefined && stats.speed > 0) {
                        elements.progressSpeed.textContent = `${formatBytes(stats.speed)}/s`;

                        // Oblicz ETA
                        if (elements.progressEta && stats.totalBytes > 0) {
                            const remaining = stats.totalBytes - stats.downloadedBytes;
                            const eta = remaining / stats.speed;
                            elements.progressEta.textContent = formatTime(eta);
                        }
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
                    showToast(translateError(error), 'error');
                    elements.progressContainer.style.display = 'none';
                    elements.btnPlay.disabled = false;
                }
            }
        );
    } catch (error) {
        showToast(translateError(error.message), 'error');
        elements.progressContainer.style.display = 'none';
        elements.btnPlay.disabled = false;
    }
}

/**
 * Tłumaczy komunikaty błędów na bardziej przyjazne
 */
function translateError(error) {
    const translations = {
        'Nie znaleziono Java': 'Nie znaleziono Java. Zainstaluj Java 17 lub nowszą.',
        'Brak połączenia z serwerem': 'Brak połączenia z serwerem. Sprawdź połączenie internetowe.',
        'Network Error': 'Błąd sieci. Sprawdź połączenie internetowe.',
        'Failed to fetch': 'Nie można połączyć z serwerem.',
        'Connection timeout': 'Przekroczono czas oczekiwania na połączenie.',
        'Serwer jest w trybie konserwacji': 'Serwer jest w trybie konserwacji. Spróbuj później.',
        'Nie można pobrać konfiguracji serwera': 'Nie można pobrać konfiguracji. Spróbuj ponownie.',
        'Download timeout': 'Pobieranie trwało za długo. Spróbuj ponownie.'
    };

    for (const [key, value] of Object.entries(translations)) {
        if (error && error.includes(key)) {
            return value;
        }
    }

    return error || 'Wystąpił nieoczekiwany błąd';
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

/**
 * Formatuje czas w sekundach do czytelnej formy (mm:ss lub hh:mm:ss)
 */
function formatTime(seconds) {
    if (!seconds || seconds <= 0 || !isFinite(seconds)) return '--:--';

    seconds = Math.ceil(seconds);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
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

    // Inicjalizuj selektor motywów
    await initThemeSelector();
}

/**
 * Inicjalizuje selektor motywów
 */
async function initThemeSelector() {
    if (!elements.themeSelect) return;

    try {
        // Pobierz dostępne motywy
        const themes = await getAvailableThemes();

        // Wyczyść i wypełnij select
        elements.themeSelect.innerHTML = '';

        for (const theme of themes) {
            const option = document.createElement('option');
            option.value = theme.id;
            option.textContent = theme.name;
            option.title = theme.description;
            elements.themeSelect.appendChild(option);
        }

        // Ustaw aktualny motyw
        elements.themeSelect.value = state.currentTheme;

        // Listener dla zmiany motywu
        elements.themeSelect.addEventListener('change', async (e) => {
            const themeId = e.target.value;
            await changeTheme(themeId);
        });

    } catch (e) {
        console.error('Błąd inicjalizacji selektora motywów:', e);
    }
}

async function getSettings() {
    // Użyj batch operation dla optymalizacji (1 IPC call zamiast 9)
    if (window.electronAPI?.getStoreMultiple) {
        const data = await window.electronAPI.getStoreMultiple([
            'ram', 'javaPath', 'customJavaArgs', 'resolution', 'closeOnLaunch', 'autoUpdate'
        ]);
        return {
            ram: data.ram || { min: 2, max: 4 },
            javaPath: data.javaPath || '',
            customJavaArgs: data.customJavaArgs || '',
            resolution: data.resolution || { width: 1280, height: 720, fullscreen: false },
            closeOnLaunch: data.closeOnLaunch || false,
            autoUpdate: data.autoUpdate !== false
        };
    }

    // Fallback dla starszych wersji
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
    // Użyj batch operation dla optymalizacji (1 IPC call zamiast 6)
    if (window.electronAPI?.setStoreMultiple) {
        await window.electronAPI.setStoreMultiple({
            ram: {
                min: parseInt(elements.ramMin.value),
                max: parseInt(elements.ramMax.value)
            },
            javaPath: elements.javaPath.value,
            customJavaArgs: elements.customJavaArgs.value,
            resolution: {
                width: parseInt(elements.resWidth.value),
                height: parseInt(elements.resHeight.value),
                fullscreen: elements.fullscreen.checked
            },
            closeOnLaunch: elements.closeOnLaunch.checked,
            autoUpdate: elements.autoUpdate.checked
        });
    } else {
        // Fallback
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
    }

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
// CHANGELOG
// ============================================
async function checkChangelog() {
    try {
        const result = await window.electronAPI?.shouldShowChangelog();
        if (result?.show && result?.changelog) {
            showChangelog(result.version, result.changelog);
        }
    } catch (error) {
        console.warn('Failed to check changelog:', error);
    }
}

function showChangelog(version, changelog) {
    // Ustaw wersję
    if (elements.changelogVersion) {
        elements.changelogVersion.textContent = version;
    }

    // Buduj zawartość
    if (elements.changelogContent && changelog) {
        let html = '';

        // Sekcja "Nowe"
        if (changelog.sections?.new?.length > 0) {
            html += `
                <div class="changelog-section">
                    <h4 class="changelog-section-title new">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        Nowe funkcje
                    </h4>
                    <ul class="changelog-list">
                        ${changelog.sections.new.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        // Sekcja "Ulepszenia"
        if (changelog.sections?.improved?.length > 0) {
            html += `
                <div class="changelog-section">
                    <h4 class="changelog-section-title improved">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                            <polyline points="17 6 23 6 23 12"/>
                        </svg>
                        Ulepszenia
                    </h4>
                    <ul class="changelog-list">
                        ${changelog.sections.improved.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        // Sekcja "Naprawione"
        if (changelog.sections?.fixed?.length > 0) {
            html += `
                <div class="changelog-section">
                    <h4 class="changelog-section-title fixed">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                            <polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        Naprawione błędy
                    </h4>
                    <ul class="changelog-list">
                        ${changelog.sections.fixed.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        elements.changelogContent.innerHTML = html;
    }

    // Otwórz modal
    openModal('changelog');
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

// ============================================
// REGULAMIN SERWERA
// ============================================

/**
 * Sprawdza czy użytkownik musi zaakceptować regulamin
 * @returns {Promise<{needsAcceptance: boolean, rules: object|null}>}
 */
async function checkRules() {
    if (!state.isLoggedIn || !state.token) {
        return { needsAcceptance: false, rules: null };
    }

    try {
        const response = await api.checkRulesAcceptance();

        if (response.success && response.data) {
            state.rulesAccepted = response.data.accepted;

            if (!response.data.accepted && response.data.rules) {
                state.pendingRules = response.data.rules;
                return { needsAcceptance: true, rules: response.data.rules };
            }
        }

        return { needsAcceptance: false, rules: null };
    } catch (error) {
        console.warn('Błąd sprawdzania regulaminu:', error);
        // W przypadku błędu pozwalamy grać
        return { needsAcceptance: false, rules: null };
    }
}

/**
 * Wyświetla modal z regulaminem
 */
function showRulesModal(rules) {
    if (!rules) return;

    // Ustaw tytuł
    if (elements.rulesTitle) {
        elements.rulesTitle.textContent = rules.title || 'Regulamin Serwera';
    }

    // Ustaw wersję
    if (elements.rulesVersion) {
        elements.rulesVersion.textContent = `Wersja: ${rules.version}`;
    }

    // Ustaw treść (konwertuj markdown na HTML jeśli potrzeba)
    if (elements.rulesContent) {
        // Prosta konwersja markdown - nagłówki i listy
        let html = escapeHtml(rules.content);

        // Nagłówki ## -> h3
        html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');

        // Pogrubienie **text**
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // Lista numerowana
        html = html.replace(/^\d+\. (.+)$/gm, '<li class="numbered">$1</li>');

        // Lista punktowana
        html = html.replace(/^- (.+)$/gm, '<li>$1</li>');

        // Nowe linie
        html = html.replace(/\n\n/g, '</p><p>');
        html = '<p>' + html + '</p>';

        elements.rulesContent.innerHTML = html;
    }

    // Reset checkboxa i przycisku
    if (elements.rulesAcceptCheckbox) {
        elements.rulesAcceptCheckbox.checked = false;
    }
    if (elements.btnRulesAccept) {
        elements.btnRulesAccept.disabled = true;
    }

    // Otwórz modal
    openModal('rules');
}

/**
 * Obsługuje akceptację regulaminu
 */
async function handleRulesAccept() {
    if (!elements.rulesAcceptCheckbox?.checked) {
        showToast('Musisz zaznaczyć akceptację regulaminu', 'warning');
        return;
    }

    // Disable button during request
    if (elements.btnRulesAccept) {
        elements.btnRulesAccept.disabled = true;
        elements.btnRulesAccept.textContent = 'Akceptowanie...';
    }

    try {
        const response = await api.acceptRules();

        if (response.success) {
            state.rulesAccepted = true;
            state.pendingRules = null;

            closeModal('rules');
            showToast('Regulamin zaakceptowany!', 'success');

            // Uruchom grę po akceptacji
            handlePlay();
        } else {
            showToast(response.error || 'Błąd akceptacji regulaminu', 'error');
        }
    } catch (error) {
        console.error('Błąd akceptacji regulaminu:', error);
        showToast('Błąd akceptacji regulaminu', 'error');
    } finally {
        if (elements.btnRulesAccept) {
            elements.btnRulesAccept.textContent = 'Akceptuję i chcę grać';
            elements.btnRulesAccept.disabled = !elements.rulesAcceptCheckbox?.checked;
        }
    }
}

// Odświeżaj konfigurację co 5 minut
setInterval(loadServerConfig, 5 * 60 * 1000);

// Odświeżaj status serwera MC co 30 sekund
setInterval(loadServerStatus, 30 * 1000);
