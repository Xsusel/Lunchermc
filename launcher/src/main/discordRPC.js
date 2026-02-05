/**
 * XsusLauncher - Discord Rich Presence
 * Pokazuje status gry w Discord
 */
const DiscordRPC = require('discord-rpc');

class DiscordPresence {
    constructor() {
        // Discord Application Client ID - do zmiany na własne
        this.clientId = '1234567890123456789'; // Placeholder - wymień na prawdziwe ID
        this.client = null;
        this.connected = false;
        this.enabled = true;
        this.startTimestamp = null;
        this.serverName = 'XsusServer';
        this.username = '';

        // Stan gry
        this.gameState = 'idle'; // idle, launching, playing
    }

    /**
     * Inicjalizuje połączenie z Discord RPC
     */
    async init(clientId = null) {
        if (clientId) {
            this.clientId = clientId;
        }

        // Jeśli clientId to placeholder, nie inicjalizuj
        if (this.clientId === '1234567890123456789') {
            console.log('[Discord RPC] Client ID not configured, skipping initialization');
            return false;
        }

        try {
            DiscordRPC.register(this.clientId);
            this.client = new DiscordRPC.Client({ transport: 'ipc' });

            this.client.on('ready', () => {
                console.log('[Discord RPC] Connected as', this.client.user.username);
                this.connected = true;
                this.updatePresence();
            });

            this.client.on('disconnected', () => {
                console.log('[Discord RPC] Disconnected');
                this.connected = false;
            });

            await this.client.login({ clientId: this.clientId });
            return true;
        } catch (error) {
            console.error('[Discord RPC] Failed to connect:', error.message);
            this.connected = false;
            return false;
        }
    }

    /**
     * Ustawia status włączony/wyłączony
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.clearPresence();
        } else if (this.connected) {
            this.updatePresence();
        }
    }

    /**
     * Ustawia nazwę serwera
     */
    setServerName(name) {
        this.serverName = name || 'XsusServer';
        if (this.connected && this.enabled) {
            this.updatePresence();
        }
    }

    /**
     * Ustawia nazwę użytkownika
     */
    setUsername(username) {
        this.username = username || '';
        if (this.connected && this.enabled) {
            this.updatePresence();
        }
    }

    /**
     * Ustawia stan gry na "uruchamianie"
     */
    setLaunching() {
        this.gameState = 'launching';
        this.startTimestamp = null;
        if (this.connected && this.enabled) {
            this.updatePresence();
        }
    }

    /**
     * Ustawia stan gry na "gra"
     */
    setPlaying() {
        this.gameState = 'playing';
        this.startTimestamp = new Date();
        if (this.connected && this.enabled) {
            this.updatePresence();
        }
    }

    /**
     * Ustawia stan na "idle" (w launcherze)
     */
    setIdle() {
        this.gameState = 'idle';
        this.startTimestamp = null;
        if (this.connected && this.enabled) {
            this.updatePresence();
        }
    }

    /**
     * Aktualizuje Discord Rich Presence
     */
    async updatePresence() {
        if (!this.connected || !this.enabled || !this.client) {
            return;
        }

        try {
            let activity = {};

            switch (this.gameState) {
                case 'launching':
                    activity = {
                        details: `Uruchamia Minecraft`,
                        state: `Łączy z ${this.serverName}`,
                        largeImageKey: 'minecraft_logo',
                        largeImageText: 'Minecraft',
                        smallImageKey: 'xsus_logo',
                        smallImageText: 'XsusLauncher',
                        instance: false
                    };
                    break;

                case 'playing':
                    activity = {
                        details: `Gra na ${this.serverName}`,
                        state: this.username ? `Jako ${this.username}` : 'W grze',
                        startTimestamp: this.startTimestamp,
                        largeImageKey: 'minecraft_logo',
                        largeImageText: 'Minecraft',
                        smallImageKey: 'xsus_logo',
                        smallImageText: this.serverName,
                        instance: true
                    };
                    break;

                case 'idle':
                default:
                    activity = {
                        details: 'W launcherze',
                        state: 'Wybiera opcje',
                        largeImageKey: 'xsus_logo',
                        largeImageText: 'XsusLauncher',
                        instance: false
                    };
                    break;
            }

            await this.client.setActivity(activity);
        } catch (error) {
            console.error('[Discord RPC] Failed to update presence:', error.message);
        }
    }

    /**
     * Czyści Discord Presence
     */
    async clearPresence() {
        if (this.client && this.connected) {
            try {
                await this.client.clearActivity();
            } catch (error) {
                console.error('[Discord RPC] Failed to clear presence:', error.message);
            }
        }
    }

    /**
     * Rozłącza klienta Discord RPC
     */
    async destroy() {
        if (this.client) {
            try {
                await this.clearPresence();
                this.client.destroy();
                this.client = null;
                this.connected = false;
            } catch (error) {
                console.error('[Discord RPC] Failed to destroy client:', error.message);
            }
        }
    }

    /**
     * Sprawdza czy jest połączony
     */
    isConnected() {
        return this.connected;
    }

    /**
     * Zwraca stan włączenia
     */
    isEnabled() {
        return this.enabled;
    }
}

// Eksportujemy singleton
const discordPresence = new DiscordPresence();
module.exports = discordPresence;
