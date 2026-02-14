/**
 * Middleware limitowania żądań (Rate Limiting)
 * Rozszerzone funkcje:
 * - Limitowanie per IP (domyślne)
 * - Limitowanie per user (po autoryzacji)
 * - Dynamiczne limity per user
 * - Tracking prób i blokad
 */
import rateLimit from 'express-rate-limit';
import db from '../config/database.js';

/**
 * Pobiera adres IP klienta
 * Obsługuje reverse proxy (Nginx)
 */
const getClientIp = (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.ip;
};

// ============================================
// IN-MEMORY STORE DLA USER RATE LIMITS
// ============================================

class UserRateLimitStore {
    constructor() {
        this.hits = new Map(); // key -> { count, resetTime }
        this.blockedUsers = new Map(); // userId -> { until, reason }
        this.blockedIPs = new Map(); // ip -> { until, reason }

        // Czyść stare wpisy co minutę
        setInterval(() => this.cleanup(), 60 * 1000);
    }

    /**
     * Generuje klucz dla rate limiting
     */
    getKey(identifier, prefix = '') {
        return prefix ? `${prefix}:${identifier}` : identifier;
    }

    /**
     * Sprawdza i inkrementuje licznik
     */
    increment(key, windowMs, maxHits) {
        const now = Date.now();
        const record = this.hits.get(key);

        if (!record || now > record.resetTime) {
            // Nowy window
            this.hits.set(key, {
                count: 1,
                resetTime: now + windowMs,
                firstHit: now
            });
            return { current: 1, remaining: maxHits - 1, resetTime: now + windowMs, blocked: false };
        }

        record.count++;
        const remaining = Math.max(0, maxHits - record.count);
        const blocked = record.count > maxHits;

        return {
            current: record.count,
            remaining,
            resetTime: record.resetTime,
            blocked
        };
    }

    /**
     * Pobiera aktualny stan dla klucza
     */
    get(key) {
        return this.hits.get(key);
    }

    /**
     * Resetuje licznik
     */
    reset(key) {
        this.hits.delete(key);
    }

    /**
     * Blokuje użytkownika
     */
    blockUser(userId, durationMs, reason = 'rate_limit') {
        this.blockedUsers.set(String(userId), {
            until: Date.now() + durationMs,
            reason
        });
    }

    /**
     * Blokuje IP
     */
    blockIP(ip, durationMs, reason = 'rate_limit') {
        this.blockedIPs.set(ip, {
            until: Date.now() + durationMs,
            reason
        });
    }

    /**
     * Sprawdza czy użytkownik jest zablokowany
     */
    isUserBlocked(userId) {
        const block = this.blockedUsers.get(String(userId));
        if (!block) return null;
        if (Date.now() > block.until) {
            this.blockedUsers.delete(String(userId));
            return null;
        }
        return block;
    }

    /**
     * Sprawdza czy IP jest zablokowane
     */
    isIPBlocked(ip) {
        const block = this.blockedIPs.get(ip);
        if (!block) return null;
        if (Date.now() > block.until) {
            this.blockedIPs.delete(ip);
            return null;
        }
        return block;
    }

    /**
     * Odblokuje użytkownika
     */
    unblockUser(userId) {
        return this.blockedUsers.delete(String(userId));
    }

    /**
     * Odblokuje IP
     */
    unblockIP(ip) {
        return this.blockedIPs.delete(ip);
    }

    /**
     * Czyści wygasłe wpisy
     */
    cleanup() {
        const now = Date.now();

        // Czyść hits
        for (const [key, record] of this.hits.entries()) {
            if (now > record.resetTime) {
                this.hits.delete(key);
            }
        }

        // Czyść blokady użytkowników
        for (const [userId, block] of this.blockedUsers.entries()) {
            if (now > block.until) {
                this.blockedUsers.delete(userId);
            }
        }

        // Czyść blokady IP
        for (const [ip, block] of this.blockedIPs.entries()) {
            if (now > block.until) {
                this.blockedIPs.delete(ip);
            }
        }
    }

