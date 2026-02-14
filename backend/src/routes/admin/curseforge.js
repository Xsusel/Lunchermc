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
    getServerSubPath, ensureDir, getClientIp, createServerFolders,
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
import { findModDownload as mrFindModDownload } from '../../utils/modrinth.js';

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
    const { modId, fileId, gameVersion, serverId } = req.body;

    if (!modId || !fileId) {
        return res.status(400).json({
            success: false,
            error: 'modId and fileId are required',
        });
    }

    // Determine target server
    let targetServer;
    if (serverId) {
        targetServer = Server.getById(parseInt(serverId));
    }
    if (!targetServer) {
        targetServer = Server.getDefault();
    }
    if (!targetServer) {
        return res.status(400).json({
            success: false,
            error: 'Brak serwera docelowego. Podaj serverId lub utwórz domyślny serwer.',
        });
    }

    // 1. Get mod details from CurseForge
    const cfMod = await cfGetModById(parseInt(modId));

    // 2. Get download URL (with Modrinth fallback)
    let downloadUrl = await cfGetFileDownloadUrl(parseInt(modId), parseInt(fileId));
    let modrinthFallback = false;
    let modrinthFileName = null;

    // 3. Get file details
    const filesResult = await cfGetModFiles(parseInt(modId), {
        gameVersion,
        pageSize: 50,
    });
    const fileInfo = filesResult.data.find(f => f.id === parseInt(fileId));
    let fileName = fileInfo ? fileInfo.fileName : `${cfMod.slug}-${fileId}.jar`;

    if (!downloadUrl) {
        // Fallback: szukaj na Modrinth - wykryj loader z kategorii CurseForge
        const loaderType =
            cfMod.categories?.some(c => c.name?.toLowerCase().includes('neoforge')) ? 'neoforge' :
            cfMod.categories?.some(c => c.name?.toLowerCase().includes('fabric')) ? 'fabric' :
            cfMod.categories?.some(c => c.name?.toLowerCase().includes('forge')) ? 'forge' : undefined;

        const mrResult = await mrFindModDownload(cfMod.name, cfMod.slug, {
            gameVersion: gameVersion || fileInfo?.gameVersions?.[0],
            loader: loaderType,
        });

        if (!mrResult) {
            return res.status(404).json({
                success: false,
                error: `Nie można pobrać "${cfMod.name}" - zablokowany na CurseForge i nie znaleziony na Modrinth.`,
            });
        }

        downloadUrl = mrResult.downloadUrl;
        modrinthFallback = true;
        modrinthFileName = mrResult.fileName;
        fileName = mrResult.fileName || fileName;
    }

    // 4. Prepare destination in server's mods folder
    const serverModsPath = getServerSubPath(targetServer.id, 'mods');
    ensureDir(serverModsPath);
    const safeFilename = sanitizeFilename(fileName);
    const destPath = path.join(serverModsPath, safeFilename);

    // 5. Check if mod with same filename already exists
    const existingMod = Mod.findByFilename(safeFilename);
    if (existingMod) {
        // Just assign to server if not already
        Server.assignMod(targetServer.id, existingMod.id);
        return res.json({
            success: true,
            message: `Mod "${existingMod.name}" juz istnieje - przypisano do serwera "${targetServer.name}"`,
            data: existingMod,
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

    // 8. Create Mod record in DB with per-server URL
    const mod = Mod.create({
        name: cfMod.name,
        filename: safeFilename,
        url: `/api/download/servers/${targetServer.id}/mods/${safeFilename}`,
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

    // 9. Assign to target server only
    Server.assignMod(targetServer.id, mod.id);

    // 10. Log the action
    ActivityLog.logAdminAction('curseforge_import_mod', {
        modId: mod.id,
        serverId: targetServer.id,
        serverName: targetServer.name,
        curseforgeId: modId,
        curseforgeFileId: fileId,
        filename: safeFilename,
        name: cfMod.name,
    }, getClientIp(req));

    const source = modrinthFallback ? ' (pobrano z Modrinth)' : '';
    res.status(201).json({
        success: true,
        message: `Mod "${cfMod.name}" imported to "${targetServer.name}"${source}`,
        data: mod,
        modrinthFallback,
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
        // Create full folder structure for the new server
        createServerFolders(targetServer.id);
    } else if (serverId) {
        targetServer = Server.getById(parseInt(serverId));
        if (!targetServer) {
            return res.status(404).json({
                success: false,
                error: 'Serwer nie znaleziony',
            });
        }
        // Ensure folder structure exists for existing server
        createServerFolders(targetServer.id);
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

    // 6. Download mods from manifest - save to per-server folder
    const serverModsPath = getServerSubPath(targetServer.id, 'mods');
    ensureDir(serverModsPath);

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
            // Try to get mod details from CurseForge (non-fatal - 403 possible)
            let depMod = null;
            try {
                depMod = await cfGetModById(projectId);
            } catch (cfModErr) {
                console.warn(`[CurseForge] Nie mozna pobrac info o modzie ${projectId}: ${cfModErr.message}`);
            }

            // Try to get file info from CurseForge (also non-fatal)
            let depFile = null;
            try {
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
            } catch (cfFileErr) {
                console.warn(`[CurseForge] Nie mozna pobrac pliku ${projectId}/${manifestFileId}: ${cfFileErr.message}`);
            }

            const modName = depMod?.name || depFile?.displayName || `Mod #${projectId}`;
            const modSlug = depMod?.slug || null;

            // If we have file info, check if already exists
            if (depFile) {
                const safeFilename = sanitizeFilename(depFile.fileName);
                let existingMod = Mod.findByFilename(safeFilename);
                if (existingMod) {
                    // Upewnij się, że plik fizycznie jest w folderze tego serwera
                    const targetModPath = path.join(serverModsPath, safeFilename);
                    if (!fs.existsSync(targetModPath)) {
                        // Skopiuj z folderu innego serwera lub globalnego
                        const sourceUrl = existingMod.url || '';
                        const serverMatch = sourceUrl.match(/\/servers\/(\d+)\/mods\//);
                        if (serverMatch) {
                            const sourcePath = path.join(getServerSubPath(parseInt(serverMatch[1]), 'mods'), safeFilename);
                            if (fs.existsSync(sourcePath)) {
                                fs.copyFileSync(sourcePath, targetModPath);
                            }
                        }
                    }
                    Server.assignMod(targetServer.id, existingMod.id);
                    results.skipped.push({
                        modId: projectId,
                        name: modName,
                        filename: safeFilename,
                        reason: 'Juz istnieje - przypisano do serwera',
                    });
                    continue;
                }
            }

            // Try download from CurseForge first
            let downloadUrl = null;
            let usedModrinth = false;
            let finalFilename = depFile ? sanitizeFilename(depFile.fileName) : `mod-${projectId}.jar`;

            if (depFile) {
                try {
                    const targetFileId = manifestFileId || depFile.id;
                    downloadUrl = await cfGetFileDownloadUrl(projectId, targetFileId);
                } catch {
                    // download URL endpoint also blocked
                }
            }

            // Fallback: Modrinth
            if (!downloadUrl) {
                try {
                    const mrResult = await mrFindModDownload(
                        depMod?.name || depFile?.displayName || null,
                        modSlug,
                        { gameVersion: mcVersion, loader: loaderType }
                    );

                    if (mrResult) {
                        downloadUrl = mrResult.downloadUrl;
                        finalFilename = sanitizeFilename(mrResult.fileName || finalFilename);
                        usedModrinth = true;
                        console.log(`[Modrinth fallback] ${modName}: ${mrResult.downloadUrl}`);

                        // Check if Modrinth file already exists
                        let existingMod = Mod.findByFilename(finalFilename);
                        if (existingMod) {
                            Server.assignMod(targetServer.id, existingMod.id);
                            results.skipped.push({
                                modId: projectId,
                                name: modName,
                                filename: finalFilename,
                                reason: 'Juz istnieje (Modrinth) - przypisano do serwera',
                            });
                            continue;
                        }
                    }
                } catch (mrErr) {
                    console.warn(`[Modrinth fallback] Blad dla ${modName}: ${mrErr.message}`);
                }
            }

            if (!downloadUrl) {
                results.failed.push({
                    modId: projectId,
                    name: modName,
                    error: 'Niedostepny na CurseForge i Modrinth',
                });
                continue;
            }

            // Pobierz z retry (max 3 próby na transient errors)
            let downloadResponse;
            for (let dlRetry = 0; dlRetry < 3; dlRetry++) {
                downloadResponse = await fetch(downloadUrl);
                if (downloadResponse.ok) break;
                // Retry tylko na transient errors (429, 500, 502, 503, 504)
                if ([429, 500, 502, 503, 504].includes(downloadResponse.status) && dlRetry < 2) {
                    await new Promise(r => setTimeout(r, 2000 * (dlRetry + 1)));
                    continue;
                }
                break;
            }
            if (!downloadResponse.ok) {
                results.failed.push({
                    modId: projectId,
                    name: modName,
                    error: `HTTP ${downloadResponse.status}${usedModrinth ? ' (Modrinth)' : ''}`,
                });
                continue;
            }

            const arrayBuffer = await downloadResponse.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const destPath = path.join(serverModsPath, finalFilename);
            fs.writeFileSync(destPath, buffer);

            const sha256 = await calculateSHA256(destPath);

            const newMod = Mod.create({
                name: modName,
                filename: finalFilename,
                url: `/api/download/servers/${targetServer.id}/mods/${finalFilename}`,
                sha256,
                file_size: buffer.length,
                is_required: true,
                is_enabled: true,
                mod_type: 'mod',
                description: depMod?.summary || null,
                curseforge_id: projectId,
                curseforge_file_id: usedModrinth ? null : (manifestFileId || depFile?.id || null),
                curseforge_url: depMod?.links?.websiteUrl || null,
            });

            // Assign only to the target server
            Server.assignMod(targetServer.id, newMod.id);

            results.imported.push({
                id: newMod.id,
                modId: projectId,
                name: modName,
                filename: finalFilename,
                source: usedModrinth ? 'modrinth' : 'curseforge',
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
