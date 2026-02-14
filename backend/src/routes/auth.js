/**
 * Trasy autoryzacji użytkowników (graczy)
 * Obsługuje logowanie, rejestrację i zarządzanie sesją
 */
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { User, ActivityLog } from '../models/index.js';
import BanAppeal from '../models/BanAppeal.js';
import {
    authenticateUser,
    generateUserToken,
    authLimiter,
    registerLimiter
} from '../middleware/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { isValidUsername, isValidPassword, getClientIp } from '../utils/helpers.js';
import { generateChallenge, verifyChallenge } from '../utils/captcha.js';
import { notifyNewUser } from '../utils/discord.js';

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
            .isLength({ min: 8 }).withMessage('Hasło musi mieć minimum 8 znaków')
            .matches(/[A-Z]/).withMessage('Hasło musi zawierać dużą literę')
            .matches(/[a-z]/).withMessage('Hasło musi zawierać małą literę')
            .matches(/[0-9]/).withMessage('Hasło musi zawierać cyfrę')
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

        const { username, password, captcha_id, captcha_answer } = req.body;

        // Weryfikacja CAPTCHA
        if (!captcha_id || captcha_answer === undefined || captcha_answer === null) {
            return res.status(400).json({
                success: false,
                error: 'CAPTCHA jest wymagana. Pobierz wyzwanie z GET /api/auth/captcha'
            });
        }

        if (!verifyChallenge(captcha_id, captcha_answer)) {
            return res.status(400).json({
                success: false,
                error: 'Nieprawidłowa odpowiedź CAPTCHA'
            });
        }

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

        // Generujemy token z IP binding
        const token = generateUserToken(user, getClientIp(req));

        // Powiadomienie Discord (async, nie blokuje odpowiedzi)
        notifyNewUser(user.username).catch(() => {});

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

        // Konto zablokowane po zbyt wielu próbach
        if (user && user.locked) {
            const lockMinutes = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
            return res.status(429).json({
                success: false,
                error: `Konto tymczasowo zablokowane. Spróbuj za ${lockMinutes} minut.`
            });
        }

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

        // Generujemy token z IP binding
        const token = generateUserToken(user, getClientIp(req));

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
            .isLength({ min: 8 }).withMessage('Nowe hasło musi mieć minimum 8 znaków')
            .matches(/[A-Z]/).withMessage('Nowe hasło musi zawierać dużą literę')
            .matches(/[a-z]/).withMessage('Nowe hasło musi zawierać małą literę')
            .matches(/[0-9]/).withMessage('Nowe hasło musi zawierać cyfrę')
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

/**
 * POST /api/auth/set-security-question
 * Ustawia pytanie bezpieczeństwa (wymaga autoryzacji)
 */
router.post('/set-security-question',
    authenticateUser,
    [
        body('question')
            .trim()
            .notEmpty().withMessage('Pytanie bezpieczeństwa jest wymagane')
            .isLength({ min: 5, max: 200 }).withMessage('Pytanie musi mieć 5-200 znaków'),
        body('answer')
            .trim()
            .notEmpty().withMessage('Odpowiedź jest wymagana')
            .isLength({ min: 2, max: 100 }).withMessage('Odpowiedź musi mieć 2-100 znaków')
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

        const { question, answer } = req.body;

        User.setSecurityQuestion(req.userId, question, answer);

        res.json({
            success: true,
            message: 'Pytanie bezpieczeństwa zostało ustawione'
        });
    })
);

/**
 * POST /api/auth/forgot-password
 * Zwraca pytanie bezpieczeństwa dla użytkownika (bez odpowiedzi)
 */
router.post('/forgot-password',
    authLimiter,
    [
        body('username')
            .trim()
            .notEmpty().withMessage('Nazwa użytkownika jest wymagana')
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

        const { username } = req.body;

        const question = User.getSecurityQuestion(username);

        if (!question) {
            return res.status(404).json({
                success: false,
                error: 'Użytkownik nie istnieje lub nie ustawił pytania bezpieczeństwa'
            });
        }

        res.json({
            success: true,
            data: {
                username: username.toLowerCase(),
                securityQuestion: question
            }
        });
    })
);

