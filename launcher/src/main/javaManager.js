/**
 * XsusLauncher - Java Manager
 * Obsługuje wykrywanie, weryfikację i automatyczną instalację Java
 *
 * Features:
 * - Wykrywanie zainstalowanych wersji Java (JAVA_HOME, PATH, typowe lokalizacje)
 * - Automatyczne pobieranie i instalacja Adoptium/Temurin JRE
 * - Obsługa Windows, macOS i Linux
 * - Cache wykrytych instalacji Java
 * - Wybór najlepszej wersji Java dla danej wersji Minecraft
 */
const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { exec } = require('child_process');
const os = require('os');

let extractZip;
try {
    extractZip = require('extract-zip');
} catch (e) {
    console.warn('extract-zip not available');
    extractZip = null;
}

class JavaManager {
    constructor(store, mainWindow) {
        this.store = store;
        this.mainWindow = mainWindow;

        // Cache dla wykrywania Java
        this.javaCacheTime = 0;
        this.javaCacheDuration = 5 * 60 * 1000; // 5 minut cache
        this.cachedJavaInstallations = null;

        // Java auto-installer
        this.isInstallingJava = false;

        // Ścieżka do danych gry
        this._gamePath = null;
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
     * Pobiera ścieżkę do gry
     */
    getGamePath() {
        if (this._gamePath) return this._gamePath;
        const customPath = this.store.get('gamePath');
        if (customPath) return customPath;
        const appData = process.env.APPDATA ||
            (process.platform === 'darwin'
                ? path.join(process.env.HOME, 'Library', 'Application Support')
                : path.join(process.env.HOME, '.local', 'share'));
        return path.join(appData, '.xsuslauncher');
    }

    /**
     * Ustawia ścieżkę gry (z gameManager)
     */
    setGamePath(gamePath) {
        this._gamePath = gamePath;
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
     * Sprawdza możliwe lokalizacje Java w systemie
     * Obsługuje Windows (Program Files/Java, Adoptium, Zulu, itp.), macOS i Linux
     */
    getPossibleJavaPaths() {
        const paths = [];

        if (process.platform === 'win32') {
            // Windows - sprawdź wszystkie typowe lokalizacje
            const programFiles = [
                process.env['ProgramFiles'],
                process.env['ProgramFiles(x86)'],
                process.env['LOCALAPPDATA']
            ].filter(Boolean);

            for (const base of programFiles) {
                // Oracle Java
                paths.push(path.join(base, 'Java'));
                // Eclipse Adoptium / Temurin
                paths.push(path.join(base, 'Eclipse Adoptium'));
                paths.push(path.join(base, 'Eclipse Foundation'));
                // Zulu
                paths.push(path.join(base, 'Zulu'));
                // Microsoft OpenJDK
                paths.push(path.join(base, 'Microsoft', 'jdk-17'));
                paths.push(path.join(base, 'Microsoft', 'jdk-21'));
                // Amazon Corretto
                paths.push(path.join(base, 'Amazon Corretto'));
                // BellSoft Liberica
                paths.push(path.join(base, 'BellSoft'));
            }

            // Minecraft bundled Java
            const appData = process.env.APPDATA || '';
            const minecraftPath = path.join(appData, '.minecraft', 'runtime');
            if (fs.existsSync(minecraftPath)) {
                paths.push(minecraftPath);
            }

            // Scoop installations
            const userProfile = process.env.USERPROFILE || '';
            if (userProfile) {
                paths.push(path.join(userProfile, 'scoop', 'apps', 'temurin17-jdk'));
                paths.push(path.join(userProfile, 'scoop', 'apps', 'temurin21-jdk'));
                paths.push(path.join(userProfile, 'scoop', 'apps', 'openjdk17'));
                paths.push(path.join(userProfile, 'scoop', 'apps', 'openjdk21'));
            }

            // Chocolatey installations
            const chocoPath = 'C:\\ProgramData\\chocolatey\\lib';
            if (fs.existsSync(chocoPath)) {
                paths.push(chocoPath);
            }
        } else if (process.platform === 'darwin') {
            // macOS
            paths.push('/Library/Java/JavaVirtualMachines');
            paths.push('/System/Library/Java/JavaVirtualMachines');
            paths.push(path.join(process.env.HOME || '', 'Library/Java/JavaVirtualMachines'));
            // Homebrew
            paths.push('/opt/homebrew/opt/openjdk@17');
            paths.push('/opt/homebrew/opt/openjdk@21');
            paths.push('/usr/local/opt/openjdk@17');
            paths.push('/usr/local/opt/openjdk@21');
        } else {
            // Linux
            paths.push('/usr/lib/jvm');
            paths.push('/usr/java');
            paths.push('/opt/java');
            paths.push('/usr/local/java');
            // SDKMAN
            const sdkmanPath = path.join(process.env.HOME || '', '.sdkman', 'candidates', 'java');
            if (fs.existsSync(sdkmanPath)) {
                paths.push(sdkmanPath);
            }
        }

        // Launcher zainstalowana Java
        const launcherJavaPath = this.getJavaInstallPath();
        if (fs.existsSync(launcherJavaPath)) {
            paths.push(launcherJavaPath);
        }

        return paths;
    }

    /**
     * Szuka Java w podanym katalogu (rekurencyjnie, max 2 poziomy)
     */
    findJavaInDirectory(dir, depth = 0) {
        if (!fs.existsSync(dir) || depth > 2) return [];

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

                    // Rekurencyjnie dla podkatalogów
                    if (depth < 2) {
                        results.push(...this.findJavaInDirectory(fullPath, depth + 1));
                    }
                }
            }
        } catch (e) {
            // Ignoruj błędy dostępu do katalogów
        }

