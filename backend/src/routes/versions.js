/**
 * Trasy dla wersji Minecraft, Forge, Fabric, NeoForge
 * Endpoint do pobierania dostępnych wersji
 */
import { Router } from 'express';
import {
    getMinecraftVersions,
    getForgeVersions,
    getFabricVersions,
    getNeoForgeVersions,
    getVersionDetails,
    getForgeInstallerUrl,
    getNeoForgeInstallerUrl,
    getFabricUrls
} from '../utils/mcVersions.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/versions/minecraft
 * Pobiera wszystkie dostępne wersje Minecraft
 * Publiczny endpoint
 */
router.get('/minecraft', asyncHandler(async (req, res) => {
    const versions = await getMinecraftVersions();

    res.json({
        success: true,
        data: versions
    });
}));

/**
 * GET /api/versions/minecraft/:version
 * Pobiera szczegóły konkretnej wersji Minecraft
 */
router.get('/minecraft/:version', asyncHandler(async (req, res) => {
    const { version } = req.params;

    try {
        const details = await getVersionDetails(version);

        res.json({
            success: true,
            data: details
        });
    } catch (error) {
        res.status(404).json({
            success: false,
            error: `Wersja ${version} nie została znaleziona`
        });
    }
}));

/**
 * GET /api/versions/forge
 * Pobiera wszystkie dostępne wersje Forge
 */
router.get('/forge', asyncHandler(async (req, res) => {
    const { mc } = req.query; // Opcjonalny filtr po wersji MC

    const versions = await getForgeVersions(mc);

    res.json({
        success: true,
        data: versions
    });
}));

/**
 * GET /api/versions/forge/:mcVersion
 * Pobiera wersje Forge dla konkretnej wersji Minecraft
 */
router.get('/forge/:mcVersion', asyncHandler(async (req, res) => {
    const { mcVersion } = req.params;

    const versions = await getForgeVersions(mcVersion);

    if (!versions || (!versions.recommended && !versions.latest)) {
        return res.status(404).json({
            success: false,
            error: `Brak wersji Forge dla Minecraft ${mcVersion}`
        });
    }

    // Dodaj URL instalatora
    if (versions.recommended) {
        versions.recommendedInstallerUrl = getForgeInstallerUrl(mcVersion, versions.recommended);
    }
    if (versions.latest) {
        versions.latestInstallerUrl = getForgeInstallerUrl(mcVersion, versions.latest);
    }

    res.json({
        success: true,
        data: versions
    });
}));

/**
 * GET /api/versions/fabric
 * Pobiera wszystkie dostępne wersje Fabric
 */
router.get('/fabric', asyncHandler(async (req, res) => {
    const { mc } = req.query;

    const versions = await getFabricVersions(mc);

    res.json({
        success: true,
        data: versions
    });
}));

/**
 * GET /api/versions/fabric/:mcVersion
 * Pobiera wersje Fabric dla konkretnej wersji Minecraft
 */
router.get('/fabric/:mcVersion', asyncHandler(async (req, res) => {
    const { mcVersion } = req.params;

    const versions = await getFabricVersions(mcVersion);

    if (!versions.isSupported) {
        return res.status(404).json({
            success: false,
            error: `Minecraft ${mcVersion} nie jest obsługiwany przez Fabric`
        });
    }

    // Dodaj URLs
    if (versions.recommended) {
        versions.urls = getFabricUrls(mcVersion, versions.recommended);
    }

    res.json({
        success: true,
        data: versions
    });
}));

/**
 * GET /api/versions/neoforge
 * Pobiera wszystkie dostępne wersje NeoForge
 */
router.get('/neoforge', asyncHandler(async (req, res) => {
    const { mc } = req.query;

    const versions = await getNeoForgeVersions(mc);

    res.json({
        success: true,
        data: versions
    });
}));

/**
 * GET /api/versions/neoforge/:mcVersion
 * Pobiera wersje NeoForge dla konkretnej wersji Minecraft
 */
router.get('/neoforge/:mcVersion', asyncHandler(async (req, res) => {
    const { mcVersion } = req.params;

    const versions = await getNeoForgeVersions(mcVersion);

    if (!versions || !versions.isSupported) {
        return res.status(404).json({
            success: false,
            error: `Brak wersji NeoForge dla Minecraft ${mcVersion}`
        });
    }

    // Dodaj URL instalatora
    if (versions.latest) {
        versions.latestInstallerUrl = getNeoForgeInstallerUrl(versions.latest);
    }

    res.json({
        success: true,
        data: versions
    });
}));

/**
 * GET /api/versions/recommended
 * Pobiera zalecane wersje dla każdego typu
 */
router.get('/recommended', asyncHandler(async (req, res) => {
    const [minecraft, forge, fabric, neoforge] = await Promise.all([
        getMinecraftVersions(),
        getForgeVersions('1.20.1'),
        getFabricVersions(),
        getNeoForgeVersions('1.20.1')
    ]);

    res.json({
        success: true,
        data: {
            minecraft: {
                latest: minecraft.latest.release,
                recommended: '1.20.1' // Najbardziej stabilna dla modów
            },
            forge: {
                mcVersion: '1.20.1',
                recommended: forge.recommended,
                latest: forge.latest
            },
            fabric: {
                recommended: fabric.recommended,
                supportedVersions: fabric.supportedVersions.slice(0, 5)
            },
            neoforge: {
                mcVersion: '1.20.1',
                latest: neoforge.latest,
                isSupported: neoforge.isSupported
            }
        }
    });
}));

export default router;
