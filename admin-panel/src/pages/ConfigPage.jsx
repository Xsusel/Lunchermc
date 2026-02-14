/**
 * Strona konfiguracji gry
 */
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { configApi, serversApi } from '../api/client';
import {
    Settings, Server, Cpu, Save, AlertTriangle,
    Loader2, RefreshCw, Gamepad2, Plus, Trash2, Edit3,
    GripVertical, Power, Star, X
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

    // Serwery
    const [servers, setServers] = useState([]);
    const [loadingServers, setLoadingServers] = useState(true);
    const [showServerModal, setShowServerModal] = useState(false);
    const [editingServer, setEditingServer] = useState(null);
    const [serverForm, setServerForm] = useState({
        name: '', description: '', ip: '', port: 25565, is_default: false
    });
    const [savingServer, setSavingServer] = useState(false);

    // Drag & Drop state
    const [draggedServer, setDraggedServer] = useState(null);
    const [dragOverServer, setDragOverServer] = useState(null);

    // Formularz konfiguracji
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
        loadServers();
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

    const loadServers = async () => {
        try {
            setLoadingServers(true);
            const response = await serversApi.getAll();
            if (response.success) {
                setServers(response.data);
            }
        } catch (error) {
            toast.error('Błąd ładowania serwerów');
        } finally {
            setLoadingServers(false);
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

    // === Zarządzanie serwerami ===

    const openAddServerModal = () => {
        setEditingServer(null);
        setServerForm({ name: '', description: '', ip: '', port: 25565, is_default: false });
        setShowServerModal(true);
    };

    const openEditServerModal = (server) => {
        setEditingServer(server);
        setServerForm({
            name: server.name,
            description: server.description || '',
            ip: server.ip,
            port: server.port || 25565,
            is_default: !!server.is_default
        });
        setShowServerModal(true);
    };

    const handleServerFormChange = (field, value) => {
        setServerForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSaveServer = async () => {
        if (!serverForm.name.trim() || !serverForm.ip.trim()) {
            toast.error('Nazwa i adres IP są wymagane');
            return;
        }
        setSavingServer(true);
        try {
            if (editingServer) {
                await serversApi.update(editingServer.id, serverForm);
                toast.success('Serwer zaktualizowany');
            } else {
                await serversApi.create(serverForm);
                toast.success('Serwer dodany');
            }
            setShowServerModal(false);
            loadServers();
        } catch (error) {
            toast.error('Błąd zapisywania serwera');
        } finally {
            setSavingServer(false);
        }
    };

    const handleDeleteServer = async (server) => {
        if (!confirm(`Czy na pewno chcesz usunąć serwer "${server.name}"?`)) return;
        try {
            await serversApi.delete(server.id);
            toast.success('Serwer usunięty');
            loadServers();
        } catch (error) {
            toast.error('Błąd usuwania serwera');
        }
    };

    const handleToggleServer = async (server) => {
        try {
            await serversApi.toggle(server.id);
            toast.success(server.is_enabled ? 'Serwer wyłączony' : 'Serwer włączony');
            loadServers();
        } catch (error) {
            toast.error('Błąd zmiany statusu serwera');
        }
    };

    const handleSetDefault = async (server) => {
        try {
            await serversApi.update(server.id, { is_default: true });
            toast.success(`${server.name} ustawiony jako domyślny`);
            loadServers();
        } catch (error) {
            toast.error('Błąd ustawiania domyślnego serwera');
        }
    };

    // === Drag & Drop ===

    const handleDragStart = (e, server) => {
        setDraggedServer(server);
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.style.opacity = '0.5';
    };

    const handleDragEnd = (e) => {
        e.currentTarget.style.opacity = '1';
        setDraggedServer(null);
        setDragOverServer(null);
    };

    const handleDragOver = (e, server) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedServer && server.id !== draggedServer.id) {
            setDragOverServer(server.id);
        }
    };

    const handleDragLeave = () => {
        setDragOverServer(null);
    };

    const handleDrop = async (e, targetServer) => {
        e.preventDefault();
        setDragOverServer(null);

        if (!draggedServer || draggedServer.id === targetServer.id) return;

        // Reorder locally first for instant feedback
        const newServers = [...servers];
        const dragIndex = newServers.findIndex(s => s.id === draggedServer.id);
        const dropIndex = newServers.findIndex(s => s.id === targetServer.id);

        const [removed] = newServers.splice(dragIndex, 1);
        newServers.splice(dropIndex, 0, removed);
        setServers(newServers);

        // Send reorder to API
        try {
            const orderedIds = newServers.map(s => s.id);
            await serversApi.reorder(orderedIds);
            toast.success('Kolejność serwerów zaktualizowana');
        } catch (error) {
            toast.error('Błąd zmiany kolejności');
            loadServers(); // Revert on error
        }

        setDraggedServer(null);
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
                    <p className="text-gray-400">Ustawienia wersji gry, serwerów i parametrów</p>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => { loadConfig(); loadServers(); }}
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

            {/* ============ SERWERY ============ */}
            <div className="card">
                <div className="card-header flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Server className="w-5 h-5 text-mc-green" />
                        Serwery Minecraft
                    </div>
                    <button onClick={openAddServerModal} className="btn btn-primary btn-sm">
                        <Plus className="w-4 h-4" />
                        Dodaj serwer
                    </button>
                </div>

                {loadingServers ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="loader" />
                    </div>
                ) : servers.length === 0 ? (
                    <div className="text-center py-8">
                        <Server className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                        <p className="text-gray-400">Brak serwerów</p>
                        <p className="text-gray-500 text-sm mt-1">Dodaj pierwszy serwer, który pojawi się w launcherze</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {servers.map((server) => (
                            <div
                                key={server.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, server)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => handleDragOver(e, server)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, server)}
                                className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
                                    dragOverServer === server.id
                                        ? 'border-mc-accent border-dashed bg-mc-accent/10'
                                        : server.is_enabled
                                            ? server.is_default
                                                ? 'border-mc-accent bg-mc-accent/5'
                                                : 'border-mc-gray bg-mc-darker'
                                            : 'border-mc-gray bg-mc-darker opacity-50'
                                }`}
                            >
                                <GripVertical className="w-5 h-5 text-gray-600 cursor-grab flex-shrink-0 hover:text-gray-400" />

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-medium text-white truncate">{server.name}</p>
                                        {!!server.is_default && (
                                            <span className="px-2 py-0.5 text-xs font-medium bg-mc-accent/20 text-mc-accent rounded">
                                                Domyślny
                                            </span>
                                        )}
                                        {!server.is_enabled && (
                                            <span className="px-2 py-0.5 text-xs font-medium bg-red-900/30 text-red-400 rounded">
                                                Wyłączony
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-400 font-mono">
                                        {server.ip}:{server.port || 25565}
                                    </p>
                                    {server.description && (
                                        <p className="text-xs text-gray-500 mt-1 truncate">{server.description}</p>
                                    )}
                                </div>

                                <div className="flex items-center gap-1 flex-shrink-0">
                                    {!server.is_default && server.is_enabled && (
                                        <button
                                            onClick={() => handleSetDefault(server)}
                                            className="p-2 rounded-lg hover:bg-mc-gray text-gray-500 hover:text-yellow-400 transition-colors"
                                            title="Ustaw jako domyślny"
                                        >
                                            <Star className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleToggleServer(server)}
                                        className={`p-2 rounded-lg hover:bg-mc-gray transition-colors ${
                                            server.is_enabled ? 'text-green-400 hover:text-red-400' : 'text-gray-500 hover:text-green-400'
                                        }`}
                                        title={server.is_enabled ? 'Wyłącz' : 'Włącz'}
                                    >
                                        <Power className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => openEditServerModal(server)}
                                        className="p-2 rounded-lg hover:bg-mc-gray text-gray-500 hover:text-blue-400 transition-colors"
                                        title="Edytuj"
                                    >
                                        <Edit3 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteServer(server)}
                                        className="p-2 rounded-lg hover:bg-mc-gray text-gray-500 hover:text-red-400 transition-colors"
                                        title="Usuń"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal dodawania/edycji serwera */}
            {showServerModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="card w-full max-w-md mx-4 relative">
                        <button
                            onClick={() => setShowServerModal(false)}
                            className="absolute top-4 right-4 p-1 rounded-lg hover:bg-mc-gray text-gray-500 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <h3 className="text-lg font-bold text-white mb-4">
                            {editingServer ? 'Edytuj serwer' : 'Dodaj serwer'}
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="label">Nazwa serwera</label>
                                <input
                                    type="text"
                                    value={serverForm.name}
                                    onChange={(e) => handleServerFormChange('name', e.target.value)}
                                    className="input"
                                    placeholder="np. Survival, Creative, SkyBlock"
                                />
                            </div>

                            <div>
                                <label className="label">Opis (opcjonalnie)</label>
                                <input
                                    type="text"
                                    value={serverForm.description}
                                    onChange={(e) => handleServerFormChange('description', e.target.value)}
                                    className="input"
                                    placeholder="Krótki opis serwera"
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div className="col-span-2">
                                    <label className="label">Adres IP</label>
                                    <input
                                        type="text"
                                        value={serverForm.ip}
                                        onChange={(e) => handleServerFormChange('ip', e.target.value)}
                                        className="input"
                                        placeholder="play.serwer.pl"
                                    />
                                </div>
                                <div>
                                    <label className="label">Port</label>
                                    <input
                                        type="number"
                                        value={serverForm.port}
                                        onChange={(e) => handleServerFormChange('port', parseInt(e.target.value) || 25565)}
                                        className="input"
                                        min={1}
                                        max={65535}
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-3 p-3 rounded-lg bg-mc-darker border border-mc-gray">
                                <input
                                    type="checkbox"
                                    id="server-default"
                                    checked={serverForm.is_default}
                                    onChange={(e) => handleServerFormChange('is_default', e.target.checked)}
                                    className="accent-mc-accent"
                                />
                                <label htmlFor="server-default" className="text-sm text-gray-300 cursor-pointer">
                                    Ustaw jako serwer domyślny
                                </label>
                            </div>

                            <div className="p-3 bg-mc-darker rounded-lg">
                                <p className="text-sm text-gray-400">Podgląd adresu:</p>
                                <p className="font-mono text-white">
                                    {serverForm.ip || 'localhost'}:{serverForm.port || 25565}
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowServerModal(false)}
                                className="btn btn-secondary flex-1"
                            >
                                Anuluj
                            </button>
                            <button
                                onClick={handleSaveServer}
                                className="btn btn-primary flex-1"
                                disabled={savingServer}
                            >
                                {savingServer ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Save className="w-4 h-4" />
                                )}
                                {editingServer ? 'Zapisz' : 'Dodaj'}
                            </button>
                        </div>
                    </div>
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
                <div className="card lg:col-span-2">
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
