/**
 * Strona konfiguracji gry - per-server
 * Każdy serwer ma własną konfigurację gry, mody i pliki
 */
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { serversApi } from '../api/client';
import {
    Settings, Server, Cpu, Save, AlertTriangle,
    Loader2, RefreshCw, Gamepad2, Plus, Trash2, Edit3,
    GripVertical, Power, Star, X, Package, Eraser,
    ChevronDown, ChevronRight, Square, CheckSquare,
    FolderSync, FolderOpen
} from 'lucide-react';

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
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(true);

    // Server modal
    const [showServerModal, setShowServerModal] = useState(false);
    const [editingServer, setEditingServer] = useState(null);
    const [serverForm, setServerForm] = useState({
        name: '', description: '', ip: '', port: 25565, is_default: false,
        game_version: '1.20.1', loader_type: 'vanilla', forge_version: '', fabric_version: '',
        java_args: '-Xmx4G -Xms2G -XX:+UseG1GC',
        maintenance_mode: false, maintenance_message: ''
    });
    const [savingServer, setSavingServer] = useState(false);

    // Mods modal
    const [showModsModal, setShowModsModal] = useState(false);
    const [modsServer, setModsServer] = useState(null);
    const [serverMods, setServerMods] = useState([]);
    const [loadingMods, setLoadingMods] = useState(false);
    const [savingMods, setSavingMods] = useState(false);

    // Expanded server config panels
    const [expandedServer, setExpandedServer] = useState(null);
    const [serverConfigForm, setServerConfigForm] = useState({});
    const [savingConfig, setSavingConfig] = useState(false);

    // FTP Sync state
    const [syncingServer, setSyncingServer] = useState(null);

    // Drag & Drop state
    const [draggedServer, setDraggedServer] = useState(null);
    const [dragOverServer, setDragOverServer] = useState(null);

    useEffect(() => {
        loadServers();
    }, []);

    const loadServers = async () => {
        try {
            setLoading(true);
            const response = await serversApi.getAll();
            if (response.success) {
                setServers(response.data);
            }
        } catch (error) {
            toast.error('Błąd ładowania serwerów');
        } finally {
            setLoading(false);
        }
    };

    // === Server CRUD ===

    const openAddServerModal = () => {
        setEditingServer(null);
        setServerForm({
            name: '', description: '', ip: '', port: 25565, is_default: false,
            game_version: '1.20.1', loader_type: 'vanilla', forge_version: '', fabric_version: '',
            java_args: '-Xmx4G -Xms2G -XX:+UseG1GC',
            maintenance_mode: false, maintenance_message: ''
        });
        setShowServerModal(true);
    };

    const openEditServerModal = (server) => {
        setEditingServer(server);
        setServerForm({
            name: server.name,
            description: server.description || '',
            ip: server.ip,
            port: server.port || 25565,
            is_default: !!server.is_default,
            game_version: server.game_version || '1.20.1',
            loader_type: server.loader_type || 'vanilla',
            forge_version: server.forge_version || '',
            fabric_version: server.fabric_version || '',
            java_args: server.java_args || '-Xmx4G -Xms2G -XX:+UseG1GC',
            maintenance_mode: !!server.maintenance_mode,
            maintenance_message: server.maintenance_message || ''
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
        if (!confirm(`Czy na pewno chcesz usunąć serwer "${server.name}"? Wszystkie przypisania modów zostaną usunięte.`)) return;
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

    // === Clear files ===

    const handleClearFiles = async (server) => {
        if (!confirm(`Czy na pewno chcesz wyczyścić WSZYSTKIE mody i pliki z serwera "${server.name}"? Ta operacja usunie przypisania, nie same pliki.`)) return;
        try {
            await serversApi.clearFiles(server.id);
            toast.success(`Wyczyszczono pliki serwera "${server.name}"`);
            loadServers();
        } catch (error) {
            toast.error('Błąd czyszczenia plików');
        }
    };

    // === FTP Sync ===

    const handleSyncServer = async (server) => {
        setSyncingServer(server.id);
        try {
            const result = await serversApi.sync(server.id);
            if (result.success) {
                const d = result.data;
                toast.success(
                    `Sync "${server.name}": +${d.added} nowych, ${d.skipped} pominięto, ${d.assigned} przypisano`
                );
                loadServers();
            }
        } catch (error) {
            toast.error('Błąd synchronizacji FTP');
        } finally {
            setSyncingServer(null);
        }
    };

    // === Inline config editing ===

    const toggleExpandServer = (server) => {
        if (expandedServer === server.id) {
            setExpandedServer(null);
        } else {
            setExpandedServer(server.id);
            setServerConfigForm({
                game_version: server.game_version || '1.20.1',
                loader_type: server.loader_type || 'vanilla',
                forge_version: server.forge_version || '',
                fabric_version: server.fabric_version || '',
                java_args: server.java_args || '-Xmx4G -Xms2G -XX:+UseG1GC',
                maintenance_mode: !!server.maintenance_mode,
                maintenance_message: server.maintenance_message || ''
            });
        }
    };

    const handleConfigChange = (field, value) => {
        setServerConfigForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSaveConfig = async (serverId) => {
        setSavingConfig(true);
        try {
            await serversApi.update(serverId, serverConfigForm);
            toast.success('Konfiguracja serwera zapisana');
            loadServers();
        } catch (error) {
            toast.error('Błąd zapisywania konfiguracji');
        } finally {
            setSavingConfig(false);
        }
    };

    // === Mods management modal ===

    const openModsModal = async (server) => {
        setModsServer(server);
        setShowModsModal(true);
        setLoadingMods(true);
        try {
            const response = await serversApi.getMods(server.id);
            if (response.success) {
                setServerMods(response.data.mods);
            }
        } catch (error) {
            toast.error('Błąd ładowania modów');
        } finally {
            setLoadingMods(false);
        }
    };

    const toggleModAssignment = (modId) => {
        setServerMods(prev => prev.map(m =>
            m.id === modId ? { ...m, assigned: !m.assigned } : m
        ));
    };

    const handleSaveMods = async () => {
        if (!modsServer) return;
        setSavingMods(true);
        try {
            const selectedModIds = serverMods.filter(m => m.assigned).map(m => m.id);
            await serversApi.setMods(modsServer.id, selectedModIds);
            toast.success(`Przypisano ${selectedModIds.length} modów do "${modsServer.name}"`);
            setShowModsModal(false);
            loadServers();
        } catch (error) {
            toast.error('Błąd zapisywania modów');
        } finally {
            setSavingMods(false);
        }
    };

    const selectAllMods = () => {
        setServerMods(prev => prev.map(m => ({ ...m, assigned: true })));
    };

    const deselectAllMods = () => {
        setServerMods(prev => prev.map(m => ({ ...m, assigned: false })));
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

        const newServers = [...servers];
        const dragIndex = newServers.findIndex(s => s.id === draggedServer.id);
        const dropIndex = newServers.findIndex(s => s.id === targetServer.id);

        const [removed] = newServers.splice(dragIndex, 1);
        newServers.splice(dropIndex, 0, removed);
        setServers(newServers);

        try {
            const orderedIds = newServers.map(s => s.id);
            await serversApi.reorder(orderedIds);
            toast.success('Kolejność serwerów zaktualizowana');
        } catch (error) {
            toast.error('Błąd zmiany kolejności');
            loadServers();
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
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Settings className="w-7 h-7 text-mc-green" />
                        Serwery i Konfiguracja
                    </h1>
                    <p className="text-gray-400">Każdy serwer ma własną wersję gry, loader i mody</p>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={loadServers}
                        className="btn btn-secondary"
                        disabled={loading}
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Odśwież
                    </button>
                    <button
                        onClick={openAddServerModal}
                        className="btn btn-primary"
                    >
                        <Plus className="w-4 h-4" />
                        Dodaj serwer
                    </button>
                </div>
            </div>

            {/* Server list */}
            {servers.length === 0 ? (
                <div className="card text-center py-12">
                    <Server className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-400 text-lg">Brak serwerów</p>
                    <p className="text-gray-500 text-sm mt-1">Dodaj pierwszy serwer, który pojawi się w launcherze</p>
                    <button onClick={openAddServerModal} className="btn btn-primary mt-4">
                        <Plus className="w-4 h-4" />
                        Dodaj serwer
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    {servers.map((server) => (
                        <div key={server.id} className="card p-0 overflow-hidden">
                            {/* Server header row */}
                            <div
                                draggable
                                onDragStart={(e) => handleDragStart(e, server)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => handleDragOver(e, server)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, server)}
                                className={`flex items-center gap-4 p-4 transition-colors ${
                                    dragOverServer === server.id
                                        ? 'border-b border-mc-accent border-dashed bg-mc-accent/10'
                                        : server.is_enabled
                                            ? 'border-b border-mc-gray'
                                            : 'border-b border-mc-gray opacity-60'
                                }`}
                            >
                                <GripVertical className="w-5 h-5 text-gray-600 cursor-grab flex-shrink-0 hover:text-gray-400" />

                                {/* Expand/collapse toggle */}
                                <button
                                    onClick={() => toggleExpandServer(server)}
                                    className="p-1 rounded hover:bg-mc-gray text-gray-400 hover:text-white transition-colors"
                                >
                                    {expandedServer === server.id
                                        ? <ChevronDown className="w-5 h-5" />
                                        : <ChevronRight className="w-5 h-5" />
                                    }
                                </button>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="font-medium text-white">{server.name}</p>
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
                                        {!!server.maintenance_mode && (
                                            <span className="px-2 py-0.5 text-xs font-medium bg-yellow-900/30 text-yellow-400 rounded">
                                                Konserwacja
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-400">
                                        <span className="font-mono">{server.ip}:{server.port || 25565}</span>
                                        <span>{server.game_version || '1.20.1'} / {server.loader_type || 'vanilla'}</span>
                                        <span className="flex items-center gap-1">
                                            <Package className="w-3.5 h-3.5" />
                                            {server.mod_count || 0} modów
                                        </span>
                                    </div>
                                    {server.description && (
                                        <p className="text-xs text-gray-500 mt-1 truncate">{server.description}</p>
                                    )}
                                </div>

                                <div className="flex items-center gap-1 flex-shrink-0">
                                    {/* Mods button */}
                                    <button
                                        onClick={() => openModsModal(server)}
                                        className="p-2 rounded-lg hover:bg-mc-gray text-gray-500 hover:text-purple-400 transition-colors"
                                        title="Zarządzaj modami"
                                    >
                                        <Package className="w-4 h-4" />
                                    </button>
                                    {/* FTP Sync button */}
                                    <button
                                        onClick={() => handleSyncServer(server)}
                                        disabled={syncingServer === server.id}
                                        className="p-2 rounded-lg hover:bg-mc-gray text-gray-500 hover:text-green-400 transition-colors"
                                        title={`Synchronizuj FTP (uploads/servers/${server.id}/mods/)`}
                                    >
                                        {syncingServer === server.id
                                            ? <Loader2 className="w-4 h-4 animate-spin" />
                                            : <FolderSync className="w-4 h-4" />
                                        }
                                    </button>
                                    {/* Clear files button */}
                                    <button
                                        onClick={() => handleClearFiles(server)}
                                        className="p-2 rounded-lg hover:bg-mc-gray text-gray-500 hover:text-orange-400 transition-colors"
                                        title="Wyczyść pliki (mody, resourcepacki)"
                                    >
                                        <Eraser className="w-4 h-4" />
                                    </button>
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

                            {/* Expanded config panel */}
                            {expandedServer === server.id && (
                                <div className="p-4 bg-mc-darker border-t border-mc-gray space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {/* Game version */}
                                        <div>
                                            <label className="label">Wersja Minecraft</label>
                                            <select
                                                value={serverConfigForm.game_version}
                                                onChange={(e) => handleConfigChange('game_version', e.target.value)}
                                                className="input"
                                            >
                                                {MC_VERSIONS.map(v => (
                                                    <option key={v} value={v}>{v}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Loader type */}
                                        <div>
                                            <label className="label">Typ loadera</label>
                                            <select
                                                value={serverConfigForm.loader_type}
                                                onChange={(e) => handleConfigChange('loader_type', e.target.value)}
                                                className="input"
                                            >
                                                {LOADER_TYPES.map(l => (
                                                    <option key={l.value} value={l.value}>{l.label}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Loader version */}
                                        {serverConfigForm.loader_type === 'forge' && (
                                            <div>
                                                <label className="label">Wersja Forge</label>
                                                <input
                                                    type="text"
                                                    value={serverConfigForm.forge_version}
                                                    onChange={(e) => handleConfigChange('forge_version', e.target.value)}
                                                    className="input"
                                                    placeholder="np. 47.2.0"
                                                />
                                            </div>
                                        )}
                                        {serverConfigForm.loader_type === 'fabric' && (
                                            <div>
                                                <label className="label">Wersja Fabric</label>
                                                <input
                                                    type="text"
                                                    value={serverConfigForm.fabric_version}
                                                    onChange={(e) => handleConfigChange('fabric_version', e.target.value)}
                                                    className="input"
                                                    placeholder="np. 0.15.6"
                                                />
                                            </div>
                                        )}

                                        {/* Java args */}
                                        <div className="md:col-span-2 lg:col-span-3">
                                            <label className="label">Argumenty JVM</label>
                                            <input
                                                type="text"
                                                value={serverConfigForm.java_args}
                                                onChange={(e) => handleConfigChange('java_args', e.target.value)}
                                                className="input font-mono text-sm"
                                                placeholder="-Xmx4G -Xms2G -XX:+UseG1GC"
                                            />
                                        </div>

                                        {/* Maintenance */}
                                        <div className="md:col-span-2 lg:col-span-3">
                                            <div className="flex items-center gap-3 mb-2">
                                                <input
                                                    type="checkbox"
                                                    id={`maintenance-${server.id}`}
                                                    checked={serverConfigForm.maintenance_mode}
                                                    onChange={(e) => handleConfigChange('maintenance_mode', e.target.checked)}
                                                    className="accent-mc-accent"
                                                />
                                                <label htmlFor={`maintenance-${server.id}`} className="text-sm text-gray-300 cursor-pointer">
                                                    Tryb konserwacji
                                                </label>
                                            </div>
                                            {serverConfigForm.maintenance_mode && (
                                                <input
                                                    type="text"
                                                    value={serverConfigForm.maintenance_message}
                                                    onChange={(e) => handleConfigChange('maintenance_message', e.target.value)}
                                                    className="input text-sm"
                                                    placeholder="Wiadomość dla graczy..."
                                                />
                                            )}
                                        </div>
                                    </div>

                                    {/* FTP Sync info */}
                                    <div className="p-3 bg-mc-gray/30 rounded-lg border border-mc-gray">
                                        <div className="flex items-center gap-2 mb-1">
                                            <FolderOpen className="w-4 h-4 text-gray-400" />
                                            <p className="text-sm font-medium text-gray-300">Folder FTP modów</p>
                                        </div>
                                        <p className="text-xs font-mono text-gray-400 select-all">
                                            uploads/servers/{server.id}/mods/
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Wrzuć pliki .jar/.zip przez FTP do tego folderu, potem kliknij przycisk synchronizacji
                                        </p>
                                    </div>

                                    <div className="flex justify-end">
                                        <button
                                            onClick={() => handleSaveConfig(server.id)}
                                            className="btn btn-primary"
                                            disabled={savingConfig}
                                        >
                                            {savingConfig ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Save className="w-4 h-4" />
                                            )}
                                            Zapisz konfigurację
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Server add/edit modal */}
            {showServerModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="card w-full max-w-lg relative max-h-[90vh] overflow-y-auto">
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
                            {/* Basic info */}
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

                            {/* Game config */}
                            <hr className="border-mc-gray" />
                            <p className="text-sm font-medium text-gray-300">Konfiguracja gry</p>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="label">Wersja MC</label>
                                    <select
                                        value={serverForm.game_version}
                                        onChange={(e) => handleServerFormChange('game_version', e.target.value)}
                                        className="input"
                                    >
                                        {MC_VERSIONS.map(v => (
                                            <option key={v} value={v}>{v}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="label">Loader</label>
                                    <select
                                        value={serverForm.loader_type}
                                        onChange={(e) => handleServerFormChange('loader_type', e.target.value)}
                                        className="input"
                                    >
                                        {LOADER_TYPES.map(l => (
                                            <option key={l.value} value={l.value}>{l.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {serverForm.loader_type === 'forge' && (
                                <div>
                                    <label className="label">Wersja Forge</label>
                                    <input
                                        type="text"
                                        value={serverForm.forge_version}
                                        onChange={(e) => handleServerFormChange('forge_version', e.target.value)}
                                        className="input"
                                        placeholder="np. 47.2.0"
                                    />
                                </div>
                            )}

                            {serverForm.loader_type === 'fabric' && (
                                <div>
                                    <label className="label">Wersja Fabric</label>
                                    <input
                                        type="text"
                                        value={serverForm.fabric_version}
                                        onChange={(e) => handleServerFormChange('fabric_version', e.target.value)}
                                        className="input"
                                        placeholder="np. 0.15.6"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="label">Argumenty JVM</label>
                                <input
                                    type="text"
                                    value={serverForm.java_args}
                                    onChange={(e) => handleServerFormChange('java_args', e.target.value)}
                                    className="input font-mono text-sm"
                                    placeholder="-Xmx4G -Xms2G -XX:+UseG1GC"
                                />
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
                                <p className="text-sm text-gray-400">Podgląd:</p>
                                <p className="font-mono text-white">
                                    {serverForm.ip || 'localhost'}:{serverForm.port || 25565}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                    MC {serverForm.game_version} / {serverForm.loader_type}
                                    {serverForm.loader_type === 'forge' && serverForm.forge_version ? ` ${serverForm.forge_version}` : ''}
                                    {serverForm.loader_type === 'fabric' && serverForm.fabric_version ? ` ${serverForm.fabric_version}` : ''}
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

            {/* Mods assignment modal */}
            {showModsModal && modsServer && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="card w-full max-w-2xl relative max-h-[85vh] flex flex-col">
                        <button
                            onClick={() => setShowModsModal(false)}
                            className="absolute top-4 right-4 p-1 rounded-lg hover:bg-mc-gray text-gray-500 hover:text-white transition-colors z-10"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <h3 className="text-lg font-bold text-white mb-1">
                            Mody - {modsServer.name}
                        </h3>
                        <p className="text-sm text-gray-400 mb-4">
                            Zaznacz mody, które mają być dostępne na tym serwerze
                        </p>

                        {/* Select all / none */}
                        <div className="flex gap-2 mb-3">
                            <button onClick={selectAllMods} className="btn btn-secondary btn-sm">
                                <CheckSquare className="w-3.5 h-3.5" />
                                Zaznacz wszystkie
                            </button>
                            <button onClick={deselectAllMods} className="btn btn-secondary btn-sm">
                                <Square className="w-3.5 h-3.5" />
                                Odznacz wszystkie
                            </button>
                            <span className="text-sm text-gray-400 ml-auto self-center">
                                {serverMods.filter(m => m.assigned).length} / {serverMods.length} wybranych
                            </span>
                        </div>

                        {/* Mods list */}
                        <div className="flex-1 overflow-y-auto border border-mc-gray rounded-lg divide-y divide-mc-gray">
                            {loadingMods ? (
                                <div className="flex items-center justify-center py-12">
                                    <div className="loader" />
                                </div>
                            ) : serverMods.length === 0 ? (
                                <div className="text-center py-12">
                                    <Package className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                                    <p className="text-gray-400">Brak modów w systemie</p>
                                    <p className="text-gray-500 text-sm">Dodaj mody w zakładce "Mody" aby je przypisać</p>
                                </div>
                            ) : (
                                serverMods.map(mod => (
                                    <label
                                        key={mod.id}
                                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-mc-darker transition-colors ${
                                            mod.assigned ? 'bg-mc-accent/5' : ''
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={mod.assigned}
                                            onChange={() => toggleModAssignment(mod.id)}
                                            className="accent-mc-accent flex-shrink-0"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-medium truncate ${
                                                mod.assigned ? 'text-white' : 'text-gray-400'
                                            }`}>
                                                {mod.name}
                                            </p>
                                            <p className="text-xs text-gray-500 truncate">
                                                {mod.filename}
                                                {mod.mod_type && mod.mod_type !== 'mod' && (
                                                    <span className="ml-2 text-gray-600">({mod.mod_type})</span>
                                                )}
                                            </p>
                                        </div>
                                        {!!mod.is_required && (
                                            <span className="px-2 py-0.5 text-xs bg-blue-900/30 text-blue-400 rounded flex-shrink-0">
                                                Wymagany
                                            </span>
                                        )}
                                    </label>
                                ))
                            )}
                        </div>

                        <div className="flex gap-3 mt-4">
                            <button
                                onClick={() => setShowModsModal(false)}
                                className="btn btn-secondary flex-1"
                            >
                                Anuluj
                            </button>
                            <button
                                onClick={handleSaveMods}
                                className="btn btn-primary flex-1"
                                disabled={savingMods || loadingMods}
                            >
                                {savingMods ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Save className="w-4 h-4" />
                                )}
                                Zapisz ({serverMods.filter(m => m.assigned).length} modów)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ConfigPage;
