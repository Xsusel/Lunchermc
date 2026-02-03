/**
 * Strona zarządzania modami
 */
import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { modsApi } from '../api/client';
import FileManager from '../components/FileManager';
import {
    Package, Plus, Upload, Link as LinkIcon, Trash2,
    ToggleLeft, ToggleRight, Edit2, X, Loader2,
    FileCode, Download, ExternalLink, RefreshCw
} from 'lucide-react';

function ModsPage() {
    const [activeTab, setActiveTab] = useState('mods');
    const [mods, setMods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploadModal, setUploadModal] = useState(false);
    const [urlModal, setUrlModal] = useState(false);
    const [editModal, setEditModal] = useState({ open: false, mod: null });
    const [actionLoading, setActionLoading] = useState(false);

    const fileInputRef = useRef(null);

    // Formularz uploadu
    const [uploadForm, setUploadForm] = useState({
        file: null,
        name: '',
        description: '',
        is_required: true,
        mod_type: 'mod'
    });

    // Formularz URL
    const [urlForm, setUrlForm] = useState({
        name: '',
        filename: '',
        url: '',
        sha256: '',
        file_size: 0,
        is_required: true,
        mod_type: 'mod',
        description: ''
    });

    useEffect(() => {
        if (activeTab === 'mods') {
            loadMods();
        }
    }, [activeTab]);

    const loadMods = async () => {
        try {
            setLoading(true);
            const response = await modsApi.getAll();
            if (response.success) {
                setMods(response.data);
            }
        } catch (error) {
            toast.error('Błąd ładowania modów');
        } finally {
            setLoading(false);
        }
    };

    const handleSync = async () => {
        setActionLoading(true);
        try {
            await modsApi.sync();
            toast.success('Synchronizacja zakończona');
            loadMods();
        } catch (error) {
            toast.error('Błąd synchronizacji');
        } finally {
            setActionLoading(false);
        }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!uploadForm.file) {
            toast.error('Wybierz plik');
            return;
        }

        setActionLoading(true);
        try {
            const formData = new FormData();
            formData.append('file', uploadForm.file);
            formData.append('name', uploadForm.name || uploadForm.file.name.replace(/\.[^.]+$/, ''));
            formData.append('description', uploadForm.description);
            formData.append('is_required', uploadForm.is_required);
            formData.append('mod_type', uploadForm.mod_type);

            await modsApi.upload(formData);
            toast.success('Mod został dodany');
            setUploadModal(false);
            setUploadForm({
                file: null,
                name: '',
                description: '',
                is_required: true,
                mod_type: 'mod'
            });
            loadMods();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Błąd uploadu');
        } finally {
            setActionLoading(false);
        }
    };

    const handleAddUrl = async (e) => {
        e.preventDefault();
        setActionLoading(true);
        try {
            await modsApi.addByUrl(urlForm);
            toast.success('Mod został dodany');
            setUrlModal(false);
            setUrlForm({
                name: '',
                filename: '',
                url: '',
                sha256: '',
                file_size: 0,
                is_required: true,
                mod_type: 'mod',
                description: ''
            });
            loadMods();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Błąd dodawania moda');
        } finally {
            setActionLoading(false);
        }
    };

    const handleToggle = async (mod) => {
        try {
            await modsApi.toggle(mod.id);
            toast.success(mod.is_enabled ? 'Mod wyłączony' : 'Mod włączony');
            loadMods();
        } catch (error) {
            toast.error('Błąd zmiany statusu');
        }
    };

    const handleDelete = async (mod) => {
        if (!confirm(`Czy na pewno chcesz usunąć mod "${mod.name}"?`)) return;

        try {
            await modsApi.delete(mod.id);
            toast.success('Mod został usunięty');
            loadMods();
        } catch (error) {
            toast.error('Błąd usuwania moda');
        }
    };

    const handleEdit = async (e) => {
        e.preventDefault();
        setActionLoading(true);
        try {
            await modsApi.update(editModal.mod.id, editModal.mod);
            toast.success('Mod został zaktualizowany');
            setEditModal({ open: false, mod: null });
            loadMods();
        } catch (error) {
            toast.error('Błąd aktualizacji moda');
        } finally {
            setActionLoading(false);
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setUploadForm(prev => ({
                ...prev,
                file,
                name: prev.name || file.name.replace(/\.[^.]+$/, '')
            }));
        }
    };

    // Statystyki
    const stats = {
        total: mods.length,
        enabled: mods.filter(m => m.is_enabled).length,
        required: mods.filter(m => m.is_required).length,
        totalSize: mods.reduce((acc, m) => acc + (m.file_size || 0), 0)
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Nagłówek */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Package className="w-7 h-7 text-mc-green" />
                        Menadżer Treści
                    </h1>
                    <p className="text-gray-400">Zarządzaj modami i plikami gry</p>
                </div>

                <div className="flex gap-2">
                    {activeTab === 'mods' && (
                        <>
                            <button
                                onClick={handleSync}
                                className="btn btn-secondary"
                                disabled={actionLoading}
                            >
                                <RefreshCw className={`w-4 h-4 ${actionLoading ? 'animate-spin' : ''}`} />
                                Sync
                            </button>
                            <button
                                onClick={() => setUrlModal(true)}
                                className="btn btn-secondary"
                            >
                                <LinkIcon className="w-4 h-4" />
                                Dodaj przez URL
                            </button>
                            <button
                                onClick={() => setUploadModal(true)}
                                className="btn btn-primary"
                            >
                                <Upload className="w-4 h-4" />
                                Prześlij plik
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Zakładki */}
            <div className="flex gap-4 border-b border-mc-gray overflow-x-auto">
                <button
                    onClick={() => setActiveTab('mods')}
                    className={`pb-2 px-1 ${activeTab === 'mods' ? 'border-b-2 border-mc-green text-white' : 'text-gray-400 hover:text-gray-300'}`}
                >
                    Mody
                </button>
                <button
                    onClick={() => setActiveTab('datapacks')}
                    className={`pb-2 px-1 ${activeTab === 'datapacks' ? 'border-b-2 border-mc-green text-white' : 'text-gray-400 hover:text-gray-300'}`}
                >
                    Data Packs
                </button>
                <button
                    onClick={() => setActiveTab('defaultconfigs')}
                    className={`pb-2 px-1 ${activeTab === 'defaultconfigs' ? 'border-b-2 border-mc-green text-white' : 'text-gray-400 hover:text-gray-300'}`}
                >
                    Default Configs
                </button>
            </div>

            {activeTab === 'mods' ? (
                <>
                    {/* Statystyki */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="card py-4 text-center">
                            <p className="text-2xl font-bold text-white">{stats.total}</p>
                            <p className="text-sm text-gray-500">Wszystkich modów</p>
                        </div>
                        <div className="card py-4 text-center">
                            <p className="text-2xl font-bold text-green-400">{stats.enabled}</p>
                            <p className="text-sm text-gray-500">Włączonych</p>
                        </div>
                        <div className="card py-4 text-center">
                            <p className="text-2xl font-bold text-yellow-400">{stats.required}</p>
                            <p className="text-sm text-gray-500">Wymaganych</p>
                        </div>
                        <div className="card py-4 text-center">
                            <p className="text-2xl font-bold text-blue-400">{formatBytes(stats.totalSize)}</p>
                            <p className="text-sm text-gray-500">Łączny rozmiar</p>
                        </div>
                    </div>

                    {/* Lista modów */}
                    <div className="card overflow-hidden p-0">
                        {loading ? (
                            <div className="flex items-center justify-center h-64">
                                <div className="loader" />
                            </div>
                        ) : mods.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Mod</th>
                                            <th>Nazwa pliku</th>
                                            <th>Rozmiar</th>
                                            <th>Typ</th>
                                            <th>Status</th>
                                            <th className="text-right">Akcje</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {mods.map((mod) => (
                                            <tr key={mod.id}>
                                                <td>
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 bg-mc-gray rounded-lg flex items-center justify-center">
                                                            <FileCode className="w-5 h-5 text-mc-green" />
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-white">{mod.name}</p>
                                                            {mod.description && (
                                                                <p className="text-xs text-gray-500 truncate max-w-xs">
                                                                    {mod.description}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="text-gray-400 text-sm font-mono">
                                                    {mod.filename}
                                                </td>
                                                <td className="text-gray-400 text-sm">
                                                    {mod.fileSizeFormatted || formatBytes(mod.file_size)}
                                                </td>
                                                <td>
                                                    <span className={`badge ${
                                                        mod.is_required ? 'badge-warning' : 'badge-info'
                                                    }`}>
                                                        {mod.is_required ? 'Wymagany' : 'Opcjonalny'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <button
                                                        onClick={() => handleToggle(mod)}
                                                        className={`flex items-center gap-1 text-sm ${
                                                            mod.is_enabled ? 'text-green-400' : 'text-gray-500'
                                                        }`}
                                                    >
                                                        {mod.is_enabled ? (
                                                            <ToggleRight className="w-5 h-5" />
                                                        ) : (
                                                            <ToggleLeft className="w-5 h-5" />
                                                        )}
                                                        {mod.is_enabled ? 'Włączony' : 'Wyłączony'}
                                                    </button>
                                                </td>
                                                <td>
                                                    <div className="flex items-center justify-end gap-2">
                                                        {mod.url && !mod.url.startsWith('/api') && (
                                                            <a
                                                                href={mod.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="p-2 hover:bg-mc-gray rounded-lg text-gray-400 transition-colors"
                                                                title="Otwórz link"
                                                            >
                                                                <ExternalLink className="w-4 h-4" />
                                                            </a>
                                                        )}
                                                        <button
                                                            onClick={() => setEditModal({ open: true, mod: { ...mod } })}
                                                            className="p-2 hover:bg-mc-gray rounded-lg text-blue-400 transition-colors"
                                                            title="Edytuj"
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(mod)}
                                                            className="p-2 hover:bg-red-900/30 rounded-lg text-red-400 transition-colors"
                                                            title="Usuń"
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
                        ) : (
                            <div className="text-center py-12">
                                <Package className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                                <p className="text-gray-500">Brak modów</p>
                                <p className="text-gray-600 text-sm">Dodaj pierwszy mod klikając przycisk powyżej</p>
                            </div>
                        )}
                    </div>
                </>
            ) : activeTab === 'datapacks' ? (
                <FileManager type="datapacks" title="Data Packs" />
            ) : (
                <FileManager type="defaultconfigs" title="Default Configs" />
            )}

            {/* Modal uploadu */}
            {uploadModal && (
                <Modal title="Prześlij mod" onClose={() => setUploadModal(false)}>
                    <form onSubmit={handleUpload} className="space-y-4">
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-mc-gray rounded-lg p-8 text-center cursor-pointer hover:border-mc-accent transition-colors"
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".jar,.zip"
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                            {uploadForm.file ? (
                                <div>
                                    <FileCode className="w-12 h-12 text-mc-green mx-auto mb-2" />
                                    <p className="text-white font-medium">{uploadForm.file.name}</p>
                                    <p className="text-gray-500 text-sm">{formatBytes(uploadForm.file.size)}</p>
                                </div>
                            ) : (
                                <div>
                                    <Upload className="w-12 h-12 text-gray-500 mx-auto mb-2" />
                                    <p className="text-gray-400">Kliknij aby wybrać plik</p>
                                    <p className="text-gray-600 text-sm">Dozwolone: .jar, .zip</p>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="label">Nazwa moda</label>
                            <input
                                type="text"
                                value={uploadForm.name}
                                onChange={(e) => setUploadForm(prev => ({ ...prev, name: e.target.value }))}
                                className="input"
                                placeholder="np. JourneyMap"
                            />
                        </div>

                        <div>
                            <label className="label">Opis (opcjonalnie)</label>
                            <textarea
                                value={uploadForm.description}
                                onChange={(e) => setUploadForm(prev => ({ ...prev, description: e.target.value }))}
                                className="input min-h-[80px] resize-none"
                                placeholder="Krótki opis moda..."
                            />
                        </div>

                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={uploadForm.is_required}
                                    onChange={(e) => setUploadForm(prev => ({ ...prev, is_required: e.target.checked }))}
                                    className="w-4 h-4 accent-mc-accent"
                                />
                                <span className="text-gray-300">Wymagany</span>
                            </label>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={() => setUploadModal(false)}
                                className="btn btn-secondary flex-1"
                                disabled={actionLoading}
                            >
                                Anuluj
                            </button>
                            <button
                                type="submit"
                                className="btn btn-primary flex-1"
                                disabled={actionLoading || !uploadForm.file}
                            >
                                {actionLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    'Prześlij'
                                )}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Modal URL */}
            {urlModal && (
                <Modal title="Dodaj mod przez URL" onClose={() => setUrlModal(false)}>
                    <form onSubmit={handleAddUrl} className="space-y-4">
                        <div>
                            <label className="label">Nazwa moda *</label>
                            <input
                                type="text"
                                value={urlForm.name}
                                onChange={(e) => setUrlForm(prev => ({ ...prev, name: e.target.value }))}
                                className="input"
                                required
                            />
                        </div>

                        <div>
                            <label className="label">Nazwa pliku *</label>
                            <input
                                type="text"
                                value={urlForm.filename}
                                onChange={(e) => setUrlForm(prev => ({ ...prev, filename: e.target.value }))}
                                className="input"
                                placeholder="mod-name-1.20.1.jar"
                                required
                            />
                        </div>

                        <div>
                            <label className="label">URL do pobrania *</label>
                            <input
                                type="url"
                                value={urlForm.url}
                                onChange={(e) => setUrlForm(prev => ({ ...prev, url: e.target.value }))}
                                className="input"
                                placeholder="https://..."
                                required
                            />
                        </div>

                        <div>
                            <label className="label">SHA256 *</label>
                            <input
                                type="text"
                                value={urlForm.sha256}
                                onChange={(e) => setUrlForm(prev => ({ ...prev, sha256: e.target.value }))}
                                className="input font-mono text-sm"
                                placeholder="64 znaki hex"
                                maxLength={64}
                                required
                            />
                        </div>

                        <div>
                            <label className="label">Rozmiar pliku (bajty)</label>
                            <input
                                type="number"
                                value={urlForm.file_size}
                                onChange={(e) => setUrlForm(prev => ({ ...prev, file_size: parseInt(e.target.value) || 0 }))}
                                className="input"
                            />
                        </div>

                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={urlForm.is_required}
                                onChange={(e) => setUrlForm(prev => ({ ...prev, is_required: e.target.checked }))}
                                className="w-4 h-4 accent-mc-accent"
                            />
                            <span className="text-gray-300">Wymagany</span>
                        </label>

                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={() => setUrlModal(false)}
                                className="btn btn-secondary flex-1"
                            >
                                Anuluj
                            </button>
                            <button
                                type="submit"
                                className="btn btn-primary flex-1"
                                disabled={actionLoading}
                            >
                                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Dodaj'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Modal edycji */}
            {editModal.open && editModal.mod && (
                <Modal title={`Edytuj: ${editModal.mod.name}`} onClose={() => setEditModal({ open: false, mod: null })}>
                    <form onSubmit={handleEdit} className="space-y-4">
                        <div>
                            <label className="label">Nazwa moda</label>
                            <input
                                type="text"
                                value={editModal.mod.name}
                                onChange={(e) => setEditModal(prev => ({
                                    ...prev,
                                    mod: { ...prev.mod, name: e.target.value }
                                }))}
                                className="input"
                                required
                            />
                        </div>

                        <div>
                            <label className="label">Opis</label>
                            <textarea
                                value={editModal.mod.description || ''}
                                onChange={(e) => setEditModal(prev => ({
                                    ...prev,
                                    mod: { ...prev.mod, description: e.target.value }
                                }))}
                                className="input min-h-[80px] resize-none"
                            />
                        </div>

                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={editModal.mod.is_required}
                                onChange={(e) => setEditModal(prev => ({
                                    ...prev,
                                    mod: { ...prev.mod, is_required: e.target.checked }
                                }))}
                                className="w-4 h-4 accent-mc-accent"
                            />
                            <span className="text-gray-300">Wymagany</span>
                        </label>

                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={() => setEditModal({ open: false, mod: null })}
                                className="btn btn-secondary flex-1"
                            >
                                Anuluj
                            </button>
                            <button
                                type="submit"
                                className="btn btn-primary flex-1"
                                disabled={actionLoading}
                            >
                                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Zapisz'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}

// Komponent Modal
function Modal({ title, onClose, children }) {
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="card w-full max-w-lg animate-fadeIn">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">{title}</h3>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-mc-gray rounded-lg text-gray-400 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default ModsPage;
