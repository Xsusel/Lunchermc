/**
 * Trasy skinów graczy (non-premium)
 * Obsługuje upload, pobieranie i zarządzanie skinami oraz pelerynami
 */
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Skin, User } from '../models/index.js';
import { authenticateUser } from '../middleware/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ensureDir } from '../utils/helpers.js';

const router = Router();

// ============================================
// KONFIGURACJA MULTER DLA SKINÓW
// ============================================

const skinStorage = multer.memoryStorage();

const skinUpload = multer({
    storage: skinStorage,
    limits: {
        fileSize: 64 * 1024 // 64KB max
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'image/png') {
            return cb(new Error('Dozwolone są tylko pliki PNG'), false);
        }
        cb(null, true);
    }
});

// ============================================
// WALIDACJA WYMIAROW PNG
// ============================================

/**
 * Odczytuje wymiary z nagłówka PNG
 * PNG header: 8 bytes signature, then IHDR chunk
 * IHDR: 4 bytes length, 4 bytes type, 4 bytes width, 4 bytes height
 * Width at offset 16, Height at offset 20
 * @param {Buffer} buffer - Bufor pliku PNG
 * @returns {object|null} Wymiary {width, height} lub null
 */
function getPngDimensions(buffer) {
    // Sprawdzamy sygnature PNG (8 bajtow)
    const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    if (buffer.length < 24) return null;

    if (!buffer.subarray(0, 8).equals(pngSignature)) {
        return null;
    }

    // Wymiary sa w IHDR chunk - bajty 16-23
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);

    return { width, height };
}

/**
 * Waliduje wymiary skina Minecraft
 * Dozwolone: 64x64 (nowy format) lub 64x32 (stary format)
 * @param {number} width - Szerokosc
 * @param {number} height - Wysokosc
 * @returns {boolean}
 */
function isValidSkinDimensions(width, height) {
    return (width === 64 && height === 64) || (width === 64 && height === 32);
}

/**
 * Waliduje wymiary peleryny Minecraft
 * Dozwolone: 64x32
 * @param {number} width - Szerokosc
 * @param {number} height - Wysokosc
 * @returns {boolean}
 */
function isValidCapeDimensions(width, height) {
    return width === 64 && height === 32;
}

// ============================================
// PUBLICZNE ENDPOINTY (BEZ AUTORYZACJI)
// ============================================

/**
 * GET /api/skins/:username
 * Pobiera URL skina dla danego gracza
 */
router.get('/:username', asyncHandler(async (req, res) => {
    const { username } = req.params;

    // Sprawdzamy czy gracz istnieje
    const user = User.findByUsername(username);
    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'Gracz nie istnieje'
        });
    }

    const skin = Skin.getByUsername(username);

    if (!skin) {
        return res.json({
            success: true,
            data: {
                username: user.username,
                ...Skin.getDefault()
            }
        });
    }

    res.json({
        success: true,
        data: {
            username: skin.username,
            skin_url: `/api/download/skins/${skin.filename}`,
            skin_type: skin.skin_type,
            cape_url: skin.cape_filename ? `/api/download/capes/${skin.cape_filename}` : null,
            updated_at: skin.updated_at
        }
    });
}));

/**
 * GET /api/skins/:username/cape
 * Pobiera URL peleryny dla danego gracza
 */
router.get('/:username/cape', asyncHandler(async (req, res) => {
    const { username } = req.params;

    const user = User.findByUsername(username);
    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'Gracz nie istnieje'
        });
    }

    const skin = Skin.getByUsername(username);

    if (!skin || !skin.cape_filename) {
        return res.json({
            success: true,
            data: {
                username: user.username,
                cape_url: null,
                has_cape: false
            }
        });
    }

    res.json({
        success: true,
        data: {
            username: skin.username,
            cape_url: `/api/download/capes/${skin.cape_filename}`,
            has_cape: true,
            updated_at: skin.updated_at
        }
    });
}));

// ============================================
// ENDPOINTY WYMAGAJACE AUTORYZACJI
// ============================================

/**
 * POST /api/skins/upload
 * Upload skina (wymaga autoryzacji)
 * Maksymalnie 64KB, format PNG, wymiary 64x64 lub 64x32
 */
