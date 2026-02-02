/**
 * Strona Dashboard - przegląd systemu
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { dashboardApi } from '../api/client';
import { useDataStore } from '../hooks/useStore';
import {
    Users, Package, Bell, Activity, Server,
    TrendingUp, Clock, Gamepad2, AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

function DashboardPage() {
    const { stats, setStats } = useDataStore();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            const response = await dashboardApi.getStats();
            if (response.success) {
                setStats(response.data);
            }
        } catch (error) {
            toast.error('Błąd ładowania statystyk');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="loader" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Nagłówek */}
            <div>
                <h1 className="text-2xl font-bold text-white">Dashboard</h1>
                <p className="text-gray-400">Przegląd systemu XsusLauncher</p>
            </div>

            {/* Ostrzeżenie o trybie konserwacji */}
            {stats?.game?.maintenanceMode && (
                <div className="card bg-yellow-900/20 border-yellow-800 flex items-center gap-4">
                    <AlertTriangle className="w-8 h-8 text-yellow-500" />
                    <div>
                        <h3 className="font-semibold text-yellow-400">Tryb konserwacji włączony</h3>
                        <p className="text-yellow-300/70 text-sm">Launcher jest niedostępny dla graczy</p>
                    </div>
                </div>
            )}

            {/* Statystyki */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Użytkownicy */}
                <div className="stat-card">
                    <div className="stat-icon bg-blue-900/50">
                        <Users className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                        <p className="stat-value">{stats?.users?.total || 0}</p>
                        <p className="stat-label">Użytkowników</p>
                    </div>
                </div>

                {/* Mody */}
                <div className="stat-card">
                    <div className="stat-icon bg-green-900/50">
                        <Package className="w-6 h-6 text-green-400" />
                    </div>
                    <div>
                        <p className="stat-value">{stats?.mods?.enabled || 0}</p>
                        <p className="stat-label">Aktywnych modów</p>
                    </div>
                </div>

                {/* Powiadomienia */}
                <div className="stat-card">
                    <div className="stat-icon bg-yellow-900/50">
                        <Bell className="w-6 h-6 text-yellow-400" />
                    </div>
                    <div>
                        <p className="stat-value">{stats?.broadcasts?.active || 0}</p>
                        <p className="stat-label">Aktywnych ogłoszeń</p>
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

            {/* Sekcja dolna */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Ostatnia aktywność */}
                <div className="card">
                    <div className="card-header">
                        <Activity className="w-5 h-5 text-mc-green" />
                        Ostatnia aktywność
                    </div>

                    {stats?.recentActivity?.length > 0 ? (
                        <div className="space-y-3">
                            {stats.recentActivity.slice(0, 5).map((log, index) => (
                                <div
                                    key={log.id || index}
                                    className="flex items-center justify-between py-2 border-b border-mc-gray last:border-0"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${
                                            log.action.includes('login') ? 'bg-green-500' :
                                            log.action.includes('register') ? 'bg-blue-500' :
                                            log.action.includes('game') ? 'bg-purple-500' :
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
                        <p className="text-gray-500 text-center py-4">Brak aktywności</p>
                    )}

                    <Link
                        to="/logs"
                        className="block mt-4 text-center text-sm text-mc-accent hover:text-mc-green transition-colors"
                    >
                        Zobacz wszystkie logi →
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
                            Zarządzaj modami
                        </Link>
                        <Link to="/config" className="btn btn-secondary justify-start">
                            <Server className="w-4 h-4" />
                            Konfiguracja
                        </Link>
                        <Link to="/broadcasts" className="btn btn-secondary justify-start">
                            <Bell className="w-4 h-4" />
                            Nowe ogłoszenie
                        </Link>
                        <Link to="/users" className="btn btn-secondary justify-start">
                            <Users className="w-4 h-4" />
                            Użytkownicy
                        </Link>
                    </div>

                    {/* Info o modach */}
                    <div className="mt-6 p-4 bg-mc-darker rounded-lg">
                        <h4 className="text-sm font-medium text-gray-300 mb-2">Statystyki modów</h4>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Wszystkich modów:</span>
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
                </div>
            </div>
        </div>
    );
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
        'admin_mod_delete': 'Usunięcie moda',
        'admin_user_ban': 'Zbanowanie użytkownika',
        'admin_user_unban': 'Odbanowanie użytkownika'
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
