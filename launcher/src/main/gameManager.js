/**
 * XsusLauncher - Manager gry
 * Obsługuje wykrywanie Java, pobieranie plików i uruchamianie Minecraft
 *
 * Features:
 * - Auto-instalacja Java (Adoptium)
 * - Wznawianie pobierania (HTTP Range)
 * - Auto-tune concurrent downloads
 * - Auto RAM settings
 * - Crash reporter
 */
const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { spawn, exec } = require('child_process');
const crypto = require('crypto');
const extractZip = require('extract-zip');
const os = require('os');

// Discord Rich Presence
let discordRPC;
try {
    discordRPC = require('./discordRPC');
} catch (e) {
    console.warn('Discord RPC not available:', e.message);
    discordRPC = null;
}

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

        // Throttling dla progress events (optymalizacja dla słabszych PC)
        this.lastProgressUpdate = 0;
        this.progressThrottleMs = 100; // Minimum 100ms między aktualizacjami
        this.pendingProgress = null;

        // Cache dla wykrywania Java
        this.javaCacheTime = 0;
        this.javaCacheDuration = 5 * 60 * 1000; // 5 minut cache
        this.cachedJavaInstallations = null;

        // Auto-tune downloads
        this.concurrentDownloads = 5; // Domyślnie 5, auto-tune może zmienić (3-10)
        this.networkSpeedMbps = 0;
        this.lastSpeedTest = 0;

        // Crash reporter
        this.gameStartTime = null;
        this.gameLogs = [];
        this.maxLogLines = 1000;

        // Java auto-installer
        this.isInstallingJava = false;
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
     * Wysyła throttled progress update (optymalizacja dla słabszych PC)
     * Ogranicza liczbę aktualizacji do max 10/sekundę
     */
    sendThrottledProgress(channel, data) {
        const now = Date.now();
        const elapsed = now - this.lastProgressUpdate;

        // Zawsze zapisz najnowsze dane
        this.pendingProgress = { channel, data };

        // Jeśli minęło wystarczająco czasu, wyślij od razu
        if (elapsed >= this.progressThrottleMs) {
            this.lastProgressUpdate = now;
            this.sendToRenderer(channel, data);
            this.pendingProgress = null;
            return;
        }

        // Jeśli nie ma zaplanowanego wysłania, zaplanuj je
        if (!this.progressTimeout) {
            this.progressTimeout = setTimeout(() => {
                if (this.pendingProgress) {
                    this.lastProgressUpdate = Date.now();
                    this.sendToRenderer(this.pendingProgress.channel, this.pendingProgress.data);
                    this.pendingProgress = null;
                }
                this.progressTimeout = null;
            }, this.progressThrottleMs - elapsed);
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
    // AUTO-INSTALACJA JAVA (ADOPTIUM)
    // ============================================

    /**
     * Pobiera URL do pobrania Adoptium JDK dla danej platformy
     */
    getAdoptiumDownloadUrl(javaVersion = 17) {
        const platform = process.platform;
        const arch = process.arch === 'x64' ? 'x64' : (process.arch === 'arm64' ? 'aarch64' : 'x64');

        let os_name, ext;
        if (platform === 'win32') {
            os_name = 'windows';
            ext = 'zip';
        } else if (platform === 'darwin') {
            os_name = 'mac';
            ext = 'tar.gz';
        } else {
            os_name = 'linux';
            ext = 'tar.gz';
        }

        // Adoptium API URL
        return `https://api.adoptium.net/v3/binary/latest/${javaVersion}/ga/${os_name}/${arch}/jdk/hotspot/normal/eclipse?project=jdk`;
    }

    /**
     * Pobiera ścieżkę do folderu Java w launcherze
     */
    getJavaInstallPath() {
        const gamePath = this.getGamePath();
        return path.join(gamePath, 'java');
    }

    /**
     * Sprawdza czy Java jest już zainstalowana przez launcher
     */
    getInstalledJavaPath() {
        const javaDir = this.getJavaInstallPath();
        if (!fs.existsSync(javaDir)) return null;

        const javaExe = process.platform === 'win32' ? 'javaw.exe' : 'java';

        try {
            const entries = fs.readdirSync(javaDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    // Sprawdź standardową strukturę JDK
                    const binPath = path.join(javaDir, entry.name, 'bin', javaExe);
                    if (fs.existsSync(binPath)) {
                        return binPath;
                    }
                    // macOS ma inną strukturę
                    const macPath = path.join(javaDir, entry.name, 'Contents', 'Home', 'bin', javaExe);
                    if (fs.existsSync(macPath)) {
                        return macPath;
                    }
                }
            }
        } catch (e) {
            console.error('Error checking installed Java:', e);
        }

        return null;
    }

    /**
     * Automatycznie instaluje Java (Adoptium) jeśli nie znaleziono
     */
    async autoInstallJava(requiredVersion = 17) {
        if (this.isInstallingJava) {
            throw new Error('Java jest już instalowana');
        }

        this.isInstallingJava = true;
        const javaDir = this.getJavaInstallPath();
        this.ensureDir(javaDir);

        try {
            this.sendToRenderer('game-status', { status: 'Pobieranie Java (Adoptium)...' });
            console.log(`Auto-installing Java ${requiredVersion}...`);

            // Pobierz URL
            const downloadUrl = this.getAdoptiumDownloadUrl(requiredVersion);
            const ext = process.platform === 'win32' ? 'zip' : 'tar.gz';
            const archivePath = path.join(javaDir, `adoptium-${requiredVersion}.${ext}`);

            // Pobierz archiwum
            await this.downloadFileWithResume(downloadUrl, archivePath, (downloaded, total) => {
                const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
                this.sendThrottledProgress('download-progress', {
                    type: 'java-installer',
                    name: `Java ${requiredVersion} (Adoptium)`,
                    current: 1,
                    total: 1,
                    status: 'downloading',
                    bytes: downloaded,
                    totalBytes: total,
                    percent
                });
            });

            // Rozpakuj archiwum
            this.sendToRenderer('game-status', { status: 'Instalowanie Java...' });
            console.log('Extracting Java archive...');

            if (ext === 'zip') {
                await extractZip(archivePath, { dir: javaDir });
            } else {
                // Dla tar.gz użyj tar
                await new Promise((resolve, reject) => {
                    exec(`tar -xzf "${archivePath}" -C "${javaDir}"`, (error) => {
                        if (error) reject(error);
                        else resolve();
                    });
                });
            }

            // Usuń archiwum
            try { fs.unlinkSync(archivePath); } catch (e) {}

            // Znajdź zainstalowaną Javę
            const installedPath = this.getInstalledJavaPath();
            if (!installedPath) {
                throw new Error('Nie udało się znaleźć Java po instalacji');
            }

            // Weryfikuj instalację
            const javaInfo = await this.getJavaVersion(installedPath);
            if (!javaInfo) {
                throw new Error('Zainstalowana Java nie działa poprawnie');
            }

            console.log(`Java ${javaInfo.version} installed successfully at: ${installedPath}`);

            // Wyczyść cache Java
            this.cachedJavaInstallations = null;
            this.javaCacheTime = 0;

            this.sendToRenderer('game-status', {
                status: `Java ${javaInfo.version} zainstalowana pomyślnie!`
            });

            return installedPath;

        } catch (error) {
            console.error('Java auto-install failed:', error);
            throw new Error(`Nie udało się zainstalować Java: ${error.message}`);
        } finally {
            this.isInstallingJava = false;
        }
    }

    // ============================================
    // WZNAWIANIE POBIERANIA (HTTP RANGE)
    // ============================================

    /**
     * Pobiera plik z obsługą wznawiania (HTTP Range)
     */
    downloadFileWithResume(url, destPath, onProgress, maxRetries = 5) {
        return new Promise((resolve, reject) => {
            this.ensureDir(path.dirname(destPath));

            const fullUrl = this.getFullUrl(url);
            if (!fullUrl) {
                reject(new Error('Invalid URL'));
                return;
            }

            // Sprawdź czy istnieje częściowo pobrany plik
            const partialPath = destPath + '.partial';
            let startByte = 0;

            if (fs.existsSync(partialPath)) {
                const stat = fs.statSync(partialPath);
                startByte = stat.size;
                console.log(`Resuming download from byte ${startByte}`);
            }

            const attemptDownload = (attempt) => {
                const protocol = fullUrl.startsWith('https') ? https : http;

                const options = {
                    headers: {}
                };

                // Dodaj Range header jeśli wznawiamy
                if (startByte > 0) {
                    options.headers['Range'] = `bytes=${startByte}-`;
                }

                // Otwórz plik w trybie append lub write
                const fileFlags = startByte > 0 ? 'a' : 'w';
                const file = fs.createWriteStream(partialPath, { flags: fileFlags });
                let downloadedBytes = startByte;
                let lastProgressTime = Date.now();
                let totalSize = 0;

                const cleanup = (removeFile = true) => {
                    try {
                        file.close();
                        if (removeFile && fs.existsSync(partialPath)) {
                            fs.unlinkSync(partialPath);
                        }
                    } catch (e) {}
                };

                const retryOrFail = (error) => {
                    cleanup(false); // Nie usuwaj pliku - może być wznowiony
                    if (attempt < maxRetries) {
                        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                        console.log(`[RETRY ${attempt + 1}/${maxRetries}] ${path.basename(destPath)} - ${error.message}, waiting ${delay}ms`);
                        // Zaktualizuj startByte z aktualnego rozmiaru pliku
                        if (fs.existsSync(partialPath)) {
                            startByte = fs.statSync(partialPath).size;
                        }
                        setTimeout(() => attemptDownload(attempt + 1), delay);
                    } else {
                        cleanup(true); // Usuń plik po ostatniej próbie
                        reject(new Error(`Failed after ${maxRetries} attempts: ${error.message}`));
                    }
                };

                const request = protocol.get(fullUrl, options, (response) => {
                    // Obsługa przekierowań
                    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                        cleanup(false);
                        return this.downloadFileWithResume(response.headers.location, destPath, onProgress, maxRetries - attempt)
                            .then(resolve)
                            .catch(reject);
                    }

                    // 206 = Partial Content (wznawianie działa)
                    // 200 = OK (serwer nie obsługuje Range, zacznij od nowa)
                    if (response.statusCode === 200 && startByte > 0) {
                        console.log('Server does not support resume, starting from beginning');
                        startByte = 0;
                        downloadedBytes = 0;
                        cleanup(true);
                        return attemptDownload(attempt);
                    }

                    if (response.statusCode !== 200 && response.statusCode !== 206) {
                        retryOrFail(new Error(`HTTP ${response.statusCode}`));
                        return;
                    }

                    // Oblicz całkowity rozmiar
                    if (response.statusCode === 206 && response.headers['content-range']) {
                        const match = response.headers['content-range'].match(/bytes \d+-\d+\/(\d+)/);
                        if (match) {
                            totalSize = parseInt(match[1], 10);
                        }
                    } else {
                        totalSize = parseInt(response.headers['content-length'] || '0', 10) + startByte;
                    }

                    response.on('data', (chunk) => {
                        downloadedBytes += chunk.length;
                        lastProgressTime = Date.now();
                        if (onProgress && totalSize > 0) {
                            onProgress(downloadedBytes, totalSize);
                        }
                    });

                    response.pipe(file);

                    file.on('finish', () => {
                        file.close(() => {
                            // Sprawdź czy plik ma sensowny rozmiar
                            try {
                                const stat = fs.statSync(partialPath);
                                if (totalSize > 0 && stat.size < totalSize * 0.99) {
                                    // Zapisz postęp i retry
                                    startByte = stat.size;
                                    retryOrFail(new Error(`Incomplete download: ${stat.size}/${totalSize} bytes`));
                                } else {
                                    // Zmień nazwę z .partial na docelową
                                    if (fs.existsSync(destPath)) {
                                        fs.unlinkSync(destPath);
                                    }
                                    fs.renameSync(partialPath, destPath);
                                    resolve(destPath);
                                }
                            } catch (e) {
                                // Zmień nazwę nawet jeśli nie znamy rozmiaru
                                try {
                                    if (fs.existsSync(destPath)) {
                                        fs.unlinkSync(destPath);
                                    }
                                    fs.renameSync(partialPath, destPath);
                                    resolve(destPath);
                                } catch (e2) {
                                    reject(e2);
                                }
                            }
                        });
                    });

                    file.on('error', (err) => retryOrFail(err));
                    response.on('error', (err) => retryOrFail(err));
                });

                request.on('error', (err) => retryOrFail(err));

                // Timeout - 2 minuty
                request.setTimeout(120000, () => {
                    request.destroy();
                    retryOrFail(new Error('Download timeout'));
                });

                // Sprawdź czy pobieranie się nie zawiesiło
                const stallCheck = setInterval(() => {
                    if (Date.now() - lastProgressTime > 30000 && downloadedBytes > startByte) {
                        clearInterval(stallCheck);
                        request.destroy();
                        retryOrFail(new Error('Download stalled'));
                    }
                }, 5000);

                request.on('close', () => clearInterval(stallCheck));
            };

            attemptDownload(0);
        });
    }

    // ============================================
    // AUTO-TUNE CONCURRENT DOWNLOADS
    // ============================================

    /**
     * Testuje prędkość sieci i dostosowuje liczbę równoległych pobrań
     */
    async testNetworkSpeed() {
        const now = Date.now();
        // Testuj co 5 minut max
        if (this.lastSpeedTest > 0 && (now - this.lastSpeedTest) < 5 * 60 * 1000) {
            return this.networkSpeedMbps;
        }

        console.log('Testing network speed...');
        this.sendToRenderer('game-status', { status: 'Testowanie prędkości sieci...' });

        try {
            // Pobierz mały plik testowy (np. z Cloudflare)
            const testUrl = 'https://speed.cloudflare.com/__down?bytes=1000000'; // 1MB
            const testSize = 1000000;
            const startTime = Date.now();

            await new Promise((resolve, reject) => {
                const request = https.get(testUrl, (response) => {
                    if (response.statusCode !== 200) {
                        reject(new Error(`HTTP ${response.statusCode}`));
                        return;
                    }

                    let downloaded = 0;
                    response.on('data', (chunk) => {
                        downloaded += chunk.length;
                    });
                    response.on('end', () => resolve(downloaded));
                    response.on('error', reject);
                });
                request.on('error', reject);
                request.setTimeout(10000, () => {
                    request.destroy();
                    reject(new Error('Speed test timeout'));
                });
            });

            const elapsed = (Date.now() - startTime) / 1000; // sekundy
            const speedMbps = (testSize * 8) / (elapsed * 1000000); // Mbps

            this.networkSpeedMbps = speedMbps;
            this.lastSpeedTest = now;

            // Dostosuj liczbę równoległych pobrań
            // < 10 Mbps: 3 równoległe
            // 10-50 Mbps: 5 równoległych
            // 50-100 Mbps: 7 równoległych
            // > 100 Mbps: 10 równoległych
            if (speedMbps < 10) {
                this.concurrentDownloads = 3;
            } else if (speedMbps < 50) {
                this.concurrentDownloads = 5;
            } else if (speedMbps < 100) {
                this.concurrentDownloads = 7;
            } else {
                this.concurrentDownloads = 10;
            }

            console.log(`Network speed: ${speedMbps.toFixed(2)} Mbps, concurrent downloads: ${this.concurrentDownloads}`);

            return speedMbps;

        } catch (error) {
            console.warn('Speed test failed, using default settings:', error.message);
            this.concurrentDownloads = 5;
            return 0;
        }
    }

    // ============================================
    // AUTO RAM SETTINGS
    // ============================================

    /**
     * Oblicza optymalne ustawienia RAM na podstawie systemu
     */
    getOptimalRamSettings() {
        const totalMemGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
        const freeMemGB = Math.round(os.freemem() / (1024 * 1024 * 1024));

        console.log(`System RAM: ${totalMemGB} GB total, ${freeMemGB} GB free`);

        // Zostaw minimum 2GB dla systemu
        const availableForGame = Math.max(totalMemGB - 2, 2);

        // Ustawienia w zależności od dostępnej pamięci
        let minRam, maxRam;

        if (totalMemGB <= 4) {
            // Mało RAM - oszczędne ustawienia
            minRam = 1;
            maxRam = 2;
        } else if (totalMemGB <= 8) {
            // Średnio RAM
            minRam = 2;
            maxRam = Math.min(4, availableForGame);
        } else if (totalMemGB <= 16) {
            // Dużo RAM
            minRam = 2;
            maxRam = Math.min(8, availableForGame);
        } else {
            // Bardzo dużo RAM
            minRam = 4;
            maxRam = Math.min(12, availableForGame);
        }

        return {
            min: minRam,
            max: maxRam,
            totalSystem: totalMemGB,
            freeSystem: freeMemGB,
            recommended: maxRam
        };
    }

    /**
     * Automatycznie ustawia RAM jeśli użytkownik nie zmienił ustawień
     */
    async autoConfigureRam() {
        // Sprawdź czy użytkownik ręcznie ustawił RAM
        const userConfigured = this.store.get('ramManuallyConfigured');
        if (userConfigured) {
            console.log('RAM settings manually configured, skipping auto-config');
            return this.store.get('ram') || { min: 2, max: 4 };
        }

        const optimal = this.getOptimalRamSettings();
        console.log(`Auto-configuring RAM: min=${optimal.min}GB, max=${optimal.max}GB`);

        this.store.set('ram', { min: optimal.min, max: optimal.max });

        return { min: optimal.min, max: optimal.max };
    }

    // ============================================
    // CRASH REPORTER
    // ============================================

    /**
     * Zapisuje linię logu z gry
     */
    addGameLog(line) {
        this.gameLogs.push({
            time: new Date().toISOString(),
            line: line
        });

        // Ogranicz liczbę linii
        if (this.gameLogs.length > this.maxLogLines) {
            this.gameLogs.shift();
        }
    }

    /**
     * Wykrywa crash na podstawie logów
     */
    detectCrash(exitCode, logs) {
        // Exit code != 0 sugeruje crash
        if (exitCode !== 0 && exitCode !== null) {
            return {
                detected: true,
                type: 'exit_code',
                code: exitCode
            };
        }

        // Sprawdź logi pod kątem typowych błędów
        const crashPatterns = [
            /Exception in thread/i,
            /Error: Could not create the Java Virtual Machine/i,
            /OutOfMemoryError/i,
            /A fatal error has been detected/i,
            /EXCEPTION_ACCESS_VIOLATION/i,
            /Minecraft has crashed/i,
            /The game crashed whilst/i
        ];

        const lastLogs = logs.slice(-100); // Sprawdź ostatnie 100 linii
        for (const log of lastLogs) {
            for (const pattern of crashPatterns) {
                if (pattern.test(log.line)) {
                    return {
                        detected: true,
                        type: 'log_pattern',
                        pattern: pattern.toString(),
                        line: log.line
                    };
                }
            }
        }

        return { detected: false };
    }

    /**
     * Generuje raport o crashu
     */
    generateCrashReport(crashInfo, config) {
        const report = {
            timestamp: new Date().toISOString(),
            launcherVersion: app.getVersion(),
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,

            system: {
                totalMemory: os.totalmem(),
                freeMemory: os.freemem(),
                cpus: os.cpus().length,
                osRelease: os.release()
            },

            game: {
                version: config?.gameVersion || 'unknown',
                loader: config?.loaderType || 'vanilla',
                forgeVersion: config?.forgeVersion,
                serverIp: config?.serverIp,
                username: config?.username
            },

            settings: {
                ram: this.store.get('ram'),
                javaPath: this.store.get('javaPath'),
                resolution: this.store.get('resolution')
            },

            crash: crashInfo,

            // Ostatnie 200 linii logów
            logs: this.gameLogs.slice(-200),

            sessionDuration: this.gameStartTime ?
                Math.round((Date.now() - this.gameStartTime) / 1000) : 0
        };

        return report;
    }

    /**
     * Zapisuje raport o crashu do pliku
     */
    async saveCrashReport(report) {
        const gamePath = this.getGamePath();
        const crashDir = path.join(gamePath, 'crash-reports', 'launcher');
        this.ensureDir(crashDir);

        const filename = `crash-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const filepath = path.join(crashDir, filename);

        fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
        console.log(`Crash report saved to: ${filepath}`);

        return filepath;
    }

    /**
     * Obsługuje zamknięcie gry (wykrywa crash)
     */
    async handleGameClose(exitCode, config) {
        const crashInfo = this.detectCrash(exitCode, this.gameLogs);

        if (crashInfo.detected) {
            console.log('Crash detected:', crashInfo);

            const report = this.generateCrashReport(crashInfo, config);
            const reportPath = await this.saveCrashReport(report);

            // Powiadom renderer o crashu
            this.sendToRenderer('game-crash', {
                crash: crashInfo,
                reportPath,
                sessionDuration: report.sessionDuration
            });

            return { crashed: true, report, reportPath };
        }

        return { crashed: false };
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
     * Wykrywa wszystkie zainstalowane wersje Java (z cache)
     */
    async detectJava(forceRefresh = false) {
        // Sprawdź cache
        const now = Date.now();
        if (!forceRefresh && this.cachedJavaInstallations && (now - this.javaCacheTime) < this.javaCacheDuration) {
            console.log('Using cached Java installations');
            return this.cachedJavaInstallations;
        }

        console.log('Detecting Java installations...');
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

        // Zapisz do cache
        this.cachedJavaInstallations = javaInstallations;
        this.javaCacheTime = now;

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
    // FORGE INSTALLATION
    // ============================================

    /**
     * Pobiera URL instalatora Forge z oficjalnego API
     */
    getForgeInstallerUrl(mcVersion, forgeVersion) {
        // Format URL: https://maven.minecraftforge.net/net/minecraftforge/forge/{mcVersion}-{forgeVersion}/forge-{mcVersion}-{forgeVersion}-installer.jar
        return `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${forgeVersion}/forge-${mcVersion}-${forgeVersion}-installer.jar`;
    }

    /**
     * Sprawdza czy Forge jest zainstalowany
     */
    isForgeInstalled(gamePath, mcVersion, forgeVersion) {
        // Sprawdź różne możliwe formaty nazwy wersji Forge
        const possibleVersionIds = [
            `${mcVersion}-forge-${forgeVersion}`,
            `${mcVersion}-forge-${mcVersion}-${forgeVersion}`,
            `forge-${mcVersion}-${forgeVersion}`,
            `${mcVersion}-Forge_${forgeVersion}`
        ];

        for (const versionId of possibleVersionIds) {
            const versionJsonPath = path.join(gamePath, 'versions', versionId, `${versionId}.json`);
            if (fs.existsSync(versionJsonPath)) {
                console.log(`Forge found at: ${versionJsonPath}`);
                return true;
            }
        }
        return false;
    }

    /**
     * Pobiera installer Forge (nie uruchamia go - minecraft-launcher-core to zrobi)
     */
    async downloadForgeInstaller(gamePath, mcVersion, forgeVersion) {
        const forgeDir = path.join(gamePath, 'forge');
        this.ensureDir(forgeDir);

        const installerPath = path.join(forgeDir, `forge-${mcVersion}-${forgeVersion}-installer.jar`);

        // Pobierz installer jeśli nie istnieje
        if (!fs.existsSync(installerPath)) {
            const installerUrl = this.getForgeInstallerUrl(mcVersion, forgeVersion);

            this.sendToRenderer('game-status', { status: `Pobieranie Forge ${forgeVersion}...` });
            this.sendToRenderer('download-progress', {
                type: 'forge-installer',
                name: `forge-${mcVersion}-${forgeVersion}-installer.jar`,
                current: 0,
                total: 1,
                status: 'downloading'
            });

            console.log(`Downloading Forge installer from: ${installerUrl}`);

            try {
                await this.downloadFile(installerUrl, installerPath, (downloaded, total) => {
                    const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
                    this.sendToRenderer('download-progress', {
                        type: 'forge-installer',
                        name: `forge-${mcVersion}-${forgeVersion}-installer.jar`,
                        current: 1,
                        total: 1,
                        status: 'downloading',
                        bytes: downloaded,
                        totalBytes: total,
                        percent
                    });
                });
                console.log(`Forge installer downloaded to: ${installerPath}`);
            } catch (error) {
                console.error('Failed to download Forge installer:', error);
                // Usuń uszkodzony plik jeśli istnieje
                if (fs.existsSync(installerPath)) {
                    fs.unlinkSync(installerPath);
                }
                throw new Error(`Nie udało się pobrać Forge: ${error.message}`);
            }
        } else {
            console.log(`Forge installer already exists at: ${installerPath}`);
        }

        return installerPath;
    }

    // ============================================
    // POBIERANIE PLIKÓW
    // ============================================

    /**
     * Pobiera pełny URL (dodaje bazowy URL jeśli to URL względny)
     */
    getFullUrl(url) {
        if (!url) return null;
        // Jeśli URL jest względny (zaczyna się od /), dodaj bazowy URL
        if (url.startsWith('/')) {
            const baseUrl = this.store.get('apiUrl') || 'https://mc.xsus.pl';
            return `${baseUrl}${url}`;
        }
        return url;
    }

    /**
     * Pobiera plik z URL z obsługą retry i exponential backoff
     */
    downloadFile(url, destPath, onProgress, maxRetries = 5) {
        return new Promise((resolve, reject) => {
            this.ensureDir(path.dirname(destPath));

            const fullUrl = this.getFullUrl(url);
            if (!fullUrl) {
                reject(new Error('Invalid URL'));
                return;
            }

            const attemptDownload = (attempt) => {
                const protocol = fullUrl.startsWith('https') ? https : http;

                // Usuń plik jeśli istnieje (może być częściowo pobrany)
                if (fs.existsSync(destPath)) {
                    try { fs.unlinkSync(destPath); } catch (e) {}
                }

                const file = fs.createWriteStream(destPath);
                let downloadedBytes = 0;
                let lastProgressTime = Date.now();

                const cleanup = () => {
                    try {
                        file.close();
                        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
                    } catch (e) {}
                };

                const retryOrFail = (error) => {
                    cleanup();
                    if (attempt < maxRetries) {
                        const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // Exponential backoff, max 10s
                        console.log(`[RETRY ${attempt + 1}/${maxRetries}] ${path.basename(destPath)} - ${error.message}, waiting ${delay}ms`);
                        setTimeout(() => attemptDownload(attempt + 1), delay);
                    } else {
                        reject(new Error(`Failed after ${maxRetries} attempts: ${error.message}`));
                    }
                };

                const request = protocol.get(fullUrl, (response) => {
                    // Obsługa przekierowań
                    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                        cleanup();
                        return this.downloadFile(response.headers.location, destPath, onProgress, maxRetries - attempt)
                            .then(resolve)
                            .catch(reject);
                    }

                    if (response.statusCode !== 200) {
                        retryOrFail(new Error(`HTTP ${response.statusCode}`));
                        return;
                    }

                    const totalSize = parseInt(response.headers['content-length'] || '0', 10);

                    response.on('data', (chunk) => {
                        downloadedBytes += chunk.length;
                        lastProgressTime = Date.now();
                        if (onProgress && totalSize > 0) {
                            onProgress(downloadedBytes, totalSize);
                        }
                    });

                    response.pipe(file);

                    file.on('finish', () => {
                        file.close(() => {
                            // Sprawdź czy plik ma sensowny rozmiar
                            try {
                                const stat = fs.statSync(destPath);
                                if (totalSize > 0 && stat.size < totalSize * 0.99) {
                                    retryOrFail(new Error(`Incomplete download: ${stat.size}/${totalSize} bytes`));
                                } else {
                                    resolve(destPath);
                                }
                            } catch (e) {
                                resolve(destPath);
                            }
                        });
                    });

                    file.on('error', (err) => retryOrFail(err));
                    response.on('error', (err) => retryOrFail(err));
                });

                request.on('error', (err) => retryOrFail(err));

                // Timeout - 2 minuty dla całego pobierania
                const timeout = 120000;
                request.setTimeout(timeout, () => {
                    request.destroy();
                    retryOrFail(new Error('Download timeout'));
                });

                // Sprawdź czy pobieranie się nie zawiesiło (brak danych przez 30s)
                const stallCheck = setInterval(() => {
                    if (Date.now() - lastProgressTime > 30000 && downloadedBytes > 0) {
                        clearInterval(stallCheck);
                        request.destroy();
                        retryOrFail(new Error('Download stalled'));
                    }
                }, 5000);

                request.on('close', () => clearInterval(stallCheck));
            };

            attemptDownload(0);
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
     * Sprawdza czy plik wymaga pobrania (nie istnieje lub zły hash)
     */
    async checkFileNeedsDownload(file, destPath) {
        if (!fs.existsSync(destPath)) {
            return { needsDownload: true, reason: 'missing' };
        }

        try {
            const existingHash = await this.calculateFileHash(destPath);
            if (existingHash === file.sha256) {
                return { needsDownload: false, reason: 'cached' };
            }
            return { needsDownload: true, reason: 'hash_mismatch' };
        } catch (error) {
            return { needsDownload: true, reason: 'hash_error' };
        }
    }

    /**
     * Pobiera pojedynczy plik z weryfikacją (ze wsparciem wznawiania)
     */
    async downloadAndVerifyFile(file, destPath, onProgress) {
        // Użyj wznawiania pobierania dla lepszego UX
        await this.downloadFileWithResume(file.url, destPath, onProgress);

        // Weryfikuj hash po pobraniu
        if (file.sha256) {
            const downloadedHash = await this.calculateFileHash(destPath);
            if (downloadedHash !== file.sha256) {
                fs.unlinkSync(destPath);
                throw new Error('Hash verification failed');
            }
        }

        return true;
    }

    /**
     * Synchronizuje pliki z serwerem - RÓWNOLEGŁE POBIERANIE z optymalizacjami
     */
    async syncFiles(files, gamePath) {
        // Użyj dynamicznej liczby pobrań (auto-tuned)
        const CONCURRENT_DOWNLOADS = this.concurrentDownloads || 5;
        const CONCURRENT_VERIFICATIONS = 10; // Liczba równoległych weryfikacji (optymalizacja)
        const MAX_RETRIES_PER_FILE = 3;

        const results = {
            downloaded: [],
            skipped: [],
            errors: [],
            totalFiles: files.length
        };

        console.log(`\n========================================`);
        console.log(`Starting sync of ${files.length} files`);
        console.log(`Concurrent downloads: ${CONCURRENT_DOWNLOADS}`);
        console.log(`Concurrent verifications: ${CONCURRENT_VERIFICATIONS}`);
        console.log(`========================================\n`);

        // FAZA 1: Sprawdź które pliki wymagają pobrania - RÓWNOLEGLE
        this.sendToRenderer('game-status', { status: 'Sprawdzanie plików...' });

        const filesToDownload = [];
        let checkedCount = 0;

        // Przygotuj wszystkie pliki z ich ścieżkami
        const fileChecks = files.map(file => {
            const relativePath = file.path || `mods/${file.filename}`;
            const destPath = path.join(gamePath, relativePath);
            const fileName = file.filename || path.basename(destPath);
            this.ensureDir(path.dirname(destPath));
            return { file, destPath, fileName, relativePath };
        });

        // Weryfikuj pliki równolegle (w grupach)
        for (let i = 0; i < fileChecks.length; i += CONCURRENT_VERIFICATIONS) {
            const batch = fileChecks.slice(i, i + CONCURRENT_VERIFICATIONS);

            const batchResults = await Promise.all(
                batch.map(async ({ file, destPath, fileName, relativePath }) => {
                    const check = await this.checkFileNeedsDownload(file, destPath);
                    return { file, destPath, fileName, relativePath, needsDownload: check.needsDownload };
                })
            );

            for (const result of batchResults) {
                checkedCount++;
                if (result.needsDownload) {
                    filesToDownload.push({
                        ...result.file,
                        destPath: result.destPath,
                        fileName: result.fileName,
                        relativePath: result.relativePath
                    });
                } else {
                    results.skipped.push(result.fileName);
                }
            }

            // Aktualizuj postęp sprawdzania (throttled)
            this.sendThrottledProgress('game-status', {
                status: `Sprawdzanie plików... (${checkedCount}/${files.length})`
            });
        }

        console.log(`\nFiles to download: ${filesToDownload.length}`);
        console.log(`Files already cached: ${results.skipped.length}\n`);

        if (filesToDownload.length === 0) {
            this.sendToRenderer('game-status', {
                status: `Wszystkie pliki są aktualne (${results.skipped.length} z cache)`
            });
            return results;
        }

        // FAZA 2: Pobierz pliki równolegle
        this.sendToRenderer('game-status', {
            status: `Pobieranie ${filesToDownload.length} plików...`
        });

        let downloadedCount = 0;
        let activeDownloads = 0;
        let currentIndex = 0;
        const failedFiles = [];

        const downloadNext = async () => {
            while (currentIndex < filesToDownload.length && activeDownloads < CONCURRENT_DOWNLOADS) {
                const fileIndex = currentIndex++;
                const file = filesToDownload[fileIndex];
                activeDownloads++;

                (async () => {
                    let success = false;
                    let lastError = null;

                    for (let retry = 0; retry < MAX_RETRIES_PER_FILE && !success; retry++) {
                        try {
                            this.sendThrottledProgress('download-progress', {
                                type: 'file',
                                name: file.fileName,
                                current: downloadedCount + 1,
                                total: filesToDownload.length,
                                status: 'downloading',
                                retry: retry > 0 ? retry : undefined
                            });

                            await this.downloadAndVerifyFile(file, file.destPath, (bytes, total) => {
                                // Używamy throttled progress dla mniejszego obciążenia CPU
                                this.sendThrottledProgress('download-progress', {
                                    type: 'file',
                                    name: file.fileName,
                                    current: downloadedCount + 1,
                                    total: filesToDownload.length,
                                    status: 'downloading',
                                    bytes,
                                    totalBytes: total,
                                    percent: Math.round(((downloadedCount + (bytes / total)) / filesToDownload.length) * 100)
                                });
                            });

                            success = true;
                            downloadedCount++;
                            results.downloaded.push(file.fileName);
                            console.log(`[OK] ${file.fileName} (${downloadedCount}/${filesToDownload.length})`);

                        } catch (error) {
                            lastError = error;
                            console.log(`[FAIL] ${file.fileName} attempt ${retry + 1}: ${error.message}`);

                            if (retry < MAX_RETRIES_PER_FILE - 1) {
                                await new Promise(r => setTimeout(r, 1000 * (retry + 1)));
                            }
                        }
                    }

                    if (!success) {
                        results.errors.push({ filename: file.fileName, error: lastError?.message || 'Unknown error' });
                        failedFiles.push(file);
                        console.error(`[FAILED] ${file.fileName} after ${MAX_RETRIES_PER_FILE} attempts`);
                    }

                    activeDownloads--;

                    // Aktualizuj status
                    const totalProgress = downloadedCount + results.errors.length;
                    this.sendToRenderer('game-status', {
                        status: `Pobieranie... (${totalProgress}/${filesToDownload.length})${results.errors.length > 0 ? ` - ${results.errors.length} błędów` : ''}`
                    });

                    // Kontynuuj pobieranie następnych
                    downloadNext();
                })();
            }
        };

        // Rozpocznij pobieranie
        await new Promise((resolve) => {
            const checkComplete = setInterval(() => {
                const totalProcessed = downloadedCount + results.errors.length;
                if (totalProcessed >= filesToDownload.length && activeDownloads === 0) {
                    clearInterval(checkComplete);
                    resolve();
                }
            }, 100);

            downloadNext();
        });

        // FAZA 3: Podsumowanie
        console.log(`\n========================================`);
        console.log(`Sync complete:`);
        console.log(`  Downloaded: ${results.downloaded.length}`);
        console.log(`  Cached: ${results.skipped.length}`);
        console.log(`  Errors: ${results.errors.length}`);
        console.log(`========================================\n`);

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
        this.gameLogs = []; // Reset logów
        this.gameStartTime = Date.now();

        // Przechowaj config dla crash reportera
        this.currentGameConfig = config;

        // Discord Rich Presence - ustaw status uruchamiania
        if (discordRPC) {
            discordRPC.setUsername(config.username);
            discordRPC.setServerName(config.serverName || 'XsusServer');
            discordRPC.setLaunching();
        }

        try {
            const gamePath = this.getGamePath();
            this.ensureDir(gamePath);

            // Auto-tune downloads na podstawie prędkości sieci
            this.sendToRenderer('game-status', { status: 'Optymalizacja połączenia...' });
            await this.testNetworkSpeed();

            // Auto-konfiguracja RAM
            this.sendToRenderer('game-status', { status: 'Konfiguracja pamięci...' });
            await this.autoConfigureRam();

            // Sprawdź Java
            this.sendToRenderer('game-status', { status: 'Wykrywanie Java...' });

            let javaPath = this.store.get('javaPath');
            if (!javaPath) {
                // Najpierw sprawdź czy mamy zainstalowaną przez launcher
                const installedJava = this.getInstalledJavaPath();
                if (installedJava) {
                    const javaInfo = await this.getJavaVersion(installedJava);
                    if (javaInfo) {
                        javaPath = installedJava;
                        console.log(`Using launcher-installed Java ${javaInfo.version}`);
                    }
                }

                // Jeśli nie, szukaj w systemie
                if (!javaPath) {
                    const bestJava = await this.getBestJavaForVersion(config.gameVersion);
                    if (bestJava) {
                        javaPath = bestJava.path;
                        console.log(`Using Java ${bestJava.version} from ${javaPath}`);
                    }
                }

                // Jeśli nadal brak - auto-instaluj
                if (!javaPath) {
                    console.log('No Java found, auto-installing...');

                    // Określ wymaganą wersję Java na podstawie wersji MC
                    const [major, minor] = config.gameVersion.split('.').map(Number);
                    let requiredJava = 17;
                    if (major >= 1 && minor >= 20 && config.gameVersion.includes('.5')) {
                        requiredJava = 21;
                    } else if (major >= 1 && minor >= 18) {
                        requiredJava = 17;
                    }

                    try {
                        javaPath = await this.autoInstallJava(requiredJava);
                    } catch (installError) {
                        throw new Error(`Nie znaleziono Java i nie udało się jej zainstalować: ${installError.message}`);
                    }
                }
            }

            // Weryfikuj ścieżkę Java
            if (!fs.existsSync(javaPath)) {
                throw new Error(`Nie znaleziono Java w: ${javaPath}`);
            }

            // Przygotowanie Forge jeśli potrzebne
            let forgeInstallerPath = null;
            if (config.loaderType === 'forge' && config.forgeVersion) {
                this.sendToRenderer('game-status', { status: 'Przygotowanie Forge...' });

                try {
                    // Pobierz installer Forge (minecraft-launcher-core go zainstaluje)
                    forgeInstallerPath = await this.downloadForgeInstaller(
                        gamePath,
                        config.gameVersion,
                        config.forgeVersion
                    );
                    console.log(`Forge installer ready at: ${forgeInstallerPath}`);
                } catch (error) {
                    console.error('Forge preparation failed:', error);
                    throw new Error(`Nie udało się przygotować Forge: ${error.message}`);
                }
            }

            // Synchronizuj pliki (preferuj config.files, fallback do config.mods)
            this.sendToRenderer('game-status', { status: 'Synchronizacja plików...' });

            const filesToSync = config.files || config.mods || [];
            if (filesToSync.length > 0) {
                console.log(`Syncing ${filesToSync.length} files...`);

                const syncResult = await this.syncFiles(filesToSync, gamePath);
                console.log('Files sync result:', {
                    downloaded: syncResult.downloaded.length,
                    skipped: syncResult.skipped.length,
                    errors: syncResult.errors.length
                });

                // Jeśli są błędy, zatrzymaj uruchamianie
                if (syncResult.errors.length > 0) {
                    const errorFiles = syncResult.errors.map(e => e.filename).join(', ');
                    console.error('Failed to download files:', syncResult.errors);

                    // Jeśli więcej niż 10% plików nie powiodło się, zatrzymaj
                    const errorRate = syncResult.errors.length / filesToSync.length;
                    if (errorRate > 0.1 || syncResult.errors.length >= 5) {
                        throw new Error(`Nie udało się pobrać ${syncResult.errors.length} plików: ${errorFiles.substring(0, 100)}...`);
                    } else {
                        // Wyświetl ostrzeżenie ale kontynuuj
                        this.sendToRenderer('game-status', {
                            status: `Uwaga: ${syncResult.errors.length} plik(ów) nie zostało pobranych`,
                            warning: true
                        });
                        console.warn(`Continuing despite ${syncResult.errors.length} download errors`);
                    }
                }

                // Wyświetl podsumowanie
                this.sendToRenderer('game-status', {
                    status: `Synchronizacja zakończona: ${syncResult.downloaded.length} pobranych, ${syncResult.skipped.length} z cache`
                });
            } else {
                console.log('No files to sync');
            }

            // Zapisz konfigurację serwera dla moda XsusMenu
            // Mod czyta ten plik by wyświetlić przycisk "Połącz z [server]" w menu
            this.sendToRenderer('game-status', { status: 'Zapisywanie konfiguracji serwera...' });
            try {
                const serverConfigPath = path.join(gamePath, 'xsus_server.json');
                const serverConfig = {
                    serverIp: config.serverIp || 'localhost',
                    serverPort: config.serverPort || 25565,
                    serverName: config.serverName || 'XsusServer',
                    lastUpdated: new Date().toISOString()
                };
                fs.writeFileSync(serverConfigPath, JSON.stringify(serverConfig, null, 2));
                console.log('Server config written to:', serverConfigPath);
            } catch (error) {
                console.warn('Failed to write server config:', error);
            }

            // Przygotuj opcje uruchomienia
            const ramSettings = this.store.get('ram') || { min: 2, max: 4 };
            const resolution = this.store.get('resolution') || { width: 1280, height: 720, fullscreen: false };
            const customJavaArgs = this.store.get('customJavaArgs') || '';

            this.sendToRenderer('game-status', { status: 'Uruchamianie Minecraft...' });

            // Użyj minecraft-launcher-core jeśli dostępny
            if (Client) {
                const launcher = new Client();

                // Przygotuj opcje uruchomienia
                const launchOpts = {
                    // Ścieżka gry
                    root: gamePath,

                    // Wersja - dla Forge minecraft-launcher-core potrzebuje bazowej wersji MC
                    version: {
                        number: config.gameVersion,
                        type: 'release'
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

                    // Automatyczne połączenie z serwerem (dla MC 1.20+)
                    quickPlay: config.serverIp ? {
                        type: 'multiplayer',
                        identifier: `${config.serverIp}:${config.serverPort || 25565}`
                    } : undefined,

                    // Dodatkowe argumenty
                    customArgs: customJavaArgs ? customJavaArgs.split(' ').filter(a => a) : [],

                    // Forge - przekaż ścieżkę do instalatora JAR
                    // minecraft-launcher-core automatycznie pobierze MC i zainstaluje Forge
                    forge: forgeInstallerPath || undefined,

                    // Overrides dla modów - wskaż folder mods
                    overrides: {
                        gameDirectory: gamePath
                    }
                };

                // Dla Fabric
                if (config.loaderType === 'fabric' && config.fabricVersion) {
                    launchOpts.version.custom = `fabric-loader-${config.fabricVersion}-${config.gameVersion}`;
                }

                console.log('Launch options:', JSON.stringify({
                    ...launchOpts,
                    authorization: '***hidden***'
                }, null, 2));

                // Listener dla postępu
                launcher.on('debug', (e) => {
                    console.log('[MC Debug]', e);
                });

                launcher.on('data', (e) => {
                    console.log('[MC Data]', e);
                    this.addGameLog(e); // Zbieraj logi dla crash reportera
                    this.sendToRenderer('game-output', e);
                });

                launcher.on('progress', (e) => {
                    console.log('[MC Progress]', e.type, e.task, `${e.current}/${e.total}`);

                    // Mapuj typy postępu na komunikaty
                    let statusMessage = 'Pobieranie...';
                    if (e.type === 'assets') {
                        statusMessage = `Pobieranie zasobów... (${e.current}/${e.total})`;
                    } else if (e.type === 'natives') {
                        statusMessage = `Pobieranie bibliotek natywnych... (${e.current}/${e.total})`;
                    } else if (e.type === 'classes') {
                        statusMessage = `Pobieranie klas Minecraft... (${e.current}/${e.total})`;
                    } else if (e.type === 'forge') {
                        statusMessage = `Instalowanie Forge... (${e.current}/${e.total})`;
                    }

                    this.sendToRenderer('game-status', { status: statusMessage });
                    this.sendToRenderer('download-progress', {
                        type: e.type,
                        task: e.task,
                        current: e.current,
                        total: e.total,
                        percent: e.total > 0 ? Math.round((e.current / e.total) * 100) : 0
                    });
                });

                launcher.on('download', (e) => {
                    console.log('[MC Download]', e);
                });

                launcher.on('download-status', (e) => {
                    console.log('[MC Download Status]', e);
                    if (e.name) {
                        this.sendToRenderer('game-status', { status: `Pobieranie: ${e.name}` });
                    }
                });

                // Uruchom
                this.gameProcess = await launcher.launch(launchOpts);

                if (this.gameProcess) {
                    // Discord Rich Presence - gra uruchomiona
                    if (discordRPC) {
                        discordRPC.setPlaying();
                    }

                    // Zbieraj logi z stdout/stderr
                    if (this.gameProcess.stdout) {
                        this.gameProcess.stdout.on('data', (data) => {
                            const line = data.toString();
                            this.addGameLog(line);
                        });
                    }
                    if (this.gameProcess.stderr) {
                        this.gameProcess.stderr.on('data', (data) => {
                            const line = data.toString();
                            this.addGameLog(line);
                        });
                    }

                    this.gameProcess.on('close', async (code) => {
                        console.log(`Game process closed with code: ${code}`);

                        // Discord Rich Presence - gra zamknięta
                        if (discordRPC) {
                            discordRPC.setIdle();
                        }

                        // Sprawdź czy to crash
                        const crashResult = await this.handleGameClose(code, this.currentGameConfig);

                        if (crashResult.crashed) {
                            console.log('Game crashed, report saved');
                        }

                        this.sendToRenderer('game-close', {
                            code,
                            crashed: crashResult.crashed,
                            crashReport: crashResult.reportPath
                        });

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

        // Auto-instalacja Java
        ipcMain.handle('auto-install-java', async (event, version = 17) => {
            try {
                const javaPath = await this.autoInstallJava(version);
                return { success: true, javaPath };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // Sprawdź zainstalowaną przez launcher Javę
        ipcMain.handle('get-installed-java', async () => {
            const javaPath = this.getInstalledJavaPath();
            if (javaPath) {
                const info = await this.getJavaVersion(javaPath);
                return { installed: true, path: javaPath, info };
            }
            return { installed: false };
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

        // ============================================
        // NOWE HANDLERY - Optymalizacje
        // ============================================

        // Test prędkości sieci
        ipcMain.handle('test-network-speed', async () => {
            const speed = await this.testNetworkSpeed();
            return {
                speedMbps: speed,
                concurrentDownloads: this.concurrentDownloads
            };
        });

        // Pobierz optymalne ustawienia RAM
        ipcMain.handle('get-optimal-ram', async () => {
            return this.getOptimalRamSettings();
        });

        // Auto-konfiguracja RAM
        ipcMain.handle('auto-configure-ram', async () => {
            return this.autoConfigureRam();
        });

        // Pobierz informacje o systemie
        ipcMain.handle('get-system-info', async () => {
            return {
                platform: process.platform,
                arch: process.arch,
                totalMemory: os.totalmem(),
                freeMemory: os.freemem(),
                cpus: os.cpus().length,
                osRelease: os.release(),
                hostname: os.hostname()
            };
        });

        // Pobierz ostatnie raporty o crashach
        ipcMain.handle('get-crash-reports', async () => {
            const gamePath = this.getGamePath();
            const crashDir = path.join(gamePath, 'crash-reports', 'launcher');

            if (!fs.existsSync(crashDir)) {
                return [];
            }

            try {
                const files = fs.readdirSync(crashDir)
                    .filter(f => f.endsWith('.json'))
                    .sort()
                    .reverse()
                    .slice(0, 10); // Ostatnie 10

                return files.map(filename => {
                    const filepath = path.join(crashDir, filename);
                    try {
                        const content = fs.readFileSync(filepath, 'utf8');
                        const report = JSON.parse(content);
                        return {
                            filename,
                            filepath,
                            timestamp: report.timestamp,
                            crashType: report.crash?.type,
                            gameVersion: report.game?.version
                        };
                    } catch (e) {
                        return { filename, filepath, error: 'Failed to parse' };
                    }
                });
            } catch (e) {
                return [];
            }
        });

        // Odczytaj konkretny raport o crashu
        ipcMain.handle('read-crash-report', async (event, filepath) => {
            try {
                const content = fs.readFileSync(filepath, 'utf8');
                return JSON.parse(content);
            } catch (e) {
                return null;
            }
        });

        // Otwórz folder z crash reportami
        ipcMain.handle('open-crash-reports-folder', async () => {
            const gamePath = this.getGamePath();
            const crashDir = path.join(gamePath, 'crash-reports', 'launcher');
            this.ensureDir(crashDir);

            const { shell } = require('electron');
            shell.openPath(crashDir);
            return crashDir;
        });
    }
}

module.exports = GameManager;
