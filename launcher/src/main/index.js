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
    let url;
    const storeUrl = store.get('apiUrl');
    if (storeUrl && storeUrl.trim()) {
        url = storeUrl.trim();
    } else if (process.env.API_URL && process.env.API_URL.trim()) {
        url = process.env.API_URL.trim();
    } else {
        return DEFAULT_API_URL;
    }
    // Usuń trailing /api - ścieżki w kodzie już dodają /api/...
    url = url.replace(/\/+$/, '');
    if (url.endsWith('/api')) {
        url = url.slice(0, -4);
    }
    return url;
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

    // Skonfiguruj electron-updater z dynamicznym URL
    configureAutoUpdater();

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
// AUTO-UPDATE (electron-updater + fallback)
// ============================================

let pendingUpdatePath = null;
let useNativeUpdater = !!autoUpdater;
let updateCheckInterval = null;
let updateCheckFailCount = 0;

/**
 * Konfiguruje electron-updater z dynamicznym URL
 * Ustawia feed URL na /api/launcher/releases (serwuje latest.yml)
 */
function configureAutoUpdater() {
    if (!autoUpdater) return;

    const apiUrl = resolveApiUrl();
    const feedUrl = `${apiUrl}/api/launcher/releases`;

    try {
        autoUpdater.setFeedURL({
            provider: 'generic',
            url: feedUrl
        });

        autoUpdater.autoDownload = false; // Kontrolujemy kiedy pobierać
        autoUpdater.autoInstallOnAppQuit = true;

        // Aktualizacja dostępna
        autoUpdater.on('update-available', (info) => {
            console.log('electron-updater: update available', info.version);
            updateCheckFailCount = 0;
            mainWindow?.webContents.send('update-available', {
                currentVersion: app.getVersion(),
                latestVersion: info.version,
                changelog: info.releaseNotes || '',
                isRequired: false,
                nativeUpdate: true
            });
        });

        // Postęp pobierania
        autoUpdater.on('download-progress', (progress) => {
            mainWindow?.webContents.send('update-download-progress', {
                percent: Math.round(progress.percent),
                downloaded: progress.transferred,
                total: progress.total,
                bytesPerSecond: progress.bytesPerSecond,
                status: `Pobieranie aktualizacji... ${Math.round(progress.percent)}%`
            });
        });

        // Aktualizacja pobrana - gotowa do instalacji
        autoUpdater.on('update-downloaded', (info) => {
            console.log('electron-updater: update downloaded', info.version);
            mainWindow?.webContents.send('update-downloaded', {
                version: info.version,
                nativeUpdate: true
            });
        });

        // Brak aktualizacji
        autoUpdater.on('update-not-available', () => {
            console.log('electron-updater: no update available');
            updateCheckFailCount = 0;
            mainWindow?.webContents.send('update-not-available');
        });

        // Błąd
        autoUpdater.on('error', (error) => {
            console.error('electron-updater error:', error);
            mainWindow?.webContents.send('update-error', {
                error: error.message || 'Błąd aktualizacji'
            });
        });

        console.log('electron-updater configured:', feedUrl);
    } catch (e) {
        console.warn('Failed to configure electron-updater:', e.message);
        useNativeUpdater = false;
    }

    // Uruchom okresowe sprawdzanie aktualizacji (co godzinę)
    if (!updateCheckInterval) {
        updateCheckInterval = setInterval(() => {
            if (store.get('autoUpdate') && process.env.NODE_ENV !== 'development') {
                checkForUpdates();
            }
        }, 60 * 60 * 1000); // 1 godzina
    }
}

/**
 * Sprawdza aktualizacje
 * Próbuje najpierw electron-updater, jeśli niedostępny - custom API
 */
async function checkForUpdates() {
    if (useNativeUpdater) {
        try {
            // Uaktualnij feed URL (może się zmienić w ustawieniach)
            const apiUrl = resolveApiUrl();
            autoUpdater.setFeedURL({
                provider: 'generic',
                url: `${apiUrl}/api/launcher/releases`
            });
            await autoUpdater.checkForUpdates();
            updateCheckFailCount = 0;
            return;
        } catch (error) {
            console.warn('electron-updater check failed, using custom fallback:', error.message);
        }
    }

    // Fallback: custom API-based check
    try {
        const apiUrl = resolveApiUrl();
        const currentVersion = app.getVersion();
        const arch = process.arch || 'x64';
        const platform = process.platform || 'win32';
        const url = `${apiUrl}/api/launcher/check-update?version=${currentVersion}&arch=${arch}&platform=${platform}`;

        const response = await fetchJson(url);

        if (response && response.success && response.data && response.data.updateAvailable) {
            console.log(`Update available (custom): ${response.data.latestVersion}`);
            updateCheckFailCount = 0;

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
                isRequired: response.data.isRequired,
                nativeUpdate: false
            });
        } else {
            updateCheckFailCount = 0;
            mainWindow?.webContents.send('update-not-available');
        }
    } catch (error) {
        updateCheckFailCount++;
        console.error(`Update check error (attempt ${updateCheckFailCount}):`, error.message);
    }
}

