/**
 * Trasy zarządzania modami
 * /mods CRUD, upload, sync, verify, recalculate-sha256
 */
import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Mod, ActivityLog } from '../../models/index.js';
import { authenticateAdmin } from '../../middleware/index.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import {
    calculateSHA256, sanitizeFilename, isAllowedModFile,
    getModsPath, ensureDir, getClientIp, formatFileSize, verifyFileSHA256
} from '../../utils/helpers.js';

const router = Router();

// Konfiguracja multer dla uploadu plików
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const modsPath = getModsPath();
        ensureDir(modsPath);
        cb(null, modsPath);
    },
    filename: (req, file, cb) => {
        const safeName = sanitizeFilename(file.originalname);
        cb(null, safeName);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 100) * 1024 * 1024 // Domyślnie 100MB
    },
    fileFilter: (req, file, cb) => {
        if (isAllowedModFile(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('Dozwolone są tylko pliki .jar i .zip'), false);
        }
    }
});

/**
 * GET /api/admin/mods
 * Lista wszystkich modów
 */
router.get('/mods', asyncHandler(async (req, res) => {
    const mods = Mod.getAll();

    res.json({
        success: true,
        data: mods.map(mod => ({
            ...mod,
            fileSizeFormatted: formatFileSize(mod.file_size)
        }))
    });
}));

/**
 * POST /api/admin/mods
 * Dodaje nowy mod (przez upload pliku)
 */
router.post('/mods',
    upload.single('file'),
    asyncHandler(async (req, res) => {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Nie przesłano pliku'
            });
        }

        const { name, description, is_required, mod_type } = req.body;
        const filePath = req.file.path;
        const filename = req.file.filename;

        // Obliczamy sumę kontrolną
        const sha256 = await calculateSHA256(filePath);

        // Sprawdzamy czy mod już istnieje
        const existingMod = Mod.findByFilename(filename);
        if (existingMod) {
            // Usuwamy przesłany plik
            fs.unlinkSync(filePath);
            return res.status(409).json({
                success: false,
                error: 'Mod o tej nazwie już istnieje'
            });
        }

        // Tworzymy wpis w bazie
        const mod = Mod.create({
            name: name || filename.replace(/\.[^.]+$/, ''),
            filename,
            url: `/api/download/mods/${filename}`,
            sha256,
            file_size: req.file.size,
            is_required: is_required === 'true' || is_required === true,
            mod_type: mod_type || 'mod',
            description
        });

        ActivityLog.logAdminAction('mod_upload', {
            modId: mod.id,
            filename
        }, getClientIp(req));

        res.status(201).json({
            success: true,
            message: 'Mod został dodany',
            data: mod
        });
    })
);

/**
 * POST /api/admin/mods/url
 * Dodaje mod przez URL (zewnętrzny link)
 */
router.post('/mods/url',
    [
        body('name').trim().notEmpty().withMessage('Nazwa jest wymagana'),
        body('filename').trim().notEmpty().withMessage('Nazwa pliku jest wymagana'),
        body('url').isURL().withMessage('Nieprawidłowy URL'),
        body('sha256').isLength({ min: 64, max: 64 }).withMessage('Nieprawidłowa suma SHA256')
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

        const { name, filename, url, sha256, file_size, is_required, mod_type, description } = req.body;

        // Sprawdzamy czy mod już istnieje
        if (Mod.findByFilename(filename)) {
            return res.status(409).json({
                success: false,
                error: 'Mod o tej nazwie już istnieje'
            });
        }

        const mod = Mod.create({
            name,
            filename,
            url,
            sha256,
            file_size: file_size || 0,
            is_required: is_required !== false,
            mod_type: mod_type || 'mod',
            description
        });

        ActivityLog.logAdminAction('mod_add_url', {
            modId: mod.id,
            filename,
            url
        }, getClientIp(req));

        res.status(201).json({
            success: true,
            message: 'Mod został dodany',
            data: mod
        });
    })
);

/**
 * PUT /api/admin/mods/:id
 * Aktualizuje mod
 */
