/**
 * Trasy pobierania plików
 * Serwuje pliki modów i innych zasobów
 */
import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { Mod } from '../models/index.js';
import { downloadLimiter } from '../middleware/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getModsPath } from '../utils/helpers.js';

const router = Router();

// Stosujemy rate limiting dla wszystkich pobrań
router.use(downloadLimiter);

/**
 * GET /api/download/mods/:filename
 * Pobiera plik moda
 */
router.get('/mods/:filename', asyncHandler(async (req, res) => {
    const { filename } = req.params;

    // Sprawdzamy czy mod istnieje w bazie
    const mod = Mod.findByFilename(filename);
    if (!mod) {
        return res.status(404).json({
            success: false,
            error: 'Plik nie istnieje'
        });
    }

    // Sprawdzamy czy mod jest włączony
    if (!mod.is_enabled) {
        return res.status(403).json({
            success: false,
            error: 'Plik jest niedostępny'
        });
    }

    // Ścieżka do pliku
    const filePath = path.join(getModsPath(), filename);

    // Sprawdzamy czy plik istnieje na dysku
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            error: 'Plik nie został znaleziony na serwerze'
        });
    }

    // Pobieramy informacje o pliku
    const stat = fs.statSync(filePath);

    // Ustawiamy nagłówki
    res.setHeader('Content-Type', 'application/java-archive');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-SHA256', mod.sha256);

    // Obsługujemy zakresowe pobieranie (Range requests)
    const range = req.headers.range;
    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunkSize = end - start + 1;

        res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', chunkSize);
        res.status(206);

        const stream = fs.createReadStream(filePath, { start, end });
        stream.pipe(res);
    } else {
        // Standardowe pobieranie
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
    }
}));

/**
 * HEAD /api/download/mods/:filename
 * Sprawdza informacje o pliku bez pobierania
 */
router.head('/mods/:filename', asyncHandler(async (req, res) => {
    const { filename } = req.params;

    const mod = Mod.findByFilename(filename);
    if (!mod || !mod.is_enabled) {
        return res.status(404).end();
    }

    const filePath = path.join(getModsPath(), filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).end();
    }

    const stat = fs.statSync(filePath);

    res.setHeader('Content-Type', 'application/java-archive');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('X-SHA256', mod.sha256);
    res.setHeader('Accept-Ranges', 'bytes');
    res.status(200).end();
}));

/**
 * GET /api/download/launcher/:filename
 * Pobiera plik launchera (dla auto-update)
 */
router.get('/launcher/:filename', asyncHandler(async (req, res) => {
    const { filename } = req.params;

    // Ścieżka do plików launchera
    const launcherPath = path.join(getModsPath(), '..', 'launcher');
    const filePath = path.join(launcherPath, filename);

    // Sprawdzamy czy plik istnieje
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            error: 'Plik launchera nie został znaleziony'
        });
    }

    const stat = fs.statSync(filePath);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
}));

export default router;
