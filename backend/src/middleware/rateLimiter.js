/**
 * Middleware limitowania żądań (Rate Limiting)
 * Chroni API przed nadmiernym wykorzystaniem
 */
import rateLimit from 'express-rate-limit';

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
 * 50 pobrań na minutę
 */
export const downloadLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuta
    max: 50,
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
