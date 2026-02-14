/**
 * Strona integracji z CurseForge
 * Wyszukiwanie i import modow/modpackow z CurseForge
 */
import { useState, useEffect, useCallback } from 'react';
import {
    Search, Download, Package, Loader2, ExternalLink,
    Filter, ChevronLeft, ChevronRight, AlertCircle, Check, Box, X
} from 'lucide-react';
import { curseforgeApi } from '../api/client';
import toast from 'react-hot-toast';

const PAGE_SIZE = 20;

const MOD_LOADERS = [
    { value: '', label: 'Wszystkie loadery' },
    { value: '1', label: 'Forge' },
    { value: '4', label: 'Fabric' },
    { value: '6', label: 'NeoForge' }
];

function CurseForgePage() {
    const [activeTab, setActiveTab] = useState('mods');
    const [searchQuery, setSearchQuery] = useState('');
    const [gameVersion, setGameVersion] = useState('');
    const [modLoaderType, setModLoaderType] = useState('');
    const [versions, setVersions] = useState([]);
    const [results, setResults] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [error, setError] = useState(null);

    // Modal importu
    const [importModal, setImportModal] = useState({ open: false, mod: null });
    const [modFiles, setModFiles] = useState([]);
    const [selectedFileId, setSelectedFileId] = useState('');
    const [filesLoading, setFilesLoading] = useState(false);
    const [importing, setImporting] = useState(false);

    // Modpack import progress
    const [modpackProgress, setModpackProgress] = useState(null);

    // Pobierz dostepne wersje MC przy starcie
    useEffect(() => {
        loadVersions();
    }, []);

    const loadVersions = async () => {
        try {
            const response = await curseforgeApi.getVersions();
            if (response.success && response.data) {
                // CurseForge API returns nested objects: [{type, versions: [...]}, ...]
                // Flatten to a simple string array of version numbers
                const allVersions = [];
                for (const group of response.data) {
                    if (group.versions && Array.isArray(group.versions)) {
                        allVersions.push(...group.versions);
                    } else if (typeof group === 'string') {
                        allVersions.push(group);
                    }
                }
                setVersions(allVersions);
            }
        } catch (err) {
            console.error('Blad ladowania wersji:', err);
        }
    };

    const handleSearch = useCallback(async (index = 0) => {
        setLoading(true);
        setError(null);
        setSearched(true);
        setCurrentIndex(index);

        try {
            const params = {
                q: searchQuery,
                gameVersion: gameVersion || undefined,
                modLoaderType: modLoaderType || undefined,
                pageSize: PAGE_SIZE,
                index
            };

            let response;
            if (activeTab === 'mods') {
                response = await curseforgeApi.searchMods(params);
            } else {
                response = await curseforgeApi.searchModpacks(params);
            }

            if (response.success) {
                setResults(response.data?.results || []);
                setTotalCount(response.data?.pagination?.totalCount || 0);
            } else {
                setError(response.error || 'Wystapil blad wyszukiwania');
                setResults([]);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Blad polaczenia z API CurseForge');
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, [searchQuery, gameVersion, modLoaderType, activeTab]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        handleSearch(0);
    };

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setResults([]);
        setSearched(false);
        setTotalCount(0);
        setCurrentIndex(0);
        setError(null);
    };

    // Paginacja
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);
    const currentPage = Math.floor(currentIndex / PAGE_SIZE) + 1;

    const handlePrevPage = () => {
        if (currentIndex > 0) {
            handleSearch(currentIndex - PAGE_SIZE);
        }
    };

    const handleNextPage = () => {
        if (currentIndex + PAGE_SIZE < totalCount) {
            handleSearch(currentIndex + PAGE_SIZE);
        }
    };

    // Import - otworz modal
    const handleOpenImport = async (mod) => {
        setImportModal({ open: true, mod });
        setSelectedFileId('');
        setModFiles([]);
        setFilesLoading(true);

        try {
            const params = {};
            if (gameVersion) params.gameVersion = gameVersion;
            if (modLoaderType) params.modLoaderType = modLoaderType;

            const response = await curseforgeApi.getModFiles(mod.id, params);
            if (response.success && response.data) {
                const files = response.data.files || response.data;
                setModFiles(Array.isArray(files) ? files : []);
                if (Array.isArray(files) && files.length > 0) {
                    setSelectedFileId(String(files[0].id));
                }
            }
        } catch (err) {
            toast.error('Blad ladowania plikow moda');
        } finally {
            setFilesLoading(false);
        }
    };

    const handleCloseImport = () => {
        setImportModal({ open: false, mod: null });
        setModFiles([]);
        setSelectedFileId('');
        setModpackProgress(null);
    };

    // Import moda
    const handleImportMod = async () => {
        if (!selectedFileId) {
            toast.error('Wybierz wersje pliku');
            return;
        }

        setImporting(true);
        try {
            const response = await curseforgeApi.importMod({
                modId: importModal.mod.id,
                fileId: parseInt(selectedFileId)
            });

            if (response.success) {
                toast.success(`Mod "${importModal.mod.name}" zostal zaimportowany`);
                handleCloseImport();
            } else {
                toast.error(response.error || 'Blad importu moda');
            }
        } catch (err) {
            toast.error(err.response?.data?.error || 'Blad importu moda');
        } finally {
            setImporting(false);
        }
    };

    // Import modpacka
    const handleImportModpack = async () => {
        if (!selectedFileId) {
            toast.error('Wybierz wersje modpacka');
            return;
        }

        setImporting(true);
        setModpackProgress({
            total: 0,
            imported: 0,
            failed: 0,
            items: [],
            done: false
        });

        try {
            const response = await curseforgeApi.importModpack({
                modId: importModal.mod.id,
                fileId: parseInt(selectedFileId)
            });

            if (response.success) {
                const result = response.data || {};
                // Backend returns imported/skipped/failed as arrays
                const importedCount = Array.isArray(result.imported) ? result.imported.length : (result.imported || 0);
                const failedCount = Array.isArray(result.failed) ? result.failed.length : (result.failed || 0);
                const importedItems = (Array.isArray(result.imported) ? result.imported : []).map(i => ({ ...i, success: true }));
                const failedItems = (Array.isArray(result.failed) ? result.failed : []).map(i => ({ ...i, success: false }));
                setModpackProgress({
                    total: result.total || 0,
                    imported: importedCount,
                    failed: failedCount,
                    items: [...importedItems, ...failedItems],
                    done: true
                });
                toast.success(`Modpack zaimportowany: ${importedCount}/${result.total || 0} modow`);
            } else {
                toast.error(response.error || 'Blad importu modpacka');
                setModpackProgress(null);
            }
        } catch (err) {
            toast.error(err.response?.data?.error || 'Blad importu modpacka');
            setModpackProgress(null);
        } finally {
            setImporting(false);
        }
    };

    const formatDownloads = (count) => {
        if (!count) return '0';
        return count.toLocaleString('pl-PL');
    };

    const truncateText = (text, maxLength = 120) => {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Naglowek */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Box className="w-7 h-7 text-orange-500" />
                        CurseForge
                    </h1>
                    <p className="text-gray-400">Wyszukuj i importuj mody oraz modpacki z CurseForge</p>
                </div>
            </div>

            {/* Zakladki */}
            <div className="flex gap-4 border-b border-mc-gray">
                <button
                    onClick={() => handleTabChange('mods')}
                    className={`pb-2 px-1 whitespace-nowrap ${activeTab === 'mods' ? 'border-b-2 border-orange-500 text-white' : 'text-gray-400 hover:text-gray-300'}`}
                >
                    <span className="flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        Mody
                    </span>
                </button>
                <button
                    onClick={() => handleTabChange('modpacks')}
                    className={`pb-2 px-1 whitespace-nowrap ${activeTab === 'modpacks' ? 'border-b-2 border-orange-500 text-white' : 'text-gray-400 hover:text-gray-300'}`}
                >
                    <span className="flex items-center gap-2">
                        <Box className="w-4 h-4" />
                        Modpacki
                    </span>
                </button>
            </div>

            {/* Wyszukiwarka */}
            <form onSubmit={handleSearchSubmit} className="card">
                <div className="flex flex-col lg:flex-row gap-3">
                    <div className="flex-1">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={activeTab === 'mods' ? 'Szukaj modow...' : 'Szukaj modpackow...'}
                                className="input pl-10 w-full"
                            />
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <select
                            value={gameVersion}
                            onChange={(e) => setGameVersion(e.target.value)}
                            className="input min-w-[160px]"
                        >
                            <option value="">Wersja MC</option>
                            {versions.map((v) => (
                                <option key={v} value={v}>{v}</option>
                            ))}
                        </select>
                        <select
                            value={modLoaderType}
                            onChange={(e) => setModLoaderType(e.target.value)}
                            className="input min-w-[160px]"
                        >
                            {MOD_LOADERS.map((loader) => (
                                <option key={loader.value} value={loader.value}>
                                    {loader.label}
                                </option>
                            ))}
                        </select>
                        <button
                            type="submit"
                            className="btn btn-primary whitespace-nowrap"
                            disabled={loading}
                        >
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <>
                                    <Search className="w-4 h-4" />
                                    Szukaj
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </form>

            {/* Blad */}
            {error && (
                <div className="card border border-red-500/30 bg-red-900/10">
                    <div className="flex items-center gap-3 text-red-400">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <p>{error}</p>
                    </div>
                </div>
            )}

            {/* Stan poczatkowy */}
            {!searched && !loading && (
                <div className="card text-center py-16">
                    <Box className="w-16 h-16 text-orange-500/50 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-white mb-2">
                        Wyszukaj {activeTab === 'mods' ? 'mody' : 'modpacki'} z CurseForge
                    </h3>
                    <p className="text-gray-400 max-w-md mx-auto">
                        Wpisz nazwe {activeTab === 'mods' ? 'moda' : 'modpacka'} w pole wyszukiwania,
                        opcjonalnie wybierz wersje Minecraft i mod loader, a nastepnie kliknij "Szukaj".
                    </p>
                </div>
            )}

            {/* Ladowanie */}
            {loading && (
                <div className="flex items-center justify-center h-64">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                        <p className="text-sm text-gray-500">Wyszukiwanie...</p>
                    </div>
                </div>
            )}

            {/* Wyniki */}
            {searched && !loading && !error && (
                <>
                    {results.length > 0 ? (
                        <>
                            {/* Info o wynikach */}
                            <div className="flex items-center justify-between text-sm text-gray-400">
                                <p>Znaleziono: {formatDownloads(totalCount)} wynikow</p>
                                <p>Strona {currentPage} z {totalPages}</p>
                            </div>

                            {/* Siatka wynikow */}
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {results.map((mod) => (
                                    <div key={mod.id} className="card hover:border-orange-500/30 transition-colors group">
                                        <div className="flex gap-4">
                                            {/* Logo */}
                                            <div className="w-16 h-16 rounded-lg overflow-hidden bg-mc-gray flex-shrink-0">
                                                {mod.logo?.thumbnailUrl ? (
                                                    <img
                                                        src={mod.logo.thumbnailUrl}
                                                        alt={mod.name}
                                                        className="w-full h-full object-cover"
                                                        onError={(e) => {
                                                            e.target.style.display = 'none';
                                                            e.target.parentNode.innerHTML = '<div class="w-full h-full flex items-center justify-center"><svg class="w-8 h-8 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg></div>';
                                                        }}
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <Package className="w-8 h-8 text-gray-600" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-semibold text-white truncate" title={mod.name}>
                                                    {mod.name}
                                                </h3>
                                                <p className="text-xs text-gray-500 mb-1">
                                                    {mod.authors?.map(a => a.name).join(', ') || 'Nieznany autor'}
                                                </p>
                                                <div className="flex items-center gap-3 text-xs text-gray-400">
                                                    <span className="flex items-center gap-1">
                                                        <Download className="w-3 h-3" />
                                                        {formatDownloads(mod.downloadCount)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Opis */}
                                        <p className="text-sm text-gray-400 mt-3 line-clamp-2">
                                            {truncateText(mod.summary)}
                                        </p>

                                        {/* Akcje */}
                                        <div className="flex items-center justify-between mt-4 pt-3 border-t border-mc-gray">
                                            {mod.links?.websiteUrl && (
                                                <a
                                                    href={mod.links.websiteUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1 transition-colors"
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                    CurseForge
                                                </a>
                                            )}
                                            <button
                                                onClick={() => handleOpenImport(mod)}
                                                className="btn btn-primary text-sm py-1.5 px-3 ml-auto"
                                            >
                                                <Download className="w-4 h-4" />
                                                {activeTab === 'mods' ? 'Importuj' : 'Importuj Modpack'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Paginacja */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-center gap-4 pt-4">
                                    <button
                                        onClick={handlePrevPage}
                                        disabled={currentIndex === 0}
                                        className="btn btn-secondary"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                        Poprzednia
                                    </button>
                                    <span className="text-gray-400 text-sm">
                                        Strona {currentPage} z {totalPages}
                                    </span>
                                    <button
                                        onClick={handleNextPage}
                                        disabled={currentIndex + PAGE_SIZE >= totalCount}
                                        className="btn btn-secondary"
                                    >
                                        Nastepna
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="card text-center py-12">
                            <Search className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                            <p className="text-gray-400">Brak wynikow</p>
                            <p className="text-gray-500 text-sm mt-1">Sprobuj zmienic fraze wyszukiwania lub filtry</p>
                        </div>
                    )}
                </>
            )}

            {/* Modal importu */}
            {importModal.open && importModal.mod && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="card w-full max-w-lg animate-fadeIn max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-white">
                                {activeTab === 'mods' ? 'Importuj mod' : 'Importuj modpack'}
                            </h3>
                            <button
                                onClick={handleCloseImport}
                                className="p-2 hover:bg-mc-gray rounded-lg text-gray-400 transition-colors"
                                disabled={importing}
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Info o modzie */}
                        <div className="flex items-center gap-3 mb-4 p-3 bg-mc-gray/50 rounded-lg">
                            <div className="w-12 h-12 rounded-lg overflow-hidden bg-mc-gray flex-shrink-0">
                                {importModal.mod.logo?.thumbnailUrl ? (
                                    <img
                                        src={importModal.mod.logo.thumbnailUrl}
                                        alt={importModal.mod.name}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <Package className="w-6 h-6 text-gray-600" />
                                    </div>
                                )}
                            </div>
                            <div>
                                <p className="font-medium text-white">{importModal.mod.name}</p>
                                <p className="text-xs text-gray-400">
                                    {importModal.mod.authors?.map(a => a.name).join(', ')}
                                </p>
                            </div>
                        </div>

                        {/* Progress modpacka */}
                        {modpackProgress && (
                            <div className="mb-4 space-y-3">
                                {/* Pasek postepu */}
                                <div>
                                    <div className="flex justify-between text-sm text-gray-400 mb-1">
                                        <span>Postep importu</span>
                                        <span>
                                            {modpackProgress.imported + modpackProgress.failed}/{modpackProgress.total}
                                        </span>
                                    </div>
                                    <div className="w-full bg-mc-gray rounded-full h-2">
                                        <div
                                            className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                                            style={{
                                                width: modpackProgress.total > 0
                                                    ? `${((modpackProgress.imported + modpackProgress.failed) / modpackProgress.total) * 100}%`
                                                    : '0%'
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Podsumowanie */}
                                {modpackProgress.done && (
                                    <div className="p-3 bg-mc-gray/50 rounded-lg space-y-1 text-sm">
                                        <p className="text-green-400 flex items-center gap-2">
                                            <Check className="w-4 h-4" />
                                            Zaimportowano: {modpackProgress.imported}
                                        </p>
                                        {modpackProgress.failed > 0 && (
                                            <p className="text-red-400 flex items-center gap-2">
                                                <AlertCircle className="w-4 h-4" />
                                                Bledy: {modpackProgress.failed}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Lista elementow */}
                                {modpackProgress.items && modpackProgress.items.length > 0 && (
                                    <div className="max-h-48 overflow-y-auto space-y-1 text-sm">
                                        {modpackProgress.items.map((item, idx) => (
                                            <div
                                                key={idx}
                                                className={`flex items-center gap-2 px-2 py-1 rounded ${
                                                    item.success
                                                        ? 'text-green-400'
                                                        : 'text-red-400'
                                                }`}
                                            >
                                                {item.success ? (
                                                    <Check className="w-3 h-3 flex-shrink-0" />
                                                ) : (
                                                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                                                )}
                                                <span className="truncate">{item.name || item.filename || `Mod #${idx + 1}`}</span>
                                                {item.error && (
                                                    <span className="text-xs text-red-500 ml-auto flex-shrink-0">
                                                        ({item.error})
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {modpackProgress.done && (
                                    <button
                                        onClick={handleCloseImport}
                                        className="btn btn-secondary w-full mt-2"
                                    >
                                        Zamknij
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Wybor pliku - ukryj jesli modpack w trakcie importu */}
                        {!modpackProgress && (
                            <>
                                {filesLoading ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
                                        <span className="text-gray-400 ml-2">Ladowanie plikow...</span>
                                    </div>
                                ) : modFiles.length > 0 ? (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="label">Wybierz wersje pliku</label>
                                            <select
                                                value={selectedFileId}
                                                onChange={(e) => setSelectedFileId(e.target.value)}
                                                className="input w-full"
                                            >
                                                <option value="">-- Wybierz plik --</option>
                                                {modFiles.map((file) => (
                                                    <option key={file.id} value={String(file.id)}>
                                                        {file.displayName || file.fileName}
                                                        {file.gameVersions ? ` [${file.gameVersions.join(', ')}]` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="flex gap-3 pt-2">
                                            <button
                                                type="button"
                                                onClick={handleCloseImport}
                                                className="btn btn-secondary flex-1"
                                                disabled={importing}
                                            >
                                                Anuluj
                                            </button>
                                            <button
                                                onClick={activeTab === 'mods' ? handleImportMod : handleImportModpack}
                                                className="btn btn-primary flex-1"
                                                disabled={importing || !selectedFileId}
                                            >
                                                {importing ? (
                                                    <>
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        Importowanie...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Download className="w-4 h-4" />
                                                        Importuj
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-8">
                                        <AlertCircle className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                                        <p className="text-gray-400">Brak dostepnych plikow</p>
                                        <p className="text-gray-500 text-sm mt-1">
                                            Sprobuj zmienic filtry wersji lub mod loadera
                                        </p>
                                        <button
                                            onClick={handleCloseImport}
                                            className="btn btn-secondary mt-4"
                                        >
                                            Zamknij
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default CurseForgePage;
