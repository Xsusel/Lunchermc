/**
 * XsusLauncher - Klient API
 * Komunikacja z backendem serwera
 * Z obsługą trybu offline
 */

// URL API - ustaw odpowiedni adres serwera
const API_URL = 'https://mc.xsus.pl/api';

// Globalny stan offline
window.isOffline = false;

/**
 * Klasa obsługująca komunikację z API
 * Z optymalizacjami: cache, ETag support, offline fallback
 */
class ApiClient {
    constructor() {
        this.baseUrl = API_URL;
        this.token = null;

        // Cache responses (optymalizacja dla słabszych PC)
        this.cache = new Map();
        this.cacheExpiry = new Map();
        this.defaultCacheTTL = 30 * 1000; // 30 sekund domyślnie
        this.configCacheTTL = 5 * 60 * 1000; // 5 minut dla konfiguracji

        // localStorage keys for offline cache
        this._offlineCachePrefix = 'xsus_offline_';
    }

    /**
     * Ustawia token autoryzacji
     */
    setToken(token) {
        this.token = token;
    }

    /**
     * Sprawdza czy cache jest aktualny
     */
    isCacheValid(key) {
        const expiry = this.cacheExpiry.get(key);
        return expiry && Date.now() < expiry;
    }

    /**
     * Pobiera z cache
     */
    getFromCache(key) {
        if (this.isCacheValid(key)) {
            return this.cache.get(key);
        }
        this.cache.delete(key);
        this.cacheExpiry.delete(key);
        return null;
    }

    /**
     * Zapisuje do cache
     */
    setCache(key, data, ttl = this.defaultCacheTTL) {
        this.cache.set(key, data);
        this.cacheExpiry.set(key, Date.now() + ttl);
    }

    /**
     * Czyści cały cache
     */
    clearCache() {
        this.cache.clear();
        this.cacheExpiry.clear();
    }

    /**
     * Sprawdza czy launcher jest online
     * @returns {boolean}
     */
    static isOnline() {
        return !window.isOffline;
    }

    /**
     * Zapisuje odpowiedź do localStorage jako offline cache
     */
    _saveToOfflineCache(key, data) {
        try {
            const cacheEntry = {
                data: data,
                timestamp: Date.now()
            };
            localStorage.setItem(this._offlineCachePrefix + key, JSON.stringify(cacheEntry));
        } catch (e) {
            console.warn('[Offline Cache] Failed to save:', e.message);
        }
    }

    /**
     * Pobiera dane z offline cache w localStorage
     */
    _getFromOfflineCache(key) {
        try {
            const raw = localStorage.getItem(this._offlineCachePrefix + key);
            if (raw) {
                const cacheEntry = JSON.parse(raw);
                return cacheEntry.data;
            }
        } catch (e) {
            console.warn('[Offline Cache] Failed to read:', e.message);
        }
        return null;
    }

    /**
     * Wykonuje żądanie HTTP z opcjonalnym cache i offline fallback
     */
    async request(endpoint, options = {}, cacheOptions = {}) {
        const { useCache = false, cacheTTL = this.defaultCacheTTL, forceRefresh = false } = cacheOptions;
        const cacheKey = `${endpoint}:${JSON.stringify(options.body || '')}`;
        const offlineCacheKey = endpoint.replace(/[^a-zA-Z0-9]/g, '_');

        // Sprawdź cache (tylko dla GET requests)
        if (useCache && !forceRefresh && options.method !== 'POST') {
            const cached = this.getFromCache(cacheKey);
            if (cached) {
                console.log(`[API Cache HIT] ${endpoint}`);
                return cached;
            }
        }

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

            // Zapisz do cache jeśli włączony
            if (useCache && options.method !== 'POST') {
                this.setCache(cacheKey, data, cacheTTL);
            }

            // Zapisz do offline cache (localStorage) dla kluczowych endpointów GET
            if (options.method !== 'POST' && options.method !== 'DELETE') {
                this._saveToOfflineCache(offlineCacheKey, data);
            }

            // Jeśli byliśmy offline a teraz się udało - przywróć online
            if (window.isOffline) {
                const wasOffline = true;
                window.isOffline = false;
                console.log('[API] Connection restored - switching to online mode');
                // Emituj event przejścia do trybu online
                window.dispatchEvent(new CustomEvent('online-status-changed', { detail: { online: true, wasOffline } }));
            }

            return data;
        } catch (error) {
            const isNetworkError = error.message === 'Failed to fetch' ||
                error.message === 'NetworkError when attempting to fetch resource.' ||
                error.message === 'Network request failed' ||
                error.name === 'TypeError';

            if (isNetworkError) {
                // Ustaw tryb offline
                if (!window.isOffline) {
                    window.isOffline = true;
                    console.warn('[API] Network error - switching to offline mode');
                    window.dispatchEvent(new CustomEvent('online-status-changed', { detail: { online: false } }));
                }

                // Spróbuj pobrać z offline cache (tylko dla GET requests)
                if (options.method !== 'POST' && options.method !== 'DELETE') {
                    const offlineData = this._getFromOfflineCache(offlineCacheKey);
                    if (offlineData) {
                        console.log(`[API Offline Cache HIT] ${endpoint}`);
                        return offlineData;
                    }
                }

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
     * Pobiera pełną konfigurację dla launchera (z cache)
     */
    async getLauncherConfig(forceRefresh = false) {
        return this.request('/launcher/config', {}, {
            useCache: true,
            cacheTTL: this.configCacheTTL,
            forceRefresh
        });
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
     * Sprawdza status serwera (z cache 15s)
     */
    async getServerStatus(queryParams = '', forceRefresh = false) {
        const url = queryParams ? `/launcher/server-status?${queryParams}` : '/launcher/server-status';
        return this.request(url, {}, {
            useCache: true,
            cacheTTL: 15 * 1000, // 15 sekund cache dla statusu
            forceRefresh
        });
    }

    // ============================================
    // REGULAMIN SERWERA
    // ============================================

    /**
     * Pobiera aktywny regulamin serwera
     */
    async getServerRules() {
        return this.request('/launcher/rules');
    }

    /**
     * Sprawdza czy użytkownik zaakceptował regulamin
     */
    async checkRulesAcceptance() {
        return this.request('/launcher/rules/check');
    }

    /**
     * Akceptuje regulamin serwera
     */
    async acceptRules() {
        return this.request('/launcher/rules/accept', {
            method: 'POST'
        });
    }

    // ============================================
    // AKTUALNOŚCI (NEWS)
    // ============================================

    /**
     * Pobiera listę aktualności
     */
    async getNews(options = {}) {
        const params = new URLSearchParams();
        if (options.limit) params.set('limit', options.limit);
        if (options.offset) params.set('offset', options.offset);
        if (options.type) params.set('type', options.type);
        if (options.tag) params.set('tag', options.tag);

        const queryString = params.toString();
        return this.request(`/launcher/news${queryString ? '?' + queryString : ''}`, {}, {
            useCache: true,
            cacheTTL: 60 * 1000 // 1 minuta cache
        });
    }

    /**
     * Pobiera szczegóły aktualności
     */
    async getNewsDetails(id) {
        return this.request(`/launcher/news/${id}`);
    }
}

// Eksportujemy instancję
const api = new ApiClient();

// Alias dla wygody - LauncherAPI.isOnline()
const LauncherAPI = {
    isOnline: () => ApiClient.isOnline()
};
