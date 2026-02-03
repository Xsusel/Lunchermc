/**
 * Trasy zarządzania plikami (configs, resourcepacks, shaderpacks, itp.)
 * Obsługa paczek i synchronizacji folderów
 */
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { authenticateAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ensureDir, calculateSHA256, sanitizeFilename } from '../utils/helpers.js';
import db from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Ścieżka bazowa dla plików
const FILES_BASE_PATH = path.join(__dirname, '../../uploads');

// Typy plików i ich foldery
const FILE_TYPES = {
    datapacks: { folder: 'datapacks', extensions: ['.zip', '.json', '.mcfunction'] },
    defaultconfigs: { folder: 'defaultconfigs', extensions: ['.json', '.toml', '.cfg', '.properties', '.txt', '.yaml', '.yml'] },
    configs: { folder: 'config', extensions: ['.json', '.toml', '.cfg', '.properties', '.txt', '.yaml', '.yml'] },
    resourcepacks: { folder: 'resourcepacks', extensions: ['.zip'] },
    shaderpacks: { folder: 'shaderpacks', extensions: ['.zip'] },
    scripts: { folder: 'scripts', extensions: ['.zs', '.js'] }
};

// Tworzenie tabel dla różnych typów plików
const initFileTables = () => {
    db.exec(`
        CREATE TABLE IF NOT EXISTS game_files_extended (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_type TEXT NOT NULL,
            name TEXT NOT NULL,
            filename TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            url TEXT,
            sha256 TEXT NOT NULL,
            file_size INTEGER DEFAULT 0,
            is_enabled INTEGER DEFAULT 1,
            is_required INTEGER DEFAULT 1,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(file_type, filename)
        )
    `);
};

initFileTables();

// Konfiguracja multer dla różnych typów plików
const createStorage = (fileType) => {
    const folderPath = path.join(FILES_BASE_PATH, FILE_TYPES[fileType]?.folder || fileType);
    ensureDir(folderPath);

    return multer.diskStorage({
        destination: (req, file, cb) => cb(null, folderPath),
        filename: (req, file, cb) => cb(null, sanitizeFilename(file.originalname))
    });
};

const createUpload = (fileType) => {
    const typeConfig = FILE_TYPES[fileType];
    if (!typeConfig) return null;

    return multer({
        storage: createStorage(fileType),
        limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
        fileFilter: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            if (typeConfig.extensions.includes(ext)) {
                cb(null, true);
            } else {
                cb(new Error(`Niedozwolone rozszerzenie. Dozwolone: ${typeConfig.extensions.join(', ')}`), false);
            }
        }
    });
};

// ============================================
// ENDPOINTY PUBLICZNE (dla launchera)
// ============================================

/**
 * GET /api/files/manifest
 * Pobiera pełny manifest wszystkich plików do synchronizacji
 */
router.get('/manifest', asyncHandler(async (req, res) => {
    const files = db.prepare(`
        SELECT * FROM game_files_extended WHERE is_enabled = 1
        ORDER BY file_type, name
    `).all();

    // Grupuj po typie
    const manifest = {};
    for (const file of files) {
        if (!manifest[file.file_type]) {
            manifest[file.file_type] = [];
        }
        manifest[file.file_type].push({
            name: file.name,
            filename: file.filename,
            path: file.relative_path,
            url: file.url || `/api/files/download/${file.file_type}/${file.filename}`,
            sha256: file.sha256,
            size: file.file_size,
            required: !!file.is_required
        });
    }

    res.json({
        success: true,
        data: {
            manifest,
            generatedAt: new Date().toISOString()
        }
    });
}));

/**
 * GET /api/files/download/:type/:filename
 * Pobiera plik
 */
