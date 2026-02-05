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
    installUpdate: () => ipcRenderer.send('install-update'),
    onUpdateAvailable: (callback) => {
        ipcRenderer.on('update-available', callback);
    },
    onUpdateDownloaded: (callback) => {
        ipcRenderer.on('update-downloaded', callback);
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
    fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),

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

    // Usuwanie listenerów
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    },

    // ============================================
    // DISCORD RICH PRESENCE
    // ============================================
    discordRPC: {
        setEnabled: (enabled) => ipcRenderer.invoke('discord-rpc-set-enabled', enabled),
        setClientId: (clientId) => ipcRenderer.invoke('discord-rpc-set-client-id', clientId),
        getStatus: () => ipcRenderer.invoke('discord-rpc-get-status'),
        setUsername: (username) => ipcRenderer.invoke('discord-rpc-set-username', username),
        setServer: (serverName) => ipcRenderer.invoke('discord-rpc-set-server', serverName)
    },

    // ============================================
    // CHANGELOG
    // ============================================
    getChangelog: () => ipcRenderer.invoke('get-changelog'),
    getChangelogVersion: (version) => ipcRenderer.invoke('get-changelog-version', version),
    shouldShowChangelog: () => ipcRenderer.invoke('should-show-changelog'),
    markChangelogSeen: () => ipcRenderer.invoke('mark-changelog-seen'),

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
