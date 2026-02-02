/**
 * Middleware obsługi błędów
 * Centralna obsługa błędów w aplikacji
 */

/**
 * Handler błędów - przechwytuje wszystkie błędy i zwraca jednolity format
 */
export const errorHandler = (err, req, res, next) => {
    console.error('❌ Błąd:', err);

    // Błędy walidacji express-validator
    if (err.array && typeof err.array === 'function') {
        return res.status(400).json({
            success: false,
            error: 'Błąd walidacji',
            details: err.array()
        });
    }

    // Błędy SQLite
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({
            success: false,
            error: 'Zasób już istnieje'
        });
    }

    if (err.code === 'SQLITE_CONSTRAINT') {
        return res.status(400).json({
            success: false,
            error: 'Naruszenie ograniczenia bazy danych'
        });
    }

    // Błędy Multer (upload plików)
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            success: false,
            error: 'Plik jest zbyt duży'
        });
    }

    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
            success: false,
            error: 'Nieoczekiwany plik'
        });
    }

    // Błędy JWT
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            error: 'Nieprawidłowy token'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            error: 'Token wygasł'
        });
    }

    // Błędy walidacji (niestandardowe)
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: err.message
        });
    }

    // Błędy autoryzacji
    if (err.name === 'UnauthorizedError' || err.status === 401) {
        return res.status(401).json({
            success: false,
            error: err.message || 'Brak autoryzacji'
        });
    }

    // Błędy dostępu
    if (err.name === 'ForbiddenError' || err.status === 403) {
        return res.status(403).json({
            success: false,
            error: err.message || 'Brak dostępu'
        });
    }

    // Błędy nie znaleziono
    if (err.name === 'NotFoundError' || err.status === 404) {
        return res.status(404).json({
            success: false,
            error: err.message || 'Nie znaleziono'
        });
    }

    // Domyślny błąd serwera
    const statusCode = err.status || err.statusCode || 500;
    const message = process.env.NODE_ENV === 'production'
        ? 'Wystąpił błąd serwera'
        : err.message || 'Wystąpił błąd serwera';

    res.status(statusCode).json({
        success: false,
        error: message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
};

/**
 * Handler dla nieznalezionych tras
 */
export const notFoundHandler = (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint nie istnieje',
        path: req.originalUrl
    });
};

/**
 * Wrapper async dla route handlerów
 * Automatycznie przechwytuje błędy async i przekazuje do errorHandler
 */
export const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Tworzy błąd z określonym statusem
 */
export const createError = (status, message) => {
    const error = new Error(message);
    error.status = status;
    return error;
};
