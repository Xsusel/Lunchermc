/**
 * Trasy CurseForge - wyszukiwanie, import modow i modpackow z CurseForge
 * Wszystkie trasy wymagaja autoryzacji admina (nakladanej przez parent router)
 */
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { Mod, ActivityLog, Server } from '../../models/index.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import {
    calculateSHA256, sanitizeFilename,
    getModsPath, ensureDir, getClientIp,
} from '../../utils/helpers.js';
import {
    searchMods as cfSearchMods,
    searchModpacks as cfSearchModpacks,
    getModById as cfGetModById,
    getModFiles as cfGetModFiles,
    getFileDownloadUrl as cfGetFileDownloadUrl,
    getModpackFiles as cfGetModpackFiles,
    extractModpackManifest as cfExtractModpackManifest,
    getCategories as cfGetCategories,
    getGameVersions as cfGetGameVersions,
    MINECRAFT_GAME_ID,
} from '../../utils/curseforge.js';

const router = Router();

// Sprawdź czy klucz API jest skonfigurowany
router.use((req, res, next) => {
    if (!process.env.CURSEFORGE_API_KEY) {
        return res.status(503).json({
            success: false,
            error: 'Integracja CurseForge nie jest skonfigurowana. Ustaw CURSEFORGE_API_KEY w zmiennych środowiskowych.'
        });
    }
    next();
});

// ============================================
// GET /search - Search mods on CurseForge
// ============================================
router.get('/search', asyncHandler(async (req, res) => {
    const {
        q, gameVersion, modLoaderType,
        category, pageSize, index,
    } = req.query;

    const result = await cfSearchMods(MINECRAFT_GAME_ID, q || '', {
        gameVersion,
        modLoaderType: modLoaderType ? parseInt(modLoaderType) : undefined,
        categoryId: category ? parseInt(category) : undefined,
        pageSize: pageSize ? parseInt(pageSize) : 20,
        index: index ? parseInt(index) : 0,
    });

    res.json({
        success: true,
        data: {
            results: result.data,
            pagination: result.pagination,
        },
    });
}));

// ============================================
// GET /modpacks - Search modpacks on CurseForge
// ============================================
router.get('/modpacks', asyncHandler(async (req, res) => {
    const {
        q, gameVersion, modLoaderType,
        category, pageSize, index,
    } = req.query;

    const result = await cfSearchModpacks(q || '', {
        gameVersion,
        modLoaderType: modLoaderType ? parseInt(modLoaderType) : undefined,
        categoryId: category ? parseInt(category) : undefined,
        pageSize: pageSize ? parseInt(pageSize) : 20,
        index: index ? parseInt(index) : 0,
    });

    res.json({
        success: true,
        data: {
            results: result.data,
            pagination: result.pagination,
        },
    });
}));

// ============================================
// GET /mod/:modId - Get mod details with files
// ============================================
router.get('/mod/:modId', asyncHandler(async (req, res) => {
    const modId = parseInt(req.params.modId);
    if (isNaN(modId)) {
        return res.status(400).json({ success: false, error: 'Invalid modId' });
    }

    const mod = await cfGetModById(modId);
    const files = await cfGetModFiles(modId, { pageSize: 10 });

    res.json({
        success: true,
        data: {
            mod,
            files: files.data,
            pagination: files.pagination,
        },
    });
}));

// ============================================
// GET /mod/:modId/files - Get file list for a mod
// ============================================
router.get('/mod/:modId/files', asyncHandler(async (req, res) => {
    const modId = parseInt(req.params.modId);
    if (isNaN(modId)) {
        return res.status(400).json({ success: false, error: 'Invalid modId' });
    }

    const { gameVersion, modLoaderType, pageSize, index } = req.query;

    const result = await cfGetModFiles(modId, {
        gameVersion,
        modLoaderType: modLoaderType ? parseInt(modLoaderType) : undefined,
        pageSize: pageSize ? parseInt(pageSize) : 20,
        index: index ? parseInt(index) : 0,
    });

    res.json({
        success: true,
        data: {
            files: result.data,
            pagination: result.pagination,
        },
    });
}));

// ============================================
// GET /categories - Get mod categories
// ============================================
router.get('/categories', asyncHandler(async (req, res) => {
    const categories = await cfGetCategories();
    res.json({ success: true, data: categories });
}));