router.get('/download/:type/:filename', asyncHandler(async (req, res) => {
    const { type, filename } = req.params;

    if (!FILE_TYPES[type]) {
        return res.status(400).json({
            success: false,
            error: 'Nieznany typ pliku'
        });
    }

    const filePath = path.join(FILES_BASE_PATH, FILE_TYPES[type].folder, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            error: 'Plik nie istnieje'
        });
    }

    const stat = fs.statSync(filePath);

    // Pobierz SHA256 z bazy
    const fileRecord = db.prepare(`
        SELECT sha256 FROM game_files_extended WHERE file_type = ? AND filename = ?
    `).get(type, filename);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (fileRecord?.sha256) {
        res.setHeader('X-SHA256', fileRecord.sha256);
    }

    fs.createReadStream(filePath).pipe(res);
}));

// ============================================
// ENDPOINTY ADMINA
// ============================================

router.use(authenticateAdmin);

/**
 * GET /api/files/admin/list/:type
 * Lista plików danego typu
 */
router.get('/admin/list/:type', asyncHandler(async (req, res) => {
    const { type } = req.params;

    if (!FILE_TYPES[type]) {
        return res.status(400).json({
            success: false,
            error: 'Nieznany typ pliku'
        });
    }

    const files = db.prepare(`
        SELECT * FROM game_files_extended WHERE file_type = ?
        ORDER BY name ASC
    `).all(type);

    res.json({
        success: true,
        data: files.map(f => ({
            ...f,
            fileSizeFormatted: formatBytes(f.file_size)
        }))
    });
}));

/**
 * POST /api/files/admin/upload/:type
 * Upload pliku
 */
router.post('/admin/upload/:type', asyncHandler(async (req, res) => {
    const { type } = req.params;

    if (!FILE_TYPES[type]) {
        return res.status(400).json({
            success: false,
            error: 'Nieznany typ pliku'
        });
    }

    const upload = createUpload(type);
    if (!upload) {
        return res.status(500).json({
            success: false,
            error: 'Błąd konfiguracji uploadu'
        });
    }

    upload.single('file')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({
                success: false,
                error: err.message
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Nie przesłano pliku'
            });
        }

        const { name, description, is_required } = req.body;
        const filePath = req.file.path;
        const filename = req.file.filename;
        const sha256 = await calculateSHA256(filePath);

        // Sprawdź czy plik już istnieje
        const existing = db.prepare(`
            SELECT id FROM game_files_extended WHERE file_type = ? AND filename = ?
        `).get(type, filename);

        if (existing) {
            // Aktualizuj istniejący
            db.prepare(`
                UPDATE game_files_extended
                SET sha256 = ?, file_size = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(sha256, req.file.size, existing.id);

            return res.json({
                success: true,
                message: 'Plik zaktualizowany',
                data: { id: existing.id, filename }
            });
        }

        // Dodaj nowy
        const result = db.prepare(`
            INSERT INTO game_files_extended (file_type, name, filename, relative_path, sha256, file_size, is_required, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            type,
            name || filename.replace(/\.[^.]+$/, ''),
            filename,
            `${FILE_TYPES[type].folder}/${filename}`,
            sha256,
            req.file.size,
            is_required === 'true' || is_required === true ? 1 : 0,
            description || null
        );

        res.status(201).json({
            success: true,
            message: 'Plik dodany',
            data: { id: result.lastInsertRowid, filename }
        });
    });
}));

/**
 * POST /api/files/admin/sync
 * Synchronizuje bazę danych z plikami na dysku
 * Skanuje foldery i dodaje/usuwa wpisy
 */
