/**
 * Trasy pobierania plików
 * Serwuje pliki modów i innych zasobów
 */
import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { Mod, Skin } from '../models/index.js';
import { downloadLimiter } from '../middleware/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getModsPath, getServerSubPath } from '../utils/helpers.js';

const router = Router();

// Stosujemy rate limiting dla wszystkich pobrań
router.use(downloadLimiter);

/**
 * Weryfikuje że ścieżka pliku nie wychodzi poza dozwolony katalog
 * @param {string} baseDir - Dozwolony katalog bazowy
 * @param {string} filename - Nazwa pliku do sprawdzenia
 * @returns {string|null} Bezpieczna ścieżka lub null
 */
function safePath(baseDir, filename) {
    // Podstawowa walidacja nazwy pliku
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return null;
    }

    const resolvedBase = path.resolve(baseDir);
    const resolvedPath = path.resolve(baseDir, filename);

    // Sprawdź czy ścieżka jest w dozwolonym katalogu
    if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
        return null;
    }

    return resolvedPath;
}

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

    // Ścieżka do pliku z ochroną path traversal
    const filePath = safePath(getModsPath(), filename);
    if (!filePath) {
        return res.status(400).json({ success: false, error: 'Nieprawidłowa nazwa pliku' });
    }

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

    const filePath = safePath(getModsPath(), filename);
    if (!filePath || !fs.existsSync(filePath)) {
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
 * GET /api/download/servers/:serverId/mods/:filename
 * Pobiera plik moda z folderu konkretnego serwera
 */
router.get('/servers/:serverId/mods/:filename', asyncHandler(async (req, res) => {
    const { serverId, filename } = req.params;

    // Sprawdzamy czy mod istnieje w bazie i jest włączony
    const mod = Mod.findByFilename(filename);
    if (!mod) {
        return res.status(404).json({ success: false, error: 'Plik nie istnieje' });
    }
    if (!mod.is_enabled) {
        return res.status(403).json({ success: false, error: 'Plik jest niedostępny' });
    }

    // Ścieżka do pliku w folderze serwera
    const serverModsPath = getServerSubPath(parseInt(serverId), 'mods');
    const filePath = safePath(serverModsPath, filename);
    if (!filePath) {
        return res.status(400).json({ success: false, error: 'Nieprawidłowa nazwa pliku' });
    }

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'Plik nie został znaleziony na serwerze' });
    }

    const stat = fs.statSync(filePath);

    res.setHeader('Content-Type', 'application/java-archive');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-SHA256', mod.sha256);

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
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
    }
}));

/**
 * HEAD /api/download/servers/:serverId/mods/:filename
 * Sprawdza informacje o pliku w folderze serwera
 */
router.head('/servers/:serverId/mods/:filename', asyncHandler(async (req, res) => {
    const { serverId, filename } = req.params;

    const mod = Mod.findByFilename(filename);
    if (!mod || !mod.is_enabled) {
        return res.status(404).end();
    }

    const serverModsPath = getServerSubPath(parseInt(serverId), 'mods');
    const filePath = safePath(serverModsPath, filename);
    if (!filePath || !fs.existsSync(filePath)) {
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
 * GET /api/download/servers/:serverId/files/:type/(*)
 * Pobiera dowolny plik z folderu serwera (config, resourcepacks, shaderpacks, scripts, kubejs)
 */
router.get('/servers/:serverId/files/:type/*', asyncHandler(async (req, res) => {
    const { serverId, type } = req.params;
    const relativePath = req.params[0]; // everything after /type/

    const allowedTypes = ['config', 'resourcepacks', 'shaderpacks', 'scripts', 'kubejs'];
    if (!allowedTypes.includes(type)) {
        return res.status(400).json({ success: false, error: 'Nieznany typ pliku' });
    }

    const serverTypePath = getServerSubPath(parseInt(serverId), type);
    const filePath = path.resolve(serverTypePath, relativePath);

    // Path traversal protection
    if (!filePath.startsWith(serverTypePath)) {
        return res.status(400).json({ success: false, error: 'Nieprawidłowa ścieżka' });
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return res.status(404).json({ success: false, error: 'Plik nie istnieje' });
    }

    const stat = fs.statSync(filePath);
    const filename = path.basename(filePath);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    fs.createReadStream(filePath).pipe(res);
}));

/**
 * GET /api/download/launcher/:filename
 * Pobiera plik launchera (dla auto-update)
 */
router.get('/launcher/:filename', asyncHandler(async (req, res) => {
    const { filename } = req.params;

    // Ścieżka do plików launchera z ochroną path traversal
    const launcherPath = path.join(getModsPath(), '..', 'launcher');
    const filePath = safePath(launcherPath, filename);
    if (!filePath) {
        return res.status(400).json({ success: false, error: 'Nieprawidłowa nazwa pliku' });
    }

    // Sprawdzamy czy plik istnieje
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            error: 'Plik launchera nie został znaleziony'
        });
    }

    const stat = fs.statSync(filePath);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Accept-Ranges', 'bytes');

    // Obsługujemy zakresowe pobieranie (Range requests) dla resume
    const range = req.headers.range;
    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunkSize = end - start + 1;

        res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
        res.setHeader('Content-Length', chunkSize);
        res.status(206);

        const stream = fs.createReadStream(filePath, { start, end });
        stream.pipe(res);
    } else {
        res.setHeader('Content-Length', stat.size);
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
    }
}));

/**
 * GET /api/download/skins/:filename
 * Pobiera plik skina gracza
 */
router.get('/skins/:filename', asyncHandler(async (req, res) => {
    const { filename } = req.params;

    // Ścieżka z ochroną path traversal
    const filePath = safePath(Skin.getSkinsPath(), filename);
    if (!filePath) {
        return res.status(400).json({ success: false, error: 'Nieprawidlowa nazwa pliku' });
    }

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            error: 'Plik skina nie zostal znaleziony'
        });
    }

    const stat = fs.statSync(filePath);

    // Ustawiamy naglowki
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache 5 minut

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
}));

/**
 * GET /api/download/capes/:filename
 * Pobiera plik peleryny gracza
 */
router.get('/capes/:filename', asyncHandler(async (req, res) => {
    const { filename } = req.params;

    // Ścieżka z ochroną path traversal
    const filePath = safePath(Skin.getCapesPath(), filename);
    if (!filePath) {
        return res.status(400).json({ success: false, error: 'Nieprawidlowa nazwa pliku' });
    }

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            error: 'Plik peleryny nie zostal znaleziony'
        });
    }

    const stat = fs.statSync(filePath);

    // Ustawiamy naglowki
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache 5 minut

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
}));

export default router;
