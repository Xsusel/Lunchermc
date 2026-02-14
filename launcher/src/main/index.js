/**
 * XsusLauncher - Główny proces Electron
 * Zarządza oknem aplikacji i komunikacją z systemem
 */
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const GameManager = require('./gameManager');
const JavaManager = require('./javaManager');
const CrashReporter = require('./crashReporter');
const { getChangelog, getLatestChangelog } = require('./changelog');
const { getAvailableThemes, getTheme, getThemeVariables } = require('./themes');

const https = require('https');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

// Auto-updater (opcjonalny - electron-updater)
let autoUpdater;
try {
    autoUpdater = require('electron-updater').autoUpdater;
} catch (e) {
    console.warn('electron-updater not available, using custom updater');
    autoUpdater = null;
}

// Domyślny URL API
const DEFAULT_API_URL = 'https://mc.xsus.pl';

/**
 * Rozwiązuje URL API z priorytetem:
 * 1. electron-store config
 * 2. Zmienna środowiskowa API_URL
 * 3. Domyślny hardcoded URL
 */
function resolveApiUrl() {
    const storeUrl = store.get('apiUrl');
    if (storeUrl && storeUrl.trim()) return storeUrl.trim();
    if (process.env.API_URL && process.env.API_URL.trim()) return process.env.API_URL.trim();
    return DEFAULT_API_URL;
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
        apiUrl: '',

        // Ustawienia launchera
        launcherVersion: '1.0.0',
        autoUpdate: true,
        theme: 'dark',

        // Changelog - ostatnia widziana wersja
        lastSeenVersion: ''
    }
});