router.put('/mods/:id', asyncHandler(async (req, res) => {
    const modId = parseInt(req.params.id);
    const mod = Mod.findById(modId);

    if (!mod) {
        return res.status(404).json({
            success: false,
            error: 'Mod nie istnieje'
        });
    }

    const updated = Mod.update(modId, req.body);

    ActivityLog.logAdminAction('mod_update', {
        modId,
        changes: req.body
    }, getClientIp(req));

    res.json({
        success: true,
        message: 'Mod został zaktualizowany',
        data: updated
    });
}));

/**
 * POST /api/admin/mods/:id/toggle
 * Włącza/wyłącza mod
 */
router.post('/mods/:id/toggle', asyncHandler(async (req, res) => {
    const modId = parseInt(req.params.id);
    const mod = Mod.findById(modId);

    if (!mod) {
        return res.status(404).json({
            success: false,
            error: 'Mod nie istnieje'
        });
    }

    const newState = !mod.is_enabled;
    Mod.setEnabled(modId, newState);

    ActivityLog.logAdminAction('mod_toggle', {
        modId,
        enabled: newState
    }, getClientIp(req));

    res.json({
        success: true,
        message: newState ? 'Mod został włączony' : 'Mod został wyłączony',
        data: { enabled: newState }
    });
}));

/**
 * DELETE /api/admin/mods/:id
 * Usuwa mod
 */
router.delete('/mods/:id', asyncHandler(async (req, res) => {
    const modId = parseInt(req.params.id);
    const mod = Mod.findById(modId);

    if (!mod) {
        return res.status(404).json({
            success: false,
            error: 'Mod nie istnieje'
        });
    }

    // Usuwamy plik jeśli jest lokalny
    if (mod.url && mod.url.startsWith('/api/download/mods/')) {
        const filePath = path.join(getModsPath(), mod.filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    Mod.delete(modId);

    ActivityLog.logAdminAction('mod_delete', {
        modId,
        filename: mod.filename
    }, getClientIp(req));

    res.json({
        success: true,
        message: 'Mod został usunięty'
    });
}));

/**
 * POST /api/admin/mods/sync
 * Synchronizuje listę modów z plikami na dysku
 */
router.post('/mods/sync', asyncHandler(async (req, res) => {
    const modsPath = getModsPath();
    ensureDir(modsPath);

    const filesOnDisk = fs.readdirSync(modsPath).filter(f =>
        f.endsWith('.jar') || f.endsWith('.zip')
    );

    const modsInDb = Mod.getAll();
    const dbFilenames = new Set(modsInDb.map(m => m.filename));
    const diskFilenames = new Set(filesOnDisk);

    const results = { added: 0, removed: 0 };

    // 1. Dodaj nowe pliki
    for (const filename of filesOnDisk) {
        if (!dbFilenames.has(filename)) {
            const filePath = path.join(modsPath, filename);
            const sha256 = await calculateSHA256(filePath);
            const stats = fs.statSync(filePath);

            Mod.create({
                name: filename.replace(/\.[^.]+$/, ''),
                filename,
                url: `/api/download/mods/${filename}`,
                sha256,
                file_size: stats.size,
                is_required: true,
                mod_type: 'mod',
                description: 'Zsynchornizowano automatycznie'
            });
            results.added++;
        }
    }

    // 2. Usuń nieistniejące pliki z bazy (tylko te lokalne)
    for (const mod of modsInDb) {
        if (mod.url && mod.url.startsWith('/api/download/mods/') && !diskFilenames.has(mod.filename)) {
            Mod.delete(mod.id);
            results.removed++;
        }
    }

    ActivityLog.logAdminAction('mods_sync', results, getClientIp(req));

    res.json({
        success: true,
        message: `Synchronizacja zakończona: Dodano ${results.added}, usunięto ${results.removed}`,
        data: results
    });
}));

/**
 * POST /api/admin/mods/verify
 * Weryfikuje integralność wszystkich modów na serwerze
 * Porównuje pliki z sumami SHA256 w bazie danych
 */
router.post('/mods/verify',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const modsPath = getModsPath();
        const modsInDb = Mod.getAll();

        const results = {
            verified: [],      // Pliki z poprawnymi checksumami
            corrupted: [],     // Pliki z nieprawidłowymi checksumami
            missing: [],       // Pliki w bazie ale nie na dysku
            orphaned: [],      // Pliki na dysku ale nie w bazie
            errors: []         // Błędy weryfikacji
        };

        // Pobierz pliki na dysku
        let filesOnDisk = [];
        if (fs.existsSync(modsPath)) {
            filesOnDisk = fs.readdirSync(modsPath)
                .filter(f => isAllowedModFile(f));
        }
        const diskFilenames = new Set(filesOnDisk);

        // Weryfikuj każdy mod z bazy
        for (const mod of modsInDb) {
            const filePath = path.join(modsPath, mod.filename);

            // Tylko lokalne pliki (nie zewnętrzne URL)
            if (mod.url && !mod.url.startsWith('/api/download/mods/')) {
                // Pomiń zewnętrzne mody - nie możemy ich weryfikować
                continue;
            }

            const verification = await verifyFileSHA256(filePath, mod.sha256);

            if (verification.error === 'file_not_found') {
                results.missing.push({
                    id: mod.id,
                    filename: mod.filename,
                    expectedSha256: mod.sha256
                });
            } else if (!verification.valid) {
                results.corrupted.push({
                    id: mod.id,
                    filename: mod.filename,
                    expectedSha256: mod.sha256,
                    actualSha256: verification.actual
                });
            } else {
                results.verified.push({
                    id: mod.id,
                    filename: mod.filename,
                    sha256: mod.sha256
                });
            }

            // Usuń z listy dyskowej
            diskFilenames.delete(mod.filename);
        }

        // Pozostałe pliki na dysku to "orphaned" (nie w bazie)
        for (const filename of diskFilenames) {
            const filePath = path.join(modsPath, filename);
            try {
                const sha256 = await calculateSHA256(filePath);
                const stats = fs.statSync(filePath);
                results.orphaned.push({
                    filename,
                    sha256,
                    size: stats.size
                });
            } catch (error) {
                results.errors.push({
                    filename,
                    error: error.message
                });
            }
        }

        // Loguj akcję
        ActivityLog.logAdminAction('mods_verify', {
            verified: results.verified.length,
            corrupted: results.corrupted.length,
            missing: results.missing.length,
            orphaned: results.orphaned.length
        }, getClientIp(req));

        res.json({
            success: true,
            message: `Weryfikacja zakończona: ${results.verified.length} OK, ${results.corrupted.length} uszkodzonych, ${results.missing.length} brakujących`,
            data: results
        });
    })
);

