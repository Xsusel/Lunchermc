/**
 * XsusLauncher - Crash Reporter
 * Przechwytuje awarie, logi gry i generuje raporty diagnostyczne
 */
const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

class CrashReporter {
    constructor(store, mainWindow) {
        this.store = store;
        this.mainWindow = mainWindow;
        this.gameProcess = null;
        this.gameLogs = [];
        this.gameStderrLogs = [];
        this.maxLogLines = 1000;
        this.maxCrashReports = 20;
        this.crashReportsDir = path.join(app.getPath('userData'), 'crash-reports');

        // Upewnij sie ze katalog istnieje
        this._ensureDir(this.crashReportsDir);
    }

    /**
     * Inicjalizuje crash reporter - przechwytuje globalne bledy
     */
    initialize() {
        // Przechwytuj unhandled exceptions
        process.on('uncaughtException', (error) => {
            console.error('[CrashReporter] Uncaught Exception:', error);
            this._saveCrashReport({
                type: 'uncaught_exception',
                error: {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                }
            });
        });

        // Przechwytuj unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            console.error('[CrashReporter] Unhandled Rejection:', reason);
            this._saveCrashReport({
                type: 'unhandled_rejection',
                error: {
                    message: reason instanceof Error ? reason.message : String(reason),
                    stack: reason instanceof Error ? reason.stack : undefined,
                    name: reason instanceof Error ? reason.name : 'UnhandledRejection'
                }
            });
        });

        // Rejestruj IPC handlery
        this._registerIPCHandlers();

        // Wyczysc stare raporty przy starcie
        this._cleanupOldReports();

        console.log('[CrashReporter] Initialized, reports dir:', this.crashReportsDir);
    }

    /**
     * Ustawia referencje do procesu gry - nasluchiuje stderr
     */
    attachGameProcess(gameProcess, gameConfig) {
        this.gameProcess = gameProcess;
        this.gameLogs = [];
        this.gameStderrLogs = [];
        this._currentGameConfig = gameConfig;

        if (!gameProcess) return;

        // Zbieraj stdout
        if (gameProcess.stdout) {
            gameProcess.stdout.on('data', (data) => {
                const lines = data.toString().split('\n').filter(l => l.trim());
                for (const line of lines) {
                    this._addLog('stdout', line);
                }
            });
        }

        // Zbieraj stderr (crash output)
        if (gameProcess.stderr) {
            gameProcess.stderr.on('data', (data) => {
                const lines = data.toString().split('\n').filter(l => l.trim());
                for (const line of lines) {
                    this._addLog('stderr', line);
                    this.gameStderrLogs.push({
                        time: new Date().toISOString(),
                        line: line
                    });
                }
            });
        }

        // Nasluchiuj zamkniecia procesu
        gameProcess.on('close', (exitCode) => {
            this._handleGameExit(exitCode);
        });

        gameProcess.on('error', (error) => {
            console.error('[CrashReporter] Game process error:', error);
            this._saveCrashReport({
                type: 'game_process_error',
                error: {
                    message: error.message,
                    stack: error.stack,
                    code: error.code
                },
                gameConfig: this._currentGameConfig,
                gameLogs: this.gameLogs.slice(-200),
                stderrLogs: this.gameStderrLogs.slice(-100)
            });
        });

        console.log('[CrashReporter] Attached to game process');
    }

    /**
     * Dodaje linie logu
     */
    _addLog(source, line) {
        this.gameLogs.push({
            time: new Date().toISOString(),
            source: source,
            line: line
        });

        // Ogranicz liczbe linii
        if (this.gameLogs.length > this.maxLogLines) {
            this.gameLogs.shift();
        }
    }

    /**
     * Obsluguje wyjscie procesu gry
     */
    _handleGameExit(exitCode) {
        // Wykryj crash na podstawie exit code i logow
        const crashDetected = this._detectCrash(exitCode);

        if (crashDetected.detected) {
            console.log('[CrashReporter] Game crash detected:', crashDetected);

            const reportPath = this._saveCrashReport({
                type: 'game_crash',
                exitCode: exitCode,
                crashDetection: crashDetected,
                gameConfig: this._currentGameConfig,
                gameLogs: this.gameLogs.slice(-200),
                stderrLogs: this.gameStderrLogs.slice(-100)
            });

            // Powiadom renderer
            this._sendToRenderer('game-crash', {
                crash: crashDetected,
                reportPath: reportPath,
                exitCode: exitCode
            });
        }

        this.gameProcess = null;
    }

    /**
     * Wykrywa crash na podstawie exit code i logow
     */
    _detectCrash(exitCode) {
        // Exit code != 0 sugeruje crash
        if (exitCode !== 0 && exitCode !== null) {
            return {
                detected: true,
                type: 'exit_code',
                code: exitCode,
                description: `Game exited with code ${exitCode}`
            };
        }

        // Sprawdz logi pod katem typowych bledow
        const crashPatterns = [
            { pattern: /Exception in thread/i, desc: 'Java Exception' },
            { pattern: /Error: Could not create the Java Virtual Machine/i, desc: 'JVM Creation Error' },
            { pattern: /OutOfMemoryError/i, desc: 'Out of Memory' },
            { pattern: /A fatal error has been detected/i, desc: 'Fatal JVM Error' },
            { pattern: /EXCEPTION_ACCESS_VIOLATION/i, desc: 'Access Violation' },
            { pattern: /Minecraft has crashed/i, desc: 'Minecraft Crash' },
            { pattern: /The game crashed whilst/i, desc: 'Game Crash' },
            { pattern: /java\.lang\.OutOfMemoryError/i, desc: 'Java OutOfMemoryError' },
            { pattern: /StackOverflowError/i, desc: 'Stack Overflow' },
            { pattern: /UnsatisfiedLinkError/i, desc: 'Native Library Error' }
        ];

        const allLogs = [...this.gameLogs.slice(-100), ...this.gameStderrLogs.slice(-50)];

        for (const log of allLogs) {
            for (const { pattern, desc } of crashPatterns) {
                if (pattern.test(log.line)) {
                    return {
                        detected: true,
                        type: 'log_pattern',
                        pattern: pattern.toString(),
                        description: desc,
                        matchedLine: log.line.substring(0, 500)
                    };
                }
            }
        }

        return { detected: false };
    }

    /**
     * Zapisuje raport o crashu do pliku
     * @returns {string} sciezka do pliku raportu
     */
    _saveCrashReport(crashData) {
        this._ensureDir(this.crashReportsDir);

        const timestamp = new Date();
        const filename = `crash-${timestamp.toISOString().replace(/[:.]/g, '-')}.log`;
        const filepath = path.join(this.crashReportsDir, filename);

        // Zbierz informacje systemowe
        const systemInfo = {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            electronVersion: process.versions.electron,
            osRelease: os.release(),
            osType: os.type(),
            hostname: os.hostname(),
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            cpus: os.cpus().length,
            uptime: os.uptime()
        };

        // Formatuj raport jako czytelny tekst
        let report = '';
        report += '====================================================\n';
        report += '  XsusLauncher - Raport z awarii\n';
        report += '====================================================\n\n';

        report += `Data: ${timestamp.toISOString()}\n`;
        report += `Wersja launchera: ${app.getVersion()}\n\n`;

        report += '--- Informacje systemowe ---\n';
        report += `System: ${systemInfo.osType} ${systemInfo.osRelease} (${systemInfo.platform}/${systemInfo.arch})\n`;
        report += `Node.js: ${systemInfo.nodeVersion}\n`;
        report += `Electron: ${systemInfo.electronVersion || 'N/A'}\n`;
        report += `RAM: ${Math.round(systemInfo.totalMemory / (1024 * 1024 * 1024))} GB total, ${Math.round(systemInfo.freeMemory / (1024 * 1024 * 1024))} GB free\n`;
        report += `CPU: ${systemInfo.cpus} cores\n\n`;

        report += '--- Typ awarii ---\n';
        report += `Typ: ${crashData.type}\n`;

        if (crashData.exitCode !== undefined) {
            report += `Exit code: ${crashData.exitCode}\n`;
        }

        if (crashData.crashDetection) {
            report += `Detekcja: ${crashData.crashDetection.description || crashData.crashDetection.type}\n`;
            if (crashData.crashDetection.matchedLine) {
                report += `Pasujaca linia: ${crashData.crashDetection.matchedLine}\n`;
            }
        }

        if (crashData.error) {
            report += `\n--- Blad ---\n`;
            report += `Nazwa: ${crashData.error.name || 'N/A'}\n`;
            report += `Wiadomosc: ${crashData.error.message || 'N/A'}\n`;
            if (crashData.error.stack) {
                report += `Stack trace:\n${crashData.error.stack}\n`;
            }
        }

        if (crashData.gameConfig) {
            report += '\n--- Konfiguracja gry ---\n';
            report += `Wersja MC: ${crashData.gameConfig.gameVersion || 'N/A'}\n`;
            report += `Loader: ${crashData.gameConfig.loaderType || 'vanilla'}\n`;
            if (crashData.gameConfig.forgeVersion) {
                report += `Forge: ${crashData.gameConfig.forgeVersion}\n`;
            }
            if (crashData.gameConfig.neoforgeVersion) {
                report += `NeoForge: ${crashData.gameConfig.neoforgeVersion}\n`;
            }
            report += `Serwer: ${crashData.gameConfig.serverIp || 'N/A'}:${crashData.gameConfig.serverPort || 25565}\n`;
            report += `Gracz: ${crashData.gameConfig.username || 'N/A'}\n`;
        }

        // Ustawienia launchera
        if (this.store) {
            report += '\n--- Ustawienia ---\n';
            const ram = this.store.get('ram') || {};
            report += `RAM: min=${ram.min || '?'}GB, max=${ram.max || '?'}GB\n`;
            report += `Java: ${this.store.get('javaPath') || 'auto'}\n`;
            const resolution = this.store.get('resolution') || {};
            report += `Rozdzielczosc: ${resolution.width || '?'}x${resolution.height || '?'} (fullscreen: ${resolution.fullscreen || false})\n`;
        }

        // Logi stderr (crash output z Minecraft)
        if (crashData.stderrLogs && crashData.stderrLogs.length > 0) {
            report += '\n--- stderr (ostatnie linie) ---\n';
            for (const log of crashData.stderrLogs.slice(-50)) {
                report += `[${log.time}] ${log.line}\n`;
            }
        }

        // Logi gry
        if (crashData.gameLogs && crashData.gameLogs.length > 0) {
            report += '\n--- Logi gry (ostatnie linie) ---\n';
            for (const log of crashData.gameLogs.slice(-100)) {
                const source = log.source ? `[${log.source}]` : '';
                report += `[${log.time}]${source} ${log.line}\n`;
            }
        }

        report += '\n====================================================\n';
        report += '  Koniec raportu\n';
        report += '====================================================\n';

        // Zapisz do pliku
        try {
            fs.writeFileSync(filepath, report, 'utf8');
            console.log(`[CrashReporter] Report saved to: ${filepath}`);
        } catch (error) {
            console.error('[CrashReporter] Failed to save report:', error);
        }

        // Wyczysc stare raporty
        this._cleanupOldReports();

        return filepath;
    }

    /**
     * Usuwa najstarsze raporty jesli jest wiecej niz maxCrashReports
     */
    _cleanupOldReports() {
        try {
            if (!fs.existsSync(this.crashReportsDir)) return;

            const files = fs.readdirSync(this.crashReportsDir)
                .filter(f => f.startsWith('crash-') && f.endsWith('.log'))
                .sort()
                .reverse(); // Najnowsze pierwsze

            if (files.length > this.maxCrashReports) {
                const toDelete = files.slice(this.maxCrashReports);
                for (const file of toDelete) {
                    try {
                        fs.unlinkSync(path.join(this.crashReportsDir, file));
                        console.log(`[CrashReporter] Deleted old report: ${file}`);
                    } catch (e) {
                        // Ignoruj bledy usuwania
                    }
                }
            }
        } catch (error) {
            console.warn('[CrashReporter] Cleanup error:', error);
        }
    }

    /**
     * Rejestruje handlery IPC
     */
    _registerIPCHandlers() {
        // Pobierz liste raportow o awariach
        ipcMain.handle('get-crash-reports', async () => {
            try {
                if (!fs.existsSync(this.crashReportsDir)) {
                    return [];
                }

                const files = fs.readdirSync(this.crashReportsDir)
                    .filter(f => f.startsWith('crash-') && f.endsWith('.log'))
                    .sort()
                    .reverse()
                    .slice(0, 20);

                return files.map(filename => {
                    const filepath = path.join(this.crashReportsDir, filename);
                    try {
                        const stat = fs.statSync(filepath);
                        // Parsuj timestamp z nazwy pliku: crash-YYYY-MM-DDTHH-MM-SS-MMMZ.log
                        const timestampMatch = filename.match(/crash-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
                        let timestamp = null;
                        if (timestampMatch) {
                            timestamp = timestampMatch[1].replace(/-/g, (m, offset) => {
                                // Przywroc dwukropki w czasie
                                if (offset > 9) return ':';
                                return m;
                            });
                            // Prostsza metoda - uzyj daty pliku
                            timestamp = stat.mtime.toISOString();
                        }

                        return {
                            filename,
                            filepath,
                            timestamp: timestamp || stat.mtime.toISOString(),
                            size: stat.size
                        };
                    } catch (e) {
                        return { filename, filepath, error: 'Failed to read file info' };
                    }
                });
            } catch (e) {
                console.error('[CrashReporter] Error listing reports:', e);
                return [];
            }
        });

        // Odczytaj konkretny raport o crashu
        ipcMain.handle('get-crash-report', async (event, filename) => {
            try {
                // Zabezpieczenie sciezki - pozwol tylko na nazwy plikow bez sciezek
                const safeName = path.basename(filename);
                const filepath = path.join(this.crashReportsDir, safeName);

                if (!fs.existsSync(filepath)) {
                    return { success: false, error: 'Report not found' };
                }

                const content = fs.readFileSync(filepath, 'utf8');
                return {
                    success: true,
                    filename: safeName,
                    content: content
                };
            } catch (e) {
                console.error('[CrashReporter] Error reading report:', e);
                return { success: false, error: e.message };
            }
        });

        // Odczytaj konkretny raport (kompatybilnosc z preload read-crash-report)
        ipcMain.handle('read-crash-report', async (event, filepath) => {
            try {
                const safePath = path.basename(filepath);
                const fullPath = path.join(this.crashReportsDir, safePath);

                if (!fs.existsSync(fullPath)) {
                    // Sprobuj bezposredniej sciezki (kompatybilnosc wsteczna)
                    if (fs.existsSync(filepath)) {
                        const content = fs.readFileSync(filepath, 'utf8');
                        return content;
                    }
                    return null;
                }

                const content = fs.readFileSync(fullPath, 'utf8');
                return content;
            } catch (e) {
                return null;
            }
        });

        // Otworz folder z crash reportami
        ipcMain.handle('open-crash-reports-folder', async () => {
            this._ensureDir(this.crashReportsDir);
            const { shell } = require('electron');
            shell.openPath(this.crashReportsDir);
            return this.crashReportsDir;
        });
    }

    /**
     * Wysyla wiadomosc do okna renderera
     */
    _sendToRenderer(channel, data) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data);
        }
    }

    /**
     * Upewnia sie ze katalog istnieje
     */
    _ensureDir(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }
}

module.exports = CrashReporter;