// ============================================
// GET /versions - Get available game versions
// ============================================
router.get('/versions', asyncHandler(async (req, res) => {
    const versions = await cfGetGameVersions();
    res.json({ success: true, data: versions });
}));

// ============================================
// POST /import-mod - Import a single mod from CurseForge
// ============================================
router.post('/import-mod', asyncHandler(async (req, res) => {
    const { modId, fileId, gameVersion } = req.body;

    if (!modId || !fileId) {
        return res.status(400).json({
            success: false,
            error: 'modId and fileId are required',
        });
    }

    // 1. Get mod details from CurseForge
    const cfMod = await cfGetModById(parseInt(modId));

    // 2. Get download URL
    const downloadUrl = await cfGetFileDownloadUrl(parseInt(modId), parseInt(fileId));
    if (!downloadUrl) {
        return res.status(404).json({
            success: false,
            error: 'Download URL not available for this file. The mod author may have disabled direct downloads.',
        });
    }

    // 3. Get file details
    const filesResult = await cfGetModFiles(parseInt(modId), {
        gameVersion,
        pageSize: 50,
    });
    const fileInfo = filesResult.data.find(f => f.id === parseInt(fileId));
    const fileName = fileInfo ? fileInfo.fileName : `${cfMod.slug}-${fileId}.jar`;

    // 4. Prepare destination
    const modsPath = getModsPath();
    ensureDir(modsPath);
    const safeFilename = sanitizeFilename(fileName);
    const destPath = path.join(modsPath, safeFilename);

    // 5. Check if mod with same filename already exists
    const existingMod = Mod.findByFilename(safeFilename);
    if (existingMod) {
        return res.status(409).json({
            success: false,
            error: `Mod with filename "${safeFilename}" already exists (id: ${existingMod.id})`,
        });
    }

    // 6. Download the file
    const downloadResponse = await fetch(downloadUrl);
    if (!downloadResponse.ok) {
        throw new Error(`Failed to download mod: ${downloadResponse.status} ${downloadResponse.statusText}`);
    }

    const arrayBuffer = await downloadResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(destPath, buffer);

    // 7. Calculate SHA256
    const sha256 = await calculateSHA256(destPath);
    const fileSize = buffer.length;

    // 8. Create Mod record in DB
    const mod = Mod.create({
        name: cfMod.name,
        filename: safeFilename,
        url: `/api/download/mods/${safeFilename}`,
        sha256,
        file_size: fileSize,
        is_required: true,
        is_enabled: true,
        mod_type: 'mod',
        description: cfMod.summary || null,
        curseforge_id: parseInt(modId),
        curseforge_file_id: parseInt(fileId),
        curseforge_url: cfMod.links?.websiteUrl || null,
    });

    // 9. Auto-assign to all servers
    try {
        const allServers = Server.getAll();
        for (const server of allServers) {
            Server.assignMod(server.id, mod.id);
        }
    } catch (e) {
        // Non-critical
    }

    // 10. Log the action
    ActivityLog.logAdminAction('curseforge_import_mod', {
        modId: mod.id,
        curseforgeId: modId,
        curseforgeFileId: fileId,
        filename: safeFilename,
        name: cfMod.name,
    }, getClientIp(req));

    res.status(201).json({
        success: true,
        message: `Mod "${cfMod.name}" imported successfully`,
        data: mod,
    });
}));

