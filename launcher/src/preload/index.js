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

    // Synchronizacja plikow
    syncMods: (mods) => ipcRenderer.invoke('sync-mods', mods),
    getFileHash: (filePath) => ipcRenderer.invoke('get-file-hash', filePath),
    fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),

    // Eventy gry
    onGameOutput: (callback) => {
        ipcRenderer.on('game-output', (event, data) => callback(data));
    },
    onGameClose: (callback) => {
        ipcRenderer.on('game-close', (event, code) => callback(code));
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
    }
});

// Informacja o załadowaniu
console.log('XsusLauncher preload script loaded');