// Helper: fetch JSON from URL (z timeout na socket I response)
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { timeout: 10000 }, (res) => {
            let data = '';
            // Timeout na odczyt body (30s)
            res.setTimeout(30000, () => {
                res.destroy();
                reject(new Error('Response timeout'));
            });
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

/**
 * Pobiera aktualizację (custom fallback)
 * Używany gdy electron-updater nie jest dostępny
 */
async function downloadUpdateCustom(downloadUrl, sha256, version) {
    const tempDir = path.join(app.getPath('temp'), 'xsuslauncher-update');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    const ext = process.platform === 'win32' ? '.exe' : '.AppImage';
    const arch = process.arch || 'x64';
    const filePath = path.join(tempDir, `XsusLauncher-${version}-${arch}${ext}`);

    return new Promise((resolve, reject) => {
        mainWindow?.webContents.send('update-download-progress', { percent: 0, status: 'Rozpoczynanie pobierania...' });

        const makeRequest = (url, redirectCount = 0) => {
            if (redirectCount > 5) {
                reject(new Error('Zbyt wiele przekierowań'));
                return;
            }

            const client = url.startsWith('https') ? https : http;
            const req = client.get(url, { timeout: 60000 }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    mainWindow?.webContents.send('update-download-progress', {
                        percent: 0,
                        status: 'Przekierowanie...'
                    });
                    makeRequest(res.headers.location, redirectCount + 1);
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
                        const fileHash = hash.digest('hex');
                        if (sha256 && fileHash !== sha256) {
                            try { fs.unlinkSync(filePath); } catch (_) {}
                            reject(new Error(`Weryfikacja SHA256 nie powiodła się (oczekiwano: ${sha256.substring(0, 16)}..., otrzymano: ${fileHash.substring(0, 16)}...)`));
                            return;
                        }

                        pendingUpdatePath = filePath;
                        resolve(filePath);
                    });
                });

                fileStream.on('error', (err) => {
                    try { fs.unlinkSync(filePath); } catch (_) {}
                    reject(err);
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Timeout pobierania (60s)'));
            });
        };

        makeRequest(downloadUrl);
    });
}

// IPC: Ręczne sprawdzenie aktualizacji
ipcMain.handle('check-for-updates', async () => {
    await checkForUpdates();
    return { success: true };
});

// IPC: Pobierz aktualizację
ipcMain.handle('download-update', async (event, data) => {
    try {
        // Jeśli to native update (electron-updater) - pobierz przez autoUpdater
        if (data.nativeUpdate && useNativeUpdater) {
            await autoUpdater.downloadUpdate();
            return { success: true, nativeUpdate: true };
        }

        // Custom fallback
        const filePath = await downloadUpdateCustom(data.downloadUrl, data.sha256, data.version);
        mainWindow?.webContents.send('update-downloaded', { filePath, version: data.version, nativeUpdate: false });
        return { success: true, filePath };
    } catch (error) {
        mainWindow?.webContents.send('update-error', { error: error.message });
        return { success: false, error: error.message };
    }
});

// IPC: Zainstaluj pobraną aktualizację
ipcMain.on('install-update', (event, data) => {
    // electron-updater: bezszwowa aktualizacja (podmienia pliki, restartuje)
    if ((data?.nativeUpdate || !pendingUpdatePath) && useNativeUpdater) {
        console.log('Installing update via electron-updater (seamless)...');
        autoUpdater.quitAndInstall(false, true);
        return;
    }

    // Custom fallback: uruchom instalator
    if (pendingUpdatePath && fs.existsSync(pendingUpdatePath)) {
        console.log('Installing update via custom installer...');
        const updatePath = pendingUpdatePath;
        pendingUpdatePath = null; // Reset po użyciu
        shell.openPath(updatePath);
        setTimeout(() => app.quit(), 1000);
    }
});

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
