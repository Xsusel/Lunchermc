/**
 * Strona zarzadzania skinami i pelerynami graczy
 */
import { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { skinsApi } from '../api/client';
import {
    Shirt, Search, Trash2, RefreshCw, ChevronLeft, ChevronRight,
    User, Calendar, Image, X, Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

function SkinsPage() {
    const [skins, setSkins] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [pagination, setPagination] = useState({
        total: 0,
        limit: 20,
        offset: 0
    });
    const [deleteModal, setDeleteModal] = useState({ open: false, skin: null, type: 'skin' });
    const [actionLoading, setActionLoading] = useState(false);
    const [previewSkin, setPreviewSkin] = useState(null);

    // Debounce wyszukiwania
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setPagination(prev => ({ ...prev, offset: 0 }));
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        loadSkins();
    }, [pagination.offset, debouncedSearch]);

    const loadSkins = async () => {
        try {
            setLoading(true);
            const response = await skinsApi.getAll({
                limit: pagination.limit,
                offset: pagination.offset,
                search: debouncedSearch || undefined
            });
            if (response.success) {
                setSkins(response.data.skins || response.data || []);
                if (response.data.pagination) {
                    setPagination(prev => ({
                        ...prev,
                        total: response.data.pagination.total || 0
                    }));
                }
            }
        } catch (error) {
            toast.error('Blad ladowania skinow');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteModal.skin) return;

        try {
            setActionLoading(true);
            let response;
            if (deleteModal.type === 'cape') {
                response = await skinsApi.deleteCape(deleteModal.skin.id);
            } else {
                response = await skinsApi.delete(deleteModal.skin.id);
            }

            if (response.success) {
                toast.success(
                    deleteModal.type === 'cape'
                        ? `Peleryna gracza ${deleteModal.skin.username} usunieta`
                        : `Skin gracza ${deleteModal.skin.username} usuniety`
                );
                loadSkins();
            }
        } catch (error) {
            toast.error('Blad usuwania');
        } finally {
            setActionLoading(false);
            setDeleteModal({ open: false, skin: null, type: 'skin' });
        }
    };

    const totalPages = Math.ceil(pagination.total / pagination.limit);
    const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;

    const goToPage = (page) => {
        setPagination(prev => ({
            ...prev,
            offset: (page - 1) * prev.limit
        }));
    };

    const getPageNumbers = () => {
        const pages = [];
        const maxVisible = 5;
        let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        let end = Math.min(totalPages, start + maxVisible - 1);

        if (end - start + 1 < maxVisible) {
            start = Math.max(1, end - maxVisible + 1);
        }

        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        return pages;
    };

    const getSkinThumbnailUrl = (skin) => {
        if (skin.skin_url) return skin.skin_url;
        if (skin.skin_path) {
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            return `${apiUrl}/skins/render/${skin.username}?size=64`;
        }
        return null;
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Naglowek */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Shirt className="w-7 h-7 text-mc-green" />
                        Skiny i Peleryny
                    </h1>
                    <p className="text-gray-400">Zarzadzanie skinami graczy</p>
                </div>

                <div className="flex gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Szukaj po nicku..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="input pl-9 w-64"
                        />
                        {search && (
                            <button
                                onClick={() => setSearch('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    <button
                        onClick={loadSkins}
                        className="btn btn-secondary"
                        disabled={loading}
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Lista skinow */}
            <div className="card overflow-hidden p-0">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="loader" />
                    </div>
                ) : skins.length > 0 ? (
                    <>
                        <div className="overflow-x-auto">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th className="w-16">Podglad</th>
                                        <th>Gracz</th>
                                        <th>Typ</th>
                                        <th>Data uploadu</th>
                                        <th className="w-24">Akcje</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {skins.map((skin) => {
                                        const thumbnailUrl = getSkinThumbnailUrl(skin);

                                        return (
                                            <tr key={skin.id}>
                                                <td>
                                                    {thumbnailUrl ? (
                                                        <button
                                                            onClick={() => setPreviewSkin(skin)}
                                                            className="w-10 h-10 rounded-lg border border-mc-gray overflow-hidden hover:border-mc-accent transition-colors cursor-pointer bg-mc-darker"
                                                        >
                                                            <img
                                                                src={thumbnailUrl}
                                                                alt={`Skin ${skin.username}`}
                                                                className="w-full h-full object-cover image-rendering-pixelated"
                                                                onError={(e) => {
                                                                    e.target.style.display = 'none';
                                                                    e.target.parentElement.classList.add('flex', 'items-center', 'justify-center');
                                                                    const icon = document.createElement('div');
                                                                    icon.innerHTML = '?';
                                                                    icon.className = 'text-gray-500 text-sm';
                                                                    e.target.parentElement.appendChild(icon);
                                                                }}
                                                            />
                                                        </button>
                                                    ) : (
                                                        <div className="w-10 h-10 rounded-lg border border-mc-gray bg-mc-darker flex items-center justify-center">
                                                            <User className="w-5 h-5 text-gray-600" />
                                                        </div>
                                                    )}
                                                </td>
                                                <td>
                                                    <span className="text-white font-medium">{skin.username}</span>
                                                </td>
                                                <td>
                                                    <div className="flex gap-2">
                                                        {(skin.has_skin || skin.skin_path || skin.skin_url) && (
                                                            <span className="px-2 py-0.5 text-xs rounded-full bg-blue-900/30 text-blue-400">
                                                                Skin
                                                            </span>
                                                        )}
                                                        {(skin.has_cape || skin.cape_path || skin.cape_url) && (
                                                            <span className="px-2 py-0.5 text-xs rounded-full bg-purple-900/30 text-purple-400">
                                                                Peleryna
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="text-gray-400 text-sm whitespace-nowrap">
                                                    {skin.uploaded_at || skin.created_at
                                                        ? formatDate(skin.uploaded_at || skin.created_at)
                                                        : '-'}
                                                </td>
                                                <td>
                                                    <div className="flex gap-1">
                                                        {(skin.has_skin || skin.skin_path || skin.skin_url) && (
                                                            <button
                                                                onClick={() => setDeleteModal({
                                                                    open: true,
                                                                    skin,
                                                                    type: 'skin'
                                                                })}
                                                                className="p-1.5 rounded-lg hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors"
                                                                title="Usun skin"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        {(skin.has_cape || skin.cape_path || skin.cape_url) && (
                                                            <button
                                                                onClick={() => setDeleteModal({
                                                                    open: true,
                                                                    skin,
                                                                    type: 'cape'
                                                                })}
                                                                className="p-1.5 rounded-lg hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors"
                                                                title="Usun peleryne"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Paginacja */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between px-4 py-3 border-t border-mc-gray">
                                <p className="text-sm text-gray-500">
                                    Pokazuje {pagination.offset + 1}-{Math.min(pagination.offset + pagination.limit, pagination.total)} z {pagination.total}
                                </p>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => goToPage(currentPage - 1)}
                                        disabled={currentPage === 1}
                                        className="btn btn-secondary btn-sm disabled:opacity-50"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    {getPageNumbers().map(page => (
                                        <button
                                            key={page}
                                            onClick={() => goToPage(page)}
                                            className={`btn btn-sm min-w-[36px] ${
                                                page === currentPage
                                                    ? 'btn-primary'
                                                    : 'btn-secondary'
                                            }`}
                                        >
                                            {page}
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => goToPage(currentPage + 1)}
                                        disabled={currentPage === totalPages}
                                        className="btn btn-secondary btn-sm disabled:opacity-50"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="text-center py-12">
                        <Shirt className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-500">Brak skinow</p>
                        {search && (
                            <p className="text-gray-600 text-sm mt-1">Sprobuj zmienic wyszukiwanie</p>
                        )}
                    </div>
                )}
            </div>

            {/* Modal podgladu skina */}
            {previewSkin && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setPreviewSkin(null)}>
                    <div className="bg-mc-dark rounded-xl border border-mc-gray p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-white">Skin: {previewSkin.username}</h3>
                            <button
                                onClick={() => setPreviewSkin(null)}
                                className="p-1 hover:bg-mc-gray rounded-lg"
                            >
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>
                        <div className="flex justify-center bg-mc-darker rounded-lg p-8 border border-mc-gray">
                            {getSkinThumbnailUrl(previewSkin) ? (
                                <img
                                    src={getSkinThumbnailUrl(previewSkin)}
                                    alt={`Skin ${previewSkin.username}`}
                                    className="w-32 h-32 object-contain"
                                    style={{ imageRendering: 'pixelated' }}
                                />
                            ) : (
                                <User className="w-32 h-32 text-gray-600" />
                            )}
                        </div>
                        <div className="mt-4 space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Gracz:</span>
                                <span className="text-white">{previewSkin.username}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Data uploadu:</span>
                                <span className="text-white">
                                    {previewSkin.uploaded_at || previewSkin.created_at
                                        ? formatDate(previewSkin.uploaded_at || previewSkin.created_at)
                                        : '-'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal potwierdzenia usuniecia */}
            {deleteModal.open && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                    <div className="bg-mc-dark rounded-xl border border-mc-gray p-6 max-w-sm w-full">
                        <h3 className="text-lg font-bold text-white mb-2">
                            {deleteModal.type === 'cape' ? 'Usun peleryne' : 'Usun skin'}
                        </h3>
                        <p className="text-gray-400 mb-6">
                            Czy na pewno chcesz usunac {deleteModal.type === 'cape' ? 'peleryne' : 'skin'} gracza{' '}
                            <span className="text-white font-medium">{deleteModal.skin?.username}</span>?
                            Tej akcji nie mozna cofnac.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setDeleteModal({ open: false, skin: null, type: 'skin' })}
                                className="btn btn-secondary"
                                disabled={actionLoading}
                            >
                                Anuluj
                            </button>
                            <button
                                onClick={handleDelete}
                                className="btn bg-red-600 hover:bg-red-700 text-white"
                                disabled={actionLoading}
                            >
                                {actionLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Trash2 className="w-4 h-4" />
                                )}
                                Usun
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function formatDate(dateString) {
    try {
        return format(new Date(dateString), 'dd.MM.yyyy HH:mm', { locale: pl });
    } catch {
        return dateString;
    }
}

export default SkinsPage;
