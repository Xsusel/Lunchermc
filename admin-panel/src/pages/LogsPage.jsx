/**
 * Strona logow aktywnosci
 * Z filtrami dat, poziomu, kategorii, eksportem CSV i paginacja
 */
import { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { logsApi } from '../api/client';
import {
    FileText, RefreshCw, Filter, ChevronLeft, ChevronRight,
    LogIn, UserPlus, Gamepad2, Settings, Shield,
    Search, Download, Calendar, X, AlertTriangle,
    Info, AlertCircle, ChevronsLeft, ChevronsRight
} from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

const ACTION_FILTERS = [
    { value: '', label: 'Wszystkie akcje' },
    { value: 'login', label: 'Logowania' },
    { value: 'registration', label: 'Rejestracje' },
    { value: 'game_start', label: 'Uruchomienia gry' },
    { value: 'admin_login', label: 'Logowania admina' },
    { value: 'admin_config_update', label: 'Aktualizacja konfiguracji' },
    { value: 'admin_mod_upload', label: 'Upload moda' },
    { value: 'admin_mod_delete', label: 'Usuniecie moda' },
    { value: 'admin_user_ban', label: 'Banowanie' },
    { value: 'admin_user_unban', label: 'Odbanowanie' },
    { value: 'admin_user_delete', label: 'Usuniecie uzytkownika' },
    { value: 'admin_broadcast_create', label: 'Nowe powiadomienie' }
];

const SEVERITY_LEVELS = [
    { value: '', label: 'Wszystkie poziomy', color: '' },
    { value: 'info', label: 'Info', color: 'text-green-400' },
    { value: 'warning', label: 'Ostrzezenie', color: 'text-yellow-400' },
    { value: 'error', label: 'Blad', color: 'text-red-400' }
];

const CATEGORY_FILTERS = [
    { value: '', label: 'Wszystkie kategorie' },
    { value: 'auth', label: 'Autoryzacja' },
    { value: 'game', label: 'Gra' },
    { value: 'admin', label: 'Panel admina' },
    { value: 'system', label: 'System' }
];

/**
 * Klasyfikacja poziomu zdarzenia na podstawie akcji
 */
function getSeverity(action) {
    if (!action) return 'info';
    if (action.includes('ban') || action.includes('delete') || action.includes('error')) return 'error';
    if (action.includes('maintenance') || action.includes('unban') || action.includes('warning')) return 'warning';
    return 'info';
}

/**
 * Klasyfikacja kategorii na podstawie akcji
 */
function getCategory(action) {
    if (!action) return 'system';
    if (action.includes('login') || action.includes('registration')) return 'auth';
    if (action.includes('game')) return 'game';
    if (action.includes('admin')) return 'admin';
    return 'system';
}

function LogsPage() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const [severityFilter, setSeverityFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [searchText, setSearchText] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [totalCount, setTotalCount] = useState(0);
    const [pagination, setPagination] = useState({
        limit: 50,
        offset: 0
    });

    // Debounce wyszukiwania
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchText);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchText]);

    useEffect(() => {
        loadLogs();
    }, [pagination.offset, filter]);

    // Reset offset przy zmianie filtrow
    useEffect(() => {
        setPagination(prev => ({ ...prev, offset: 0 }));
    }, [debouncedSearch, severityFilter, categoryFilter, dateFrom, dateTo]);

    const loadLogs = async () => {
        try {
            setLoading(true);
            const response = await logsApi.getAll(
                pagination.limit,
                pagination.offset,
                filter || null
            );
            if (response.success) {
                setLogs(response.data);
                // Probuj wyciagnac total z response
                if (response.pagination?.total) {
                    setTotalCount(response.pagination.total);
                } else if (response.total) {
                    setTotalCount(response.total);
                } else {
                    // Jesli brak total, szacuj na podstawie danych
                    setTotalCount(
                        response.data.length < pagination.limit
                            ? pagination.offset + response.data.length
                            : pagination.offset + pagination.limit + 1
                    );
                }
            }
        } catch (error) {
            toast.error('Blad ladowania logow');
        } finally {
            setLoading(false);
        }
    };

    const handleFilterChange = (newFilter) => {
        setFilter(newFilter);
        setPagination(prev => ({ ...prev, offset: 0 }));
    };

    const clearAllFilters = () => {
        setFilter('');
        setSeverityFilter('');
        setCategoryFilter('');
        setSearchText('');
        setDebouncedSearch('');
        setDateFrom('');
        setDateTo('');
        setPagination(prev => ({ ...prev, offset: 0 }));
    };

    const hasActiveFilters = filter || severityFilter || categoryFilter || debouncedSearch || dateFrom || dateTo;

    // Filtrowanie po stronie klienta (severity, category, search, date)
    const filteredLogs = useMemo(() => {
        let result = logs;

        if (severityFilter) {
            result = result.filter(log => getSeverity(log.action) === severityFilter);
        }

        if (categoryFilter) {
            result = result.filter(log => getCategory(log.action) === categoryFilter);
        }

        if (debouncedSearch) {
            const q = debouncedSearch.toLowerCase();
            result = result.filter(log => {
                const actionText = formatAction(log.action).toLowerCase();
                const details = typeof log.details === 'object'
                    ? JSON.stringify(log.details).toLowerCase()
                    : (log.details || '').toLowerCase();
                const username = (log.username || '').toLowerCase();
                return actionText.includes(q) || details.includes(q) || username.includes(q);
            });
        }

        if (dateFrom) {
            const from = new Date(dateFrom);
            from.setHours(0, 0, 0, 0);
            result = result.filter(log => new Date(log.created_at) >= from);
        }

        if (dateTo) {
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            result = result.filter(log => new Date(log.created_at) <= to);
        }

        return result;
    }, [logs, severityFilter, categoryFilter, debouncedSearch, dateFrom, dateTo]);

    // Eksport CSV
    const exportToCSV = () => {
        if (filteredLogs.length === 0) {
            toast.error('Brak danych do eksportu');
            return;
        }

        const headers = ['ID', 'Data', 'Akcja', 'Uzytkownik', 'Szczegoly', 'IP', 'Poziom', 'Kategoria'];
        const rows = filteredLogs.map(log => [
            log.id,
            log.created_at,
            formatAction(log.action),
            log.username || '',
            typeof log.details === 'object' ? JSON.stringify(log.details) : (log.details || ''),
            log.ip_address || '',
            getSeverity(log.action),
            getCategory(log.action)
        ]);

        const csvContent = [
            headers.join(';'),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
        ].join('\n');

        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `logi_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast.success(`Wyeksportowano ${filteredLogs.length} wpisow`);
    };

    const getActionIcon = (action) => {
        if (action.includes('login')) return LogIn;
        if (action.includes('registration')) return UserPlus;
        if (action.includes('game')) return Gamepad2;
        if (action.includes('admin')) return Shield;
        return Settings;
    };

    const getSeverityColor = (action) => {
        const severity = getSeverity(action);
        switch (severity) {
            case 'error': return 'text-red-400 bg-red-900/30';
            case 'warning': return 'text-yellow-400 bg-yellow-900/30';
            default: return 'text-green-400 bg-green-900/30';
        }
    };

    const getSeverityBadge = (action) => {
        const severity = getSeverity(action);
        switch (severity) {
            case 'error':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-red-900/30 text-red-400">
                        <AlertCircle className="w-3 h-3" />
                        Blad
                    </span>
                );
            case 'warning':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-yellow-900/30 text-yellow-400">
                        <AlertTriangle className="w-3 h-3" />
                        Ostrz.
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-green-900/30 text-green-400">
                        <Info className="w-3 h-3" />
                        Info
                    </span>
                );
        }
    };

    const getSeverityRowClass = (action) => {
        const severity = getSeverity(action);
        switch (severity) {
            case 'error': return 'border-l-2 border-l-red-500';
            case 'warning': return 'border-l-2 border-l-yellow-500';
            default: return 'border-l-2 border-l-green-500/30';
        }
    };

    // Paginacja
    const totalPages = Math.max(1, Math.ceil(totalCount / pagination.limit));
    const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;

    const goToPage = (page) => {
        setPagination(prev => ({
            ...prev,
            offset: (page - 1) * prev.limit
        }));
    };

    const getPageNumbers = () => {
        const pages = [];
        const maxVisible = 7;
        let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        let end = Math.min(totalPages, start + maxVisible - 1);

        if (end - start + 1 < maxVisible) {
            start = Math.max(1, end - maxVisible + 1);
        }

        if (start > 1) {
            pages.push(1);
            if (start > 2) pages.push('...');
        }

        for (let i = start; i <= end; i++) {
            pages.push(i);
        }

        if (end < totalPages) {
            if (end < totalPages - 1) pages.push('...');
            pages.push(totalPages);
        }

        return pages;
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Naglowek */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <FileText className="w-7 h-7 text-mc-green" />
                        Logi Aktywnosci
                    </h1>
                    <p className="text-gray-400">Historia zdarzen w systemie</p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`btn btn-secondary ${showFilters ? 'ring-2 ring-mc-accent' : ''}`}
                    >
                        <Filter className="w-4 h-4" />
                        Filtry
                        {hasActiveFilters && (
                            <span className="w-2 h-2 rounded-full bg-mc-accent" />
                        )}
                    </button>

                    <button
                        onClick={exportToCSV}
                        className="btn btn-secondary"
                        disabled={filteredLogs.length === 0}
                    >
                        <Download className="w-4 h-4" />
                        Eksport CSV
                    </button>

                    <button
                        onClick={loadLogs}
                        className="btn btn-secondary"
                        disabled={loading}
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Panel filtrow */}
            {showFilters && (
                <div className="card animate-fadeIn">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                            <Filter className="w-4 h-4" />
                            Filtry
                        </h3>
                        {hasActiveFilters && (
                            <button
                                onClick={clearAllFilters}
                                className="text-xs text-gray-500 hover:text-white flex items-center gap-1"
                            >
                                <X className="w-3 h-3" />
                                Wyczysc filtry
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                        {/* Wyszukiwanie */}
                        <div className="xl:col-span-2">
                            <label className="block text-xs text-gray-500 mb-1">Szukaj</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="Szukaj w akcjach, szczegolach..."
                                    value={searchText}
                                    onChange={(e) => setSearchText(e.target.value)}
                                    className="input pl-9 w-full"
                                />
                            </div>
                        </div>

                        {/* Filtr akcji */}
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Akcja</label>
                            <select
                                value={filter}
                                onChange={(e) => handleFilterChange(e.target.value)}
                                className="input w-full"
                            >
                                {ACTION_FILTERS.map(f => (
                                    <option key={f.value} value={f.value}>{f.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Filtr poziomu */}
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Poziom</label>
                            <select
                                value={severityFilter}
                                onChange={(e) => setSeverityFilter(e.target.value)}
                                className="input w-full"
                            >
                                {SEVERITY_LEVELS.map(s => (
                                    <option key={s.value} value={s.value}>{s.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Filtr kategorii */}
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Kategoria</label>
                            <select
                                value={categoryFilter}
                                onChange={(e) => setCategoryFilter(e.target.value)}
                                className="input w-full"
                            >
                                {CATEGORY_FILTERS.map(c => (
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Placeholder na uklad */}
                        <div className="hidden xl:block" />

                        {/* Zakres dat */}
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Data od</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className="input pl-9 w-full"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Data do</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className="input pl-9 w-full"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Lista logow */}
            <div className="card overflow-hidden p-0">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="loader" />
                    </div>
                ) : filteredLogs.length > 0 ? (
                    <>
                        <div className="overflow-x-auto">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th className="w-12"></th>
                                        <th>Akcja</th>
                                        <th>Poziom</th>
                                        <th>Uzytkownik</th>
                                        <th>Szczegoly</th>
                                        <th>IP</th>
                                        <th>Data</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredLogs.map((log) => {
                                        const ActionIcon = getActionIcon(log.action);
                                        const colorClass = getSeverityColor(log.action);
                                        const rowClass = getSeverityRowClass(log.action);

                                        return (
                                            <tr key={log.id} className={rowClass}>
                                                <td>
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorClass}`}>
                                                        <ActionIcon className="w-4 h-4" />
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className="text-white">{formatAction(log.action)}</span>
                                                </td>
                                                <td>
                                                    {getSeverityBadge(log.action)}
                                                </td>
                                                <td className="text-gray-400">
                                                    {log.username || '-'}
                                                </td>
                                                <td className="text-gray-500 text-sm max-w-xs truncate">
                                                    {log.details ? (
                                                        typeof log.details === 'object'
                                                            ? JSON.stringify(log.details)
                                                            : log.details
                                                    ) : '-'}
                                                </td>
                                                <td className="text-gray-500 font-mono text-sm">
                                                    {log.ip_address || '-'}
                                                </td>
                                                <td className="text-gray-400 text-sm whitespace-nowrap">
                                                    {formatDate(log.created_at)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Paginacja z numerami stron */}
                        <div className="flex items-center justify-between px-4 py-3 border-t border-mc-gray">
                            <p className="text-sm text-gray-500">
                                Pokazuję {filteredLogs.length} wpisow
                                {hasActiveFilters && logs.length !== filteredLogs.length && (
                                    <span className="text-gray-600"> (przefiltrowano z {logs.length})</span>
                                )}
                            </p>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => goToPage(1)}
                                    disabled={currentPage === 1}
                                    className="btn btn-secondary btn-sm disabled:opacity-50"
                                    title="Pierwsza strona"
                                >
                                    <ChevronsLeft className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => goToPage(currentPage - 1)}
                                    disabled={currentPage === 1}
                                    className="btn btn-secondary btn-sm disabled:opacity-50"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>

                                {getPageNumbers().map((page, idx) => (
                                    page === '...' ? (
                                        <span key={`dots-${idx}`} className="px-2 text-gray-500">...</span>
                                    ) : (
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
                                    )
                                ))}

                                <button
                                    onClick={() => goToPage(currentPage + 1)}
                                    disabled={currentPage === totalPages || logs.length < pagination.limit}
                                    className="btn btn-secondary btn-sm disabled:opacity-50"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => goToPage(totalPages)}
                                    disabled={currentPage === totalPages || logs.length < pagination.limit}
                                    className="btn btn-secondary btn-sm disabled:opacity-50"
                                    title="Ostatnia strona"
                                >
                                    <ChevronsRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="text-center py-12">
                        <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-500">Brak logow</p>
                        {hasActiveFilters && (
                            <div className="mt-2">
                                <p className="text-gray-600 text-sm">Sprobuj zmienic filtry</p>
                                <button
                                    onClick={clearAllFilters}
                                    className="mt-2 text-sm text-mc-accent hover:text-mc-green"
                                >
                                    Wyczysc wszystkie filtry
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function formatAction(action) {
    const actions = {
        'login': 'Logowanie uzytkownika',
        'registration': 'Rejestracja nowego uzytkownika',
        'game_start': 'Uruchomienie gry',
        'admin_login': 'Logowanie administratora',
        'admin_config_update': 'Aktualizacja konfiguracji',
        'admin_mod_upload': 'Przeslanie moda',
        'admin_mod_delete': 'Usuniecie moda',
        'admin_mod_toggle': 'Zmiana statusu moda',
        'admin_mod_update': 'Aktualizacja moda',
        'admin_mod_add_url': 'Dodanie moda (URL)',
        'admin_user_ban': 'Zbanowanie uzytkownika',
        'admin_user_unban': 'Odbanowanie uzytkownika',
        'admin_user_delete': 'Usuniecie uzytkownika',
        'admin_broadcast_create': 'Utworzenie powiadomienia',
        'admin_maintenance_mode': 'Zmiana trybu konserwacji',
        'admin_launcher_version_add': 'Dodanie wersji launchera'
    };
    return actions[action] || action;
}

function formatDate(dateString) {
    try {
        return format(new Date(dateString), 'dd.MM.yyyy HH:mm:ss', { locale: pl });
    } catch {
        return dateString;
    }
}

export default LogsPage;