// Referencja do głównego okna
let mainWindow = null;
let gameManager = null;
let javaManager = null;
let crashReporter = null;

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
        if (store.get('autoUpdate') && process.env.NODE_ENV !== 'development') {
            setTimeout(() => checkForUpdates(), 3000); // 3s delay po starcie
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

    // Inicjalizuj CrashReporter
    crashReporter = new CrashReporter(store, mainWindow);
    crashReporter.initialize();

    // Inicjalizuj JavaManager
    javaManager = new JavaManager(store, mainWindow);
    javaManager.registerIPCHandlers();

    // Inicjalizuj GameManager
    gameManager = new GameManager(store, mainWindow);
    gameManager.registerIPCHandlers();

    // Przekaz java manager do game managera
    gameManager.javaManager = javaManager;

    // Przekaz crash reporter do game managera (aby moc podpiac sie pod proces gry)
    gameManager.crashReporter = crashReporter;
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

// Pobieranie rozwiązanego URL API
ipcMain.handle('get-api-url', () => {
    return resolveApiUrl();
});

// Ustawianie URL API
ipcMain.handle('set-api-url', (event, url) => {
    if (url && url.trim()) {
        // Usuń trailing slash
        const cleanUrl = url.trim().replace(/\/+$/, '');
        store.set('apiUrl', cleanUrl);
        return { success: true, apiUrl: cleanUrl };
    } else {
        // Resetuj do domyślnego (wyczyść store, użyje env lub default)
        store.set('apiUrl', '');
        return { success: true, apiUrl: resolveApiUrl() };
    }
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
// AUTO-UPDATE (Custom API-based)
// ============================================

let pendingUpdatePath = null;

// Sprawdza aktualizacje z API serwera
async function checkForUpdates() {
    try {
        const apiUrl = resolveApiUrl();
        const currentVersion = app.getVersion();
        const url = `${apiUrl}/api/launcher/check-update?version=${currentVersion}`;

        const response = await fetchJson(url);

        if (response && response.success && response.data && response.data.updateAvailable) {
            console.log(`Update available: ${response.data.latestVersion}`);

            // Resolve relative download URL to absolute
            let downloadUrl = response.data.downloadUrl;
            if (downloadUrl && !downloadUrl.startsWith('http')) {
                downloadUrl = `${apiUrl}${downloadUrl.startsWith('/') ? '' : '/'}${downloadUrl}`;
            }

            mainWindow?.webContents.send('update-available', {
                currentVersion: response.data.currentVersion,
                latestVersion: response.data.latestVersion,
                downloadUrl,
                sha256: response.data.sha256,
                changelog: response.data.changelog,
                isRequired: response.data.isRequired
            });
        } else {
            console.log('No update available');
            mainWindow?.webContents.send('update-not-available');
        }
    } catch (error) {
        console.error('Update check error:', error);
    }
}

// Helper: fetch JSON from URL
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, { timeout: 10000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// Pobiera aktualizację
async function downloadUpdate(downloadUrl, sha256, version) {
    const tempDir = path.join(app.getPath('temp'), 'xsuslauncher-update');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    const ext = process.platform === 'win32' ? '.exe' : '.AppImage';
    const filePath = path.join(tempDir, `XsusLauncher-${version}${ext}`);

    return new Promise((resolve, reject) => {
        mainWindow?.webContents.send('update-download-progress', { percent: 0, status: 'Rozpoczynanie pobierania...' });

        const client = downloadUrl.startsWith('https') ? https : http;

        const makeRequest = (url) => {
            client.get(url, (res) => {
                // Handle redirects
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    makeRequest(res.headers.location);
                    return;
                }

                if (res.statusCode !== 200) {
                    reject(new Error(`Download failed: HTTP ${res.statusCode}`));
                    return;
                }

                const totalSize = parseInt(res.headers['content-length'], 10) || 0;
                let downloadedSize = 0;
                const fileStream = fs.createWriteStream(filePath);
                const hash = crypto.createHash('sha256');

                res.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    hash.update(chunk);

                    if (totalSize > 0) {
                        const percent = Math.round((downloadedSize / totalSize) * 100);
                        mainWindow?.webContents.send('update-download-progress', {
                            percent,
                            downloaded: downloadedSize,
                            total: totalSize,
                            status: `Pobieranie aktualizacji... ${percent}%`
                        });
                    }
                });

                res.pipe(fileStream);

                fileStream.on('finish', () => {
                    fileStream.close(() => {
                        // Weryfikuj SHA256
                        const fileHash = hash.digest('hex');
                        if (sha256 && fileHash !== sha256) {
                            fs.unlinkSync(filePath);
                            reject(new Error('Weryfikacja SHA256 nie powiodła się'));
                            return;
                        }

                        pendingUpdatePath = filePath;
                        resolve(filePath);
                    });
                });

                fileStream.on('error', (err) => {
                    fs.unlinkSync(filePath).catch(() => {});
                    reject(err);
                });
            }).on('error', reject);
        };

        makeRequest(downloadUrl);
    });
}

// IPC: Ręczne sprawdzenie aktualizacji
ipcMain.handle('check-for-updates', async () => {
    await checkForUpdates();
    return { success: true };
});

// IPC: Pobierz i zainstaluj aktualizację
ipcMain.handle('download-update', async (event, { downloadUrl, sha256, version }) => {
    try {
        const filePath = await downloadUpdate(downloadUrl, sha256, version);
        mainWindow?.webContents.send('update-downloaded', { filePath, version });
        return { success: true, filePath };
    } catch (error) {
        mainWindow?.webContents.send('update-error', { error: error.message });
        return { success: false, error: error.message };
    }
});

// IPC: Zainstaluj pobraną aktualizację
ipcMain.on('install-update', () => {
    if (pendingUpdatePath && fs.existsSync(pendingUpdatePath)) {
        // Uruchom instalator i zamknij launcher
        shell.openPath(pendingUpdatePath);
        setTimeout(() => app.quit(), 1000);
    } else if (autoUpdater) {
        autoUpdater.quitAndInstall();
    }
});

// electron-updater events (backup)
if (autoUpdater) {
    autoUpdater.on('update-available', (info) => {
        mainWindow?.webContents.send('update-available', {
            currentVersion: app.getVersion(),
            latestVersion: info.version,
            changelog: info.releaseNotes || ''
        });
    });

    autoUpdater.on('update-downloaded', () => {
        mainWindow?.webContents.send('update-downloaded', {});
    });

    autoUpdater.on('error', (error) => {
        console.error('Auto-update error:', error);
    });
}

// ============================================
// OFFLINE MODE / ONLINE STATUS
// ============================================

// Sprawdza czy API jest dostępne (ping)
ipcMain.handle('check-online-status', async () => {
    try {
        const apiUrl = resolveApiUrl();
        const url = `${apiUrl}/api/launcher/config`;
        const response = await fetchJson(url);

        if (response && response.success) {
            // Cache successful config response
            store.set('cachedConfig', response);
            store.set('cachedConfigTimestamp', Date.now());
            return { online: true, config: response };
        }
        return { online: false, error: 'Invalid response' };
    } catch (error) {
        return { online: false, error: error.message };
    }
});

// Zwraca ostatnio zakeszowaną konfigurację (dla trybu offline)
ipcMain.handle('get-cached-config', () => {
    const cachedConfig = store.get('cachedConfig');
    const cachedTimestamp = store.get('cachedConfigTimestamp');

    if (cachedConfig) {
        return {
            success: true,
            data: cachedConfig,
            timestamp: cachedTimestamp,
            fromCache: true
        };
    }
    return { success: false, error: 'No cached config available' };
});

// ============================================
// DODATKOWE HANDLERY IPC
// ============================================

// Sprawdzenie statusu gry
ipcMain.handle('is-game-running', () => {
    return gameManager ? gameManager.gameProcess !== null : false;
});

// ============================================
// CHANGELOG IPC HANDLERS
// ============================================

// Pobierz changelog dla aktualnej wersji
ipcMain.handle('get-changelog', () => {
    return getLatestChangelog();
});

// Pobierz changelog dla konkretnej wersji
ipcMain.handle('get-changelog-version', (event, version) => {
    return getChangelog(version);
});

// Sprawdź czy pokazać changelog (nowa wersja)
ipcMain.handle('should-show-changelog', () => {
    const currentVersion = app.getVersion();
    const lastSeenVersion = store.get('lastSeenVersion');

    // Jeśli to pierwsza instalacja lub nowa wersja
    if (!lastSeenVersion || lastSeenVersion !== currentVersion) {
        return {
            show: true,
            version: currentVersion,
            changelog: getChangelog(currentVersion) || getLatestChangelog()
        };
    }

    return { show: false };
});

// Oznacz changelog jako widziany
ipcMain.handle('mark-changelog-seen', () => {
    const currentVersion = app.getVersion();
    store.set('lastSeenVersion', currentVersion);
    return { success: true };
});

// ============================================
// MOTYWY
// ============================================

// Pobierz listę dostępnych motywów
ipcMain.handle('get-available-themes', () => {
    return getAvailableThemes();
});

// Pobierz szczegóły motywu
ipcMain.handle('get-theme', (event, themeId) => {
    return getTheme(themeId);
});

// Pobierz zmienne CSS motywu
ipcMain.handle('get-theme-variables', (event, themeId) => {
    return getThemeVariables(themeId);
});

// Pobierz aktualny motyw
ipcMain.handle('get-current-theme', () => {
    const themeId = store.get('theme', 'dark');
    return {
        id: themeId,
        ...getTheme(themeId),
        variables: getThemeVariables(themeId)
    };
});

// Ustaw motyw
ipcMain.handle('set-theme', (event, themeId) => {
    const theme = getTheme(themeId);
    if (theme) {
        store.set('theme', themeId);
        return {
            success: true,
            id: themeId,
            variables: getThemeVariables(themeId)
        };
    }
    return { success: false, error: 'Theme not found' };
});

module.exports = {};
