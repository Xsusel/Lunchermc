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

        // Throttling dla progress events (optymalizacja dla słabszych PC)
        this.lastProgressUpdate = 0;
        this.progressThrottleMs = 100; // Minimum 100ms między aktualizacjami
        this.pendingProgress = null;

        // Cache dla wykrywania Java
        this.javaCacheTime = 0;
        this.javaCacheDuration = 5 * 60 * 1000; // 5 minut cache
        this.cachedJavaInstallations = null;
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
     * Pobiera pojedynczy plik z weryfikacją
     */
    async downloadAndVerifyFile(file, destPath, onProgress) {
        await this.downloadFile(file.url, destPath, onProgress);

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
        const CONCURRENT_DOWNLOADS = 5; // Liczba równoległych pobrań
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
