/**
 * Strona zarzadzania aktualnosciami (news)
 */
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { newsApi } from '../api/client';
import {
    Newspaper, Plus, Edit3, Trash2, Pin, PinOff,
    Eye, EyeOff, Loader2, Search, Filter,
    ChevronLeft, ChevronRight, Tag, Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

// Konfiguracja typow wiadomosci
const NEWS_TYPES = {
    news: { label: 'Wiadomosc', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    update: { label: 'Aktualizacja', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
    event: { label: 'Wydarzenie', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    maintenance: { label: 'Konserwacja', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    announcement: { label: 'Ogloszenie', color: 'bg-red-500/20 text-red-400 border-red-500/30' }
};

function NewsPage() {
    const [news, setNews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState('');
    const [pagination, setPagination] = useState({
        total: 0,
        page: 1,
        pages: 1,
        limit: 20,
        offset: 0
    });

    // Modal edycji/tworzenia
    const [modal, setModal] = useState({ open: false, item: null });
    const [form, setForm] = useState({
        title: '',
        content: '',
        summary: '',
        type: 'news',
        isPinned: false,
        tags: ''
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadNews();
    }, [pagination.offset, filterType]);

    const loadNews = async () => {
        try {
            setLoading(true);
            const response = await newsApi.getAll({
                limit: pagination.limit,
                offset: pagination.offset,
                type: filterType || undefined
            });
            if (response.success) {
                setNews(response.data || []);
                if (response.pagination) {
                    setPagination(prev => ({
                        ...prev,
                        total: response.pagination.total,
                        page: response.pagination.page,
                        pages: response.pagination.pages
                    }));
                }
            }
        } catch (error) {
            toast.error('Blad ladowania wiadomosci');
        } finally {
            setLoading(false);
        }
    };

    const openCreateModal = () => {
        setForm({
            title: '',
            content: '',
            summary: '',
            type: 'news',
            isPinned: false,
            tags: ''
        });
        setModal({ open: true, item: null });
    };

    const openEditModal = (item) => {
        setForm({
            title: item.title,
            content: item.content,
            summary: item.summary || '',
            type: item.type || 'news',
            isPinned: !!item.is_pinned,
            tags: (item.tags || []).join(', ')
        });
        setModal({ open: true, item });
    };

    const handleSave = async () => {
        if (!form.title.trim() || !form.content.trim()) {
            toast.error('Tytul i tresc sa wymagane');
            return;
        }

        setSaving(true);
        try {
            const data = {
                title: form.title,
                content: form.content,
                summary: form.summary || undefined,
                type: form.type,
                isPinned: form.isPinned,
                tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : []
            };

            if (modal.item) {
                await newsApi.update(modal.item.id, data);
                toast.success('Wiadomosc zostala zaktualizowana');
            } else {
                await newsApi.create(data);
                toast.success('Wiadomosc zostala utworzona');
            }
            setModal({ open: false, item: null });
            loadNews();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Blad zapisu wiadomosci');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (item) => {
        if (!confirm(`Czy na pewno chcesz usunac wiadomosc "${item.title}"?`)) return;

        try {
            await newsApi.delete(item.id);
            toast.success('Wiadomosc zostala usunieta');
            loadNews();
        } catch (error) {
            toast.error('Blad usuwania wiadomosci');
        }
    };

    const handleTogglePublish = async (item) => {
        try {
            if (item.is_published) {
                await newsApi.unpublish(item.id);
                toast.success('Publikacja wycofana');
            } else {
                await newsApi.publish(item.id);
                toast.success('Wiadomosc opublikowana');
            }
            loadNews();
        } catch (error) {
            toast.error('Blad zmiany statusu publikacji');
        }
    };

    const handleTogglePin = async (item) => {
        try {
            const response = await newsApi.togglePinned(item.id);
            toast.success(response.message || 'Status przypiecia zmieniony');
            loadNews();
        } catch (error) {
            toast.error('Blad zmiany przypiecia');
        }
    };

    // Filtrowanie po wyszukiwaniu (lokalnie)
    const filteredNews = news.filter(item =>
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        (item.content && item.content.toLowerCase().includes(search.toLowerCase()))
    );

    const totalPages = pagination.pages;
    const currentPage = pagination.page;

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Naglowek */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Newspaper className="w-7 h-7 text-mc-green" />
                        Aktualnosci
                    </h1>
                    <p className="text-gray-400">Zarzadzaj wiadomosciami i ogloszeniami ({pagination.total})</p>
                </div>

                <button onClick={openCreateModal} className="btn btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Nowa wiadomosc
                </button>
            </div>

            {/* Filtry */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Szukaj wiadomosci..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="input pl-10"
                    />
                </div>

                <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <select
                        value={filterType}
                        onChange={(e) => {
                            setFilterType(e.target.value);
                            setPagination(prev => ({ ...prev, offset: 0 }));
                        }}
                        className="input pl-10 pr-8 appearance-none"
                    >
                        <option value="">Wszystkie typy</option>
                        {Object.entries(NEWS_TYPES).map(([key, val]) => (
                            <option key={key} value={key}>{val.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Lista wiadomosci */}
            <div className="card overflow-hidden p-0">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="loader" />
                    </div>
                ) : filteredNews.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                        <Newspaper className="w-12 h-12 mb-4 opacity-50" />
                        <p>{search || filterType ? 'Nie znaleziono wiadomosci' : 'Brak wiadomosci'}</p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Tytul</th>
                                        <th>Typ</th>
                                        <th>Status</th>
                                        <th>Przypieta</th>
                                        <th>Wyswietlenia</th>
                                        <th>Autor</th>
                                        <th>Data utworzenia</th>
                                        <th className="text-right">Akcje</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredNews.map((item) => (
                                        <tr key={item.id}>
                                            <td>
                                                <div className="max-w-xs">
                                                    <span className="font-medium text-white block truncate">
                                                        {item.title}
                                                    </span>
                                                    {item.summary && (
                                                        <span className="text-xs text-gray-500 block truncate">
                                                            {item.summary}
                                                        </span>
                                                    )}
                                                    {item.tags && item.tags.length > 0 && (
                                                        <div className="flex gap-1 mt-1 flex-wrap">
                                                            {item.tags.map((tag) => (
                                                                <span key={tag} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-gray-700 text-gray-300 rounded">
                                                                    <Tag className="w-2.5 h-2.5" />
                                                                    {tag}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <TypeBadge type={item.type} />
                                            </td>
                                            <td>
                                                {item.is_published ? (
                                                    <span className="badge badge-success">Opublikowana</span>
                                                ) : (
                                                    <span className="badge badge-secondary">Szkic</span>
                                                )}
                                            </td>
                                            <td>
                                                {item.is_pinned ? (
                                                    <Pin className="w-4 h-4 text-yellow-400" />
                                                ) : (
                                                    <span className="text-gray-600">-</span>
                                                )}
                                            </td>
                                            <td className="text-gray-400 text-sm">
                                                {item.views_count || 0}
                                            </td>
                                            <td className="text-gray-400 text-sm">
                                                {item.author_name || '-'}
                                            </td>
                                            <td className="text-gray-400 text-sm">
                                                {formatDate(item.created_at)}
                                            </td>
                                            <td>
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        onClick={() => handleTogglePublish(item)}
                                                        className={`p-2 rounded-lg transition-colors ${
                                                            item.is_published
                                                                ? 'hover:bg-yellow-900/30 text-yellow-400'
                                                                : 'hover:bg-green-900/30 text-green-400'
                                                        }`}
                                                        title={item.is_published ? 'Wycofaj publikacje' : 'Opublikuj'}
                                                    >
                                                        {item.is_published ? (
                                                            <EyeOff className="w-4 h-4" />
                                                        ) : (
                                                            <Eye className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => handleTogglePin(item)}
                                                        className={`p-2 rounded-lg transition-colors ${
                                                            item.is_pinned
                                                                ? 'hover:bg-yellow-900/30 text-yellow-400'
                                                                : 'hover:bg-gray-700 text-gray-400'
                                                        }`}
                                                        title={item.is_pinned ? 'Odepnij' : 'Przypnij'}
                                                    >
                                                        {item.is_pinned ? (
                                                            <PinOff className="w-4 h-4" />
                                                        ) : (
                                                            <Pin className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => openEditModal(item)}
                                                        className="p-2 hover:bg-blue-900/30 rounded-lg text-blue-400 transition-colors"
                                                        title="Edytuj"
                                                    >
                                                        <Edit3 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(item)}
                                                        className="p-2 hover:bg-red-900/30 rounded-lg text-red-400 transition-colors"
                                                        title="Usun"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Paginacja */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between px-4 py-3 border-t border-mc-gray">
                                <p className="text-sm text-gray-500">
                                    Strona {currentPage} z {totalPages}
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setPagination(prev => ({
                                            ...prev,
                                            offset: Math.max(0, prev.offset - prev.limit)
                                        }))}
                                        disabled={pagination.offset === 0}
                                        className="btn btn-secondary btn-sm disabled:opacity-50"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setPagination(prev => ({
                                            ...prev,
                                            offset: prev.offset + prev.limit
                                        }))}
                                        disabled={currentPage >= totalPages}
                                        className="btn btn-secondary btn-sm disabled:opacity-50"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Modal tworzenia/edycji */}
            {modal.open && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="card w-full max-w-2xl animate-fadeIn max-h-[90vh] overflow-y-auto">
                        <h3 className="text-lg font-semibold text-white mb-4">
                            {modal.item ? `Edytuj: ${modal.item.title}` : 'Nowa wiadomosc'}
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="label">Tytul</label>
                                <input
                                    type="text"
                                    value={form.title}
                                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                                    className="input"
                                    placeholder="Tytul wiadomosci"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="label">Typ</label>
                                    <select
                                        value={form.type}
                                        onChange={(e) => setForm({ ...form, type: e.target.value })}
                                        className="input"
                                    >
                                        {Object.entries(NEWS_TYPES).map(([key, val]) => (
                                            <option key={key} value={key}>{val.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="label">Tagi (rozdzielone przecinkiem)</label>
                                    <input
                                        type="text"
                                        value={form.tags}
                                        onChange={(e) => setForm({ ...form, tags: e.target.value })}
                                        className="input"
                                        placeholder="np. mody, serwer, event"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="label">Krotki opis (opcjonalnie)</label>
                                <input
                                    type="text"
                                    value={form.summary}
                                    onChange={(e) => setForm({ ...form, summary: e.target.value })}
                                    className="input"
                                    placeholder="Krotki opis widoczny na liscie"
                                />
                            </div>

                            <div>
                                <label className="label">Tresc</label>
                                <textarea
                                    value={form.content}
                                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                                    className="input min-h-[200px] resize-y"
                                    placeholder="Tresc wiadomosci..."
                                />
                            </div>

                            <div className="flex items-center gap-3">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={form.isPinned}
                                        onChange={(e) => setForm({ ...form, isPinned: e.target.checked })}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-500"></div>
                                </label>
                                <span className="text-sm text-gray-300">Przypnij wiadomosc</span>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setModal({ open: false, item: null })}
                                className="btn btn-secondary flex-1"
                                disabled={saving}
                            >
                                Anuluj
                            </button>
                            <button
                                onClick={handleSave}
                                className="btn btn-primary flex-1"
                                disabled={saving}
                            >
                                {saving ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : modal.item ? (
                                    'Zapisz zmiany'
                                ) : (
                                    'Utworz wiadomosc'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function TypeBadge({ type }) {
    const config = NEWS_TYPES[type] || NEWS_TYPES.news;
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>
            {config.label}
        </span>
    );
}

function formatDate(dateString) {
    try {
        return format(new Date(dateString), 'dd.MM.yyyy HH:mm', { locale: pl });
    } catch {
        return dateString || '-';
    }
}

export default NewsPage;
