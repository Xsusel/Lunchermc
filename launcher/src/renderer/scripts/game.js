/**
 * XsusLauncher - Moduł uruchamiania gry
 * Obsługuje pobieranie plików i uruchamianie Minecraft
 */

/**
 * Klasa zarządzająca uruchamianiem gry
 */
class GameLauncher {
    constructor() {
        this.isDownloading = false;
        this.isLaunching = false;
        this.downloadProgress = 0;
        this.currentTask = '';
    }

    /**
     * Pobiera plik z URL z obsługą postępu
     */
    async downloadFile(url, destPath, onProgress) {
        return new Promise(async (resolve, reject) => {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const contentLength = response.headers.get('content-length');
                const total = parseInt(contentLength, 10);
                let loaded = 0;

                const reader = response.body.getReader();
                const chunks = [];

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    chunks.push(value);
                    loaded += value.length;

                    if (onProgress && total) {
                        onProgress(loaded, total);
                    }
                }

                // Konwertujemy do Blob i zapisujemy
                const blob = new Blob(chunks);
                const buffer = await blob.arrayBuffer();

                // Zapisz plik przez IPC (wymaga implementacji w main process)
                // Na potrzeby demonstracji używamy localStorage do symulacji
                resolve(buffer);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Oblicza SHA256 pliku
     */
    async calculateSHA256(buffer) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Przygotowuje i uruchamia grę
     */
    async launch(config, settings, callbacks = {}) {
        const { onProgress, onStatusChange, onComplete, onError } = callbacks;

        try {
            this.isLaunching = true;

            // 1. Sprawdź pliki
            onStatusChange?.('Sprawdzanie plików...');
            onProgress?.(0, 'Analizowanie...');

            // 2. Pobierz konfigurację z API
            onStatusChange?.('Pobieranie konfiguracji...');
            const launcherConfig = await api.getLauncherConfig();

            if (!launcherConfig.success) {
                throw new Error('Nie można pobrać konfiguracji');
            }

            const gameConfig = launcherConfig.data.config;
            const mods = launcherConfig.data.mods;

            // Sprawdź tryb konserwacji
            if (gameConfig.maintenanceMode) {
                throw new Error(gameConfig.maintenanceMessage || 'Serwer jest w trybie konserwacji');
            }

            // 3. Przygotuj parametry gry
            const gamePath = await window.electronAPI.getGamePath();
            const ramSettings = settings.ram || { min: 2, max: 4 };

            // 4. Symulacja pobierania/sprawdzania plików
            onStatusChange?.('Weryfikacja plików gry...');

            // Symulujemy progress dla każdego moda
            const totalMods = mods.length;
            for (let i = 0; i < totalMods; i++) {
                const mod = mods[i];
                const progress = Math.round(((i + 1) / totalMods) * 100);

                onProgress?.(progress, `Sprawdzanie: ${mod.name}`);

                // Symulacja opóźnienia (w rzeczywistej implementacji tutaj byłoby pobieranie)
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            onStatusChange?.('Przygotowywanie do uruchomienia...');
            onProgress?.(100, 'Gotowe!');

            // 5. Loguj uruchomienie gry
            try {
                await api.logGameStart();
            } catch (e) {
                console.warn('Nie udało się zalogować uruchomienia gry:', e);
            }

            // 6. Przygotuj argumenty uruchomienia
            // W prawdziwej implementacji tutaj byłoby uruchomienie minecraft-launcher-core
            const launchOptions = {
                // Podstawowe
                root: gamePath,
                version: {
                    number: gameConfig.gameVersion,
                    type: gameConfig.loaderType
                },

                // Pamięć RAM
                memory: {
                    min: `${ramSettings.min}G`,
                    max: `${ramSettings.max}G`
                },

                // Użytkownik (non-premium)
                authorization: {
                    access_token: '0',
                    client_token: '0',
                    uuid: this.generateOfflineUUID(config.username),
                    name: config.username,
                    user_properties: '{}'
                },

                // Automatyczne połączenie z serwerem!
                server: {
                    host: gameConfig.serverIp,
                    port: gameConfig.serverPort
                },

                // Rozdzielczość
                window: {
                    width: settings.resolution?.width || 1280,
                    height: settings.resolution?.height || 720,
                    fullscreen: settings.resolution?.fullscreen || false
                },

                // Java
                javaPath: settings.javaPath || undefined,
                customArgs: settings.customJavaArgs ? settings.customJavaArgs.split(' ') : [],

                // Loader (Forge/Fabric)
                forge: gameConfig.loaderType === 'forge' ? gameConfig.forgeVersion : undefined,
                fabric: gameConfig.loaderType === 'fabric' ? gameConfig.fabricVersion : undefined
            };

            onStatusChange?.('Uruchamianie gry...');

            // W rzeczywistej implementacji tutaj byłoby:
            // const { Client } = require('minecraft-launcher-core');
            // const launcher = new Client();
            // launcher.launch(launchOptions);

            // Symulacja uruchomienia
            await new Promise(resolve => setTimeout(resolve, 1000));

            onComplete?.({
                success: true,
                message: 'Gra została uruchomiona',
                launchOptions
            });

            // Zamknij launcher jeśli ustawiono
            if (settings.closeOnLaunch) {
                window.electronAPI.closeWindow();
            }

        } catch (error) {
            console.error('Błąd uruchamiania:', error);
            onError?.(error.message);
        } finally {
            this.isLaunching = false;
        }
    }

    /**
     * Generuje UUID dla trybu offline (non-premium)
     */
    generateOfflineUUID(username) {
        // Generujemy UUID na podstawie nazwy użytkownika
        const md5 = this.simpleHash(username);
        return `${md5.slice(0, 8)}-${md5.slice(8, 12)}-${md5.slice(12, 16)}-${md5.slice(16, 20)}-${md5.slice(20, 32)}`;
    }

    /**
     * Prosty hash do generowania UUID
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        // Konwertuj do hex i uzupełnij do 32 znaków
        return Math.abs(hash).toString(16).padStart(8, '0').repeat(4).slice(0, 32);
    }

    /**
     * Zatrzymuje pobieranie
     */
    cancelDownload() {
        this.isDownloading = false;
    }
}

// Eksportujemy instancję
const gameLauncher = new GameLauncher();