router.post('/admin/sync', asyncHandler(async (req, res) => {
    const results = {
        added: [],
        removed: [],
        updated: []
    };

    for (const [type, config] of Object.entries(FILE_TYPES)) {
        const folderPath = path.join(FILES_BASE_PATH, config.folder);
        ensureDir(folderPath);

        // Pobierz pliki z dysku
        const filesOnDisk = fs.readdirSync(folderPath).filter(f => {
            const ext = path.extname(f).toLowerCase();
            return config.extensions.includes(ext);
        });

        // Pobierz pliki z bazy
        const filesInDb = db.prepare(`
            SELECT id, filename, sha256 FROM game_files_extended WHERE file_type = ?
        `).all(type);

        const dbFilenames = new Set(filesInDb.map(f => f.filename));
        const diskFilenames = new Set(filesOnDisk);

        // Dodaj brakujące pliki (są na dysku, nie ma w bazie)
        for (const filename of filesOnDisk) {
            if (!dbFilenames.has(filename)) {
                const filePath = path.join(folderPath, filename);
                const stat = fs.statSync(filePath);
                const sha256 = await calculateSHA256(filePath);

                db.prepare(`
                    INSERT INTO game_files_extended (file_type, name, filename, relative_path, sha256, file_size)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(
                    type,
                    filename.replace(/\.[^.]+$/, ''),
                    filename,
                    `${config.folder}/${filename}`,
                    sha256,
                    stat.size
                );

                results.added.push({ type, filename });
            }
        }

        // Usuń nieistniejące pliki (są w bazie, nie ma na dysku)
        for (const file of filesInDb) {
            if (!diskFilenames.has(file.filename)) {
                db.prepare('DELETE FROM game_files_extended WHERE id = ?').run(file.id);
                results.removed.push({ type, filename: file.filename });
            }
        }

        // Sprawdź czy SHA256 się zgadza
        for (const file of filesInDb) {
            if (diskFilenames.has(file.filename)) {
                const filePath = path.join(folderPath, file.filename);
                const currentSha256 = await calculateSHA256(filePath);

                if (currentSha256 !== file.sha256) {
                    const stat = fs.statSync(filePath);
                    db.prepare(`
                        UPDATE game_files_extended
                        SET sha256 = ?, file_size = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `).run(currentSha256, stat.size, file.id);

                    results.updated.push({ type, filename: file.filename });
                }
            }
        }
    }

    res.json({
        success: true,
        message: 'Synchronizacja zakończona',
        data: results
    });
}));

/**
 * DELETE /api/files/admin/:type/:id
 * Usuwa plik
 */
router.delete('/admin/:type/:id', asyncHandler(async (req, res) => {
    const { type, id } = req.params;

    const file = db.prepare(`
        SELECT * FROM game_files_extended WHERE id = ? AND file_type = ?
    `).get(parseInt(id), type);

    if (!file) {
        return res.status(404).json({
            success: false,
            error: 'Plik nie istnieje'
        });
    }

    // Usuń plik z dysku
    const filePath = path.join(FILES_BASE_PATH, file.relative_path);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }

    // Usuń z bazy
    db.prepare('DELETE FROM game_files_extended WHERE id = ?').run(parseInt(id));

    res.json({
        success: true,
        message: 'Plik usunięty'
    });
}));

/**
 * PUT /api/files/admin/:type/:id/toggle
 * Włącza/wyłącza plik
 */
router.put('/admin/:type/:id/toggle', asyncHandler(async (req, res) => {
    const { type, id } = req.params;

    const file = db.prepare(`
        SELECT is_enabled FROM game_files_extended WHERE id = ? AND file_type = ?
    `).get(parseInt(id), type);

    if (!file) {
        return res.status(404).json({
            success: false,
            error: 'Plik nie istnieje'
        });
    }

    const newState = file.is_enabled ? 0 : 1;
    db.prepare(`
        UPDATE game_files_extended SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(newState, parseInt(id));

    res.json({
        success: true,
        message: newState ? 'Plik włączony' : 'Plik wyłączony'
    });
}));

/**
 * GET /api/files/admin/stats
 * Statystyki plików
 */
router.get('/admin/stats', asyncHandler(async (req, res) => {
    const stats = {};

    for (const type of Object.keys(FILE_TYPES)) {
        const result = db.prepare(`
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN is_enabled = 1 THEN 1 ELSE 0 END) as enabled,
                SUM(file_size) as totalSize
            FROM game_files_extended WHERE file_type = ?
        `).get(type);

        stats[type] = {
            total: result.total || 0,
            enabled: result.enabled || 0,
            totalSize: result.totalSize || 0,
            totalSizeFormatted: formatBytes(result.totalSize || 0)
        };
    }

    res.json({
        success: true,
        data: stats
    });
}));

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default router;
