/**
 * Trasy autoryzacji admina
 * POST /login, POST /2fa/verify-login
 */
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import { Admin, ActivityLog } from '../../models/index.js';
import { generateAdminToken, authLimiter } from '../../middleware/index.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { getClientIp } from '../../utils/helpers.js';

const router = Router();

/**
 * POST /api/admin/login
 * Logowanie administratora
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
        const admin = Admin.verifyPassword(username, password);

        if (!admin) {
            return res.status(401).json({
                success: false,
                error: 'Nieprawidłowe dane logowania'
            });
        }

        // Sprawdzamy czy 2FA jest włączone
        if (Admin.is2FAEnabled(admin.id)) {
            // Generujemy tymczasowy token (5 minut)
            const tempToken = jwt.sign(
                {
                    id: admin.id,
                    username: admin.username,
                    type: 'admin_2fa_pending'
                },
                process.env.JWT_SECRET,
                { expiresIn: '5m' }
            );

            return res.json({
                success: true,
                data: {
                    requires2FA: true,
                    tempToken
                }
            });
        }

        // Logujemy akcję
        ActivityLog.logAdminAction('login', { admin: username }, getClientIp(req));

        const token = generateAdminToken(admin, getClientIp(req));

        res.json({
            success: true,
            data: {
                admin: {
                    id: admin.id,
                    username: admin.username,
                    role: admin.role || 'admin'
                },
                token
            }
        });
    })
);

/**
 * POST /api/admin/2fa/verify-login
 * Weryfikuje kod 2FA podczas logowania i zwraca pełny token
 */
router.post('/2fa/verify-login',
    authLimiter,
    [
        body('tempToken').notEmpty().withMessage('Token tymczasowy jest wymagany'),
        body('token').trim().notEmpty().withMessage('Kod 2FA jest wymagany')
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

        const { tempToken, token } = req.body;

        // Weryfikujemy tymczasowy token
        let decoded;
        try {
            decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
        } catch (error) {
            return res.status(401).json({
                success: false,
                error: 'Token tymczasowy wygasł lub jest nieprawidłowy'
            });
        }

        if (decoded.type !== 'admin_2fa_pending') {
            return res.status(401).json({
                success: false,
                error: 'Nieprawidłowy typ tokenu'
            });
        }

        const admin = Admin.findById(decoded.id);
        if (!admin) {
            return res.status(401).json({
                success: false,
                error: 'Administrator nie istnieje'
            });
        }

        // Próbujemy weryfikację kodem TOTP
        let verified = Admin.verify2FA(decoded.id, token);

        // Jeśli nie udało się, próbujemy kodem zapasowym
        if (!verified) {
            verified = Admin.verifyBackupCode(decoded.id, token);
        }

        if (!verified) {
            return res.status(401).json({
                success: false,
                error: 'Nieprawidłowy kod 2FA'
            });
        }

        // Logujemy akcję
        ActivityLog.logAdminAction('login', { admin: admin.username, with2FA: true }, getClientIp(req));

        const fullToken = generateAdminToken(admin, getClientIp(req));

        res.json({
            success: true,
            data: {
                admin: {
                    id: admin.id,
                    username: admin.username,
                    role: admin.role || 'admin'
                },
                token: fullToken
            }
        });
    })
);

export default router;
