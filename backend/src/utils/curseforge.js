/**
 * CurseForge API v1 Client
 * Provides functions for searching mods, modpacks, getting mod details,
 * file downloads, categories, and game versions from CurseForge.
 *
 * Requires CURSEFORGE_API_KEY environment variable.
 * Uses native fetch (Node 18+).
 *
 * @see https://docs.curseforge.com/
 */

const CURSEFORGE_API_BASE = 'https://api.curseforge.com/v1';
export const MINECRAFT_GAME_ID = 432;
const MODPACK_CLASS_ID = 4471;

/**
 * ModLoaderType enum matching CurseForge API values
 */
export const ModLoaderType = {
    Forge: 1,
    Fabric: 4,
    NeoForge: 6,
};

/**
 * Returns the configured API key or throws if missing.
 * @returns {string}
 */
function getApiKey() {
    const key = process.env.CURSEFORGE_API_KEY;
    if (!key) {
        const err = new Error('Klucz API CurseForge nie jest skonfigurowany. Ustaw CURSEFORGE_API_KEY w pliku .env lub docker-compose.yml');
        err.statusCode = 503;
        throw err;
    }
    return key;
}

/**
 * Performs a request to the CurseForge API.
 * @param {string} endpoint - API endpoint path (without base URL)
 * @param {object} [options] - fetch options override
 * @returns {Promise<object>} Parsed JSON response body
 */
