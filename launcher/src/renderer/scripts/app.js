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
    pendingRules: null,
    servers: [],
    selectedServerId: null,
    serverStatuses: {},
    isOffline: false
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
    serverList: document.getElementById('server-list'),
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
    javaStatus: document.getElementById('java-status'),
    javaStatusIcon: document.getElementById('java-status-icon'),
    javaStatusText: document.getElementById('java-status-text'),
    javaActions: document.getElementById('java-actions'),
    btnJavaInstall: document.getElementById('btn-java-install'),
    javaInstallProgress: document.getElementById('java-install-progress'),
    javaInstallFill: document.getElementById('java-install-fill'),
    javaInstallStatus: document.getElementById('java-install-status'),
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
    apiUrl: document.getElementById('api-url'),
    btnApiUrlReset: document.getElementById('btn-api-url-reset'),
    launcherVersion: document.getElementById('launcher-version'),

    // Logi gry
    logSessionSelect: document.getElementById('log-session-select'),
    btnLogsClear: document.getElementById('btn-logs-clear'),
    btnLogsCopy: document.getElementById('btn-logs-copy'),
    btnLogsFolder: document.getElementById('btn-logs-folder'),
    logsAutoscroll: document.getElementById('logs-autoscroll'),
    logsContainer: document.getElementById('logs-container'),
    logsOutput: document.getElementById('logs-output'),

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

    // News section
    newsSection: document.getElementById('news-section'),
    newsContainer: document.getElementById('news-container'),
    newsToggle: document.getElementById('news-toggle'),

    // Update modal
    updateModal: document.getElementById('update-modal'),
    updateModalClose: document.getElementById('update-modal-close'),
    updateCurrentVersion: document.getElementById('update-current-version'),
    updateNewVersion: document.getElementById('update-new-version'),
    updateChangelog: document.getElementById('update-changelog'),
    updateProgress: document.getElementById('update-progress'),
    updateProgressText: document.getElementById('update-progress-text'),
    updateProgressPercent: document.getElementById('update-progress-percent'),
    updateProgressFill: document.getElementById('update-progress-fill'),
    updateFooter: document.getElementById('update-footer'),
    updateInstallFooter: document.getElementById('update-install-footer'),
    btnUpdateLater: document.getElementById('btn-update-later'),
    btnUpdateNow: document.getElementById('btn-update-now'),
    btnUpdateInstall: document.getElementById('btn-update-install'),

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

    // Pobierz aktualności
    await loadNews();

    // Inicjalizuj sekcję aktualności
    initNewsSection();

    // Pobierz wersję launchera
    await loadLauncherVersion();

    // Inicjalizuj przycisk graj
    initPlayButton();

    // Sprawdź czy pokazać changelog (nowa wersja)
    await checkChangelog();

    // Inicjalizuj system aktualizacji
    initAutoUpdate();

    // Inicjalizuj tryb offline (nasłuchuj zmian statusu sieci)
    initOfflineMode();

    // Sprawdź czy są niedawne raporty o awariach
    await checkRecentCrashReports();

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

    // Odśwież dane specyficzne dla strony
    if (pageName === 'logs') {
        loadLogSessions();
    }
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
    else if (name === 'update') modal = elements.updateModal;

    modal?.classList.add('active');
}

function closeModal(name) {
    let modal;
    if (name === 'login') modal = elements.loginModal;
    else if (name === 'register') modal = elements.registerModal;
    else if (name === 'changelog') modal = elements.changelogModal;
    else if (name === 'rules') modal = elements.rulesModal;
    else if (name === 'update') modal = elements.updateModal;

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

    // Blokuj rejestrację w trybie offline
    if (state.isOffline || window.isOffline) {
        showRegisterError('Rejestracja jest niedostępna w trybie offline');
        return;
    }

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
                // Jeśli jesteśmy offline, użyj zapisanego username bez weryfikacji
                if (window.isOffline) {
                    console.log('[Offline] Używam zapisanej sesji bez weryfikacji tokenu');
                    state.user = { username: username };
                    state.token = token;
                    state.isLoggedIn = true;
                    updateUserUI();
                } else {
                    // Token nieważny - wyczyść
                    await window.electronAPI?.deleteStore('token');
                }
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
            applyServerConfig(response.data);

            // Jeśli byliśmy offline - przywróć
            if (state.isOffline) {
                state.isOffline = false;
                window.isOffline = false;
                removeOfflineIndicator();
                updateOfflineUI();
            }
        }
    } catch (error) {
        console.error('Błąd ładowania konfiguracji:', error);

        // Próba załadowania z cache (electron-store) jeśli offline
        try {
            const cachedResult = await window.electronAPI?.getCachedConfig();
            if (cachedResult && cachedResult.success && cachedResult.data) {
                console.log('[Offline] Ładowanie konfiguracji z cache');
                const cachedData = cachedResult.data.data || cachedResult.data;
                applyServerConfig(cachedData);
                state.isOffline = true;
                window.isOffline = true;
                showOfflineIndicator();
                updateOfflineUI();
                return;
            }
        } catch (cacheError) {
            console.warn('Nie udało się załadować konfiguracji z cache:', cacheError);
        }

        if (elements.serverList) {
            elements.serverList.innerHTML = '<div class="server-list-empty">Brak połączenia z serwerem API</div>';
        }
        state.serverOnline = false;

        showToast('Nie można połączyć z serwerem', 'error');
    }
}

