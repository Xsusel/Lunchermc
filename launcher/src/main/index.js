/**
 * XsusLauncher - Główny proces Electron
 * Zarządza oknem aplikacji i komunikacją z systemem
 */
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const GameManager = require('./gameManager');

// Auto-updater (opcjonalny)
let autoUpdater;
try {
    autoUpdater = require('electron-updater').autoUpdater;
} catch (e) {
    console.warn('electron-updater not available');
    autoUpdater = null;
}

// Konfiguracja przechowywania ustawień
const store = new Store({
    defaults: {
        // Ustawienia użytkownika
        username: '',
        token: '',
        rememberMe: true,

        // Ustawienia gry
        ram: {
            min: 2,
            max: 4
        },
        javaPath: '',
        customJavaArgs: '',
        resolution: {
            width: 1280,
            height: 720,
            fullscreen: false
        },
        closeOnLaunch: false,

        // Ścieżka do gry
        gamePath: '',

        // URL API serwera
        apiUrl: 'https://mc.xsus.pl',

        // Ustawienia launchera
        launcherVersion: '1.0.0',
        autoUpdate: true,
        theme: 'dark'
    }
});

// Referencja do głównego okna
let mainWindow = null;
let gameManager = null;

// Ścieżka do danych gry
const getDefaultGamePath = () => {
    const appData = process.env.APPDATA ||
        (process.platform === 'darwin'
            ? path.join(process.env.HOME, 'Library', 'Application Support')
            : path.join(process.env.HOME, '.local', 'share'));
    return path.join(appData, '.xsuslauncher');
};

/**
 * Tworzy główne okno aplikacji
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 700,
        minWidth: 900,
        minHeight: 600,
        frame: false, // Usuwamy domyślną ramkę
        transparent: false,
        resizable: true,
        icon: path.join(__dirname, '../../assets/icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, '../preload/index.js')
        },
        show: false // Pokaż gdy gotowe
    });

    // Ładujemy interfejs
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    // Pokaż okno gdy załadowane
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();

        // Sprawdź aktualizacje w tle
        if (autoUpdater && store.get('autoUpdate') && process.env.NODE_ENV !== 'development') {
            autoUpdater.checkForUpdatesAndNotify();
        }
    });

    // DevTools w trybie developerskim
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }

    // Obsługa zamknięcia okna
    mainWindow.on('closed', () => {
        mainWindow = null;
        gameManager = null;
    });

    // Inicjalizuj GameManager
    gameManager = new GameManager(store, mainWindow);
    gameManager.registerIPCHandlers();
}

// ============================================
// OBSŁUGA IPC (komunikacja z rendererem)
// ============================================

// Obsługa okna
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow?.maximize();
    }
});
ipcMain.on('window-close', () => mainWindow?.close());

// Ustawienia
ipcMain.handle('store-get', (event, key) => store.get(key));
ipcMain.handle('store-set', (event, key, value) => store.set(key, value));
ipcMain.handle('store-delete', (event, key) => store.delete(key));

// Batch store operations (optymalizacja - mniej IPC calls)
ipcMain.handle('store-get-multiple', (event, keys) => {
    const result = {};
    for (const key of keys) {
        result[key] = store.get(key);
    }
    return result;
});

ipcMain.handle('store-set-multiple', (event, data) => {
    for (const [key, value] of Object.entries(data)) {
        store.set(key, value);
    }
    return true;
});

// Ścieżki
ipcMain.handle('get-game-path', () => {
    const customPath = store.get('gamePath');
    return customPath || getDefaultGamePath();
});

ipcMain.handle('select-java-path', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Wybierz plik Java (javaw.exe lub java)',
        properties: ['openFile'],
        filters: [
            { name: 'Java Executable', extensions: ['exe', ''] }
        ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
        const javaPath = result.filePaths[0];
        store.set('javaPath', javaPath);
        return javaPath;
    }
    return null;
});

ipcMain.handle('select-game-path', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Wybierz folder gry',
        properties: ['openDirectory', 'createDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
        const gamePath = result.filePaths[0];
        store.set('gamePath', gamePath);
        return gamePath;
    }
    return null;
});

// Otwieranie linków zewnętrznych
ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
});

// Otwieranie folderu gry
ipcMain.on('open-game-folder', async () => {
    const gamePath = store.get('gamePath') || getDefaultGamePath();
    shell.openPath(gamePath);
});

// Informacje o systemie
ipcMain.handle('get-system-info', () => {
    const os = require('os');
    return {
        platform: process.platform,
        arch: process.arch,
        totalMemory: Math.round(os.totalmem() / (1024 * 1024 * 1024)), // GB
        freeMemory: Math.round(os.freemem() / (1024 * 1024 * 1024)),
        cpus: os.cpus().length
    };
});

// Pobieranie wersji launchera
ipcMain.handle('get-launcher-version', () => {
    return app.getVersion();
});

// ============================================
// INICJALIZACJA APLIKACJI
// ============================================

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// ============================================
// AUTO-UPDATE
// ============================================

if (autoUpdater) {
    autoUpdater.on('update-available', () => {
        mainWindow?.webContents.send('update-available');
    });

    autoUpdater.on('update-downloaded', () => {
        mainWindow?.webContents.send('update-downloaded');
    });

    autoUpdater.on('error', (error) => {
        console.error('Auto-update error:', error);
    });

    // Instalacja aktualizacji na żądanie
    ipcMain.on('install-update', () => {
        autoUpdater.quitAndInstall();
    });
}

// ============================================
// DODATKOWE HANDLERY IPC
// ============================================

// Sprawdzenie statusu gry
ipcMain.handle('is-game-running', () => {
    return gameManager ? gameManager.gameProcess !== null : false;
});