    /**
     * Pobiera statystyki
     */
    getStats() {
        return {
            activeHits: this.hits.size,
            blockedUsers: this.blockedUsers.size,
            blockedIPs: this.blockedIPs.size,
            blockedUsersList: Array.from(this.blockedUsers.entries()).map(([id, b]) => ({
                userId: id,
                until: new Date(b.until).toISOString(),
                reason: b.reason
            })),
            blockedIPsList: Array.from(this.blockedIPs.entries()).map(([ip, b]) => ({
                ip,
                until: new Date(b.until).toISOString(),
                reason: b.reason
            }))
        };
    }
}

// Singleton store
export const rateLimitStore = new UserRateLimitStore();

// ============================================
// CUSTOM USER RATE LIMITS (z bazy danych)
// ============================================

// Cache dla limitów użytkowników (5 minut TTL)
const userLimitsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Pobiera niestandardowe limity użytkownika z bazy
 */
function getUserCustomLimits(userId) {
    const cached = userLimitsCache.get(userId);
    if (cached && Date.now() < cached.expires) {
        return cached.limits;
    }

    try {
        // Sprawdź czy użytkownik ma custom limits w bazie
        const user = db.prepare(`
            SELECT custom_rate_limit FROM users WHERE id = ?
        `).get(userId);

        let limits = null;
        if (user && user.custom_rate_limit) {
            try {
                limits = JSON.parse(user.custom_rate_limit);
            } catch (e) {}
        }

        userLimitsCache.set(userId, {
            limits,
            expires: Date.now() + CACHE_TTL
        });

        return limits;
    } catch (e) {
        return null;
    }
}

/**
 * Tworzy middleware rate limiting per user
 */
export function createUserRateLimiter(options = {}) {
    const {
        windowMs = 15 * 60 * 1000,      // 15 minut
        maxRequests = 100,               // Max żądań
        keyPrefix = 'user',              // Prefix klucza
        useUserId = true,                // Używaj userId (jeśli dostępne)
        blockOnExceed = false,           // Blokuj użytkownika po przekroczeniu
        blockDurationMs = 30 * 60 * 1000, // 30 minut blokady
        message = 'Zbyt wiele żądań. Spróbuj ponownie później.',
        skipFailedRequests = false,
        customLimitsField = null         // Pole z custom limits
    } = options;

    return (req, res, next) => {
        const ip = getClientIp(req);

        // Sprawdź blokadę IP
        const ipBlock = rateLimitStore.isIPBlocked(ip);
        if (ipBlock) {
            return res.status(429).json({
                success: false,
                error: 'Twój adres IP został tymczasowo zablokowany',
                reason: ipBlock.reason,
                retryAfter: new Date(ipBlock.until).toISOString()
            });
        }

        // Pobierz userId (jeśli dostępne i useUserId=true)
        const userId = useUserId ? (req.user?.id || req.admin?.id) : null;

        // Sprawdź blokadę użytkownika
        if (userId) {
            const userBlock = rateLimitStore.isUserBlocked(userId);
            if (userBlock) {
                return res.status(429).json({
                    success: false,
                    error: 'Twoje konto zostało tymczasowo zablokowane z powodu zbyt wielu żądań',
                    reason: userBlock.reason,
                    retryAfter: new Date(userBlock.until).toISOString()
                });
            }
        }

        // Określ limit
        let effectiveMax = maxRequests;
        let effectiveWindow = windowMs;

        // Sprawdź custom limits dla użytkownika
        if (userId && customLimitsField) {
            const customLimits = getUserCustomLimits(userId);
            if (customLimits && customLimits[customLimitsField]) {
                effectiveMax = customLimits[customLimitsField].maxRequests || maxRequests;
                effectiveWindow = customLimits[customLimitsField].windowMs || windowMs;
            }
        }

        // Generuj klucz (userId ma priorytet nad IP)
        const identifier = userId ? `user:${userId}` : `ip:${ip}`;
        const key = rateLimitStore.getKey(identifier, keyPrefix);

        // Sprawdź limit
        const result = rateLimitStore.increment(key, effectiveWindow, effectiveMax);

        // Ustaw nagłówki
        res.set('X-RateLimit-Limit', String(effectiveMax));
        res.set('X-RateLimit-Remaining', String(result.remaining));
        res.set('X-RateLimit-Reset', String(Math.ceil(result.resetTime / 1000)));

        if (result.blocked) {
            // Blokuj użytkownika/IP jeśli ustawiono
            if (blockOnExceed) {
                if (userId) {
                    rateLimitStore.blockUser(userId, blockDurationMs, 'rate_limit_exceeded');
                } else {
                    rateLimitStore.blockIP(ip, blockDurationMs, 'rate_limit_exceeded');
                }
            }

            return res.status(429).json({
                success: false,
                error: message,
                retryAfter: new Date(result.resetTime).toISOString()
            });
        }

        // Zapisz informacje w req dla dalszego użycia
        req.rateLimit = {
            limit: effectiveMax,
            remaining: result.remaining,
            resetTime: result.resetTime
        };

        next();
    };
}

