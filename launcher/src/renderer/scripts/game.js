/**
 * XsusLauncher - Modul uruchamiania gry
 * Obsluguje pobieranie plikow i uruchamianie Minecraft
 */

/**
 * Klasa zarzadzajaca uruchamianiem gry
 */
class GameLauncher {
    constructor() {
        this.isDownloading = false;
        this.isLaunching = false;
        this.downloadProgress = 0;
        this.currentTask = '';
        this.javaInstallations = [];

        // Statystyki pobierania
        this.downloadStats = {
            startTime: 0,
            lastTime: 0,
            lastBytes: 0,
            speed: 0,
            totalBytes: 0,
            downloadedBytes: 0
        };

        // Zarejestruj listenery
        this.setupListeners();
    }

    /**
     * Konfiguruje listenery eventow z main process
     */
    setupListeners() {
        // Postep pobierania
        window.electronAPI.onDownloadProgress((data) => {
            this.downloadProgress = data;

            // Oblicz prędkość pobierania
            const now = Date.now();
            if (data.bytes !== undefined) {
                // Mamy dokładne bajty
                this.downloadStats.downloadedBytes = data.bytes;
                this.downloadStats.totalBytes = data.totalBytes || 0;

                // Oblicz prędkość (średnia z ostatniej sekundy)
                if (this.downloadStats.lastTime > 0) {
                    const timeDiff = (now - this.downloadStats.lastTime) / 1000;
                    if (timeDiff > 0) {
                        const bytesDiff = data.bytes - this.downloadStats.lastBytes;
                        this.downloadStats.speed = Math.round(bytesDiff / timeDiff);
                    }
                }
                this.downloadStats.lastTime = now;
                this.downloadStats.lastBytes = data.bytes;
            }

            if (this.onProgressCallback) {
                const percent = data.total > 0 ? Math.round((data.current / data.total) * 100) : 0;
                this.onProgressCallback(percent, data.name || data.task || 'Pobieranie...', {
                    downloadedBytes: this.downloadStats.downloadedBytes,
                    totalBytes: this.downloadStats.totalBytes,
                    speed: this.downloadStats.speed
                });
            }
        });

        // Output z gry
        window.electronAPI.onGameOutput((data) => {
            console.log('[Minecraft]', data);
            if (this.onGameOutputCallback) {
                this.onGameOutputCallback(data);
            }
        });

        // Zamkniecie gry (obsługuje nowy format z crash info)
        window.electronAPI.onGameClose((data) => {
            // Obsługa nowego formatu (obiekt) i starego (kod)
            const code = typeof data === 'object' ? data.code : data;
            const crashed = typeof data === 'object' ? data.crashed : false;
            const crashReport = typeof data === 'object' ? data.crashReport : null;

            console.log('Game closed with code:', code, 'crashed:', crashed);
            this.isLaunching = false;

            if (this.onGameCloseCallback) {
                this.onGameCloseCallback({ code, crashed, crashReport });
            }
        });

        // Crash gry (szczegółowe informacje)
        window.electronAPI.onGameCrash?.((data) => {
            console.log('Game crashed:', data);
            this.isLaunching = false;

            if (this.onGameCrashCallback) {
                this.onGameCrashCallback(data);
            }
        });

        // Status gry
        window.electronAPI.onGameStatus((data) => {
            if (this.onStatusCallback) {
                this.onStatusCallback(data.status);
            }
        });
    }

    /**
     * Ustawia callback dla crashu gry
     */
    setGameCrashCallback(callback) {
        this.onGameCrashCallback = callback;
    }

    /**
     * Wykrywa zainstalowane wersje Java
     */
    async detectJava() {
        try {
            this.javaInstallations = await window.electronAPI.detectJava();
            return this.javaInstallations;
        } catch (error) {
            console.error('Error detecting Java:', error);
            return [];
        }
    }

    /**
     * Sprawdza czy Java jest dostepna
     */
    async checkJavaAvailable() {
        const installations = await this.detectJava();
        return installations.length > 0;
    }

    /**
     * Pobiera najlepsza wersje Java dla danej wersji MC
     */
    getBestJavaForVersion(mcVersion) {
        if (this.javaInstallations.length === 0) {
            return null;
        }

        // Parse MC version
        const parts = mcVersion.split('.');
        const major = parseInt(parts[0]);
        const minor = parseInt(parts[1] || 0);

        // Wymagania Java dla roznych wersji MC
        let requiredJava = 8;
        if (major >= 1 && minor >= 20 && mcVersion.includes('.5')) {
            requiredJava = 21;
        } else if (major >= 1 && minor >= 18) {
            requiredJava = 17;
        } else if (major >= 1 && minor >= 17) {
            requiredJava = 16;
        }

        // Znajdz kompatybilna wersje
        const compatible = this.javaInstallations.filter(j => j.version >= requiredJava);

        if (compatible.length > 0) {
            return compatible[0];
        }

        // Zwroc najnowsza dostepna
        return this.javaInstallations[0];
    }

