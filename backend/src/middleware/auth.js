/**
 * Middleware autoryzacji
 * Obsługuje weryfikację tokenów JWT
 */
import jwt from 'jsonwebtoken';
import { User, Admin, ActivityLog } from '../models/index.js';
import { getClientIp } from '../utils/helpers.js';

/**
 * Middleware weryfikujący token użytkownika (gracza)
 */
export const authenticateUser = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Brak tokenu autoryzacji'
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded.type !== 'user') {
            return res.status(403).json({
                success: false,
                error: 'Nieprawidłowy typ tokenu'
            });
        }

        // Sprawdzamy czy użytkownik istnieje i nie jest zbanowany
        const user = User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Użytkownik nie istnieje'
            });
        }

        if (user.is_banned) {
            return res.status(403).json({
                success: false,
                error: 'Konto zostało zablokowane',
                reason: user.ban_reason
            });
        }

        // Opcjonalnie sprawdzamy IP binding
        if (decoded.ip) {
            const clientIp = getClientIp(req);
            if (clientIp !== decoded.ip) {
                ActivityLog.logSecurityEvent('ip_mismatch', clientIp, {
                    userId: decoded.id,
                    expectedIp: decoded.ip,
                    actualIp: clientIp
                });
                return res.status(401).json({
                    success: false,
                    error: 'Sesja wygasła - zmiana adresu IP'
                });
            }
        }

        req.user = user;
        req.userId = user.id;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token wygasł'
            });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                error: 'Nieprawidłowy token'
            });
        }
        return res.status(500).json({
            success: false,
            error: 'Błąd autoryzacji'
        });
    }
};

/**
 * Middleware weryfikujący token administratora
 */
export const authenticateAdmin = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Brak tokenu autoryzacji'
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded.type !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Wymagane uprawnienia administratora'
            });
        }

        // Sprawdzamy czy admin istnieje
        const admin = Admin.findById(decoded.id);
        if (!admin) {
            return res.status(401).json({
                success: false,
                error: 'Administrator nie istnieje'
            });
        }

        // Opcjonalnie sprawdzamy IP binding
        if (decoded.ip) {
            const clientIp = getClientIp(req);
            if (clientIp !== decoded.ip) {
                ActivityLog.logSecurityEvent('ip_mismatch', clientIp, {
                    adminId: decoded.id,
                    expectedIp: decoded.ip,
                    actualIp: clientIp
                });
                return res.status(401).json({
                    success: false,
                    error: 'Sesja wygasła - zmiana adresu IP'
                });
            }
        }

        req.admin = admin;
        req.adminId = admin.id;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token wygasł'
            });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                error: 'Nieprawidłowy token'
            });
        }
        return res.status(500).json({
            success: false,
            error: 'Błąd autoryzacji'
        });
    }
};

/**
 * Middleware opcjonalnej autoryzacji
 * Nie zwraca błędu jeśli brak tokenu, ale ustawia req.user jeśli jest
 */
export const optionalAuth = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded.type === 'user') {
            const user = User.findById(decoded.id);
            if (user && !user.is_banned) {
                req.user = user;
                req.userId = user.id;
            }
        } else if (decoded.type === 'admin') {
            const admin = Admin.findById(decoded.id);
            if (admin) {
                req.admin = admin;
                req.adminId = admin.id;
            }
        }

        next();
    } catch (error) {
        // Ignorujemy błędy - autoryzacja jest opcjonalna
        next();
    }
};

/**
 * Generuje token JWT dla użytkownika
 * @param {object} user - Obiekt użytkownika
 * @param {string|null} ip - Adres IP klienta (opcjonalny, dla session-IP binding)
 * @returns {string} Token JWT
 */
export const generateUserToken = (user, ip = null) => {
    const payload = {
        id: user.id,
        username: user.username,
        type: 'user'
    };
    if (ip) payload.ip = ip;
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
};

/**
 * Generuje token JWT dla administratora
 * @param {object} admin - Obiekt administratora
 * @param {string|null} ip - Adres IP klienta (opcjonalny, dla session-IP binding)
 * @returns {string} Token JWT
 */
export const generateAdminToken = (admin, ip = null) => {
    const payload = {
        id: admin.id,
        username: admin.username,
        type: 'admin'
    };
    if (ip) payload.ip = ip;
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
};
