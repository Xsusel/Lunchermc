/**
 * Trasy autoryzacji użytkowników (graczy)
 * Obsługuje logowanie, rejestrację i zarządzanie sesją
 */
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { User, ActivityLog } from '../models/index.js';
import {
    authenticateUser,
    generateUserToken,
    authLimiter,
    registerLimiter
} from '../middleware/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { isValidUsername, isValidPassword, getClientIp } from '../utils/helpers.js';

const router = Router();

/**
 * POST /api/auth/register
 * Rejestracja nowego użytkownika
 */
router.post('/register',
    registerLimiter,
    [
        body('username')
            .trim()
            .notEmpty().withMessage('Nazwa użytkownika jest wymagana')
            .isLength({ min: 3, max: 16 }).withMessage('Nazwa musi mieć 3-16 znaków')
            .matches(/^[a-zA-Z0-9_]+$/).withMessage('Dozwolone: litery, cyfry, podkreślenia'),
        body('password')
            .notEmpty().withMessage('Hasło jest wymagane')
            .isLength({ min: 6 }).withMessage('Hasło musi mieć minimum 6 znaków')
    ],
    asyncHandler(async (req, res) => {
        // Walidacja
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const { username, password } = req.body;

        // Sprawdzamy czy nazwa jest dostępna
        if (!User.isUsernameAvailable(username)) {
            return res.status(409).json({
                success: false,
                error: 'Nazwa użytkownika jest już zajęta'
            });
        }

        // Tworzymy użytkownika
        const user = User.create(username, password);

        // Logujemy rejestrację
        ActivityLog.logRegistration(user.id, getClientIp(req));

        // Generujemy token
        const token = generateUserToken(user);

        res.status(201).json({
            success: true,
            message: 'Konto zostało utworzone',
            data: {
                user: {
                    id: user.id,
                    username: user.username
                },
                token
            }
        });
    })
);

/**
 * POST /api/auth/login
 * Logowanie użytkownika
 */
router.post('/login',
    authLimiter,
    [
        body('username').trim().notEmpty().withMessage('Nazwa użytkownika jest wymagana'),
        body('password').notEmpty().withMessage('Hasło jest wymagane')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const { username, password } = req.body;

        // Weryfikujemy dane logowania
        const user = User.verifyPassword(username, password);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Nieprawidłowa nazwa użytkownika lub hasło'
            });
        }

        // Sprawdzamy czy użytkownik nie jest zbanowany
        if (user.is_banned) {
            return res.status(403).json({
                success: false,
                error: 'Konto zostało zablokowane',
                reason: user.ban_reason || 'Brak podanego powodu'
            });
        }

        // Logujemy logowanie
        ActivityLog.logLogin(user.id, getClientIp(req));

        // Generujemy token
        const token = generateUserToken(user);

        res.json({
            success: true,
            message: 'Zalogowano pomyślnie',
            data: {
                user: {
                    id: user.id,
                    username: user.username
                },
                token
            }
        });
    })
);

/**
 * GET /api/auth/me
 * Pobiera dane zalogowanego użytkownika
 */
router.get('/me',
    authenticateUser,
    asyncHandler(async (req, res) => {
        res.json({
            success: true,
            data: {
                id: req.user.id,
                username: req.user.username,
                createdAt: req.user.created_at,
                lastLogin: req.user.last_login,
                totalPlaytime: req.user.total_playtime
            }
        });
    })
);

/**
 * POST /api/auth/change-password
 * Zmiana hasła użytkownika
 */
router.post('/change-password',
    authenticateUser,
    [
        body('currentPassword').notEmpty().withMessage('Aktualne hasło jest wymagane'),
        body('newPassword')
            .notEmpty().withMessage('Nowe hasło jest wymagane')
            .isLength({ min: 6 }).withMessage('Nowe hasło musi mieć minimum 6 znaków')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const { currentPassword, newPassword } = req.body;

        // Weryfikujemy aktualne hasło
        const user = User.verifyPassword(req.user.username, currentPassword);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Nieprawidłowe aktualne hasło'
            });
        }

        // Zmieniamy hasło
        User.changePassword(req.userId, newPassword);

        res.json({
            success: true,
            message: 'Hasło zostało zmienione'
        });
    })
);

/**
 * POST /api/auth/verify
 * Weryfikuje token (dla launchera)
 */
router.post('/verify',
    authenticateUser,
    asyncHandler(async (req, res) => {
        res.json({
            success: true,
            data: {
                valid: true,
                user: {
                    id: req.user.id,
                    username: req.user.username
                }
            }
        });
    })
);

export default router;
