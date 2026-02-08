/**
 * XsusLauncher - Klient API
 * Komunikacja z backendem serwera
 */

// URL API - ustaw odpowiedni adres serwera
const API_URL = 'https://mc.xsus.pl/api';

/**
 * Klasa obsługująca komunikację z API
 * Z optymalizacjami: cache, ETag support
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
     * Wykonuje żądanie HTTP z opcjonalnym cache
     */
    async request(endpoint, options = {}, cacheOptions = {}) {
        const { useCache = false, cacheTTL = this.defaultCacheTTL, forceRefresh = false } = cacheOptions;
        const cacheKey = `${endpoint}:${JSON.stringify(options.body || '')}`;

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