/**
 * POST /api/admin/mods/:id/recalculate-sha256
 * Przelicza SHA256 dla konkretnego moda i aktualizuje w bazie
 */
router.post('/mods/:id/recalculate-sha256',
    authenticateAdmin,
    [
        param('id').isInt().withMessage('ID musi być liczbą całkowitą')
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

        const { id } = req.params;
        const mod = Mod.findById(parseInt(id));

        if (!mod) {
            return res.status(404).json({
                success: false,
                error: 'Mod nie znaleziony'
            });
        }

        const filePath = path.join(getModsPath(), mod.filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                error: 'Plik moda nie istnieje na serwerze'
            });
        }

        try {
            const newSha256 = await calculateSHA256(filePath);
            const stats = fs.statSync(filePath);

            // Aktualizuj w bazie
            Mod.update(parseInt(id), {
                sha256: newSha256,
                file_size: stats.size
            });

            ActivityLog.logAdminAction('mod_sha256_recalculate', {
                modId: id,
                filename: mod.filename,
                oldSha256: mod.sha256,
                newSha256
            }, getClientIp(req));

            res.json({
                success: true,
                message: 'SHA256 zaktualizowany',
                data: {
                    filename: mod.filename,
                    oldSha256: mod.sha256,
                    newSha256,
                    size: stats.size
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: `Błąd przeliczania SHA256: ${error.message}`
            });
        }
    })
);

export default router;