/**
 * Aplikuje dane konfiguracyjne serwera do UI
 */
async function applyServerConfig(data) {
    state.config = data;

    // Aktualizuj UI
    const config = data.config;

    let versionText = config.gameVersion;
    if (config.loaderType !== 'vanilla') {
        versionText += ` (${config.loaderType})`;
    }
    elements.gameVersion.textContent = versionText;

    // Liczba modów
    const modsFromMods = data.mods?.length || 0;
    const modsFromFiles = data.files?.filter(f => f.type === 'mod').length || 0;
    const modsCount = Math.max(modsFromMods, modsFromFiles);
    if (elements.modsCount) {
        elements.modsCount.textContent = modsCount;
    }

    // Serwery
    state.servers = data.servers || [];

    // Przywróć zapisany wybór serwera
    const savedServerId = await window.electronAPI?.getStore('selectedServerId');
    if (savedServerId && state.servers.find(s => s.id === savedServerId)) {
        state.selectedServerId = savedServerId;
    } else {
        // Wybierz domyślny serwer
        const defaultServer = state.servers.find(s => s.isDefault) || state.servers[0];
        state.selectedServerId = defaultServer?.id || null;
    }

    // Renderuj listę serwerów
    renderServerList();

    // Wyświetl powiadomienia
    displayBroadcasts(data.broadcasts);

    // Pobierz statusy serwerów (tylko jeśli online)
    if (!state.isOffline) {
        loadAllServerStatuses();
    }

    // Maintenance check
    state.serverOnline = !config.maintenanceMode;
    updateUserUI();
}

/**
 * Renderuje listę serwerów w UI
 */
function renderServerList() {
    if (!elements.serverList) return;

    if (state.servers.length === 0) {
        elements.serverList.innerHTML = '<div class="server-list-empty">Brak dostępnych serwerów</div>';
        return;
    }

    elements.serverList.innerHTML = state.servers.map(server => {
        const isSelected = server.id === state.selectedServerId;
        const status = state.serverStatuses[server.id];
        const statusClass = status ? (status.online ? 'online' : 'offline') : 'checking';

        // Formatuj ping
        let pingText = '';
        let pingClass = '';
        if (status && status.online && status.latency) {
            pingText = `${status.latency}ms`;
            if (status.latency < 50) pingClass = 'good';
            else if (status.latency < 150) pingClass = 'medium';
            else pingClass = 'bad';
        }

        // Formatuj graczy
        let playersText = '';
        let playersClass = '';
        if (status && status.online && status.players) {
            playersText = `${status.players.online}/${status.players.max}`;
            if (status.players.online > 0) playersClass = 'has-players';
        } else if (status && !status.online) {
            playersText = 'Offline';
        } else {
            playersText = '...';
        }

        return `
            <div class="server-item ${isSelected ? 'selected' : ''}" data-server-id="${server.id}">
                <div class="server-item-indicator ${statusClass}"></div>
                <div class="server-item-info">
                    <div class="server-item-name">
                        ${escapeHtml(server.name)}
                        ${server.isDefault ? '<span class="server-item-default-badge">Domyślny</span>' : ''}
                    </div>
                    <div class="server-item-address">${escapeHtml(server.ip)}:${server.port || 25565}</div>
                    ${server.description ? `<div class="server-item-description">${escapeHtml(server.description)}</div>` : ''}
                </div>
                <div class="server-item-right">
                    <span class="server-item-players ${playersClass}">${playersText}</span>
                    ${pingText ? `<span class="server-item-ping ${pingClass}">${pingText}</span>` : ''}
                </div>
                <div class="server-item-selected-check">
                    <svg class="server-item-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
            </div>
        `;
    }).join('');

    // Dodaj event listenery
    elements.serverList.querySelectorAll('.server-item').forEach(item => {
        item.addEventListener('click', () => {
            const serverId = parseInt(item.dataset.serverId);
            selectServer(serverId);
        });
    });
}

/**
 * Wybiera serwer
 */
async function selectServer(serverId) {
    state.selectedServerId = serverId;

    // Zapisz wybór
    await window.electronAPI?.setStore('selectedServerId', serverId);

    // Zaktualizuj UI
    renderServerList();

    // Zaktualizuj stan online na podstawie wybranego serwera
    const status = state.serverStatuses[serverId];
    if (status) {
        state.serverOnline = status.online && !state.config?.config?.maintenanceMode;
    }
    updateUserUI();
}

