/**
 * XsusLauncher - Preload Script
 * Bezpieczny most między głównym procesem a rendererem
 */
const { contextBridge, ipcRenderer } = require('electron');

// Eksponujemy bezpieczne API do renderera
contextBridge.exposeInMainWorld('electronAPI', {
    // ============================================
    // ZARZĄDZANIE OKNEM
    // ============================================
    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    maximizeWindow: () => ipcRenderer.send('window-maximize'),
    closeWindow: () => ipcRenderer.send('window-close'),

    // ============================================
    // PRZECHOWYWANIE DANYCH
    // ============================================
    getStore: (key) => ipcRenderer.invoke('store-get', key),
    setStore: (key, value) => ipcRenderer.invoke('store-set', key, value),
    deleteStore: (key) => ipcRenderer.invoke('store-delete', key),
    // Batch operations (optymalizacja - pojedynczy IPC call zamiast wielu)
    getStoreMultiple: (keys) => ipcRenderer.invoke('store-get-multiple', keys),
    setStoreMultiple: (data) => ipcRenderer.invoke('store-set-multiple', data),

    // ============================================
    // ŚCIEŻKI
    // ============================================
    getGamePath: () => ipcRenderer.invoke('get-game-path'),
    selectJavaPath: () => ipcRenderer.invoke('select-java-path'),
    selectGamePath: () => ipcRenderer.invoke('select-game-path'),

    // ============================================
    // SYSTEM
    // ============================================
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
    getLauncherVersion: () => ipcRenderer.invoke('get-launcher-version'),
    openExternal: (url) => ipcRenderer.send('open-external', url),
    openGameFolder: () => ipcRenderer.send('open-game-folder'),

    // ============================================
    // AKTUALIZACJE
    // ============================================
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: (data) => ipcRenderer.invoke('download-update', data),
    installUpdate: () => ipcRenderer.send('install-update'),
    onUpdateAvailable: (callback) => {
        ipcRenderer.on('update-available', (event, data) => callback(data));
    },
    onUpdateNotAvailable: (callback) => {
        ipcRenderer.on('update-not-available', callback);
    },
    onUpdateDownloaded: (callback) => {
        ipcRenderer.on('update-downloaded', (event, data) => callback(data));
    },
    onUpdateDownloadProgress: (callback) => {
        ipcRenderer.on('update-download-progress', (event, data) => callback(data));
    },
    onUpdateError: (callback) => {
        ipcRenderer.on('update-error', (event, data) => callback(data));
    },

    // ============================================
    // URUCHAMIANIE GRY
    // ============================================
    launchGame: (config) => ipcRenderer.invoke('launch-game', config),
    killGame: () => ipcRenderer.send('kill-game'),
    isGameRunning: () => ipcRenderer.invoke('is-game-running'),

    // Wykrywanie Java
    detectJava: () => ipcRenderer.invoke('detect-java'),
    checkJava: (javaPath) => ipcRenderer.invoke('check-java', javaPath),

    // ============================================
    // AUTO-INSTALACJA JAVA
    // ============================================
    autoInstallJava: (version = 17) => ipcRenderer.invoke('auto-install-java', version),
    getInstalledJava: () => ipcRenderer.invoke('get-installed-java'),

    // ============================================
    // OPTYMALIZACJE
    // ============================================
    testNetworkSpeed: () => ipcRenderer.invoke('test-network-speed'),
    getOptimalRam: () => ipcRenderer.invoke('get-optimal-ram'),
    autoConfigureRam: () => ipcRenderer.invoke('auto-configure-ram'),

    // ============================================
    // CRASH REPORTER
    // ============================================
    getCrashReports: () => ipcRenderer.invoke('get-crash-reports'),
    readCrashReport: (filepath) => ipcRenderer.invoke('read-crash-report', filepath),
    openCrashReportsFolder: () => ipcRenderer.invoke('open-crash-reports-folder'),

    // Synchronizacja plikow
    syncMods: (mods) => ipcRenderer.invoke('sync-mods', mods),
    getFileHash: (filePath) => ipcRenderer.invoke('get-file-hash', filePath),
    verifyFileHash: (filePath, expectedHash) => ipcRenderer.invoke('verify-file-hash', filePath, expectedHash),
    fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),

    // ============================================
    // GAME LOGS
    // ============================================
    getLogSessions: () => ipcRenderer.invoke('get-log-sessions'),
    readLogFile: (filePath) => ipcRenderer.invoke('read-log-file', filePath),
    getCurrentLogs: () => ipcRenderer.invoke('get-current-logs'),
    openLogsFolder: () => ipcRenderer.invoke('open-logs-folder'),
    onGameLog: (callback) => {
        ipcRenderer.on('game-log', (event, data) => callback(data));
    },

    // Eventy gry
    onGameOutput: (callback) => {
        ipcRenderer.on('game-output', (event, data) => callback(data));
    },
    onGameClose: (callback) => {
        ipcRenderer.on('game-close', (event, data) => callback(data));
    },
    onGameCrash: (callback) => {
        ipcRenderer.on('game-crash', (event, data) => callback(data));
    },
    onDownloadProgress: (callback) => {
        ipcRenderer.on('download-progress', (event, data) => callback(data));
    },
    onGameStatus: (callback) => {
        ipcRenderer.on('game-status', (event, data) => callback(data));
    },
    onFileVerified: (callback) => {
        ipcRenderer.on('file-verified', (event, data) => callback(data));
    },
    onFileVerifyError: (callback) => {
        ipcRenderer.on('file-verify-error', (event, data) => callback(data));
    },

    // Usuwanie listenerów
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    },

    // ============================================
    // OFFLINE MODE
    // ============================================
    checkOnlineStatus: () => ipcRenderer.invoke('check-online-status'),
    getCachedConfig: () => ipcRenderer.invoke('get-cached-config'),

    // ============================================
    // CRASH REPORTER (extended)
    // ============================================
    crashReporter: {
        getReports: () => ipcRenderer.invoke('get-crash-reports'),
        getReport: (filename) => ipcRenderer.invoke('get-crash-report', filename),
        openFolder: () => ipcRenderer.invoke('open-crash-reports-folder')
    },

    // ============================================
    // CHANGELOG
    // ============================================
    getChangelog: () => ipcRenderer.invoke('get-changelog'),
    getChangelogVersion: (version) => ipcRenderer.invoke('get-changelog-version', version),
    shouldShowChangelog: () => ipcRenderer.invoke('should-show-changelog'),
    markChangelogSeen: () => ipcRenderer.invoke('mark-changelog-seen'),

    // ============================================
    // API URL
    // ============================================
    getApiUrl: () => ipcRenderer.invoke('get-api-url'),
    setApiUrl: (url) => ipcRenderer.invoke('set-api-url', url),

    // ============================================
    // MOTYWY
    // ============================================
    themes: {
        getAvailable: () => ipcRenderer.invoke('get-available-themes'),
        getTheme: (themeId) => ipcRenderer.invoke('get-theme', themeId),
        getVariables: (themeId) => ipcRenderer.invoke('get-theme-variables', themeId),
        getCurrent: () => ipcRenderer.invoke('get-current-theme'),
        setTheme: (themeId) => ipcRenderer.invoke('set-theme', themeId)
    }
});

// Informacja o załadowaniu
console.log('XsusLauncher preload script loaded');