// ============================================
// POST /import-modpack - Import a modpack from CurseForge
// Downloads the modpack ZIP, reads manifest.json to get the real
// list of mods (projectID + fileID pairs), then downloads each mod.
// ============================================
router.post('/import-modpack', asyncHandler(async (req, res) => {
    const { modId, fileId, gameVersion, includeOptional } = req.body;

    if (!modId || !fileId) {
        return res.status(400).json({
            success: false,
            error: 'modId and fileId are required',
        });
    }

    // 1. Get modpack info
    const cfModpack = await cfGetModById(parseInt(modId));

    // 2. Extract mod list from modpack manifest (downloads ZIP, reads manifest.json)
    let manifestFiles;
    try {
        manifestFiles = await cfExtractModpackManifest(parseInt(modId), parseInt(fileId));
    } catch (err) {
        return res.status(400).json({
            success: false,
            error: `Nie udało się odczytać manifestu modpacka: ${err.message}`,
        });
    }

    if (!manifestFiles || manifestFiles.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'Manifest modpacka nie zawiera żadnych modów.',
        });
    }

    const modsPath = getModsPath();
    ensureDir(modsPath);

    const results = {
        imported: [],
        skipped: [],
        failed: [],
        total: manifestFiles.length,
    };

    // 3. Process each mod from the manifest
    for (const entry of manifestFiles) {
        const projectId = entry.projectID;
        const manifestFileId = entry.fileID;
        const required = entry.required !== false; // default true

        // Skip optional mods if not requested
        if (!required && !includeOptional) {
            results.skipped.push({
                modId: projectId,
                reason: 'Opcjonalny mod (includeOptional=false)',
            });
            continue;
        }

        try {
            // Get mod details from CurseForge
            const depMod = await cfGetModById(projectId);

            // Get file info - use specific fileID from manifest if available
            let depFile;
            if (manifestFileId) {
                try {
                    const fileResult = await cfGetModpackFiles(projectId, manifestFileId);
                    depFile = fileResult;
                } catch {
                    // Fallback: search for latest file for the game version
                    const depFiles = await cfGetModFiles(projectId, {
                        gameVersion,
                        pageSize: 1,
                    });
                    depFile = depFiles.data?.[0];
                }
            } else {
                const depFiles = await cfGetModFiles(projectId, {
                    gameVersion,
                    pageSize: 1,
                });
                depFile = depFiles.data?.[0];
            }

            if (!depFile) {
                results.failed.push({
                    modId: projectId,
                    name: depMod.name,
                    error: `Nie znaleziono pliku moda`,
                });
                continue;
            }

            const safeFilename = sanitizeFilename(depFile.fileName);

            // Check if already exists in database
            const existingMod = Mod.findByFilename(safeFilename);
            if (existingMod) {
                results.skipped.push({
                    modId: projectId,
                    name: depMod.name,
                    filename: safeFilename,
                    reason: 'Już istnieje w bazie',
                });
                continue;
            }

            // Get download URL
            const targetFileId = manifestFileId || depFile.id;
            const downloadUrl = await cfGetFileDownloadUrl(projectId, targetFileId);
            if (!downloadUrl) {
                results.failed.push({
                    modId: projectId,
                    name: depMod.name,
                    error: 'URL pobierania niedostępny (autor wyłączył)',
                });
                continue;
            }

            // Download the mod file
            const downloadResponse = await fetch(downloadUrl);
            if (!downloadResponse.ok) {
                results.failed.push({
                    modId: projectId,
                    name: depMod.name,
                    error: `Pobieranie nieudane: ${downloadResponse.status}`,
                });
                continue;
            }

            const arrayBuffer = await downloadResponse.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const destPath = path.join(modsPath, safeFilename);
            fs.writeFileSync(destPath, buffer);

            // Calculate hash
            const sha256 = await calculateSHA256(destPath);

            // Create DB record
            const newMod = Mod.create({
                name: depMod.name,
                filename: safeFilename,
                url: `/api/download/mods/${safeFilename}`,
                sha256,
                file_size: buffer.length,
                is_required: true,
                is_enabled: true,
                mod_type: 'mod',
                description: depMod.summary || null,
                curseforge_id: projectId,
                curseforge_file_id: targetFileId,
                curseforge_url: depMod.links?.websiteUrl || null,
            });

            // Auto-assign to all servers
            try {
                const allServers = Server.getAll();
                for (const srv of allServers) {
                    Server.assignMod(srv.id, newMod.id);
                }
            } catch (assignErr) {
                // Non-critical
            }

            results.imported.push({
                id: newMod.id,
                modId: projectId,
                name: depMod.name,
                filename: safeFilename,
            });

        } catch (err) {
            results.failed.push({
                modId: projectId,
                error: err.message,
            });
        }
    }

    // 4. Log the action
    ActivityLog.logAdminAction('curseforge_import_modpack', {
        curseforgeId: modId,
        modpackName: cfModpack.name,
        imported: results.imported.length,
        skipped: results.skipped.length,
        failed: results.failed.length,
        total: results.total,
    }, getClientIp(req));

    res.json({
        success: true,
        message: `Modpack "${cfModpack.name}": ${results.imported.length} zaimportowano, ${results.skipped.length} pominięto, ${results.failed.length} nieudanych`,
        data: results,
    });
}));

export default router;