async function cfFetch(endpoint, options = {}) {
    const url = `${CURSEFORGE_API_BASE}${endpoint}`;
    const apiKey = getApiKey();

    const response = await fetch(url, {
        ...options,
        headers: {
            'x-api-key': apiKey,
            'Accept': 'application/json',
            ...options.headers,
        },
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(
            `CurseForge API error: ${response.status} ${response.statusText} - ${errorBody}`
        );
    }

    return response.json();
}

/**
 * Build a query string from an object, omitting undefined/null values.
 * @param {object} params
 * @returns {string}
 */
function buildQuery(params) {
    const entries = Object.entries(params).filter(
        ([, v]) => v !== undefined && v !== null && v !== ''
    );
    if (entries.length === 0) return '';
    return '?' + new URLSearchParams(entries).toString();
}

// ============================================
// PUBLIC API FUNCTIONS
// ============================================

/**
 * Search for mods on CurseForge.
 *
 * @param {number} gameId - Game ID (432 for Minecraft)
 * @param {string} query - Search query string
 * @param {object} [options]
 * @param {number} [options.categoryId] - Category filter
 * @param {string} [options.gameVersion] - Minecraft version filter
 * @param {number} [options.modLoaderType] - 1=Forge, 4=Fabric
 * @param {number} [options.pageSize] - Results per page (max 50)
 * @param {number} [options.index] - Pagination offset
 * @param {number} [options.sortField] - Sort field enum
 * @param {string} [options.sortOrder] - 'asc' or 'desc'
 * @returns {Promise<object>} { data: Mod[], pagination: { index, pageSize, resultCount, totalCount } }
 */
export async function searchMods(gameId, query, options = {}) {
    const params = {
        gameId,
        searchFilter: query || undefined,
        categoryId: options.categoryId,
        gameVersion: options.gameVersion,
        modLoaderType: options.modLoaderType,
        pageSize: options.pageSize || 20,
        index: options.index || 0,
        sortField: options.sortField,
        sortOrder: options.sortOrder,
    };

    const result = await cfFetch(`/mods/search${buildQuery(params)}`);

    return {
        data: result.data || [],
        pagination: result.pagination || {
            index: params.index,
            pageSize: params.pageSize,
            resultCount: (result.data || []).length,
            totalCount: 0,
        },
    };
}

/**
 * Get detailed information about a specific mod.
 *
 * @param {number} modId - CurseForge mod ID
 * @returns {Promise<object>} Mod details object
 */
export async function getModById(modId) {
    if (!modId) throw new Error('modId is required');

    const result = await cfFetch(`/mods/${modId}`);
    return result.data;
}

/**
 * Get a list of files for a specific mod.
 *
 * @param {number} modId - CurseForge mod ID
 * @param {object} [options]
 * @param {string} [options.gameVersion] - Minecraft version filter
 * @param {number} [options.modLoaderType] - 1=Forge, 4=Fabric
 * @param {number} [options.pageSize] - Results per page
 * @param {number} [options.index] - Pagination offset
 * @returns {Promise<object>} { data: File[], pagination }
 */
export async function getModFiles(modId, options = {}) {
    if (!modId) throw new Error('modId is required');

    const params = {
        gameVersion: options.gameVersion,
        modLoaderType: options.modLoaderType,
        pageSize: options.pageSize || 20,
        index: options.index || 0,
    };

    const result = await cfFetch(`/mods/${modId}/files${buildQuery(params)}`);

    return {
        data: result.data || [],
        pagination: result.pagination || {
            index: params.index,
            pageSize: params.pageSize,
            resultCount: (result.data || []).length,
            totalCount: 0,
        },
    };
}

/**
 * Get the download URL for a specific file.
 *
 * @param {number} modId - CurseForge mod ID
 * @param {number} fileId - CurseForge file ID
 * @returns {Promise<string>} Download URL
 */
export async function getFileDownloadUrl(modId, fileId) {
    if (!modId) throw new Error('modId is required');
    if (!fileId) throw new Error('fileId is required');

    const result = await cfFetch(`/mods/${modId}/files/${fileId}/download-url`);
    return result.data;
}

/**
 * Get file details for a modpack file.
 *
 * @param {number} modId - CurseForge modpack ID
 * @param {number} fileId - CurseForge modpack file ID
 * @returns {Promise<object>} File details
 */
export async function getModpackFiles(modId, fileId) {
    if (!modId) throw new Error('modId is required');
    if (!fileId) throw new Error('fileId is required');

    const result = await cfFetch(`/mods/${modId}/files/${fileId}`);
    return result.data;
}

/**
 * Download and parse a CurseForge modpack ZIP.
 * Returns full manifest data (files, minecraft version, loader info)
 * plus the ZIP buffer for extracting overrides.
 *
 * manifest.json structure:
 *   minecraft.version - e.g. "1.21.1"
 *   minecraft.modLoaders[0].id - e.g. "forge-47.2.0" or "neoforge-21.1.77"
 *   files[] - { projectID, fileID, required }
 *   overrides - name of overrides directory (usually "overrides")
 *
 * @param {number} modId - CurseForge modpack ID
 * @param {number} fileId - CurseForge modpack file ID
 * @returns {Promise<{manifest: object, zipBuffer: Buffer}>} Full manifest + ZIP buffer
 */
export async function extractModpackManifest(modId, fileId) {
    if (!modId) throw new Error('modId is required');
    if (!fileId) throw new Error('fileId is required');

    const downloadUrl = await getFileDownloadUrl(modId, fileId);
    if (!downloadUrl) {
        throw new Error('Nie udało się pobrać URL modpacka');
    }

    const response = await fetch(downloadUrl);
    if (!response.ok) {
        throw new Error(`Nie udało się pobrać modpacka: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const zipBuffer = Buffer.from(arrayBuffer);

    const { default: AdmZip } = await import('adm-zip');
    const zip = new AdmZip(zipBuffer);

    // CurseForge modpacks contain manifest.json at root level
    const manifestEntry = zip.getEntry('manifest.json');
    if (!manifestEntry) {
        throw new Error('Brak manifest.json w paczce modpacka');
    }

    const manifestText = manifestEntry.getData().toString('utf8');
    const manifest = JSON.parse(manifestText);

    if (!manifest.files || manifest.files.length === 0) {
        throw new Error('Manifest modpacka nie zawiera listy modów');
    }

    return { manifest, zipBuffer };
}

/**
 * Parse loader type and version from CurseForge manifest modLoader ID.
 * Examples: "forge-47.2.0", "neoforge-21.1.77", "fabric-0.15.3"
 *
 * @param {object} manifest - CurseForge modpack manifest
 * @returns {{ loaderType: string, loaderVersion: string, gameVersion: string }}
 */
export function parseManifestLoaderInfo(manifest) {
    const result = {
        gameVersion: manifest.minecraft?.version || null,
        loaderType: 'vanilla',
        loaderVersion: null,
    };

    const modLoaders = manifest.minecraft?.modLoaders;
    if (!modLoaders || modLoaders.length === 0) return result;

    // Use the primary loader (first one, or the one marked as primary)
    const primary = modLoaders.find(l => l.primary) || modLoaders[0];
    const loaderId = primary.id || '';

    if (loaderId.startsWith('forge-')) {
        result.loaderType = 'forge';
        result.loaderVersion = loaderId.replace('forge-', '');
    } else if (loaderId.startsWith('neoforge-')) {
        result.loaderType = 'neoforge';
        result.loaderVersion = loaderId.replace('neoforge-', '');
    } else if (loaderId.startsWith('fabric-')) {
        result.loaderType = 'fabric';
        result.loaderVersion = loaderId.replace('fabric-', '');
    } else if (loaderId.startsWith('quilt-')) {
        result.loaderType = 'quilt';
        result.loaderVersion = loaderId.replace('quilt-', '');
    }

    return result;
}

/**
 * Search specifically for modpacks (classId=4471).
 *
 * @param {string} query - Search query string
 * @param {object} [options] - Same options as searchMods
 * @returns {Promise<object>} { data: Mod[], pagination }
 */
export async function searchModpacks(query, options = {}) {
    const params = {
        gameId: MINECRAFT_GAME_ID,
        classId: MODPACK_CLASS_ID,
        searchFilter: query || undefined,
        gameVersion: options.gameVersion,
        modLoaderType: options.modLoaderType,
        pageSize: options.pageSize || 20,
        index: options.index || 0,
        sortField: options.sortField,
        sortOrder: options.sortOrder,
        categoryId: options.categoryId,
    };

    const result = await cfFetch(`/mods/search${buildQuery(params)}`);

    return {
        data: result.data || [],
        pagination: result.pagination || {
            index: params.index,
            pageSize: params.pageSize,
            resultCount: (result.data || []).length,
            totalCount: 0,
        },
    };
}

/**
 * Get mod categories for Minecraft.
 *
 * @returns {Promise<object[]>} Array of category objects
 */
export async function getCategories() {
    const result = await cfFetch(`/categories${buildQuery({ gameId: MINECRAFT_GAME_ID })}`);
    return result.data || [];
}

/**
 * Get available Minecraft game versions from CurseForge.
 *
 * @returns {Promise<object[]>} Array of version type/version objects
 */
export async function getGameVersions() {
    const result = await cfFetch(`/games/${MINECRAFT_GAME_ID}/versions`);
    return result.data || [];
}

export default {
    searchMods,
    getModById,
    getModFiles,
    getFileDownloadUrl,
    getModpackFiles,
    extractModpackManifest,
    parseManifestLoaderInfo,
    searchModpacks,
    getCategories,
    getGameVersions,
    ModLoaderType,
    MINECRAFT_GAME_ID,
};
