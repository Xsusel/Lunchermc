/**
 * Strona logów aktywności
 */
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { logsApi } from '../api/client';
import {
    FileText, RefreshCw, Filter, ChevronLeft, ChevronRight,
    LogIn, UserPlus, Gamepad2, Settings, Shield
} from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

const ACTION_FILTERS = [
    { value: '', label: 'Wszystkie' },
    { value: 'login', label: 'Logowania' },
    { value: 'registration', label: 'Rejestracje' },
    { value: 'game_start', label: 'Uruchomienia gry' },
    { value: 'admin_login', label: 'Logowania admina' }
];

function LogsPage() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const [pagination, setPagination] = useState({
        limit: 50,
        offset: 0
    });

    useEffect(() => {
        loadLogs();
    }, [pagination.offset, filter]);

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
            }
        } catch (error) {
            toast.error('Błąd ładowania logów');
        } finally {
            setLoading(false);
        }
    };

    const handleFilterChange = (newFilter) => {
        setFilter(newFilter);
        setPagination(prev => ({ ...prev, offset: 0 }));
    };

    const getActionIcon = (action) => {
        if (action.includes('login')) return LogIn;
        if (action.includes('registration')) return UserPlus;
        if (action.includes('game')) return Gamepad2;
        if (action.includes('admin')) return Shield;
        return Settings;
    };

    const getActionColor = (action) => {
        if (action.includes('login')) return 'text-green-400 bg-green-900/30';
        if (action.includes('registration')) return 'text-blue-400 bg-blue-900/30';
        if (action.includes('game')) return 'text-purple-400 bg-purple-900/30';
        if (action.includes('admin')) return 'text-yellow-400 bg-yellow-900/30';
        return 'text-gray-400 bg-gray-900/30';
    };

    const formatAction = (action) => {
        const actions = {
            'login': 'Logowanie użytkownika',
            'registration': 'Rejestracja nowego użytkownika',
            'game_start': 'Uruchomienie gry',
            'admin_login': 'Logowanie administratora',
            'admin_config_update': 'Aktualizacja konfiguracji',
            'admin_mod_upload': 'Przesłanie moda',
            'admin_mod_delete': 'Usunięcie moda',
            'admin_mod_toggle': 'Zmiana statusu moda',
            'admin_mod_update': 'Aktualizacja moda',
            'admin_mod_add_url': 'Dodanie moda (URL)',
            'admin_user_ban': 'Zbanowanie użytkownika',
            'admin_user_unban': 'Odbanowanie użytkownika',
            'admin_user_delete': 'Usunięcie użytkownika',
            'admin_broadcast_create': 'Utworzenie powiadomienia',
            'admin_maintenance_mode': 'Zmiana trybu konserwacji',
            'admin_launcher_version_add': 'Dodanie wersji launchera'
        };
        return actions[action] || action;
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Nagłówek */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <FileText className="w-7 h-7 text-mc-green" />
                        Logi Aktywności
                    </h1>
                    <p className="text-gray-400">Historia zdarzeń w systemie</p>
                </div>

                <div className="flex gap-2">
                    <select
                        value={filter}
                        onChange={(e) => handleFilterChange(e.target.value)}
                        className="input w-40"
                    >
                        {ACTION_FILTERS.map(f => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                    </select>

                    <button
                        onClick={loadLogs}
                        className="btn btn-secondary"
                        disabled={loading}
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Lista logów */}
            <div className="card overflow-hidden p-0">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="loader" />
                    </div>
                ) : logs.length > 0 ? (
                    <>
                        <div className="overflow-x-auto">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th className="w-12"></th>
                                        <th>Akcja</th>
                                        <th>Użytkownik</th>
                                        <th>Szczegóły</th>
                                        <th>IP</th>
                                        <th>Data</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map((log) => {
                                        const ActionIcon = getActionIcon(log.action);
                                        const colorClass = getActionColor(log.action);

                                        return (
                                            <tr key={log.id}>
                                                <td>
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorClass}`}>
                                                        <ActionIcon className="w-4 h-4" />
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className="text-white">{formatAction(log.action)}</span>
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

                        {/* Paginacja */}
                        <div className="flex items-center justify-between px-4 py-3 border-t border-mc-gray">
                            <p className="text-sm text-gray-500">
                                Pokazuję {logs.length} wpisów
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
                                    Nowsze
                                </button>
                                <button
                                    onClick={() => setPagination(prev => ({
                                        ...prev,
                                        offset: prev.offset + prev.limit
                                    }))}
                                    disabled={logs.length < pagination.limit}
                                    className="btn btn-secondary btn-sm disabled:opacity-50"
                                >
                                    Starsze
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="text-center py-12">
                        <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-500">Brak logów</p>
                        {filter && (
                            <p className="text-gray-600 text-sm">Spróbuj zmienić filtr</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function formatDate(dateString) {
    try {
        return format(new Date(dateString), 'dd.MM.yyyy HH:mm:ss', { locale: pl });
    } catch {
        return dateString;
    }
}

export default LogsPage;