        return results;
    }

    /**
     * Pobiera wersję Java z danej ścieżki
     */
    async getJavaVersion(javaPath) {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve(null);
            }, 10000); // 10s timeout

            exec(`"${javaPath}" -version`, (error, stdout, stderr) => {
                clearTimeout(timeout);
                // Java wypisuje wersję na stderr
                const output = stderr || stdout || '';
                const match = output.match(/version "(\d+)(?:\.(\d+))?(?:\.(\d+))?/);

                if (match) {
                    const major = parseInt(match[1]);
                    const minor = parseInt(match[2] || 0);
                    const patch = parseInt(match[3] || 0);

                    // Java 1.8 vs Java 17+
                    const version = major === 1 ? minor : major;

                    // Wykryj dostawcę JDK
                    let vendor = 'Unknown';
                    if (output.includes('Temurin') || output.includes('Adoptium')) vendor = 'Eclipse Temurin';
                    else if (output.includes('AdoptOpenJDK')) vendor = 'AdoptOpenJDK';
                    else if (output.includes('Corretto')) vendor = 'Amazon Corretto';
                    else if (output.includes('Zulu')) vendor = 'Azul Zulu';
                    else if (output.includes('GraalVM')) vendor = 'GraalVM';
                    else if (output.includes('OpenJDK')) vendor = 'OpenJDK';
                    else if (output.includes('Java(TM)')) vendor = 'Oracle';

                    resolve({
                        path: javaPath,
                        version,
                        versionString: `${major}.${minor}.${patch}`,
                        fullOutput: output.trim(),
                        vendor
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

        // 1. Sprawdź ścieżkę z ustawień użytkownika
        const userJavaPath = this.store.get('javaPath');
        if (userJavaPath && fs.existsSync(userJavaPath) && !checkedPaths.has(userJavaPath)) {
            const result = await this.getJavaVersion(userJavaPath);
            if (result) {
                javaInstallations.push({ ...result, source: 'settings' });
                checkedPaths.add(result.path);
            }
        }

        // 2. Sprawdź launcher zainstalowaną Java
        const installedJava = this.getInstalledJavaPath();
        if (installedJava && !checkedPaths.has(installedJava)) {
            const result = await this.getJavaVersion(installedJava);
            if (result) {
                javaInstallations.push({ ...result, source: 'launcher-installed' });
                checkedPaths.add(result.path);
            }
        }

        // 3. Sprawdź JAVA_HOME
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

        // 4. Sprawdź PATH
        const pathJava = process.platform === 'win32' ? 'javaw' : 'java';
        const pathResult = await this.getJavaVersion(pathJava);
        if (pathResult && !checkedPaths.has(pathResult.path)) {
            javaInstallations.push({ ...pathResult, source: 'PATH' });
            checkedPaths.add(pathResult.path);
        }

        // 5. Szukaj w znanych lokalizacjach
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

        console.log(`Found ${javaInstallations.length} Java installation(s)`);
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

        const requiredJava = this.getRequiredJavaVersion(mcVersion);

        // Znajdź najnowszą kompatybilną wersję
        const compatible = installations.filter(j => j.version >= requiredJava);

        if (compatible.length > 0) {
            return compatible[0];
        }

        // Jeśli nie ma kompatybilnej, zwróć najnowszą dostępną
        return installations[0];
    }

    /**
     * Określa wymaganą wersję Java dla danej wersji Minecraft
     */
    getRequiredJavaVersion(mcVersion) {
        if (!mcVersion) return 17;

        const parts = mcVersion.split('.');
        const major = parseInt(parts[0]) || 1;
        const minor = parseInt(parts[1]) || 0;
        const patch = parseInt(parts[2]) || 0;

        // Minecraft 1.21+ wymaga Java 21
        if (major >= 1 && minor >= 21) {
            return 21;
        }
        // Minecraft 1.20.5+ wymaga Java 21
        if (major >= 1 && minor >= 20 && patch >= 5) {
            return 21;
        }
        // Minecraft 1.18+ wymaga Java 17
        if (major >= 1 && minor >= 18) {
            return 17;
        }
        // Minecraft 1.17+ wymaga Java 16
        if (major >= 1 && minor >= 17) {
            return 16;
        }
        // Starsze wersje - Java 8
        return 8;
    }

    // ============================================
    // AUTOMATYCZNA INSTALACJA JAVA (Adoptium/Temurin)
    // ============================================

    /**
     * Pobiera URL do pobrania Adoptium JDK dla danej platformy
     */
    getAdoptiumDownloadUrl(javaVersion = 17) {
        const platform = process.platform;
        const arch = process.arch === 'x64' ? 'x64' : (process.arch === 'arm64' ? 'aarch64' : 'x64');

        let os_name;
        if (platform === 'win32') {
            os_name = 'windows';
        } else if (platform === 'darwin') {
            os_name = 'mac';
        } else {
            os_name = 'linux';
        }

        // Adoptium API URL - pobierz JRE (mniejszy niż JDK)
        return `https://api.adoptium.net/v3/binary/latest/${javaVersion}/ga/${os_name}/${arch}/jre/hotspot/normal/eclipse?project=jdk`;
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
                    // Sprawdź standardową strukturę JDK/JRE
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
     * Pobiera plik z URL z obsługą przekierowań
     */
    downloadFile(url, destPath, onProgress) {
        return new Promise((resolve, reject) => {
            this.ensureDir(path.dirname(destPath));

            const makeRequest = (requestUrl) => {
                const protocol = requestUrl.startsWith('https') ? https : http;
                const file = fs.createWriteStream(destPath);
                let downloadedBytes = 0;

                const request = protocol.get(requestUrl, (response) => {
                    // Obsługa przekierowań
                    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                        file.close();
                        makeRequest(response.headers.location);
                        return;
                    }

                    if (response.statusCode !== 200) {
                        file.close();
                        reject(new Error(`HTTP ${response.statusCode}`));
                        return;
                    }

                    const totalSize = parseInt(response.headers['content-length'] || '0', 10);

                    response.on('data', (chunk) => {
                        downloadedBytes += chunk.length;
                        if (onProgress && totalSize > 0) {
                            onProgress(downloadedBytes, totalSize);
                        }
                    });

                    response.pipe(file);

                    file.on('finish', () => {
                        file.close(() => resolve(destPath));
                    });

                    file.on('error', (err) => {
                        file.close();
                        try { fs.unlinkSync(destPath); } catch (e) {}
                        reject(err);
                    });
                });

                request.on('error', (err) => {
                    file.close();
                    try { fs.unlinkSync(destPath); } catch (e) {}
                    reject(err);
                });

                request.setTimeout(300000, () => { // 5 min timeout
                    request.destroy();
                    reject(new Error('Download timeout'));
                });
            };

            makeRequest(url);
        });
    }

    /**
     * Automatycznie instaluje Java (Adoptium/Temurin) jeśli nie znaleziono
     * @param {number} requiredVersion - Wymagana wersja Java (np. 17, 21)
     * @param {Function} onProgress - Callback postępu (downloaded, total)
     * @returns {Promise<string>} Ścieżka do zainstalowanej Java
     */
    async autoInstallJava(requiredVersion = 17, onProgress = null) {
        if (this.isInstallingJava) {
            throw new Error('Java jest już instalowana');
        }

        this.isInstallingJava = true;
        const javaDir = this.getJavaInstallPath();
        this.ensureDir(javaDir);

        try {
            this.sendToRenderer('game-status', { status: `Pobieranie Java ${requiredVersion} (Adoptium Temurin)...` });
            console.log(`Auto-installing Java ${requiredVersion}...`);

            // Pobierz URL
            const downloadUrl = this.getAdoptiumDownloadUrl(requiredVersion);
            const ext = process.platform === 'win32' ? 'zip' : 'tar.gz';
            const archivePath = path.join(javaDir, `adoptium-${requiredVersion}.${ext}`);

            // Pobierz archiwum
            await this.downloadFile(downloadUrl, archivePath, (downloaded, total) => {
                const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
                this.sendToRenderer('download-progress', {
                    type: 'java-installer',
                    name: `Java ${requiredVersion} (Adoptium Temurin)`,
                    current: 1,
                    total: 1,
                    status: 'downloading',
                    bytes: downloaded,
                    totalBytes: total,
                    percent
                });
                if (onProgress) onProgress(downloaded, total);
            });

            // Rozpakuj archiwum
            this.sendToRenderer('game-status', { status: 'Instalowanie Java...' });
            console.log('Extracting Java archive...');

            if (ext === 'zip' && extractZip) {
                await extractZip(archivePath, { dir: javaDir });
            } else if (ext === 'zip') {
                // Fallback dla Windows bez extract-zip
                await new Promise((resolve, reject) => {
                    exec(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${javaDir}' -Force"`, (error) => {
                        if (error) reject(error);
                        else resolve();
                    });
                });
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

            // Ustaw uprawnienia na Linux/macOS
            if (process.platform !== 'win32') {
                try {
                    fs.chmodSync(installedPath, 0o755);
                } catch (e) {}
            }

            // Weryfikuj instalację
            const javaInfo = await this.getJavaVersion(installedPath);
            if (!javaInfo) {
                throw new Error('Zainstalowana Java nie działa poprawnie');
            }

            console.log(`Java ${javaInfo.version} (${javaInfo.vendor}) installed successfully at: ${installedPath}`);

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

    /**
     * Zapewnia dostępność odpowiedniej Java dla danej wersji MC
     * Szuka w: ustawienia -> zainstalowana przez launcher -> system -> auto-instalacja
     * @returns {Promise<string>} Ścieżka do Java
     */
    async ensureJava(mcVersion) {
        // 1. Sprawdź ścieżkę z ustawień
        let javaPath = this.store.get('javaPath');
        if (javaPath && fs.existsSync(javaPath)) {
            const javaInfo = await this.getJavaVersion(javaPath);
            if (javaInfo) {
                console.log(`Using user-configured Java ${javaInfo.version} from: ${javaPath}`);
                return javaPath;
            }
        }

        // 2. Sprawdź zainstalowaną przez launcher
        const installedJava = this.getInstalledJavaPath();
        if (installedJava) {
            const javaInfo = await this.getJavaVersion(installedJava);
            if (javaInfo) {
                javaPath = installedJava;
                console.log(`Using launcher-installed Java ${javaInfo.version}`);
                return javaPath;
            }
        }

        // 3. Szukaj w systemie
        const bestJava = await this.getBestJavaForVersion(mcVersion);
        if (bestJava) {
            javaPath = bestJava.path;
            this.store.set('javaPath', javaPath);
            console.log(`Using Java ${bestJava.version} from ${javaPath} (saved to store)`);
            return javaPath;
        }

        // 4. Auto-instaluj
        console.log('No Java found, auto-installing...');
        const requiredJava = this.getRequiredJavaVersion(mcVersion);

        javaPath = await this.autoInstallJava(requiredJava);
        this.store.set('javaPath', javaPath);
        console.log(`Java path saved to store: ${javaPath}`);
        return javaPath;
    }

    // ============================================
    // REJESTRACJA IPC
    // ============================================

    /**
     * Rejestruje handlery IPC dla Java managera
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

        // Wymagana wersja Java dla wersji MC
        ipcMain.handle('get-required-java-version', async (event, mcVersion) => {
            return this.getRequiredJavaVersion(mcVersion);
        });
    }
}

module.exports = JavaManager;
