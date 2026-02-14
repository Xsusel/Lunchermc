/**
 * Integracja z API Mojang i Forge
 * Pobiera dostępne wersje gry i modloaderów
 */
import https from 'https';

// Cache dla wersji (odświeżany co godzinę)
const cache = {
    minecraft: { data: null, timestamp: 0 },
    forge: { data: null, timestamp: 0 },
    neoforge: { data: null, timestamp: 0 }
};

const CACHE_TTL = 60 * 60 * 1000; // 1 godzina

/**
 * Pobiera dane z URL
 */
function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';

            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('Błąd parsowania JSON'));
                }
            });
        }).on('error', reject);
    });
}

/**
 * Pobiera wszystkie dostępne wersje Minecraft z API Mojang
 * @returns {Promise<object>} Lista wersji
 */
export async function getMinecraftVersions() {
    // Sprawdź cache
    if (cache.minecraft.data && Date.now() - cache.minecraft.timestamp < CACHE_TTL) {
        return cache.minecraft.data;
    }

    try {
        const manifest = await fetchJSON('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');

        // Przetwarzamy wersje
        const versions = {
            latest: {
                release: manifest.latest.release,
                snapshot: manifest.latest.snapshot
            },
            releases: [],
            snapshots: []
        };

        manifest.versions.forEach(version => {
            const versionData = {
                id: version.id,
                type: version.type,
                releaseTime: version.releaseTime,
                url: version.url
            };

            if (version.type === 'release') {
                versions.releases.push(versionData);
            } else if (version.type === 'snapshot') {
                versions.snapshots.push(versionData);
            }
        });

        // Aktualizuj cache
        cache.minecraft = {
            data: versions,
            timestamp: Date.now()
        };

        return versions;
    } catch (error) {
        console.error('Błąd pobierania wersji Minecraft:', error);

        // Zwróć fallback
        return {
            latest: { release: '1.20.1', snapshot: '1.20.1' },
            releases: [
                { id: '1.21', type: 'release' },
                { id: '1.20.6', type: 'release' },
                { id: '1.20.4', type: 'release' },
                { id: '1.20.2', type: 'release' },
                { id: '1.20.1', type: 'release' },
                { id: '1.19.4', type: 'release' },
                { id: '1.18.2', type: 'release' },
                { id: '1.17.1', type: 'release' },
                { id: '1.16.5', type: 'release' },
                { id: '1.12.2', type: 'release' },
                { id: '1.8.9', type: 'release' },
                { id: '1.7.10', type: 'release' }
            ],
            snapshots: []
        };
    }
}

/**
 * Pobiera wersje Forge dla danej wersji Minecraft
 * @param {string} mcVersion - Wersja Minecraft (np. "1.20.1")
 * @returns {Promise<object>} Lista wersji Forge
 */
export async function getForgeVersions(mcVersion = null) {
    try {
        // API Forge Maven
        const promoUrl = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
        const promos = await fetchJSON(promoUrl);

        const versions = {};

        // Przetwarzamy promowane wersje
        Object.entries(promos.promos).forEach(([key, forgeVersion]) => {
            const match = key.match(/^(\d+\.\d+(?:\.\d+)?)-(.+)$/);
            if (match) {
                const [, mc, type] = match;

                if (!versions[mc]) {
                    versions[mc] = {
                        mcVersion: mc,
                        recommended: null,
                        latest: null,
                        all: []
                    };
                }

                if (type === 'recommended') {
                    versions[mc].recommended = forgeVersion;
                } else if (type === 'latest') {
                    versions[mc].latest = forgeVersion;
                }
            }
        });

        // Jeśli podano konkretną wersję MC, zwróć tylko dla niej
        if (mcVersion && versions[mcVersion]) {
            return versions[mcVersion];
        }

        return {
            versions: Object.values(versions).sort((a, b) =>
                b.mcVersion.localeCompare(a.mcVersion, undefined, { numeric: true })
            )
        };
    } catch (error) {
        console.error('Błąd pobierania wersji Forge:', error);

        // Fallback z popularnymi wersjami
        const fallback = {
            '1.20.1': { mcVersion: '1.20.1', recommended: '47.2.0', latest: '47.2.20' },
            '1.19.4': { mcVersion: '1.19.4', recommended: '45.2.0', latest: '45.2.8' },
            '1.18.2': { mcVersion: '1.18.2', recommended: '40.2.0', latest: '40.2.21' },
            '1.16.5': { mcVersion: '1.16.5', recommended: '36.2.39', latest: '36.2.42' },
            '1.12.2': { mcVersion: '1.12.2', recommended: '14.23.5.2859', latest: '14.23.5.2860' }
        };

        if (mcVersion && fallback[mcVersion]) {
            return fallback[mcVersion];
        }

        return { versions: Object.values(fallback) };
    }
}

