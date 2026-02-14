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
    getModsPath, getServerSubPath, ensureDir, getClientIp,
} from '../../utils/helpers.js';
import {
    searchMods as cfSearchMods,
    searchModpacks as cfSearchModpacks,
    getModById as cfGetModById,
    getModFiles as cfGetModFiles,
    getFileDownloadUrl as cfGetFileDownloadUrl,
    getModpackFiles as cfGetModpackFiles,
    extractModpackManifest as cfExtractModpackManifest,
    parseManifestLoaderInfo as cfParseLoaderInfo,
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
// Downloads the modpack ZIP, reads manifest.json, extracts overrides,
// downloads mods, creates/configures server with correct loader & Java.
// ============================================
router.post('/import-modpack', asyncHandler(async (req, res) => {
    const { modId, fileId, includeOptional, serverId, createServer } = req.body;

    if (!modId || !fileId) {
        return res.status(400).json({
            success: false,
            error: 'modId i fileId sa wymagane',
        });
    }

    // 1. Get modpack info from CurseForge
    const cfModpack = await cfGetModById(parseInt(modId));

    // 2. Download ZIP and extract manifest
    let manifest, zipBuffer;
    try {
        const extracted = await cfExtractModpackManifest(parseInt(modId), parseInt(fileId));
        manifest = extracted.manifest;
        zipBuffer = extracted.zipBuffer;
    } catch (err) {
        return res.status(400).json({
            success: false,
            error: `Nie udalo sie odczytac manifestu modpacka: ${err.message}`,
        });
    }

    if (!manifest.files || manifest.files.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'Manifest modpacka nie zawiera zadnych modow.',
        });
    }

    // 3. Parse loader info from manifest
    const loaderInfo = cfParseLoaderInfo(manifest);
    const mcVersion = loaderInfo.gameVersion || '1.20.1';
    const loaderType = loaderInfo.loaderType;
    const loaderVersion = loaderInfo.loaderVersion;

    // Determine Java args based on MC version
    const mcMajor = parseInt(mcVersion.split('.')[1] || '0');
    let javaArgs = '-Xmx4G -Xms2G -XX:+UseG1GC';
    if (mcMajor >= 17) {
        // MC 1.17+ needs more modern Java args
        javaArgs = '-Xmx4G -Xms2G -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200';
    }

    // 4. Create new server or use existing
    let targetServer;
    if (createServer) {
        // Create a new server with modpack config
        targetServer = Server.create({
            name: createServer.name || cfModpack.name,
            description: `Modpack: ${cfModpack.name} (CurseForge)`,
            ip: createServer.ip || 'localhost',
            port: createServer.port || 25565,
            is_default: createServer.isDefault || false,
            game_version: mcVersion,
            loader_type: loaderType,
            forge_version: loaderType === 'forge' ? loaderVersion : null,
            fabric_version: loaderType === 'fabric' ? loaderVersion : null,
            neoforge_version: loaderType === 'neoforge' ? loaderVersion : null,
            java_args: javaArgs,
        });
    } else if (serverId) {
        targetServer = Server.getById(parseInt(serverId));
        if (!targetServer) {
            return res.status(404).json({
                success: false,
                error: 'Serwer nie znaleziony',
            });
        }
        // Update server config to match modpack
        Server.update(targetServer.id, {
            game_version: mcVersion,
            loader_type: loaderType,
            forge_version: loaderType === 'forge' ? loaderVersion : null,
            fabric_version: loaderType === 'fabric' ? loaderVersion : null,
            neoforge_version: loaderType === 'neoforge' ? loaderVersion : null,
            java_args: javaArgs,
        });
        targetServer = Server.getById(targetServer.id);
    } else {
        return res.status(400).json({
            success: false,
            error: 'Podaj serverId (istniejacy) lub createServer (nowy)',
        });
    }

    // 5. Extract overrides from ZIP to server folder
    let overridesExtracted = 0;
    try {
        const { default: AdmZip } = await import('adm-zip');
        const zip = new AdmZip(zipBuffer);
        const overridesDir = manifest.overrides || 'overrides';

        const entries = zip.getEntries();
        for (const entry of entries) {
            const entryName = entry.entryName;
            // Check if this entry is inside the overrides directory
            if (!entryName.startsWith(overridesDir + '/')) continue;
            if (entry.isDirectory) continue;

            // Get relative path after overrides/ prefix
            const relativePath = entryName.slice(overridesDir.length + 1);
            if (!relativePath) continue;

            // Skip mod JARs from overrides (we'll download them properly)
            // But keep other files in mods/ like config JARs
            const parts = relativePath.split('/');
            const topFolder = parts[0];

            // Determine destination based on folder type
            const destDir = getServerSubPath(targetServer.id, topFolder);
            ensureDir(destDir);

            const subPath = parts.slice(1).join('/');
            if (!subPath) continue; // folder entry

            const destFile = path.join(destDir, subPath);
            // Ensure parent directory exists
            ensureDir(path.dirname(destFile));

            fs.writeFileSync(destFile, entry.getData());
            overridesExtracted++;
        }
    } catch (err) {
        console.error('Blad ekstrakcji overrides:', err.message);
    }

    // 6. Download mods from manifest
    const modsPath = getModsPath();
    ensureDir(modsPath);

    const results = {
        imported: [],
        skipped: [],
        failed: [],
        total: manifest.files.length,
        server: {
            id: targetServer.id,
            name: targetServer.name,
            gameVersion: mcVersion,
            loaderType,
            loaderVersion,
        },
        overridesExtracted,
    };

    for (const entry of manifest.files) {
        const projectId = entry.projectID;
        const manifestFileId = entry.fileID;
        const required = entry.required !== false;

        if (!required && !includeOptional) {
            results.skipped.push({
                modId: projectId,
                reason: 'Opcjonalny mod',
            });
            continue;
        }

        try {
            const depMod = await cfGetModById(projectId);

            // Get file info - use exact fileID from manifest
            let depFile;
            if (manifestFileId) {
                try {
                    depFile = await cfGetModpackFiles(projectId, manifestFileId);
                } catch {
                    const depFiles = await cfGetModFiles(projectId, {
                        gameVersion: mcVersion,
                        pageSize: 1,
                    });
                    depFile = depFiles.data?.[0];
                }
            } else {
                const depFiles = await cfGetModFiles(projectId, {
                    gameVersion: mcVersion,
                    pageSize: 1,
                });
                depFile = depFiles.data?.[0];
            }

            if (!depFile) {
                results.failed.push({
                    modId: projectId,
                    name: depMod.name,
                    error: 'Nie znaleziono pliku',
                });
                continue;
            }

            const safeFilename = sanitizeFilename(depFile.fileName);

            // Check if mod already exists
            let existingMod = Mod.findByFilename(safeFilename);
            if (existingMod) {
                // Mod exists - just assign to this server
                Server.assignMod(targetServer.id, existingMod.id);
                results.skipped.push({
                    modId: projectId,
                    name: depMod.name,
                    filename: safeFilename,
                    reason: 'Juz istnieje - przypisano do serwera',
                });
                continue;
            }

            // Download
            const targetFileId = manifestFileId || depFile.id;
            const downloadUrl = await cfGetFileDownloadUrl(projectId, targetFileId);
            if (!downloadUrl) {
                results.failed.push({
                    modId: projectId,
                    name: depMod.name,
                    error: 'URL niedostepny',
                });
                continue;
            }

            const downloadResponse = await fetch(downloadUrl);
            if (!downloadResponse.ok) {
                results.failed.push({
                    modId: projectId,
                    name: depMod.name,
                    error: `HTTP ${downloadResponse.status}`,
                });
                continue;
            }

            const arrayBuffer = await downloadResponse.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const destPath = path.join(modsPath, safeFilename);
            fs.writeFileSync(destPath, buffer);

            const sha256 = await calculateSHA256(destPath);

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

            // Assign only to the target server
            Server.assignMod(targetServer.id, newMod.id);

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

    // 7. Log
    ActivityLog.logAdminAction('curseforge_import_modpack', {
        curseforgeId: modId,
        modpackName: cfModpack.name,
        serverId: targetServer.id,
        serverName: targetServer.name,
        loaderType,
        loaderVersion,
        gameVersion: mcVersion,
        imported: results.imported.length,
        skipped: results.skipped.length,
        failed: results.failed.length,
        total: results.total,
        overridesExtracted,
    }, getClientIp(req));

    res.json({
        success: true,
        message: `Modpack "${cfModpack.name}": ${results.imported.length} zaimportowano, ${results.skipped.length} pominieto, ${results.failed.length} nieudanych. Serwer: ${targetServer.name} (${loaderType} ${loaderVersion || ''})`,
        data: results,
    });
}));

export default router;