/**
 * POST /api/auth/reset-password
 * Resetuje hasło po weryfikacji odpowiedzi na pytanie bezpieczeństwa
 */
router.post('/reset-password',
    authLimiter,
    [
        body('username')
            .trim()
            .notEmpty().withMessage('Nazwa użytkownika jest wymagana'),
        body('answer')
            .trim()
            .notEmpty().withMessage('Odpowiedź jest wymagana'),
        body('newPassword')
            .notEmpty().withMessage('Nowe hasło jest wymagane')
            .isLength({ min: 8 }).withMessage('Nowe hasło musi mieć minimum 8 znaków')
            .matches(/[A-Z]/).withMessage('Nowe hasło musi zawierać dużą literę')
            .matches(/[a-z]/).withMessage('Nowe hasło musi zawierać małą literę')
            .matches(/[0-9]/).withMessage('Nowe hasło musi zawierać cyfrę')
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

        const { username, answer, newPassword } = req.body;

        // Weryfikujemy odpowiedź na pytanie bezpieczeństwa
        const isValid = User.verifySecurityAnswer(username, answer);
        if (!isValid) {
            return res.status(401).json({
                success: false,
                error: 'Nieprawidłowa odpowiedź na pytanie bezpieczeństwa'
            });
        }

        // Resetujemy hasło
        const success = User.resetPassword(username, newPassword);
        if (!success) {
            return res.status(404).json({
                success: false,
                error: 'Użytkownik nie istnieje'
            });
        }

        // Logujemy reset hasła
        const user = User.findByUsername(username);
        if (user) {
            ActivityLog.logSecurityEvent('password_reset', getClientIp(req), {
                userId: user.id,
                username: user.username
            });
        }

        res.json({
            success: true,
            message: 'Hasło zostało zresetowane pomyślnie'
        });
    })
);

// ============================================
// CAPTCHA
// ============================================

/**
 * GET /api/auth/captcha
 * Generuje wyzwanie CAPTCHA (math challenge)
 * Zwraca: { id, question }
 */
router.get('/captcha',
    asyncHandler(async (req, res) => {
        const challenge = generateChallenge();

        res.json({
            success: true,
            data: {
                id: challenge.id,
                question: challenge.question
            }
        });
    })
);

// ============================================
// APELE OD BANOW
// ============================================

/**
 * POST /api/auth/appeal
 * Skladanie apelu od bana (uzytkownik)
 * Wymaga: username, reason
 * Rate limited: authLimiter
 */
router.post('/appeal',
    authLimiter,
    [
        body('username')
            .trim()
            .notEmpty().withMessage('Nazwa użytkownika jest wymagana'),
        body('reason')
            .trim()
            .notEmpty().withMessage('Powód apelu jest wymagany')
            .isLength({ min: 10, max: 2000 }).withMessage('Powód apelu musi mieć 10-2000 znaków')
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

        const { username, reason } = req.body;

        // Znajdz uzytkownika
        const user = User.findByUsername(username);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Użytkownik nie istnieje'
            });
        }

        if (!user.is_banned) {
            return res.status(400).json({
                success: false,
                error: 'Użytkownik nie jest zbanowany'
            });
        }

        try {
            const appeal = BanAppeal.create({
                userId: user.id,
                reason
            });

            ActivityLog.logSecurityEvent('ban_appeal_submitted', getClientIp(req), {
                userId: user.id,
                username: user.username,
                appealId: appeal.id
            });

            res.status(201).json({
                success: true,
                message: 'Apel został złożony i oczekuje na rozpatrzenie',
                data: {
                    id: appeal.id,
                    status: appeal.status,
                    createdAt: appeal.created_at
                }
            });
        } catch (error) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
    })
);

export default router;