/**
 * Pobiera statusy wszystkich serwerów
 */
async function loadAllServerStatuses() {
    for (const server of state.servers) {
        loadServerStatus(server.id);
    }
}

/**
 * Pobiera status konkretnego serwera MC
 */
async function loadServerStatus(serverId) {
    try {
        const url = serverId ? `serverId=${serverId}` : '';
        const response = await api.getServerStatus(url);

        if (response.success && response.data) {
            const data = response.data;
            const id = serverId || 'default';

            state.serverStatuses[id] = {
                online: data.online,
                players: data.players,
                latency: data.latency,
                version: data.version,
                maintenanceMode: data.maintenanceMode
            };

            // Zaktualizuj rendering
            renderServerList();

            // Jeśli to wybrany serwer, zaktualizuj stan online
            if (id === state.selectedServerId) {
                if (data.maintenanceMode) {
                    state.serverOnline = false;
                } else {
                    state.serverOnline = data.online;
                }
                updateUserUI();
            }
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
    // Blokada gry gdy wymagana aktualizacja jest dostępna
    if (pendingUpdate?.isRequired) {
        showUpdateModal(pendingUpdate);
        showToast('Wymagana aktualizacja launchera. Pobierz ją, aby kontynuować.', 'warning');
        return;
    }

    if (!state.isLoggedIn) {
        openModal('login');
        return;
    }

    if (!state.selectedServerId) {
        showToast('Wybierz serwer z listy', 'warning');
        return;
    }

    if (!state.serverOnline) {
        showToast('Serwer jest w trybie konserwacji lub niedostępny', 'warning');
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

    // Pobierz dane wybranego serwera
    const selectedServer = state.servers.find(s => s.id === state.selectedServerId);

    try {
        await gameLauncher.launch(
            {
                username: state.user.username,
                token: state.token,
                selectedServer: selectedServer
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

    // Przycisk auto-instalacji Java
    elements.btnJavaInstall?.addEventListener('click', handleAutoInstallJava);

    // API URL
    try {
        const currentApiUrl = await window.electronAPI?.getApiUrl();
        const storeApiUrl = await window.electronAPI?.getStore('apiUrl');
        if (elements.apiUrl) {
            // Pokaż zapisaną wartość (puste = domyślny)
            elements.apiUrl.value = storeApiUrl || '';
            elements.apiUrl.placeholder = `${currentApiUrl} (domyślny)`;
        }
    } catch (e) {
        console.warn('Błąd ładowania API URL:', e);
    }

    elements.btnApiUrlReset?.addEventListener('click', async () => {
        if (elements.apiUrl) {
            elements.apiUrl.value = '';
        }
        await window.electronAPI?.setApiUrl('');
        const resolvedUrl = await window.electronAPI?.getApiUrl();
        if (elements.apiUrl) {
            elements.apiUrl.placeholder = `${resolvedUrl} (domyślny)`;
        }
        // Aktualizuj api client
        api.updateBaseUrl(resolvedUrl);
        showToast('URL API przywrócony do domyślnego', 'info');
    });

    // Sprawdz status Java
    await checkJavaStatus();

    // Inicjalizuj selektor motywów
    await initThemeSelector();

    // Inicjalizuj logi gry
    initGameLogs();
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
            ramManuallyConfigured: true,
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
        await window.electronAPI?.setStore('ramManuallyConfigured', true);
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

    // Zapisz API URL osobno (wymaga specjalnej obsługi)
    const newApiUrl = elements.apiUrl?.value?.trim() || '';
    const result = await window.electronAPI?.setApiUrl(newApiUrl);
    if (result?.success) {
        // Aktualizuj api client w rendererze
        api.updateBaseUrl(result.apiUrl);
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
    if (elements.apiUrl) elements.apiUrl.value = '';

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
// AKTUALNOŚCI (NEWS)
// ============================================

/**
 * Ładuje aktualności z serwera
 */
async function loadNews() {
    try {
        const response = await api.getNews({ limit: 5 });

        if (response.success && response.data) {
            displayNews(response.data);
        }
    } catch (error) {
        console.warn('Błąd ładowania aktualności:', error);
        // Ukryj sekcję aktualności jeśli błąd
        if (elements.newsSection) {
            elements.newsSection.style.display = 'none';
        }
    }
}

/**
 * Inicjalizuje sekcję aktualności
 */
function initNewsSection() {
    // Toggle zwijania/rozwijania
    elements.newsToggle?.addEventListener('click', () => {
        elements.newsSection?.classList.toggle('collapsed');
    });
}

/**
 * Wyświetla aktualności
 */
function displayNews(newsList) {
    if (!elements.newsContainer) return;

    if (!newsList || newsList.length === 0) {
        elements.newsSection.style.display = 'none';
        return;
    }

    elements.newsSection.style.display = 'block';

    const typeLabels = {
        news: 'Wiadomość',
        update: 'Aktualizacja',
        event: 'Wydarzenie',
        maintenance: 'Konserwacja',
        announcement: 'Ogłoszenie'
    };

    elements.newsContainer.innerHTML = newsList.map(item => `
        <div class="news-item ${item.is_pinned ? 'pinned' : ''}" data-news-id="${item.id}">
            <div class="news-item-header">
                <span class="news-type ${item.type}">${typeLabels[item.type] || item.type}</span>
                ${item.is_pinned ? `
                    <svg class="news-pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <path d="M12 2v20M2 12h20"/>
                    </svg>
                ` : ''}
            </div>
            <h4 class="news-item-title">${escapeHtml(item.title)}</h4>
            <p class="news-item-summary">${escapeHtml(item.summary || '')}</p>
            <div class="news-item-footer">
                <span class="news-item-date">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 6v6l4 2"/>
                    </svg>
                    ${formatNewsDate(item.published_at)}
                </span>
                ${item.tags && item.tags.length > 0 ? `
                    <div class="news-item-tags">
                        ${item.tags.slice(0, 2).map(tag => `<span class="news-tag">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('');

    // Dodaj event listenery do kliknięcia
    elements.newsContainer.querySelectorAll('.news-item').forEach(item => {
        item.addEventListener('click', () => {
            const newsId = item.dataset.newsId;
            showNewsDetails(newsId);
        });
    });
}

/**
 * Formatuje datę aktualności
 */
function formatNewsDate(dateStr) {
    if (!dateStr) return '';

    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) {
        return `${diffMins} min temu`;
    } else if (diffHours < 24) {
        return `${diffHours} godz. temu`;
    } else if (diffDays < 7) {
        return `${diffDays} dni temu`;
    } else {
        return date.toLocaleDateString('pl-PL');
    }
}

/**
 * Wyświetla szczegóły aktualności
 */
async function showNewsDetails(newsId) {
    try {
        const response = await api.getNewsDetails(newsId);

        if (response.success && response.data) {
            const news = response.data;

            const typeLabels = {
                news: 'Wiadomość',
                update: 'Aktualizacja',
                event: 'Wydarzenie',
                maintenance: 'Konserwacja',
                announcement: 'Ogłoszenie'
            };

            // Prosta konwersja markdown
            let content = escapeHtml(news.content);
            content = content.replace(/^## (.+)$/gm, '<h3>$1</h3>');
            content = content.replace(/^### (.+)$/gm, '<h4>$1</h4>');
            content = content.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            content = content.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
            content = content.replace(/^- (.+)$/gm, '<li>$1</li>');
            content = content.replace(/\n\n/g, '</p><p>');
            content = '<p>' + content + '</p>';

            showToast(`Czytasz: ${news.title}`, 'info');

            // Można też pokazać modal z pełną treścią
            // Na razie pokazujemy toast - można rozbudować o modal
        }
    } catch (error) {
        console.error('Błąd ładowania szczegółów aktualności:', error);
    }
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

// ============================================
// JAVA STATUS I AUTO-INSTALACJA
// ============================================

/**
 * Sprawdza status Java i aktualizuje UI
 */
async function checkJavaStatus() {
    if (!elements.javaStatus) return;

    try {
        // Najpierw sprawdz czy launcher ma zainstalowana Java
        const installed = await window.electronAPI?.getInstalledJava();
        if (installed && installed.installed) {
            setJavaStatusOk(`Java ${installed.info?.version || '?'} (zainstalowana przez launcher)`, installed.path);
            return;
        }

        // Wykryj systemowa Java
        const installations = await window.electronAPI?.detectJava();
        if (installations && installations.length > 0) {
            const best = installations[0];
            setJavaStatusOk(`Java ${best.version} (${best.source})`, best.path);

            // Ustaw sciezke w polu jesli puste
            if (!elements.javaPath.value) {
                elements.javaPath.value = best.path;
            }
        } else {
            setJavaStatusError();
        }
    } catch (error) {
        console.error('Blad sprawdzania Java:', error);
        setJavaStatusError();
    }
}

function setJavaStatusOk(text, javaPath) {
    if (elements.javaStatus) elements.javaStatus.className = 'java-status ok';
    if (elements.javaStatusIcon) elements.javaStatusIcon.textContent = '\u2714';
    if (elements.javaStatusText) elements.javaStatusText.textContent = text;
    if (elements.javaActions) elements.javaActions.style.display = 'none';
    if (elements.javaInstallProgress) elements.javaInstallProgress.style.display = 'none';

    // Ustaw sciezke w polu jesli nie jest ustawiona
    if (javaPath && elements.javaPath && !elements.javaPath.value) {
        elements.javaPath.value = javaPath;
    }
}

function setJavaStatusError() {
    if (elements.javaStatus) elements.javaStatus.className = 'java-status error';
    if (elements.javaStatusIcon) elements.javaStatusIcon.textContent = '\u2718';
    if (elements.javaStatusText) elements.javaStatusText.textContent = 'Java nie znaleziona - wymagana do gry!';
    if (elements.javaActions) elements.javaActions.style.display = 'block';
    if (elements.javaInstallProgress) elements.javaInstallProgress.style.display = 'none';
}

/**
 * Obsluguje automatyczna instalacje Java z ustawien
 */
async function handleAutoInstallJava() {
    if (!elements.btnJavaInstall) return;

    // Zablokuj przycisk
    elements.btnJavaInstall.disabled = true;
    elements.btnJavaInstall.textContent = 'Instalowanie...';

    // Pokaz progress
    if (elements.javaActions) elements.javaActions.style.display = 'none';
    if (elements.javaInstallProgress) elements.javaInstallProgress.style.display = 'block';
    if (elements.javaInstallFill) elements.javaInstallFill.style.width = '0%';
    if (elements.javaInstallStatus) elements.javaInstallStatus.textContent = 'Pobieranie Java 17 (Adoptium)...';

    // Status
    if (elements.javaStatus) elements.javaStatus.className = 'java-status installing';
    if (elements.javaStatusIcon) elements.javaStatusIcon.textContent = '\u21BB';
    if (elements.javaStatusText) elements.javaStatusText.textContent = 'Instalowanie Java...';

    // Nasluchuj progress z download-progress
    const progressHandler = (data) => {
        if (data && data.type === 'java-installer') {
            const percent = data.percent || 0;
            if (elements.javaInstallFill) elements.javaInstallFill.style.width = `${percent}%`;
            if (elements.javaInstallStatus) {
                elements.javaInstallStatus.textContent = percent < 100
                    ? `Pobieranie Java... ${percent}%`
                    : 'Rozpakowywanie...';
            }
        }
    };

    window.electronAPI?.onDownloadProgress?.(progressHandler);

    try {
        const result = await window.electronAPI?.autoInstallJava(17);

        if (result && result.success) {
            showToast('Java zainstalowana pomyslnie!', 'success');
            elements.javaPath.value = result.javaPath;

            // Odswierz status
            await checkJavaStatus();
        } else {
            showToast(`Blad instalacji Java: ${result?.error || 'Nieznany blad'}`, 'error');
            setJavaStatusError();
            elements.btnJavaInstall.disabled = false;
            elements.btnJavaInstall.textContent = 'Sprobuj ponownie';
            if (elements.javaActions) elements.javaActions.style.display = 'block';
        }
    } catch (error) {
        showToast(`Blad instalacji Java: ${error.message}`, 'error');
        setJavaStatusError();
        elements.btnJavaInstall.disabled = false;
        elements.btnJavaInstall.textContent = 'Sprobuj ponownie';
        if (elements.javaActions) elements.javaActions.style.display = 'block';
    } finally {
        if (elements.javaInstallProgress) elements.javaInstallProgress.style.display = 'none';
    }
}

// ============================================
// LOGI GRY
// ============================================

// Stan logów
const logState = {
    entries: [],
    maxEntries: 5000,
    autoscroll: true,
    currentSession: 'current'
};

/**
 * Inicjalizuje panel logów gry
 */
function initGameLogs() {
    // Auto-scroll checkbox
    elements.logsAutoscroll?.addEventListener('change', (e) => {
        logState.autoscroll = e.target.checked;
        if (logState.autoscroll) {
            scrollLogsToBottom();
        }
    });

    // Wyczyść logi
    elements.btnLogsClear?.addEventListener('click', () => {
        logState.entries = [];
        renderLogs();
    });

    // Kopiuj logi
    elements.btnLogsCopy?.addEventListener('click', () => {
        const logText = logState.entries.map(e => `[${e.time}] ${e.line}`).join('\n');
        if (navigator.clipboard && logText) {
            navigator.clipboard.writeText(logText).then(() => {
                showToast('Logi skopiowane do schowka', 'success');
            }).catch(() => {
                showToast('Nie udało się skopiować logów', 'error');
            });
        } else if (!logText) {
            showToast('Brak logów do skopiowania', 'info');
        }
    });

    // Otwórz folder logów
    elements.btnLogsFolder?.addEventListener('click', () => {
        window.electronAPI?.openLogsFolder();
    });

    // Selektor sesji
    elements.logSessionSelect?.addEventListener('change', async (e) => {
        const value = e.target.value;
        logState.currentSession = value;

        if (value === 'current') {
            // Załaduj bieżące logi z pamięci
            const currentLogs = await window.electronAPI?.getCurrentLogs();
            logState.entries = currentLogs || [];
            renderLogs();
        } else {
            // Załaduj logi z pliku
            const content = await window.electronAPI?.readLogFile(value);
            if (content) {
                // Parsuj plik logu na wpisy
                logState.entries = content.split('\n')
                    .filter(line => line.trim())
                    .map(line => {
                        const match = line.match(/^\[(.+?)\] (.*)$/);
                        if (match) {
                            return { time: match[1], line: match[2] };
                        }
                        return { time: '', line: line };
                    });
                renderLogs();
            } else {
                logState.entries = [];
                renderLogs();
                showToast('Nie udało się odczytać pliku logu', 'error');
            }
        }
    });

    // Nasłuchuj logów w real-time
    window.electronAPI?.onGameLog((entry) => {
        if (logState.currentSession === 'current') {
            logState.entries.push(entry);

            // Ogranicz liczbę wpisów w UI
            if (logState.entries.length > logState.maxEntries) {
                logState.entries.shift();
            }

            appendLogEntry(entry);
        }
    });

    // Odśwież sesje logów po zamknięciu gry
    gameLauncher.setGameCloseCallback((data) => {
        // Odśwież listę sesji z opóźnieniem (poczekaj na zapis pliku)
        setTimeout(() => {
            loadLogSessions();
        }, 1000);
    });

    // Załaduj listę sesji
    loadLogSessions();
}

/**
 * Ładuje listę dostępnych sesji logów
 */
async function loadLogSessions() {
    if (!elements.logSessionSelect) return;

    try {
        const sessions = await window.electronAPI?.getLogSessions();

        // Zachowaj opcję "Bieżąca sesja"
        elements.logSessionSelect.innerHTML = '<option value="current">Bieżąca sesja</option>';

        if (sessions && sessions.length > 0) {
            for (const session of sessions) {
                const option = document.createElement('option');
                option.value = session.path;
                const date = new Date(session.created);
                const dateStr = date.toLocaleDateString('pl-PL');
                const timeStr = date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
                const sizeStr = formatBytes(session.size);
                option.textContent = `${dateStr} ${timeStr} (${sizeStr})`;
                elements.logSessionSelect.appendChild(option);
            }
        }
    } catch (e) {
        console.warn('Błąd ładowania sesji logów:', e);
    }
}

/**
 * Renderuje wszystkie logi
 */
function renderLogs() {
    if (!elements.logsOutput) return;

    if (logState.entries.length === 0) {
        elements.logsOutput.innerHTML = '<div class="logs-empty">Brak logów. Uruchom grę, aby zobaczyć logi.</div>';
        return;
    }

    // Renderuj tylko z ograniczeniem wydajnościowym
    const fragment = document.createDocumentFragment();
    const entriesToRender = logState.entries.slice(-2000); // Max 2000 w DOM

    for (const entry of entriesToRender) {
        const el = createLogElement(entry);
        fragment.appendChild(el);
    }

    elements.logsOutput.innerHTML = '';
    elements.logsOutput.appendChild(fragment);

    if (logState.autoscroll) {
        scrollLogsToBottom();
    }
}

/**
 * Tworzy element DOM dla wpisu logu
 */
function createLogElement(entry) {
    const div = document.createElement('div');
    div.className = 'log-entry';

    // Wykryj typ linii (error, warning, info)
    const line = entry.line || '';
    if (/error|exception|fatal|crash/i.test(line)) {
        div.classList.add('log-error');
    } else if (/warn|warning/i.test(line)) {
        div.classList.add('log-warn');
    } else if (/info/i.test(line)) {
        div.classList.add('log-info');
    }

    if (entry.time) {
        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-time';
        // Pokaż tylko godzinę:minutę:sekundę
        try {
            const date = new Date(entry.time);
            timeSpan.textContent = date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } catch (e) {
            timeSpan.textContent = entry.time.substring(11, 19);
        }
        div.appendChild(timeSpan);
    }

    const textSpan = document.createElement('span');
    textSpan.className = 'log-text';
    textSpan.textContent = line;
    div.appendChild(textSpan);

    return div;
}

/**
 * Dodaje pojedynczy wpis logu do panelu
 */
function appendLogEntry(entry) {
    if (!elements.logsOutput) return;

    // Usuń placeholder "brak logów"
    const emptyMsg = elements.logsOutput.querySelector('.logs-empty');
    if (emptyMsg) emptyMsg.remove();

    const el = createLogElement(entry);
    elements.logsOutput.appendChild(el);

    // Ogranicz liczbę elementów DOM
    while (elements.logsOutput.children.length > 2000) {
        elements.logsOutput.removeChild(elements.logsOutput.firstChild);
    }

    if (logState.autoscroll) {
        scrollLogsToBottom();
    }
}

/**
 * Przewija logi na dół
 */
function scrollLogsToBottom() {
    if (elements.logsContainer) {
        elements.logsContainer.scrollTop = elements.logsContainer.scrollHeight;
    }
}

// ============================================
// AUTO-UPDATE
// ============================================

// Przechowywanie danych o dostępnej aktualizacji
let pendingUpdate = null;

/**
 * Inicjalizuje system automatycznych aktualizacji
 */
function initAutoUpdate() {
    // Zamykanie modalu aktualizacji (z blokadą dla wymaganych aktualizacji)
    const closeUpdateIfAllowed = () => {
        if (pendingUpdate?.isRequired) {
            showToast('Ta aktualizacja jest wymagana. Pobierz ją, aby kontynuować.', 'warning');
            return;
        }
        closeModal('update');
    };

    elements.updateModalClose?.addEventListener('click', closeUpdateIfAllowed);
    elements.btnUpdateLater?.addEventListener('click', closeUpdateIfAllowed);
    elements.updateModal?.addEventListener('click', (e) => {
        if (e.target === elements.updateModal) closeUpdateIfAllowed();
    });

    // Przycisk aktualizacji
    elements.btnUpdateNow?.addEventListener('click', handleDownloadUpdate);
    elements.btnUpdateInstall?.addEventListener('click', handleInstallUpdate);

    // Nasłuchuj eventów z main process
    window.electronAPI?.onUpdateAvailable((data) => {
        console.log('Update available:', data);
        pendingUpdate = data;
        showUpdateModal(data);
    });

    window.electronAPI?.onUpdateDownloadProgress((data) => {
        if (elements.updateProgressFill) {
            elements.updateProgressFill.style.width = `${data.percent}%`;
        }
        if (elements.updateProgressPercent) {
            elements.updateProgressPercent.textContent = `${data.percent}%`;
        }
        if (elements.updateProgressText) {
            elements.updateProgressText.textContent = data.status || 'Pobieranie...';
        }
    });

    window.electronAPI?.onUpdateDownloaded((data) => {
        // Pokaż przycisk instalacji
        if (elements.updateProgress) elements.updateProgress.style.display = 'none';
        if (elements.updateFooter) elements.updateFooter.style.display = 'none';
        if (elements.updateInstallFooter) elements.updateInstallFooter.style.display = 'flex';
        showToast('Aktualizacja pobrana! Kliknij aby zainstalować.', 'success');
    });

    window.electronAPI?.onUpdateError((data) => {
        if (elements.updateProgress) elements.updateProgress.style.display = 'none';
        if (elements.updateFooter) elements.updateFooter.style.display = 'flex';
        if (elements.btnUpdateNow) {
            elements.btnUpdateNow.disabled = false;
            elements.btnUpdateNow.textContent = 'Spróbuj ponownie';
        }
        showToast(`Błąd aktualizacji: ${data.error}`, 'error');
    });
}

/**
 * Wyświetla modal z informacją o dostępnej aktualizacji
 */
function showUpdateModal(data) {
    if (elements.updateCurrentVersion) {
        elements.updateCurrentVersion.textContent = data.currentVersion || '?';
    }
    if (elements.updateNewVersion) {
        elements.updateNewVersion.textContent = data.latestVersion || '?';
    }

    // Changelog
    if (elements.updateChangelog && data.changelog) {
        elements.updateChangelog.innerHTML = `<p>${escapeHtml(data.changelog)}</p>`;
        elements.updateChangelog.style.display = 'block';
    } else if (elements.updateChangelog) {
        elements.updateChangelog.style.display = 'none';
    }

    // Reset UI
    if (elements.updateProgress) elements.updateProgress.style.display = 'none';
    if (elements.updateFooter) elements.updateFooter.style.display = 'flex';
    if (elements.updateInstallFooter) elements.updateInstallFooter.style.display = 'none';
    if (elements.btnUpdateNow) {
        elements.btnUpdateNow.disabled = false;
        elements.btnUpdateNow.textContent = 'Aktualizuj teraz';
    }

    // Jeśli aktualizacja jest wymagana, ukryj przycisk "później"
    if (data.isRequired && elements.btnUpdateLater) {
        elements.btnUpdateLater.style.display = 'none';
    }

    openModal('update');
}

/**
 * Obsługuje pobieranie aktualizacji
 */
async function handleDownloadUpdate() {
    if (!pendingUpdate) return;

    // Pokaż progress
    if (elements.updateProgress) elements.updateProgress.style.display = 'block';
    if (elements.updateFooter) elements.updateFooter.style.display = 'none';
    if (elements.btnUpdateNow) {
        elements.btnUpdateNow.disabled = true;
        elements.btnUpdateNow.textContent = 'Pobieranie...';
    }

    // Reset progress
    if (elements.updateProgressFill) elements.updateProgressFill.style.width = '0%';
    if (elements.updateProgressPercent) elements.updateProgressPercent.textContent = '0%';

    try {
        await window.electronAPI?.downloadUpdate({
            downloadUrl: pendingUpdate.downloadUrl,
            sha256: pendingUpdate.sha256,
            version: pendingUpdate.latestVersion
        });
    } catch (error) {
        showToast('Błąd pobierania aktualizacji', 'error');
        if (elements.updateProgress) elements.updateProgress.style.display = 'none';
        if (elements.updateFooter) elements.updateFooter.style.display = 'flex';
        if (elements.btnUpdateNow) {
            elements.btnUpdateNow.disabled = false;
            elements.btnUpdateNow.textContent = 'Spróbuj ponownie';
        }
    }
}

/**
 * Obsługuje instalację pobranej aktualizacji
 */
function handleInstallUpdate() {
    window.electronAPI?.installUpdate();
}

// ============================================
// TRYB OFFLINE
// ============================================

/**
 * Inicjalizuje obsługę trybu offline
 */
function initOfflineMode() {
    // Nasłuchuj eventów zmiany statusu sieci z API client
    window.addEventListener('online-status-changed', (event) => {
        const { online, wasOffline } = event.detail;
        state.isOffline = !online;

        if (online && wasOffline) {
            showToast('Połączenie przywrócone!', 'success');
            removeOfflineIndicator();
            // Odśwież dane po powrocie online
            loadServerConfig();
            loadNews();
            loadAllServerStatuses();
        } else if (!online) {
            showToast('Brak połączenia z serwerem. Tryb offline.', 'warning');
            showOfflineIndicator();
        }

        updateOfflineUI();
    });

    // Nasłuchuj natywnych eventów przeglądarki
    window.addEventListener('online', () => {
        if (state.isOffline) {
            // Spróbuj ponownie połączyć się z API
            loadServerConfig();
        }
    });

    window.addEventListener('offline', () => {
        if (!state.isOffline) {
            state.isOffline = true;
            window.isOffline = true;
            showToast('Brak połączenia z internetem. Tryb offline.', 'warning');
            showOfflineIndicator();
            updateOfflineUI();
        }
    });
}

/**
 * Wyświetla wskaźnik trybu offline w UI
 */
function showOfflineIndicator() {
    // Dodaj wskaźnik offline do paska tytułowego jeśli nie istnieje
    if (!document.getElementById('offline-indicator')) {
        const indicator = document.createElement('div');
        indicator.id = 'offline-indicator';
        indicator.className = 'offline-indicator';
        indicator.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <line x1="1" y1="1" x2="23" y2="23"/>
                <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
                <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
                <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
                <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
                <line x1="12" y1="20" x2="12.01" y2="20"/>
            </svg>
            <span>Tryb offline</span>
        `;
        indicator.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 12px;background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.4);border-radius:6px;color:#ef4444;font-size:12px;font-weight:500;position:fixed;top:8px;right:140px;z-index:9999;-webkit-app-region:no-drag;';
        const titlebar = document.getElementById('titlebar');
        if (titlebar) {
            titlebar.appendChild(indicator);
        } else {
            document.body.appendChild(indicator);
        }
    }
}

/**
 * Usuwa wskaźnik trybu offline z UI
 */
function removeOfflineIndicator() {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
        indicator.remove();
    }
}

/**
 * Aktualizuje UI w zależności od statusu online/offline
 */
function updateOfflineUI() {
    if (state.isOffline) {
        // Wyłącz przyciski wymagające sieci
        const linkRegister = document.getElementById('link-register');
        if (linkRegister) {
            linkRegister.style.pointerEvents = 'none';
            linkRegister.style.opacity = '0.5';
            linkRegister.title = 'Niedostępne w trybie offline';
        }

        // Aktualizuj przycisk graj - pozwól grać jeśli pliki są pobrane
        if (state.isLoggedIn && state.config) {
            elements.btnPlay.disabled = false;
            elements.playSubtext.textContent = 'Tryb offline (pliki z cache)';
        }
    } else {
        // Przywróć normalny stan
        const linkRegister = document.getElementById('link-register');
        if (linkRegister) {
            linkRegister.style.pointerEvents = '';
            linkRegister.style.opacity = '';
            linkRegister.title = '';
        }
        updateUserUI();
    }
}

// ============================================
// CRASH REPORTS - SPRAWDZANIE PRZY STARCIE
// ============================================

/**
 * Sprawdza czy są niedawne raporty o awariach i pokazuje powiadomienie
 */
async function checkRecentCrashReports() {
    try {
        const reports = await window.electronAPI?.crashReporter?.getReports();
        if (reports && reports.length > 0) {
            // Sprawdź czy najnowszy raport jest z ostatnich 24 godzin
            const latestReport = reports[0];
            if (latestReport.timestamp) {
                const reportTime = new Date(latestReport.timestamp).getTime();
                const now = Date.now();
                const hoursSince = (now - reportTime) / (1000 * 60 * 60);

                if (hoursSince < 24) {
                    showToast('Wykryto raport z awarii. Sprawdz w ustawieniach.', 'warning');
                }
            }
        }
    } catch (error) {
        console.warn('Blad sprawdzania raportow o awariach:', error);
    }
}

// Odświeżaj konfigurację co 5 minut
setInterval(loadServerConfig, 5 * 60 * 1000);

// Odświeżaj statusy serwerów co 30 sekund
setInterval(loadAllServerStatuses, 30 * 1000);

// Sprawdzaj aktualizacje co godzinę
setInterval(() => {
    window.electronAPI?.checkForUpdates();
}, 60 * 60 * 1000);
