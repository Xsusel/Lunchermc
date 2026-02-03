/**
 * XsusLauncher - Manager gry
 * Obsługuje wykrywanie Java, pobieranie plików i uruchamianie Minecraft
 */
const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { spawn, exec } = require('child_process');
const crypto = require('crypto');
const extractZip = require('extract-zip');

// Próba załadowania minecraft-launcher-core
let Client;
try {
    const mlc = require('minecraft-launcher-core');
    Client = mlc.Client;
} catch (e) {
    console.warn('minecraft-launcher-core not available, using fallback mode');
    Client = null;
}

class GameManager {
    constructor(store, mainWindow) {
        this.store = store;
        this.mainWindow = mainWindow;
        this.isLaunching = false;
        this.gameProcess = null;
        this.downloadQueue = [];
        this.currentDownload = null;
    }

    /**
     * Wysyła wiadomość do okna renderera
     */
    sendToRenderer(channel, data) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data);
        }
    }

    /**
     * Pobiera domyślną ścieżkę gry
     */
    getDefaultGamePath() {
        const appData = process.env.APPDATA ||
            (process.platform === 'darwin'
                ? path.join(process.env.HOME, 'Library', 'Application Support')
                : path.join(process.env.HOME, '.local', 'share'));
        return path.join(appData, '.xsuslauncher');
    }

    /**
     * Pobiera ścieżkę do gry
     */
    getGamePath() {
        return this.store.get('gamePath') || this.getDefaultGamePath();
    }

    /**
     * Upewnia się, że katalog istnieje
     */
    ensureDir(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    // ============================================
    // WYKRYWANIE JAVA
    // ============================================

    /**
     * Sprawdza możliwe lokalizacje Java
     */
    getPossibleJavaPaths() {
        const paths = [];

        if (process.platform === 'win32') {
            // Windows
            const programFiles = [
                process.env['ProgramFiles'],
                process.env['ProgramFiles(x86)'],
                process.env['LOCALAPPDATA']
            ].filter(Boolean);

            for (const base of programFiles) {
                // Oracle Java
                paths.push(path.join(base, 'Java'));
                // Eclipse Adoptium
                paths.push(path.join(base, 'Eclipse Adoptium'));
                paths.push(path.join(base, 'Eclipse Foundation'));
                // Zulu
                paths.push(path.join(base, 'Zulu'));
                // Microsoft OpenJDK
                paths.push(path.join(base, 'Microsoft', 'jdk-17*'));
                paths.push(path.join(base, 'Microsoft', 'jdk-21*'));
            }

            // Minecraft bundled Java
            const minecraftPath = path.join(process.env.APPDATA || '', '.minecraft', 'runtime');
            if (fs.existsSync(minecraftPath)) {
                paths.push(minecraftPath);
            }
        } else if (process.platform === 'darwin') {
            // macOS
            paths.push('/Library/Java/JavaVirtualMachines');
            paths.push('/System/Library/Java/JavaVirtualMachines');
            paths.push(path.join(process.env.HOME, 'Library/Java/JavaVirtualMachines'));
        } else {
            // Linux
            paths.push('/usr/lib/jvm');
            paths.push('/usr/java');
            paths.push('/opt/java');
        }

        return paths;
    }

    /**
     * Szuka Java w podanym katalogu
     */
    findJavaInDirectory(dir) {
        if (!fs.existsSync(dir)) return [];

        const results = [];
        const javaExe = process.platform === 'win32' ? 'javaw.exe' : 'java';

        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const fullPath = path.join(dir, entry.name);

                    // Sprawdź bezpośrednio w bin
                    const binPath = path.join(fullPath, 'bin', javaExe);
                    if (fs.existsSync(binPath)) {
                        results.push(binPath);
                    }

                    // Sprawdź w Contents/Home (macOS)
                    const macPath = path.join(fullPath, 'Contents', 'Home', 'bin', javaExe);
                    if (fs.existsSync(macPath)) {
                        results.push(macPath);
                    }

                    // Rekurencyjnie dla podkatalogów (max 2 poziomy)
                    results.push(...this.findJavaInDirectory(fullPath));
                }
            }
        } catch (e) {
            // Ignoruj błędy dostępu
        }

        return results;
    }

    /**
     * Pobiera wersję Java z danej ścieżki
     */
    async getJavaVersion(javaPath) {
        return new Promise((resolve) => {
            exec(`"${javaPath}" -version`, (error, stdout, stderr) => {
                // Java wypisuje wersję na stderr
                const output = stderr || stdout || '';
                const match = output.match(/version "(\d+)(?:\.(\d+))?(?:\.(\d+))?/);

                if (match) {
                    const major = parseInt(match[1]);
                    const minor = parseInt(match[2] || 0);
                    const patch = parseInt(match[3] || 0);

                    // Java 1.8 vs Java 17+
                    const version = major === 1 ? minor : major;

                    resolve({
                        path: javaPath,
                        version,
                        versionString: `${major}.${minor}.${patch}`,
                        fullOutput: output.trim()
                    });
                } else {
                    resolve(null);
                }
            });
        });
    }

    /**
     * Wykrywa wszystkie zainstalowane wersje Java
     */
    async detectJava() {
        const javaInstallations = [];
        const checkedPaths = new Set();

        // Sprawdź PATH
        const pathJava = process.platform === 'win32' ? 'javaw' : 'java';
        const pathResult = await this.getJavaVersion(pathJava);
        if (pathResult) {
            javaInstallations.push({ ...pathResult, source: 'PATH' });
            checkedPaths.add(pathResult.path);
        }

        // Sprawdź JAVA_HOME
        if (process.env.JAVA_HOME) {
            const javaExe = process.platform === 'win32' ? 'javaw.exe' : 'java';
            const javaHomePath = path.join(process.env.JAVA_HOME, 'bin', javaExe);
            if (!checkedPaths.has(javaHomePath) && fs.existsSync(javaHomePath)) {
                const result = await this.getJavaVersion(javaHomePath);
                if (result) {
                    javaInstallations.push({ ...result, source: 'JAVA_HOME' });
                    checkedPaths.add(javaHomePath);
                }
            }
        }

        // Szukaj w znanych lokalizacjach
        const possiblePaths = this.getPossibleJavaPaths();
        for (const searchPath of possiblePaths) {
            const found = this.findJavaInDirectory(searchPath);
            for (const javaPath of found) {
                if (!checkedPaths.has(javaPath)) {
                    const result = await this.getJavaVersion(javaPath);
                    if (result) {
                        javaInstallations.push({ ...result, source: 'detected' });
                        checkedPaths.add(javaPath);
                    }
                }
            }
        }

        // Sortuj po wersji (najnowsza pierwsza)
        javaInstallations.sort((a, b) => b.version - a.version);

        return javaInstallations;
    }

    /**
     * Pobiera najlepszą wersję Java dla danej wersji MC
     */
    async getBestJavaForVersion(mcVersion) {
        const installations = await this.detectJava();

        if (installations.length === 0) {
            return null;
        }

        // Parse MC version
        const [major, minor] = mcVersion.split('.').map(Number);

        // Minecraft 1.17+ wymaga Java 16+
        // Minecraft 1.18+ wymaga Java 17+
        // Minecraft 1.20.5+ wymaga Java 21+
        let requiredJava = 8;
        if (major >= 1 && minor >= 20 && mcVersion.includes('.5')) {
            requiredJava = 21;
        } else if (major >= 1 && minor >= 18) {
            requiredJava = 17;
        } else if (major >= 1 && minor >= 17) {
            requiredJava = 16;
        }

        // Znajdź najnowszą kompatybilną wersję
        const compatible = installations.filter(j => j.version >= requiredJava);

        if (compatible.length > 0) {
            return compatible[0];
        }

        // Jeśli nie ma kompatybilnej, zwróć najnowszą dostępną
        return installations[0];
    }

    // ============================================
    // POBIERANIE PLIKÓW
    // ============================================

    /**
     * Pobiera plik z URL
     */
    downloadFile(url, destPath, onProgress) {
        return new Promise((resolve, reject) => {
            this.ensureDir(path.dirname(destPath));

            const protocol = url.startsWith('https') ? https : http;
            const file = fs.createWriteStream(destPath);

            const request = protocol.get(url, (response) => {
                // Obsługa przekierowań
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    file.close();
                    fs.unlinkSync(destPath);
                    return this.downloadFile(response.headers.location, destPath, onProgress)
                        .then(resolve)
                        .catch(reject);
                }

                if (response.statusCode !== 200) {
                    file.close();
                    fs.unlinkSync(destPath);
                    reject(new Error(`HTTP ${response.statusCode}`));
                    return;
                }

                const totalSize = parseInt(response.headers['content-length'] || '0', 10);
                let downloaded = 0;

                response.on('data', (chunk) => {
                    downloaded += chunk.length;
                    if (onProgress && totalSize > 0) {
                        onProgress(downloaded, totalSize);
                    }
                });

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve(destPath);
                });
            });

            request.on('error', (err) => {
                file.close();
                if (fs.existsSync(destPath)) {
                    fs.unlinkSync(destPath);
                }
                reject(err);
            });

            request.setTimeout(30000, () => {
                request.destroy();
                reject(new Error('Download timeout'));
            });
        });
    }

    /**
     * Oblicza SHA256 pliku
     */
    calculateFileHash(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);

            stream.on('data', (data) => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }

    /**
     * Synchronizuje pliki z serwerem
     */
    async syncFiles(files, gamePath) {
        const results = {
            downloaded: [],
            skipped: [],
            removed: [],
            errors: []
        };

        const totalFiles = files.length;
        let processed = 0;

        for (const file of files) {
            processed++;
            // Użyj file.path jeśli dostępny (nowy format), w przeciwnym razie mods/filename (stary format)
            const relativePath = file.path || `mods/${file.filename}`;
            const destPath = path.join(gamePath, relativePath);

            // Upewnij się że folder istnieje
            this.ensureDir(path.dirname(destPath));

            this.sendToRenderer('download-progress', {
                type: 'file',
                name: file.filename || path.basename(destPath),
                current: processed,
                total: totalFiles,
                status: 'checking'
            });

            try {
                let needsDownload = true;

                // Sprawdź czy plik istnieje i ma prawidłowy hash
                if (fs.existsSync(destPath)) {
                    const hash = await this.calculateFileHash(destPath);
                    if (hash === file.sha256) {
                        needsDownload = false;
                        results.skipped.push(file.filename);
                    }
                }

                if (needsDownload) {
                    this.sendToRenderer('download-progress', {
                        type: 'file',
                        name: file.filename || path.basename(destPath),
                        current: processed,
                        total: totalFiles,
                        status: 'downloading'
                    });

                    await this.downloadFile(file.url, destPath, (downloaded, total) => {
                        this.sendToRenderer('download-progress', {
                            type: 'file',
                            name: file.filename || path.basename(destPath),
                            current: processed,
                            total: totalFiles,
                            status: 'downloading',
                            bytes: downloaded,
                            totalBytes: total
                        });
                    });

                    results.downloaded.push(file.filename);
                }
            } catch (error) {
                results.errors.push({ filename: file.filename, error: error.message });
            }
        }

        return results;
    }

    // ============================================
    // URUCHAMIANIE GRY
    // ============================================

    /**
     * Uruchamia grę
     */
    async launchGame(config) {
        if (this.isLaunching) {
            throw new Error('Gra jest już uruchamiana');
        }

        this.isLaunching = true;

        try {
            const gamePath = this.getGamePath();
            this.ensureDir(gamePath);

            // Sprawdź Java
            this.sendToRenderer('game-status', { status: 'Wykrywanie Java...' });

            let javaPath = this.store.get('javaPath');
            if (!javaPath) {
                const bestJava = await this.getBestJavaForVersion(config.gameVersion);
                if (!bestJava) {
                    throw new Error('Nie znaleziono Java. Zainstaluj Java 17+ lub wskaż ścieżkę w ustawieniach.');
                }
                javaPath = bestJava.path;
                console.log(`Using Java ${bestJava.version} from ${javaPath}`);
            }

            // Weryfikuj ścieżkę Java
            if (!fs.existsSync(javaPath)) {
                throw new Error(`Nie znaleziono Java w: ${javaPath}`);
            }

            // Synchronizuj pliki (preferuj config.files, fallback do config.mods)
            this.sendToRenderer('game-status', { status: 'Synchronizacja plików...' });

            const filesToSync = config.files || config.mods || [];
            if (filesToSync.length > 0) {
                // Jeśli używamy starego config.mods, musimy zapewnić kompatybilność
                // syncFiles obsługuje to przez fallback do mods/filename
                const syncResult = await this.syncFiles(filesToSync, gamePath);
                console.log('Files sync result:', syncResult);

                if (syncResult.errors.length > 0) {
                    console.warn('Some files failed to download:', syncResult.errors);
                }
            }

            // Przygotuj opcje uruchomienia
            const ramSettings = this.store.get('ram') || { min: 2, max: 4 };
            const resolution = this.store.get('resolution') || { width: 1280, height: 720, fullscreen: false };
            const customJavaArgs = this.store.get('customJavaArgs') || '';

            this.sendToRenderer('game-status', { status: 'Uruchamianie Minecraft...' });

            // Użyj minecraft-launcher-core jeśli dostępny
            if (Client) {
                const launcher = new Client();

                const launchOpts = {
                    // Ścieżka gry
                    root: gamePath,

                    // Wersja
                    version: {
                        number: config.gameVersion,
                        type: config.loaderType === 'vanilla' ? 'release' : config.loaderType
                    },

                    // Pamięć
                    memory: {
                        min: `${ramSettings.min}G`,
                        max: `${ramSettings.max}G`
                    },

                    // Java
                    javaPath: javaPath,

                    // Użytkownik (offline/non-premium)
                    authorization: {
                        access_token: '0',
                        client_token: 'xsuslauncher',
                        uuid: this.generateOfflineUUID(config.username),
                        name: config.username,
                        user_properties: '{}'
                    },

                    // Okno
                    window: {
                        width: resolution.width,
                        height: resolution.height,
                        fullscreen: resolution.fullscreen
                    },

                    // Automatyczne połączenie z serwerem
                    quickPlay: config.serverIp ? {
                        type: 'multiplayer',
                        identifier: `${config.serverIp}:${config.serverPort || 25565}`
                    } : undefined,

                    // Dodatkowe argumenty
                    customArgs: customJavaArgs ? customJavaArgs.split(' ') : [],

                    // Forge
                    forge: config.loaderType === 'forge' && config.forgeVersion
                        ? path.join(gamePath, 'forge', `forge-${config.gameVersion}-${config.forgeVersion}.jar`)
                        : undefined
                };

                // Listener dla postępu
                launcher.on('debug', (e) => console.log('[MC Debug]', e));
                launcher.on('data', (e) => {
                    this.sendToRenderer('game-output', e);
                });
                launcher.on('progress', (e) => {
                    this.sendToRenderer('download-progress', {
                        type: e.type,
                        task: e.task,
                        current: e.current,
                        total: e.total
                    });
                });

                // Uruchom
                this.gameProcess = await launcher.launch(launchOpts);

                if (this.gameProcess) {
                    this.gameProcess.on('close', (code) => {
                        this.sendToRenderer('game-close', code);
                        this.gameProcess = null;
                        this.isLaunching = false;
                    });
                } else {
                    console.error('Game process is null after launch!');
                }

            } else {
                // Fallback - uruchom bez minecraft-launcher-core
                console.log('Launching in fallback mode (no minecraft-launcher-core)');

                // Tutaj można dodać własną implementację uruchamiania
                // Na razie wyświetl informację
                this.sendToRenderer('game-status', {
                    status: 'Gotowe do uruchomienia',
                    message: 'minecraft-launcher-core nie jest dostępny. Zainstaluj go lub uruchom grę ręcznie.'
                });
            }

            return {
                success: true,
                gamePath,
                javaPath
            };

        } catch (error) {
            console.error('Launch error:', error);
            throw error;
        } finally {
            this.isLaunching = false;
        }
    }

    /**
     * Generuje UUID dla trybu offline
     */
    generateOfflineUUID(username) {
        const hash = crypto.createHash('md5').update(`OfflinePlayer:${username}`).digest('hex');
        return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
    }

    /**
     * Zatrzymuje grę
     */
    killGame() {
        if (this.gameProcess) {
            this.gameProcess.kill();
            this.gameProcess = null;
        }
    }

    // ============================================
    // REJESTRACJA IPC
    // ============================================

    /**
     * Rejestruje handlery IPC
     */
    registerIPCHandlers() {
        // Wykrywanie Java
        ipcMain.handle('detect-java', async () => {
            return this.detectJava();
        });

        // Sprawdzenie konkretnej wersji Java
        ipcMain.handle('check-java', async (event, javaPath) => {
            return this.getJavaVersion(javaPath);
        });

        // Uruchomienie gry
        ipcMain.handle('launch-game', async (event, config) => {
            try {
                return await this.launchGame(config);
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // Zatrzymanie gry
        ipcMain.on('kill-game', () => {
            this.killGame();
        });

        // Synchronizacja modów
        ipcMain.handle('sync-mods', async (event, mods) => {
            const gamePath = this.getGamePath();
            return this.syncFiles(mods, gamePath);
        });

        // Pobierz hash pliku
        ipcMain.handle('get-file-hash', async (event, filePath) => {
            if (fs.existsSync(filePath)) {
                return this.calculateFileHash(filePath);
            }
            return null;
        });

        // Sprawdź czy plik istnieje
        ipcMain.handle('file-exists', async (event, filePath) => {
            return fs.existsSync(filePath);
        });
    }
}

module.exports = GameManager;
