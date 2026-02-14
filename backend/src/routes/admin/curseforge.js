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

    // 2. Get the modpack file details (contains manifest with mod list)
    const modpackFile = await cfGetModpackFiles(parseInt(modId), parseInt(fileId));

    // The dependencies list in the file contains the mods required by the modpack
    const dependencies = modpackFile.dependencies || [];

    if (dependencies.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'No mods found in modpack manifest. The modpack may use a different format.',
        });
    }

    const modsPath = getModsPath();
    ensureDir(modsPath);

    const results = {
        imported: [],
        skipped: [],
        failed: [],
        total: dependencies.length,
    };

    // 3. Process each mod in the modpack
    for (const dep of dependencies) {
        // Skip optional dependencies if not requested
        if (!includeOptional && dep.relationType && dep.relationType !== 3) {
            // relationType 3 = required dependency
            // Others are optional, tool, incompatible, etc.
            results.skipped.push({
                modId: dep.modId,
                reason: 'Optional dependency (includeOptional=false)',
            });
            continue;
        }

        try {
            // Get mod details
            const depMod = await cfGetModById(dep.modId);

            // Get the latest file for the game version
            const depFiles = await cfGetModFiles(dep.modId, {
                gameVersion,
                pageSize: 1,
            });

            if (!depFiles.data || depFiles.data.length === 0) {
                results.failed.push({
                    modId: dep.modId,
                    name: depMod.name,
                    error: `No files found for game version ${gameVersion || 'any'}`,
                });
                continue;
            }

            const depFile = depFiles.data[0];
            const safeFilename = sanitizeFilename(depFile.fileName);

            // Check if already exists
            const existingMod = Mod.findByFilename(safeFilename);
            if (existingMod) {
                results.skipped.push({
                    modId: dep.modId,
                    name: depMod.name,
                    filename: safeFilename,
                    reason: 'Already exists in database',
                });
                continue;
            }

            // Get download URL
            const downloadUrl = await cfGetFileDownloadUrl(dep.modId, depFile.id);
            if (!downloadUrl) {
                results.failed.push({
                    modId: dep.modId,
                    name: depMod.name,
                    error: 'Download URL not available',
                });
                continue;
            }

            // Download
            const downloadResponse = await fetch(downloadUrl);
            if (!downloadResponse.ok) {
                results.failed.push({
                    modId: dep.modId,
                    name: depMod.name,
                    error: `Download failed: ${downloadResponse.status}`,
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
                curseforge_id: dep.modId,
                curseforge_file_id: depFile.id,
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
                modId: dep.modId,
                name: depMod.name,
                filename: safeFilename,
            });

        } catch (err) {
            results.failed.push({
                modId: dep.modId,
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
        message: `Modpack "${cfModpack.name}" import finished: ${results.imported.length} imported, ${results.skipped.length} skipped, ${results.failed.length} failed`,
        data: results,
    });
}));

export default router;
