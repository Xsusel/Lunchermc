/**
 * Modrinth API v2 Client
 * Fallback do pobierania modów, gdy CurseForge blokuje download.
 * Modrinth nie wymaga klucza API.
 *
 * @see https://docs.modrinth.com/
 */

const MODRINTH_API_BASE = 'https://api.modrinth.com/v2';
const USER_AGENT = 'XsusLauncher/1.0 (contact@xsuslauncher.pl)';

/**
 * Wykonuje request do Modrinth API
 */
async function mrFetch(endpoint) {
    const url = `${MODRINTH_API_BASE}${endpoint}`;

    const response = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'application/json',
        },
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(
            `Modrinth API error: ${response.status} ${response.statusText} - ${errorBody}`
        );
    }

    return response.json();
}

/**
 * Szuka moda na Modrinth po nazwie.
 *
 * @param {string} query - Nazwa moda
 * @param {object} [options]
 * @param {string} [options.gameVersion] - Wersja MC (np. "1.21.1")
 * @param {string} [options.loader] - Loader (forge, neoforge, fabric)
 * @param {number} [options.limit] - Limit wyników
 * @returns {Promise<object[]>} Lista projektów
 */
export async function searchMods(query, options = {}) {
    const facets = [];
    if (options.gameVersion) {
        facets.push(`["versions:${options.gameVersion}"]`);
    }
    if (options.loader) {
        facets.push(`["categories:${options.loader}"]`);
    }
    facets.push('["project_type:mod"]');

    const params = new URLSearchParams({
        query: query,
        limit: String(options.limit || 10),
        facets: `[${facets.join(',')}]`,
    });

    const result = await mrFetch(`/search?${params}`);
    return result.hits || [];
}

/**
 * Pobiera wersje (pliki) projektu z Modrinth.
 *
 * @param {string} projectId - Slug lub ID projektu
 * @param {object} [options]
 * @param {string} [options.gameVersion] - Wersja MC
 * @param {string} [options.loader] - Loader
 * @returns {Promise<object[]>} Lista wersji z plikami
 */
export async function getProjectVersions(projectId, options = {}) {
    const params = new URLSearchParams();
    if (options.gameVersion) {
        params.set('game_versions', JSON.stringify([options.gameVersion]));
    }
    if (options.loader) {
        params.set('loaders', JSON.stringify([options.loader]));
    }

    const query = params.toString();
    return mrFetch(`/project/${projectId}/version${query ? '?' + query : ''}`);
}

/**
 * Szuka moda na Modrinth po hashu SHA1 pliku z CurseForge.
 * Modrinth indeksuje hashe, więc można znaleźć odpowiednik.
 *
 * @param {string} hash - SHA1 hash pliku
 * @returns {Promise<object|null>} Wersja z Modrinth lub null
 */
export async function findVersionByHash(hash) {
    try {
        return await mrFetch(`/version_file/${hash}`);
    } catch {
        return null;
    }
}

/**
 * Szuka moda na Modrinth po slug/nazwie z CurseForge i próbuje
 * znaleźć pasujący plik do pobrania.
 *
 * @param {string} modName - Nazwa moda z CurseForge
 * @param {string} modSlug - Slug moda (np. "cobblemon")
 * @param {object} options
 * @param {string} options.gameVersion - Wersja MC
 * @param {string} [options.loader] - Loader (forge, neoforge, fabric)
 * @returns {Promise<{downloadUrl: string, fileName: string, sha1: string}|null>}
 */
export async function findModDownload(modName, modSlug, options = {}) {
    // Próba 1: Szukaj po slug (najczęściej taki sam na obu platformach)
    const slugsToTry = [
        modSlug,
        modSlug?.toLowerCase(),
        modName?.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-'),
    ].filter(Boolean);

    for (const slug of [...new Set(slugsToTry)]) {
        try {
            const versions = await getProjectVersions(slug, {
                gameVersion: options.gameVersion,
                loader: options.loader,
            });

            if (versions && versions.length > 0) {
                // Bierz najnowszą wersję
                const version = versions[0];
                const primaryFile = version.files?.find(f => f.primary) || version.files?.[0];

                if (primaryFile?.url) {
                    return {
                        downloadUrl: primaryFile.url,
                        fileName: primaryFile.filename,
                        sha1: primaryFile.hashes?.sha1 || null,
                    };
                }
            }
        } catch {
            // Slug nie istnieje na Modrinth, próbuj dalej
        }
    }

    // Próba 2: Szukaj po nazwie
    try {
        const searchResults = await searchMods(modName, {
            gameVersion: options.gameVersion,
            loader: options.loader,
            limit: 5,
        });

        if (searchResults.length > 0) {
            // Wybierz najlepszy wynik (najwyższe downloads lub dokładne dopasowanie)
            const bestMatch = searchResults.find(
                r => r.slug === modSlug || r.title.toLowerCase() === modName.toLowerCase()
            ) || searchResults[0];

            const versions = await getProjectVersions(bestMatch.project_id, {
                gameVersion: options.gameVersion,
                loader: options.loader,
            });

            if (versions && versions.length > 0) {
                const version = versions[0];
                const primaryFile = version.files?.find(f => f.primary) || version.files?.[0];

                if (primaryFile?.url) {
                    return {
                        downloadUrl: primaryFile.url,
                        fileName: primaryFile.filename,
                        sha1: primaryFile.hashes?.sha1 || null,
                    };
                }
            }
        }
    } catch {
        // Wyszukiwanie nie powiodło się
    }

    return null;
}

export default {
    searchMods,
    getProjectVersions,
    findVersionByHash,
    findModDownload,
};