/**
 * Pobiera wersje Fabric dla danej wersji Minecraft
 * @param {string} mcVersion - Wersja Minecraft
 * @returns {Promise<object>} Lista wersji Fabric
 */
export async function getFabricVersions(mcVersion = null) {
    try {
        // API Fabric
        const loaderUrl = 'https://meta.fabricmc.net/v2/versions/loader';
        const loaders = await fetchJSON(loaderUrl);

        const gameUrl = 'https://meta.fabricmc.net/v2/versions/game';
        const games = await fetchJSON(gameUrl);

        // Filtruj stabilne wersje loadera
        const stableLoaders = loaders
            .filter(l => l.stable)
            .slice(0, 10)
            .map(l => ({
                version: l.version,
                stable: l.stable
            }));

        // Wersje gry obsługiwane przez Fabric
        const supportedGames = games
            .filter(g => g.stable)
            .slice(0, 20)
            .map(g => g.version);

        const result = {
            loaders: stableLoaders,
            supportedVersions: supportedGames,
            recommended: stableLoaders[0]?.version || '0.15.6'
        };

        // Jeśli podano wersję MC, sprawdź czy jest obsługiwana
        if (mcVersion) {
            result.isSupported = supportedGames.includes(mcVersion);
        }

        return result;
    } catch (error) {
        console.error('Błąd pobierania wersji Fabric:', error);

        return {
            loaders: [{ version: '0.15.6', stable: true }],
            supportedVersions: ['1.20.1', '1.20', '1.19.4', '1.18.2'],
            recommended: '0.15.6',
            isSupported: true
        };
    }
}

/**
 * Pobiera wersje NeoForge dla danej wersji Minecraft
 * NeoForge jest forkiem Forge dla MC 1.20.1+
 * API: https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge
 * @param {string} mcVersion - Wersja Minecraft (np. "1.20.1", "1.21")
 * @returns {Promise<object>} Lista wersji NeoForge
 */
