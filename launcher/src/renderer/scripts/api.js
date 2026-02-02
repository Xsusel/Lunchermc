/**
 * XsusLauncher - Klient API
 * Komunikacja z backendem serwera
 */

// URL API - ustaw odpowiedni adres serwera
const API_URL = 'https://mc.xsus.pl/api';

/**
 * Klasa obsługująca komunikację z API
 */
class ApiClient {
    constructor() {
        this.baseUrl = API_URL;
        this.token = null;
    }

    /**
     * Ustawia token autoryzacji
     */
    setToken(token) {
        this.token = token;
    }

    /**
     * Wykonuje żądanie HTTP
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;

        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        try {
            const response = await fetch(url, {
                ...options,
                headers
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Wystąpił błąd');
            }

            return data;
        } catch (error) {
            if (error.message === 'Failed to fetch') {
                throw new Error('Brak połączenia z serwerem');
            }
            throw error;
        }
    }

    // ============================================
    // AUTORYZACJA
    // ============================================

    /**
     * Logowanie użytkownika
     */
    async login(username, password) {
        const data = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });

        if (data.success && data.data.token) {
            this.setToken(data.data.token);
        }

        return data;
    }

    /**
     * Rejestracja użytkownika
     */
    async register(username, password) {
        const data = await this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });

        if (data.success && data.data.token) {
            this.setToken(data.data.token);
        }

        return data;
    }

    /**
     * Weryfikacja tokenu
     */
    async verifyToken() {
        return this.request('/auth/verify', {
            method: 'POST'
        });
    }

    // ============================================
    // LAUNCHER
    // ============================================

    /**
     * Pobiera pełną konfigurację dla launchera
     */
    async getLauncherConfig() {
        return this.request('/launcher/config');
    }

    /**
     * Pobiera listę modów do pobrania
     */
    async getMods() {
        return this.request('/launcher/mods');
    }

    /**
     * Pobiera aktywne powiadomienia
     */
    async getBroadcasts() {
        return this.request('/launcher/broadcasts');
    }

    /**
     * Sprawdza aktualizację launchera
     */
    async checkLauncherUpdate(currentVersion) {
        return this.request(`/launcher/check-update?version=${currentVersion}`);
    }

    /**
     * Pobiera manifest plików do synchronizacji
     */
    async getManifest() {
        return this.request('/launcher/manifest');
    }

    /**
     * Weryfikuje pliki klienta
     */
    async verifyFiles(files) {
        return this.request('/launcher/verify-files', {
            method: 'POST',
            body: JSON.stringify({ files })
        });
    }

    /**
     * Loguje uruchomienie gry
     */
    async logGameStart() {
        return this.request('/launcher/game-start', {
            method: 'POST'
        });
    }

    /**
     * Sprawdza status serwera
     */
    async getServerStatus() {
        return this.request('/launcher/server-status');
    }
}

// Eksportujemy instancję
const api = new ApiClient();
