/**
 * Strona Dashboard - przeglad systemu
 * Z informacjami o dysku, pamieci, ostatniej aktywnosci i statystykach
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { dashboardApi, healthApi, logsApi } from '../api/client';
import { useDataStore } from '../hooks/useStore';
import {
    Users, Package, Bell, Activity, Server,
    TrendingUp, Clock, Gamepad2, AlertTriangle,
    Wifi, WifiOff, RefreshCw, HardDrive, Cpu,
    UserPlus, LogIn, FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

function DashboardPage() {
    const { stats, setStats } = useDataStore();
    const [loading, setLoading] = useState(true);
    const [serverStatus, setServerStatus] = useState(null);
    const [serversStatus, setServersStatus] = useState(null);
    const [serverLoading, setServerLoading] = useState(true);
    const [systemHealth, setSystemHealth] = useState(null);
    const [recentLogs, setRecentLogs] = useState([]);

    useEffect(() => {
        loadStats();
        loadAllServersStatus();
        loadSystemHealth();
        loadRecentLogs();

        // Odswiez status serwerow co 30 sekund
        const interval = setInterval(loadAllServersStatus, 30000);
        return () => clearInterval(interval);
    }, []);

    const loadStats = async () => {
        try {
            const response = await dashboardApi.getStats();
            if (response.success) {
                setStats(response.data);
            }
        } catch (error) {
            toast.error('Blad ladowania statystyk');
        } finally {
            setLoading(false);
        }
    };

    const loadSystemHealth = async () => {
        try {
            const response = await healthApi.getDetailed();
            if (response.success) {
                setSystemHealth(response.data);
            }
        } catch (error) {
            // Endpoint moze nie istniec - ignoruj cicho
            console.warn('Nie udalo sie pobrac statusu systemu:', error.message);
        }
    };

    const loadRecentLogs = async () => {
        try {
            const response = await logsApi.getAll(5, 0, null);
            if (response.success) {
                setRecentLogs(response.data);
            }
        } catch (error) {
            // Ignoruj - logi zaladowane w stats
        }
    };

    const loadAllServersStatus = async () => {
        try {
            setServerLoading(true);
            const response = await dashboardApi.getAllServersStatus();
            if (response.success) {
                setServersStatus(response.data);
                // Kompatybilnosc wsteczna - ustaw domyslny serwer jako serverStatus
                const defaultServer = response.data.servers?.find(s => s.isDefault) || response.data.servers?.[0];
                if (defaultServer) {
                    setServerStatus(defaultServer);
                }
            }
        } catch (error) {
            // Fallback do starego endpointu
            try {
                const response = await dashboardApi.getServerStatus();
                if (response.success) {
                    setServerStatus(response.data);
                }
            } catch {
                setServerStatus(null);
            }
        } finally {
            setServerLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="loader" />
            </div>
        );
    }

    // Oblicz dzisiejsze statystyki z recentActivity
    const todayStats = computeTodayStats(stats?.recentActivity || recentLogs);

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Naglowek */}
            <div>
                <h1 className="text-2xl font-bold text-white">Dashboard</h1>
                <p className="text-gray-400">Przeglad systemu XsusLauncher</p>
            </div>

            {/* Ostrzezenie o trybie konserwacji */}
            {stats?.game?.maintenanceMode && (
                <div className="card bg-yellow-900/20 border-yellow-800 flex items-center gap-4">
                    <AlertTriangle className="w-8 h-8 text-yellow-500" />
                    <div>
                        <h3 className="font-semibold text-yellow-400">Tryb konserwacji wlaczony</h3>
                        <p className="text-yellow-300/70 text-sm">Launcher jest niedostepny dla graczy</p>
                    </div>
                </div>
            )}

            {/* Status serwerow MC */}
            <div className="card">
                <div className="flex items-center justify-between mb-4">
                    <div className="card-header mb-0">
                        <Server className="w-5 h-5 text-mc-green" />
                        Status Serwerow Minecraft
                        {serversStatus?.summary && (
                            <span className="text-sm font-normal text-gray-400 ml-2">
                                ({serversStatus.summary.onlineServers}/{serversStatus.summary.totalServers} online, {serversStatus.summary.totalPlayersOnline} graczy)
                            </span>
                        )}
                    </div>
                    <button
                        onClick={loadAllServersStatus}
                        disabled={serverLoading}
                        className="btn btn-sm btn-secondary"
                    >
                        <RefreshCw className={`w-4 h-4 ${serverLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {serversStatus?.servers?.length > 0 ? (
                    <div className="space-y-3">
                        {serversStatus.servers.map((srv) => (
                            <div key={srv.id} className={`p-4 rounded-lg border flex items-center gap-4 ${
                                srv.online
                                    ? 'bg-green-900/10 border-green-800/50'
                                    : 'bg-red-900/10 border-red-800/50'
                            }`}>
                                {srv.online ? (
                                    <Wifi className="w-6 h-6 text-green-500 flex-shrink-0" />
                                ) : (
                                    <WifiOff className="w-6 h-6 text-red-500 flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-medium text-white">{srv.name}</p>
                                        {srv.isDefault && (
                                            <span className="px-1.5 py-0.5 text-xs bg-mc-accent/20 text-mc-accent rounded">Domyslny</span>
                                        )}
                                        <span className={`text-xs ${srv.online ? 'text-green-400' : 'text-red-400'}`}>
                                            {srv.online ? 'ONLINE' : 'OFFLINE'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 font-mono">{srv.ip}:{srv.port || 25565}</p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className="text-lg font-bold text-white">
                                        {srv.players?.online || 0}<span className="text-gray-500 text-sm">/{srv.players?.max || 0}</span>
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {srv.latency ? `${srv.latency}ms` : '\u2014'}
                                        {srv.version && ` \u00B7 ${srv.version}`}
                                    </p>
                                </div>
                                {srv.players?.sample?.length > 0 && (
                                    <div className="hidden lg:flex flex-wrap gap-1 flex-shrink-0 max-w-[200px]">
                                        {srv.players.sample.slice(0, 3).map((p, i) => (
                                            <span key={i} className="text-xs bg-mc-gray px-1.5 py-0.5 rounded text-white">{p.name}</span>
                                        ))}
                                        {srv.players.sample.length > 3 && (
                                            <span className="text-xs text-gray-500">+{srv.players.sample.length - 3}</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : serverStatus ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className={`p-4 rounded-lg flex items-center gap-4 ${
                            serverStatus?.online ? 'bg-green-900/20 border border-green-800' : 'bg-red-900/20 border border-red-800'
                        }`}>
                            {serverStatus?.online ? <Wifi className="w-8 h-8 text-green-500" /> : <WifiOff className="w-8 h-8 text-red-500" />}
                            <div>
                                <p className={`text-lg font-bold ${serverStatus?.online ? 'text-green-400' : 'text-red-400'}`}>
                                    {serverStatus?.online ? 'ONLINE' : 'OFFLINE'}
                                </p>
                                <p className="text-sm text-gray-400">{serverStatus?.ip}:{serverStatus?.port || 25565}</p>
                            </div>
                        </div>
                        <div className="p-4 rounded-lg bg-mc-darker border border-mc-gray">
                            <div className="flex items-center gap-3">
                                <Users className="w-8 h-8 text-blue-400" />
                                <div>
                                    <p className="text-2xl font-bold text-white">
                                        {serverStatus?.players?.online || 0}<span className="text-gray-500 text-lg">/{serverStatus?.players?.max || 0}</span>
                                    </p>
                                    <p className="text-sm text-gray-400">Graczy online</p>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 rounded-lg bg-mc-darker border border-mc-gray">
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Wersja:</span>
                                    <span className="text-white">{serverStatus?.version || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Ping:</span>
                                    <span className={serverStatus?.latency < 50 ? 'text-green-400' : serverStatus?.latency < 100 ? 'text-yellow-400' : 'text-red-400'}>
                                        {serverStatus?.latency ? `${serverStatus.latency}ms` : 'N/A'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <p className="text-gray-500 text-center py-4">Brak skonfigurowanych serwerow</p>
                )}
            </div>

            {/* Glowne statystyki */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Uzytkownicy */}
                <div className="stat-card">
                    <div className="stat-icon bg-blue-900/50">
                        <Users className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                        <p className="stat-value">{stats?.users?.total || 0}</p>
                        <p className="stat-label">Uzytkownikow</p>
                        {(stats?.users?.active > 0 || stats?.users?.newToday > 0) && (
                            <p className="text-xs text-gray-500 mt-1">
                                {stats?.users?.active > 0 && <span className="text-green-400">{stats.users.active} aktywnych</span>}
                                {stats?.users?.newToday > 0 && <span className="text-blue-400 ml-2">+{stats.users.newToday} dzis</span>}
                            </p>
                        )}
                    </div>
                </div>

                {/* Mody */}
                <div className="stat-card">
                    <div className="stat-icon bg-green-900/50">
                        <Package className="w-6 h-6 text-green-400" />
                    </div>
                    <div>
                        <p className="stat-value">{stats?.mods?.enabled || 0}</p>
                        <p className="stat-label">Aktywnych modow</p>
                    </div>
                </div>

                {/* Powiadomienia */}
                <div className="stat-card">
                    <div className="stat-icon bg-yellow-900/50">
                        <Bell className="w-6 h-6 text-yellow-400" />
                    </div>
                    <div>
                        <p className="stat-value">{stats?.broadcasts?.active || 0}</p>
                        <p className="stat-label">Aktywnych ogloszen</p>
                    </div>
                </div>

                {/* Wersja gry */}
                <div className="stat-card">
                    <div className="stat-icon bg-purple-900/50">
                        <Gamepad2 className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                        <p className="stat-value">{stats?.game?.version || '---'}</p>
                        <p className="stat-label">Wersja MC ({stats?.game?.loaderType || 'vanilla'})</p>
                    </div>
                </div>
            </div>

            {/* Statystyki dzisiejsze */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="card flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-green-900/30 flex items-center justify-center flex-shrink-0">
                        <LogIn className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                        <p className="text-xl font-bold text-white">{todayStats.logins}</p>
                        <p className="text-xs text-gray-500">Logowan dzis</p>
                    </div>
                </div>
                <div className="card flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                        <UserPlus className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                        <p className="text-xl font-bold text-white">{todayStats.registrations}</p>
                        <p className="text-xs text-gray-500">Rejestracji dzis</p>
                    </div>
                </div>
                <div className="card flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                        <Gamepad2 className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                        <p className="text-xl font-bold text-white">{todayStats.gameStarts}</p>
                        <p className="text-xs text-gray-500">Uruchomien gry dzis</p>
                    </div>
                </div>
                <div className="card flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-yellow-900/30 flex items-center justify-center flex-shrink-0">
                        <Activity className="w-5 h-5 text-yellow-400" />
                    </div>
                    <div>
                        <p className="text-xl font-bold text-white">{todayStats.total}</p>
                        <p className="text-xs text-gray-500">Wszystkich zdarzen dzis</p>
                    </div>
                </div>
            </div>

            {/* Uzycie zasobow systemowych */}
            {systemHealth && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Dysk */}
                    <div className="card">
                        <div className="card-header">
                            <HardDrive className="w-5 h-5 text-mc-green" />
                            Uzycie dysku
                        </div>
                        <UsageBar
                            used={systemHealth.disk?.used || systemHealth.diskUsed || 0}
                            total={systemHealth.disk?.total || systemHealth.diskTotal || 0}
                            label="Dysk"
                        />
                    </div>

                    {/* Pamiec */}
                    <div className="card">
                        <div className="card-header">
                            <Cpu className="w-5 h-5 text-mc-green" />
                            Uzycie pamieci RAM
                        </div>
                        <UsageBar
                            used={systemHealth.memory?.used || systemHealth.memUsed || 0}
                            total={systemHealth.memory?.total || systemHealth.memTotal || 0}
                            label="RAM"
                        />
                    </div>
                </div>
            )}

            {/* Sekcja dolna */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Ostatnia aktywnosc (preview) */}
                <div className="card">
                    <div className="card-header">
                        <Activity className="w-5 h-5 text-mc-green" />
                        Ostatnia aktywnosc
                    </div>

                    {(stats?.recentActivity?.length > 0 || recentLogs.length > 0) ? (
                        <div className="space-y-3">
                            {(stats?.recentActivity || recentLogs).slice(0, 5).map((log, index) => (
                                <div
                                    key={log.id || index}
                                    className="flex items-center justify-between py-2 border-b border-mc-gray last:border-0"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${
                                            log.action.includes('login') ? 'bg-green-500' :
                                            log.action.includes('register') ? 'bg-blue-500' :
                                            log.action.includes('game') ? 'bg-purple-500' :
                                            log.action.includes('ban') || log.action.includes('delete') ? 'bg-red-500' :
                                            'bg-gray-500'
                                        }`} />
                                        <div>
                                            <p className="text-sm text-white">
                                                {log.username || 'System'} - {formatAction(log.action)}
                                            </p>
                                            <p className="text-xs text-gray-500">{log.ip_address}</p>
                                        </div>
                                    </div>
                                    <span className="text-xs text-gray-500">
                                        {formatDate(log.created_at)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-gray-500 text-center py-4">Brak aktywnosci</p>
                    )}

                    <Link
                        to="/logs"
                        className="block mt-4 text-center text-sm text-mc-accent hover:text-mc-green transition-colors"
                    >
                        Zobacz wszystkie logi
                    </Link>
                </div>

                {/* Szybkie akcje */}
                <div className="card">
                    <div className="card-header">
                        <TrendingUp className="w-5 h-5 text-mc-green" />
                        Szybkie akcje
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <Link to="/mods" className="btn btn-secondary justify-start">
                            <Package className="w-4 h-4" />
                            Zarzadzaj modami
                        </Link>
                        <Link to="/config" className="btn btn-secondary justify-start">
                            <Server className="w-4 h-4" />
                            Konfiguracja
                        </Link>
                        <Link to="/broadcasts" className="btn btn-secondary justify-start">
                            <Bell className="w-4 h-4" />
                            Nowe ogloszenie
                        </Link>
                        <Link to="/users" className="btn btn-secondary justify-start">
                            <Users className="w-4 h-4" />
                            Uzytkownicy
                        </Link>
                    </div>

                    {/* Info o modach */}
                    <div className="mt-6 p-4 bg-mc-darker rounded-lg">
                        <h4 className="text-sm font-medium text-gray-300 mb-2">Statystyki modow</h4>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Wszystkich modow:</span>
                                <span className="text-white">{stats?.mods?.total || 0}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Wymaganych:</span>
                                <span className="text-white">{stats?.mods?.required || 0}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Rozmiar pakietu:</span>
                                <span className="text-white">{formatBytes(stats?.mods?.totalSize || 0)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Statystyki czasu gry */}
                    {stats?.playtime && (
                        <div className="mt-4 p-4 bg-mc-darker rounded-lg">
                            <h4 className="text-sm font-medium text-gray-300 mb-2">Czas gry graczy</h4>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Laczny czas gry:</span>
                                    <span className="text-white">{stats.playtime.totalHours || 0}h</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Sredni czas na gracza:</span>
                                    <span className="text-white">{stats.playtime.averageHours || 0}h</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * Komponent paska uzycia zasobow (dysk/RAM)
 */
function UsageBar({ used, total, label }) {
    const percentage = total > 0 ? Math.round((used / total) * 100) : 0;

    const getColor = (pct) => {
        if (pct >= 90) return 'bg-red-500';
        if (pct >= 70) return 'bg-yellow-500';
        return 'bg-green-500';
    };

    const getTextColor = (pct) => {
        if (pct >= 90) return 'text-red-400';
        if (pct >= 70) return 'text-yellow-400';
        return 'text-green-400';
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">
                    {formatBytes(used)} / {formatBytes(total)}
                </span>
                <span className={`text-sm font-medium ${getTextColor(percentage)}`}>
                    {percentage}%
                </span>
            </div>
            <div className="w-full h-3 bg-mc-darker rounded-full overflow-hidden border border-mc-gray">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${getColor(percentage)}`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                />
            </div>
            {percentage >= 90 && (
                <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {label} prawie pelny!
                </p>
            )}
        </div>
    );
}

/**
 * Oblicza dzisiejsze statystyki z listy logow
 */
function computeTodayStats(logs) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayLogs = (logs || []).filter(log => {
        try {
            return new Date(log.created_at) >= today;
        } catch {
            return false;
        }
    });

    return {
        logins: todayLogs.filter(l => l.action === 'login').length,
        registrations: todayLogs.filter(l => l.action === 'registration').length,
        gameStarts: todayLogs.filter(l => l.action === 'game_start').length,
        total: todayLogs.length
    };
}

// Funkcje pomocnicze
function formatAction(action) {
    const actions = {
        'login': 'Logowanie',
        'registration': 'Rejestracja',
        'game_start': 'Uruchomienie gry',
        'admin_login': 'Logowanie admina',
        'admin_config_update': 'Aktualizacja konfiguracji',
        'admin_mod_upload': 'Dodanie moda',
        'admin_mod_delete': 'Usuniecie moda',
        'admin_user_ban': 'Zbanowanie uzytkownika',
        'admin_user_unban': 'Odbanowanie uzytkownika'
    };
    return actions[action] || action;
}

function formatDate(dateString) {
    try {
        return format(new Date(dateString), 'dd MMM, HH:mm', { locale: pl });
    } catch {
        return dateString;
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default DashboardPage;