export async function getNeoForgeVersions(mcVersion = null) {
    try {
        const apiUrl = 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge';
        const data = await fetchJSON(apiUrl);

        // NeoForge versioning: MC 1.20.1 uses 47.x.x, MC 1.20.2+ uses {mcMinor}.{mcPatch}.x
        // np. 1.20.1 -> 47.1.x, 1.20.4 -> 20.4.x, 1.21 -> 21.0.x
        const allVersions = data.versions || [];

        // Grupuj wersje po wersji MC
        const versionsByMc = {};

        for (const version of allVersions) {
            // NeoForge wersje mają format: MAJOR.MINOR.PATCH lub MAJOR.MINOR.PATCH-beta
            const parts = version.split('.');
            if (parts.length < 3) continue;

            const major = parseInt(parts[0]);
            let detectedMc;

            if (major === 47) {
                // NeoForge 47.x.x = MC 1.20.1
                detectedMc = '1.20.1';
            } else {
                // NeoForge 20.2.x = MC 1.20.2, 20.3.x = MC 1.20.3, 20.4.x = MC 1.20.4
                // NeoForge 21.0.x = MC 1.21, 21.1.x = MC 1.21.1
                const minor = parseInt(parts[1]);
                detectedMc = minor === 0 ? `1.${major}` : `1.${major}.${minor}`;
            }

            if (!versionsByMc[detectedMc]) {
                versionsByMc[detectedMc] = [];
            }
            versionsByMc[detectedMc].push(version);
        }

        // Sortuj wersje (najnowsze najpierw)
        for (const mc of Object.keys(versionsByMc)) {
            versionsByMc[mc].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        }

        if (mcVersion) {
            const versions = versionsByMc[mcVersion] || [];
            return {
                mcVersion,
                latest: versions[0] || null,
                all: versions.slice(0, 20),
                isSupported: versions.length > 0
            };
        }

        // Zwróć wszystkie wersje MC z NeoForge
        return {
            versions: Object.entries(versionsByMc)
                .map(([mc, versions]) => ({
                    mcVersion: mc,
                    latest: versions[0],
                    count: versions.length
                }))
                .sort((a, b) => b.mcVersion.localeCompare(a.mcVersion, undefined, { numeric: true }))
        };
    } catch (error) {
        console.error('Błąd pobierania wersji NeoForge:', error);

        const fallback = {
            '1.21': { mcVersion: '1.21', latest: '21.0.167', all: ['21.0.167'], isSupported: true },
            '1.20.4': { mcVersion: '1.20.4', latest: '20.4.237', all: ['20.4.237'], isSupported: true },
            '1.20.1': { mcVersion: '1.20.1', latest: '47.1.106', all: ['47.1.106'], isSupported: true }
        };

        if (mcVersion) {
            return fallback[mcVersion] || { mcVersion, latest: null, all: [], isSupported: false };
        }

        return { versions: Object.values(fallback).map(v => ({ mcVersion: v.mcVersion, latest: v.latest, count: v.all.length })) };
    }
}

/**
 * Pobiera URL instalatora NeoForge
 * @param {string} neoforgeVersion - Wersja NeoForge (np. "47.1.106" lub "20.4.237")
 * @returns {string} URL instalatora
 */
export function getNeoForgeInstallerUrl(neoforgeVersion) {
    return `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoforgeVersion}/neoforge-${neoforgeVersion}-installer.jar`;
}

/**
 * Pobiera szczegóły wersji Minecraft (biblioteki, assety)
 * @param {string} versionId - ID wersji
 * @returns {Promise<object>} Szczegóły wersji
 */
export async function getVersionDetails(versionId) {
    try {
        // Najpierw pobierz manifest
        const manifest = await fetchJSON('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');

        // Znajdź URL szczegółów wersji
        const version = manifest.versions.find(v => v.id === versionId);
        if (!version) {
            throw new Error(`Wersja ${versionId} nie znaleziona`);
        }

        // Pobierz szczegóły
        const details = await fetchJSON(version.url);

        return {
            id: details.id,
            type: details.type,
            mainClass: details.mainClass,
            minecraftArguments: details.minecraftArguments,
            arguments: details.arguments,
            libraries: details.libraries.map(lib => ({
                name: lib.name,
                downloads: lib.downloads,
                rules: lib.rules
            })),
            downloads: details.downloads,
            assetIndex: details.assetIndex,
            javaVersion: details.javaVersion
        };
    } catch (error) {
        console.error('Błąd pobierania szczegółów wersji:', error);
        throw error;
    }
}

/**
 * Pobiera URL instalatora Forge
 * @param {string} mcVersion - Wersja Minecraft
 * @param {string} forgeVersion - Wersja Forge
 * @returns {string} URL instalatora
 */
export function getForgeInstallerUrl(mcVersion, forgeVersion) {
    const fullVersion = `${mcVersion}-${forgeVersion}`;
    return `https://maven.minecraftforge.net/net/minecraftforge/forge/${fullVersion}/forge-${fullVersion}-installer.jar`;
}

/**
 * Pobiera URL bibliotek Fabric
 * @param {string} mcVersion - Wersja Minecraft
 * @param {string} loaderVersion - Wersja loadera
 * @returns {object} URLs
 */
export function getFabricUrls(mcVersion, loaderVersion) {
    return {
        profile: `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/profile/json`,
        server: `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/server/jar`
    };
}
