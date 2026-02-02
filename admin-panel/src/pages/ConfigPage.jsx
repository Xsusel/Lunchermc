/**
 * Strona konfiguracji gry
 */
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { configApi } from '../api/client';
import {
    Settings, Server, Cpu, Save, AlertTriangle,
    Loader2, RefreshCw, Gamepad2
} from 'lucide-react';

// Dostępne wersje Minecraft (można rozbudować o pobieranie z API)
const MC_VERSIONS = [
    '1.21', '1.20.6', '1.20.4', '1.20.2', '1.20.1', '1.20',
    '1.19.4', '1.19.3', '1.19.2', '1.19',
    '1.18.2', '1.18.1', '1.18',
    '1.17.1', '1.17',
    '1.16.5', '1.16.4', '1.16.3', '1.16.2', '1.16.1',
    '1.12.2', '1.12.1', '1.12',
    '1.8.9', '1.7.10'
];

const LOADER_TYPES = [
    { value: 'vanilla', label: 'Vanilla', description: 'Czyste Minecraft bez modyfikacji' },
    { value: 'forge', label: 'Forge', description: 'Najpopularniejszy modloader' },
    { value: 'fabric', label: 'Fabric', description: 'Lekki i szybki modloader' }
];

function ConfigPage() {
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // Formularz
    const [form, setForm] = useState({
        game_version: '',
        loader_type: 'vanilla',
        forge_version: '',
        fabric_version: '',
        server_ip: '',
        server_port: 25565,
        java_args: '',
        maintenance_mode: false,
        maintenance_message: ''
    });

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        try {
            setLoading(true);
            const response = await configApi.get();
            if (response.success) {
                setConfig(response.data);
                setForm({
                    game_version: response.data.game_version || '',
                    loader_type: response.data.loader_type || 'vanilla',
                    forge_version: response.data.forge_version || '',
                    fabric_version: response.data.fabric_version || '',
                    server_ip: response.data.server_ip || '',
                    server_port: response.data.server_port || 25565,
                    java_args: response.data.java_args || '',
                    maintenance_mode: !!response.data.maintenance_mode,
                    maintenance_message: response.data.maintenance_message || ''
                });
            }
        } catch (error) {
            toast.error('Błąd ładowania konfiguracji');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
        setHasChanges(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await configApi.update(form);
            toast.success('Konfiguracja została zapisana');
            setHasChanges(false);
            loadConfig();
        } catch (error) {
            toast.error('Błąd zapisywania konfiguracji');
        } finally {
            setSaving(false);
        }
    };

    const handleMaintenanceToggle = async () => {
        const newState = !form.maintenance_mode;
        setSaving(true);
        try {
            await configApi.setMaintenance(newState, form.maintenance_message);
            toast.success(newState ? 'Tryb konserwacji włączony' : 'Tryb konserwacji wyłączony');
            setForm(prev => ({ ...prev, maintenance_mode: newState }));
            setHasChanges(false);
        } catch (error) {
            toast.error('Błąd zmiany trybu konserwacji');
        } finally {
            setSaving(false);
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Settings className="w-7 h-7 text-mc-green" />
                        Konfiguracja Gry
                    </h1>
                    <p className="text-gray-400">Ustawienia wersji gry i serwera</p>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={loadConfig}
                        className="btn btn-secondary"
                        disabled={loading}
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Odśwież
                    </button>
                    <button
                        onClick={handleSave}
                        className="btn btn-primary"
                        disabled={saving || !hasChanges}
                    >
                        {saving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        Zapisz
                    </button>
                </div>
            </div>

            {/* Ostrzeżenie o zmianach */}
            {hasChanges && (
                <div className="card bg-yellow-900/20 border-yellow-800 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-500" />
                    <p className="text-yellow-300 text-sm">Masz niezapisane zmiany</p>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Wersja gry */}
                <div className="card">
                    <div className="card-header">
                        <Gamepad2 className="w-5 h-5 text-mc-green" />
                        Wersja Minecraft
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="label">Wersja gry</label>
                            <select
                                value={form.game_version}
                                onChange={(e) => handleChange('game_version', e.target.value)}
                                className="input"
                            >
                                {MC_VERSIONS.map(v => (
                                    <option key={v} value={v}>{v}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="label">Typ loadera</label>
                            <div className="space-y-2">
                                {LOADER_TYPES.map(loader => (
                                    <label
                                        key={loader.value}
                                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                            form.loader_type === loader.value
                                                ? 'border-mc-accent bg-mc-accent/10'
                                                : 'border-mc-gray hover:border-mc-light-gray'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="loader_type"
                                            value={loader.value}
                                            checked={form.loader_type === loader.value}
                                            onChange={(e) => handleChange('loader_type', e.target.value)}
                                            className="mt-1 accent-mc-accent"
                                        />
                                        <div>
                                            <p className="font-medium text-white">{loader.label}</p>
                                            <p className="text-sm text-gray-500">{loader.description}</p>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {form.loader_type === 'forge' && (
                            <div>
                                <label className="label">Wersja Forge</label>
                                <input
                                    type="text"
                                    value={form.forge_version}
                                    onChange={(e) => handleChange('forge_version', e.target.value)}
                                    className="input"
                                    placeholder="np. 47.2.0"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Zostaw puste dla najnowszej wersji
                                </p>
                            </div>
                        )}

                        {form.loader_type === 'fabric' && (
                            <div>
                                <label className="label">Wersja Fabric Loader</label>
                                <input
                                    type="text"
                                    value={form.fabric_version}
                                    onChange={(e) => handleChange('fabric_version', e.target.value)}
                                    className="input"
                                    placeholder="np. 0.15.6"
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Serwer */}
                <div className="card">
                    <div className="card-header">
                        <Server className="w-5 h-5 text-mc-green" />
                        Serwer Minecraft
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="label">Adres IP serwera</label>
                            <input
                                type="text"
                                value={form.server_ip}
                                onChange={(e) => handleChange('server_ip', e.target.value)}
                                className="input"
                                placeholder="play.serwer.pl"
                            />
                        </div>

                        <div>
                            <label className="label">Port</label>
                            <input
                                type="number"
                                value={form.server_port}
                                onChange={(e) => handleChange('server_port', parseInt(e.target.value) || 25565)}
                                className="input"
                                min={1}
                                max={65535}
                            />
                        </div>

                        <div className="p-4 bg-mc-darker rounded-lg">
                            <p className="text-sm text-gray-400">Pełny adres serwera:</p>
                            <p className="font-mono text-white">
                                {form.server_ip || 'localhost'}:{form.server_port || 25565}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Parametry JVM */}
                <div className="card">
                    <div className="card-header">
                        <Cpu className="w-5 h-5 text-mc-green" />
                        Parametry JVM
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="label">Argumenty Java</label>
                            <textarea
                                value={form.java_args}
                                onChange={(e) => handleChange('java_args', e.target.value)}
                                className="input min-h-[120px] font-mono text-sm resize-none"
                                placeholder="-Xmx4G -Xms2G -XX:+UseG1GC"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Domyślne argumenty dla wszystkich graczy. Gracze mogą nadpisać RAM w launcherze.
                            </p>
                        </div>

                        <div className="p-4 bg-mc-darker rounded-lg">
                            <p className="text-sm text-gray-400 mb-2">Zalecane argumenty:</p>
                            <code className="text-xs text-green-400 block whitespace-pre-wrap">
                                {`-Xmx4G -Xms2G -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC`}
                            </code>
                        </div>
                    </div>
                </div>

                {/* Tryb konserwacji */}
                <div className="card">
                    <div className="card-header">
                        <AlertTriangle className="w-5 h-5 text-yellow-500" />
                        Tryb Konserwacji
                    </div>

                    <div className="space-y-4">
                        <div className={`p-4 rounded-lg border ${
                            form.maintenance_mode
                                ? 'bg-yellow-900/20 border-yellow-800'
                                : 'bg-mc-darker border-mc-gray'
                        }`}>
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <p className="font-medium text-white">
                                        {form.maintenance_mode ? 'Konserwacja włączona' : 'Konserwacja wyłączona'}
                                    </p>
                                    <p className="text-sm text-gray-500">
                                        {form.maintenance_mode
                                            ? 'Gracze nie mogą się połączyć'
                                            : 'Serwer działa normalnie'}
                                    </p>
                                </div>
                                <button
                                    onClick={handleMaintenanceToggle}
                                    disabled={saving}
                                    className={`btn ${
                                        form.maintenance_mode ? 'btn-primary' : 'btn-warning'
                                    }`}
                                >
                                    {saving ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : form.maintenance_mode ? (
                                        'Wyłącz'
                                    ) : (
                                        'Włącz'
                                    )}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="label">Wiadomość dla graczy</label>
                            <textarea
                                value={form.maintenance_message}
                                onChange={(e) => handleChange('maintenance_message', e.target.value)}
                                className="input min-h-[80px] resize-none"
                                placeholder="Serwer jest obecnie aktualizowany. Wrócimy wkrótce!"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Informacje o ostatniej aktualizacji */}
            {config && (
                <div className="card bg-mc-darker">
                    <p className="text-sm text-gray-500">
                        Ostatnia aktualizacja konfiguracji: {' '}
                        <span className="text-gray-300">
                            {new Date(config.updated_at).toLocaleString('pl-PL')}
                        </span>
                    </p>
                </div>
            )}
        </div>
    );
}

export default ConfigPage;