router.post('/upload',
    authenticateUser,
    (req, res, next) => {
        skinUpload.single('skin')(req, res, (err) => {
            if (err) {
                if (err instanceof multer.MulterError) {
                    if (err.code === 'LIMIT_FILE_SIZE') {
                        return res.status(400).json({
                            success: false,
                            error: 'Plik jest za duzy. Maksymalny rozmiar to 64KB'
                        });
                    }
                    return res.status(400).json({
                        success: false,
                        error: `Blad uploadu: ${err.message}`
                    });
                }
                return res.status(400).json({
                    success: false,
                    error: err.message
                });
            }
            next();
        });
    },
    asyncHandler(async (req, res) => {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Nie przeslano pliku skina'
            });
        }

        // Walidacja wymiarow PNG
        const dimensions = getPngDimensions(req.file.buffer);
        if (!dimensions) {
            return res.status(400).json({
                success: false,
                error: 'Nieprawidlowy format pliku PNG'
            });
        }

        if (!isValidSkinDimensions(dimensions.width, dimensions.height)) {
            return res.status(400).json({
                success: false,
                error: `Nieprawidlowe wymiary skina: ${dimensions.width}x${dimensions.height}. Dozwolone: 64x64 lub 64x32`
            });
        }

        // Typ skina (classic/slim)
        const skinType = req.body.skin_type === 'slim' ? 'slim' : 'classic';

        // Generujemy nazwe pliku
        const timestamp = Date.now();
        const filename = `${req.user.id}_${timestamp}.png`;

        // Obliczamy SHA256
        const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

        // Zapisujemy plik na dysku
        const skinsDir = Skin.getSkinsPath();
        ensureDir(skinsDir);
        const filePath = path.join(skinsDir, filename);
        fs.writeFileSync(filePath, req.file.buffer);

        // Zapisujemy w bazie danych
        const skin = Skin.upload(req.user.id, filename, sha256, skinType);

        res.json({
            success: true,
            message: 'Skin zostal przeslany',
            data: {
                username: skin.username,
                skin_url: `/api/download/skins/${skin.filename}`,
                skin_type: skin.skin_type,
                sha256: skin.sha256,
                updated_at: skin.updated_at
            }
        });
    })
);

/**
 * POST /api/skins/cape/upload
 * Upload peleryny (wymaga autoryzacji)
 * Maksymalnie 64KB, format PNG, wymiary 64x32
 */
router.post('/cape/upload',
    authenticateUser,
    (req, res, next) => {
        skinUpload.single('cape')(req, res, (err) => {
            if (err) {
                if (err instanceof multer.MulterError) {
                    if (err.code === 'LIMIT_FILE_SIZE') {
                        return res.status(400).json({
                            success: false,
                            error: 'Plik jest za duzy. Maksymalny rozmiar to 64KB'
                        });
                    }
                    return res.status(400).json({
                        success: false,
                        error: `Blad uploadu: ${err.message}`
                    });
                }
                return res.status(400).json({
                    success: false,
                    error: err.message
                });
            }
            next();
        });
    },
    asyncHandler(async (req, res) => {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Nie przeslano pliku peleryny'
            });
        }

        // Walidacja wymiarow PNG
        const dimensions = getPngDimensions(req.file.buffer);
        if (!dimensions) {
            return res.status(400).json({
                success: false,
                error: 'Nieprawidlowy format pliku PNG'
            });
        }

        if (!isValidCapeDimensions(dimensions.width, dimensions.height)) {
            return res.status(400).json({
                success: false,
                error: `Nieprawidlowe wymiary peleryny: ${dimensions.width}x${dimensions.height}. Dozwolone: 64x32`
            });
        }

        // Generujemy nazwe pliku
        const timestamp = Date.now();
        const capeFilename = `cape_${req.user.id}_${timestamp}.png`;

        // Obliczamy SHA256
        const capeSha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

        // Zapisujemy plik na dysku
        const capesDir = Skin.getCapesPath();
        ensureDir(capesDir);
        const filePath = path.join(capesDir, capeFilename);
        fs.writeFileSync(filePath, req.file.buffer);

        // Zapisujemy w bazie danych
        const skin = Skin.uploadCape(req.user.id, capeFilename, capeSha256);

        res.json({
            success: true,
            message: 'Peleryna zostala przeslana',
            data: {
                username: skin.username,
                cape_url: `/api/download/capes/${skin.cape_filename}`,
                cape_sha256: skin.cape_sha256,
                updated_at: skin.updated_at
            }
        });
    })
);

/**
 * DELETE /api/skins
 * Usuwa skin zalogowanego gracza (przywraca domyslny)
 */
router.delete('/',
    authenticateUser,
    asyncHandler(async (req, res) => {
        const deleted = Skin.delete(req.user.id);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                error: 'Nie masz ustawionego skina'
            });
        }

        res.json({
            success: true,
            message: 'Skin zostal usuniety. Przywrocono domyslny skin'
        });
    })
);

/**
 * DELETE /api/skins/cape
 * Usuwa peleryne zalogowanego gracza
 */
router.delete('/cape',
    authenticateUser,
    asyncHandler(async (req, res) => {
        const deleted = Skin.deleteCape(req.user.id);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                error: 'Nie masz ustawionej peleryny'
            });
        }

        res.json({
            success: true,
            message: 'Peleryna zostala usunieta'
        });
    })
);

export default router;