    /**
     * Przygotowuje i uruchamia gre
     */
    async launch(userConfig, settings, callbacks = {}) {
        const { onProgress, onStatusChange, onComplete, onError } = callbacks;

        // Zapisz callbacki
        this.onProgressCallback = onProgress;
        this.onStatusCallback = onStatusChange;

        try {
            this.isLaunching = true;

            // 1. Informacja o wykrywaniu Java
            // Nie blokujemy tutaj - gameManager w main process
            // automatycznie wykryje i zainstaluje Java jesli potrzeba
            onStatusChange?.('Przygotowywanie...');
            onProgress?.(0, 'Przygotowywanie...');

            // 2. Pobierz konfiguracje z API
            onStatusChange?.('Pobieranie konfiguracji...');
            onProgress?.(10, 'Pobieranie konfiguracji...');

            const launcherConfig = await api.getLauncherConfig();

            if (!launcherConfig.success) {
                throw new Error('Nie można pobrać konfiguracji serwera');
            }

            const gameConfig = launcherConfig.data.config;
            const mods = launcherConfig.data.mods || [];
            // Użyj zunifikowanej listy plików (mody + configs + datapacks itd.)
            const files = launcherConfig.data.files || [];

            // Sprawdz tryb konserwacji
            if (gameConfig.maintenanceMode) {
                throw new Error(gameConfig.maintenanceMessage || 'Serwer jest w trybie konserwacji');
            }

            // 3. Przygotuj konfiguracje uruchomienia
            // Użyj wybranego serwera jeśli dostępny, inaczej fallback do config
            const selectedServer = userConfig.selectedServer;
            const serverIp = selectedServer?.ip || gameConfig.serverIp;
            const serverPort = selectedServer?.port || gameConfig.serverPort || 25565;
            const serverName = selectedServer?.name || gameConfig.serverName || 'XsusServer';

            const launchConfig = {
                username: userConfig.username,
                gameVersion: gameConfig.gameVersion,
                loaderType: gameConfig.loaderType || 'vanilla',
                forgeVersion: gameConfig.forgeVersion,
                fabricVersion: gameConfig.fabricVersion,
                neoforgeVersion: gameConfig.neoforgeVersion,
                serverIp: serverIp,
                serverPort: serverPort,
                serverName: serverName,
                // Przekaż pełną listę plików do synchronizacji
                files: files.length > 0 ? files : mods,
                mods: mods // zachowaj dla kompatybilności
            };

            // 4. Uruchom gre przez main process
            onStatusChange?.('Uruchamianie gry...');
            onProgress?.(20, 'Uruchamianie...');

            const result = await window.electronAPI.launchGame(launchConfig);

            if (!result.success) {
                throw new Error(result.error || 'Nie udało się uruchomić gry');
            }

            // Loguj uruchomienie na serwerze
            try {
                await api.logGameStart();
            } catch (e) {
                console.warn('Nie udało się zalogować uruchomienia gry:', e);
            }

            onProgress?.(100, 'Gra uruchomiona!');
            onComplete?.({
                success: true,
                message: 'Gra została uruchomiona',
                gamePath: result.gamePath,
                javaPath: result.javaPath
            });

            // Zamknij launcher jesli ustawiono
            if (settings.closeOnLaunch) {
                setTimeout(() => {
                    window.electronAPI.closeWindow();
                }, 1000);
            }

        } catch (error) {
            console.error('Błąd uruchamiania:', error);
            onError?.(error.message);
        } finally {
            this.isLaunching = false;
        }
    }

    /**
     * Zatrzymuje gre
     */
    killGame() {
        window.electronAPI.killGame();
    }

    /**
     * Sprawdza czy gra jest uruchomiona
     */
    async isGameRunning() {
        return window.electronAPI.isGameRunning();
    }

    /**
     * Ustawia callback dla output gry
     */
    setGameOutputCallback(callback) {
        this.onGameOutputCallback = callback;
    }

    /**
     * Ustawia callback dla zamkniecia gry
     */
    setGameCloseCallback(callback) {
        this.onGameCloseCallback = callback;
    }

    /**
     * Generuje UUID dla trybu offline (non-premium)
     * Uzywane tylko jako fallback w rendererze
     */
    generateOfflineUUID(username) {
        const str = `OfflinePlayer:${username}`;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        const hex = Math.abs(hash).toString(16).padStart(8, '0').repeat(4).slice(0, 32);
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    }

    /**
     * Zatrzymuje pobieranie
     */
    cancelDownload() {
        this.isDownloading = false;
    }
}

// Eksportujemy instancje
const gameLauncher = new GameLauncher();