// ============================================
// MIDDLEWARE DO ZARZĄDZANIA BLOKADAMI (dla admina)
// ============================================

export const rateLimitAdmin = {
    /**
     * Pobiera statystyki rate limiting
     */
    getStats: () => rateLimitStore.getStats(),

    /**
     * Blokuje użytkownika
     */
    blockUser: (userId, durationMinutes, reason) => {
        rateLimitStore.blockUser(userId, durationMinutes * 60 * 1000, reason);
    },

    /**
     * Blokuje IP
     */
    blockIP: (ip, durationMinutes, reason) => {
        rateLimitStore.blockIP(ip, durationMinutes * 60 * 1000, reason);
    },

    /**
     * Odblokuje użytkownika
     */
    unblockUser: (userId) => rateLimitStore.unblockUser(userId),

    /**
     * Odblokuje IP
     */
    unblockIP: (ip) => rateLimitStore.unblockIP(ip),

    /**
     * Resetuje limit dla klucza
     */
    resetLimit: (key) => rateLimitStore.reset(key)
};

/**
 * Ogólny limiter dla API
 * Domyślnie: 100 żądań na 15 minut
 */
export const apiLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minut
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: {
        success: false,
        error: 'Zbyt wiele żądań. Spróbuj ponownie później.',
        retryAfter: 'Limit zostanie zresetowany za 15 minut'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getClientIp
});

/**
 * Limiter dla endpointów autoryzacji
 * Bardziej restrykcyjny: 5 prób na 15 minut
 */
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minut
    max: 10, // 10 prób
    message: {
        success: false,
        error: 'Zbyt wiele prób logowania. Spróbuj ponownie za 15 minut.',
        retryAfter: '15 minut'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getClientIp,
    skipSuccessfulRequests: true // Nie liczymy udanych logowań
});

/**
 * Limiter dla rejestracji
 * 3 rejestracje na godzinę z jednego IP
 */
export const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 godzina
    max: 3,
    message: {
        success: false,
        error: 'Zbyt wiele rejestracji. Spróbuj ponownie za godzinę.',
        retryAfter: '1 godzina'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getClientIp
});

/**
 * Limiter dla pobierania plików
 * 5000 pobrań na minutę (launcher pobiera wiele modów naraz)
 */
export const downloadLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuta
    max: 5000,
    message: {
        success: false,
        error: 'Zbyt wiele żądań pobierania. Poczekaj chwilę.',
        retryAfter: '1 minuta'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getClientIp
});

/**
 * Limiter dla panelu administratora
 * 200 żądań na 15 minut
 */
export const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minut
    max: 200,
    message: {
        success: false,
        error: 'Zbyt wiele żądań. Spróbuj ponownie później.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getClientIp
});
