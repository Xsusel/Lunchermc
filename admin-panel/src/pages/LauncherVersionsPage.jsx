/**
 * Strona zarzadzania wersjami launchera
 * Pozwala dodawac/usuwac wersje i zarzadzac aktualizacjami
 */
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { launcherVersionsApi } from '../api/client';
import {
    Download, Plus, Trash2, X, Loader2,
    RefreshCw, Shield, Tag, Link as LinkIcon,
    Hash, Clock, AlertTriangle
} from 'lucide-react';

function LauncherVersionsPage() {
    const [versions, setVersions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    const [form, setForm] = useState({
        version: '',
        download_url: '',
        sha256: '',
        changelog: '',
        is_required: false
    });

    useEffect(() => {
        loadVersions();
    }, []);

    const loadVersions = async () => {
        try {
            setLoading(true);
            const response = await launcherVersionsApi.getAll();
            if (response.success) {
                setVersions(response.data || []);
            }
        } catch (error) {
            toast.error('Blad ladowania wersji launchera');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Walidacja
        if (!/^\d+\.\d+\.\d+$/.test(form.version)) {
            toast.error('Nieprawidlowy format wersji (np. 1.2.3)');
            return;
        }

        if (!form.download_url) {
            toast.error('Podaj URL do pobrania');
            return;
        }

        if (form.sha256.length !== 64) {
            toast.error('SHA256 musi miec 64 znaki');
            return;
        }

        setActionLoading(true);
        try {
            const response = await launcherVersionsApi.create({
                version: form.version,
                download_url: form.download_url,
                sha256: form.sha256,
                changelog: form.changelog || null,
                is_required: form.is_required ? 1 : 0
            });

            if (response.success) {
                toast.success('Wersja launchera dodana');
                setShowAddModal(false);
                setForm({
                    version: '',
                    download_url: '',
                    sha256: '',
                    changelog: '',
                    is_required: false
                });
                loadVersions();
            }
        } catch (error) {
            toast.error(error.response?.data?.error || 'Blad dodawania wersji');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDelete = async (id, version) => {
        if (!confirm(`Czy na pewno chcesz usunac wersje ${version}?`)) {
            return;
        }

        try {
            const response = await launcherVersionsApi.delete(id);
            if (response.success) {
                toast.success('Wersja zostala usunieta');
                loadVersions();
            }
        } catch (error) {
            toast.error('Blad usuwania wersji');
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
            {/* Naglowek */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Download className="w-7 h-7 text-mc-green" />
                        Wersje Launchera
                    </h1>
                    <p className="text-gray-400">
                        Zarzadzaj wersjami launchera i aktualizacjami dla graczy
                    </p>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={loadVersions}
                        className="btn btn-secondary"
                        disabled={loading}
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Odswiez
                    </button>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="btn btn-primary"
                    >
                        <Plus className="w-4 h-4" />
                        Dodaj wersje
                    </button>
                </div>
            </div>

            {/* Info */}
            <div className="card">
                <div className="p-4 bg-blue-900/20 border border-blue-800 rounded-lg flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-blue-300">
                        <p className="font-medium mb-1">Jak to dziala:</p>
                        <ol className="list-decimal list-inside space-y-1 text-blue-400">
                            <li>Zbuduj nowa wersje launchera (npm run build:win)</li>
                            <li>Przeslij plik .exe na serwer (np. do /uploads/launcher/)</li>
                            <li>Oblicz SHA256 pliku: <code className="bg-blue-900/50 px-1 rounded">sha256sum plik.exe</code></li>
                            <li>Dodaj nowa wersje ponizej z URL do pliku i SHA256</li>
                            <li>Launcher automatycznie powiadomi graczy o aktualizacji</li>
                        </ol>
                    </div>
                </div>
            </div>

            {/* Lista wersji */}
            <div className="card">
                <div className="card-header">
                    <Tag className="w-5 h-5 text-mc-green" />
                    Opublikowane wersje ({versions.length})
                </div>

                {versions.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        <Download className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>Brak opublikowanych wersji</p>
                        <p className="text-sm mt-1">Dodaj pierwsza wersje klikajac "Dodaj wersje"</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-sm text-gray-400 border-b border-mc-gray">
                                    <th className="py-3 px-4">Wersja</th>
                                    <th className="py-3 px-4">URL</th>
                                    <th className="py-3 px-4">SHA256</th>
                                    <th className="py-3 px-4">Changelog</th>
                                    <th className="py-3 px-4">Status</th>
                                    <th className="py-3 px-4">Data</th>
                                    <th className="py-3 px-4">Akcje</th>
                                </tr>
                            </thead>
                            <tbody>
                                {versions.map((v, index) => (
                                    <tr
                                        key={v.id}
                                        className={`border-b border-mc-gray/50 hover:bg-mc-gray/20 ${
                                            index === 0 ? 'bg-mc-green/5' : ''
                                        }`}
                                    >
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono font-bold text-white">
                                                    v{v.version}
                                                </span>
                                                {index === 0 && (
                                                    <span className="px-2 py-0.5 bg-mc-green/20 text-mc-green text-xs rounded-full">
                                                        Najnowsza
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <a
                                                href={v.download_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1 max-w-[200px] truncate"
                                                title={v.download_url}
                                            >
                                                <LinkIcon className="w-3 h-3 flex-shrink-0" />
                                                {v.download_url}
                                            </a>
                                        </td>
                                        <td className="py-3 px-4">
                                            <code className="text-xs text-gray-400 max-w-[120px] block truncate" title={v.sha256}>
                                                {v.sha256}
                                            </code>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className="text-sm text-gray-400 max-w-[150px] block truncate" title={v.changelog}>
                                                {v.changelog || '-'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4">
                                            {v.is_required ? (
                                                <span className="flex items-center gap-1 text-yellow-400 text-sm">
                                                    <Shield className="w-4 h-4" />
                                                    Wymagana
                                                </span>
                                            ) : (
                                                <span className="text-gray-500 text-sm">Opcjonalna</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-gray-400 text-sm">
                                            <div className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {v.created_at ? new Date(v.created_at).toLocaleDateString('pl-PL') : '-'}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <button
                                                onClick={() => handleDelete(v.id, v.version)}
                                                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors"
                                                title="Usun wersje"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal dodawania wersji */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                    <div className="bg-mc-dark border border-mc-gray rounded-xl w-full max-w-lg mx-4 p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <Plus className="w-5 h-5 text-mc-green" />
                                Nowa wersja launchera
                            </h2>
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="p-2 hover:bg-mc-gray rounded-lg"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">
                                    Wersja (format: x.y.z)
                                </label>
                                <div className="flex items-center gap-2">
                                    <Tag className="w-4 h-4 text-gray-500" />
                                    <input
                                        type="text"
                                        value={form.version}
                                        onChange={(e) => setForm({ ...form, version: e.target.value })}
                                        placeholder="1.0.1"
                                        className="input flex-1"
                                        pattern="\d+\.\d+\.\d+"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">
                                    URL do pobrania (.exe lub .AppImage)
                                </label>
                                <div className="flex items-center gap-2">
                                    <LinkIcon className="w-4 h-4 text-gray-500" />
                                    <input
                                        type="url"
                                        value={form.download_url}
                                        onChange={(e) => setForm({ ...form, download_url: e.target.value })}
                                        placeholder="https://mc.xsus.pl/uploads/launcher/XsusLauncher-1.0.1.exe"
                                        className="input flex-1"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">
                                    SHA256 (64 znaki)
                                </label>
                                <div className="flex items-center gap-2">
                                    <Hash className="w-4 h-4 text-gray-500" />
                                    <input
                                        type="text"
                                        value={form.sha256}
                                        onChange={(e) => setForm({ ...form, sha256: e.target.value.toLowerCase() })}
                                        placeholder="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
                                        className="input flex-1 font-mono text-xs"
                                        minLength={64}
                                        maxLength={64}
                                        required
                                    />
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Oblicz: <code className="bg-mc-gray px-1 rounded">sha256sum plik.exe</code> (Linux) lub <code className="bg-mc-gray px-1 rounded">certutil -hashfile plik.exe SHA256</code> (Windows)
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">
                                    Changelog (opcjonalny)
                                </label>
                                <textarea
                                    value={form.changelog}
                                    onChange={(e) => setForm({ ...form, changelog: e.target.value })}
                                    placeholder="Opis zmian w tej wersji..."
                                    className="input w-full h-24 resize-none"
                                />
                            </div>

                            <div className="flex items-center gap-3">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={form.is_required}
                                        onChange={(e) => setForm({ ...form, is_required: e.target.checked })}
                                        className="w-4 h-4 rounded border-mc-gray bg-mc-darker"
                                    />
                                    <span className="text-sm text-gray-300">
                                        Wymagana aktualizacja (gracz musi zaktualizowac)
                                    </span>
                                </label>
                            </div>

                            <div className="flex gap-3 pt-4 border-t border-mc-gray">
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="btn btn-secondary flex-1"
                                >
                                    Anuluj
                                </button>
                                <button
                                    type="submit"
                                    disabled={actionLoading}
                                    className="btn btn-primary flex-1"
                                >
                                    {actionLoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Plus className="w-4 h-4" />
                                    )}
                                    {actionLoading ? 'Dodawanie...' : 'Dodaj wersje'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default LauncherVersionsPage;
