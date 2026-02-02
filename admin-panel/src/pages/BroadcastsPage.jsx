/**
 * Strona zarządzania powiadomieniami (broadcasts)
 */
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { broadcastsApi } from '../api/client';
import {
    Bell, Plus, Trash2, Edit2, X, Loader2,
    ToggleLeft, ToggleRight, AlertCircle, Info,
    AlertTriangle, CheckCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

const BROADCAST_TYPES = [
    { value: 'info', label: 'Informacja', icon: Info, color: 'blue' },
    { value: 'success', label: 'Sukces', icon: CheckCircle, color: 'green' },
    { value: 'warning', label: 'Ostrzeżenie', icon: AlertTriangle, color: 'yellow' },
    { value: 'error', label: 'Błąd', icon: AlertCircle, color: 'red' }
];

function BroadcastsPage() {
    const [broadcasts, setBroadcasts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState({ open: false, mode: 'create', data: null });
    const [actionLoading, setActionLoading] = useState(false);

    const [form, setForm] = useState({
        title: '',
        message: '',
        type: 'info',
        priority: 0,
        expires_at: ''
    });

    useEffect(() => {
        loadBroadcasts();
    }, []);

    const loadBroadcasts = async () => {
        try {
            setLoading(true);
            const response = await broadcastsApi.getAll();
            if (response.success) {
                setBroadcasts(response.data);
            }
        } catch (error) {
            toast.error('Błąd ładowania powiadomień');
        } finally {
            setLoading(false);
        }
    };

    const openCreateModal = () => {
        setForm({
            title: '',
            message: '',
            type: 'info',
            priority: 0,
            expires_at: ''
        });
        setModal({ open: true, mode: 'create', data: null });
    };

    const openEditModal = (broadcast) => {
        setForm({
            title: broadcast.title,
            message: broadcast.message,
            type: broadcast.type,
            priority: broadcast.priority || 0,
            expires_at: broadcast.expires_at || ''
        });
        setModal({ open: true, mode: 'edit', data: broadcast });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setActionLoading(true);

        try {
            if (modal.mode === 'create') {
                await broadcastsApi.create(form);
                toast.success('Powiadomienie zostało utworzone');
            } else {
                await broadcastsApi.update(modal.data.id, form);
                toast.success('Powiadomienie zostało zaktualizowane');
            }
            setModal({ open: false, mode: 'create', data: null });
            loadBroadcasts();
        } catch (error) {
            toast.error('Błąd zapisywania powiadomienia');
        } finally {
            setActionLoading(false);
        }
    };

    const handleToggle = async (broadcast) => {
        try {
            await broadcastsApi.toggle(broadcast.id);
            toast.success(broadcast.is_active ? 'Powiadomienie dezaktywowane' : 'Powiadomienie aktywowane');
            loadBroadcasts();
        } catch (error) {
            toast.error('Błąd zmiany statusu');
        }
    };

    const handleDelete = async (broadcast) => {
        if (!confirm('Czy na pewno chcesz usunąć to powiadomienie?')) return;

        try {
            await broadcastsApi.delete(broadcast.id);
            toast.success('Powiadomienie usunięte');
            loadBroadcasts();
        } catch (error) {
            toast.error('Błąd usuwania powiadomienia');
        }
    };

    const getTypeInfo = (type) => {
        return BROADCAST_TYPES.find(t => t.value === type) || BROADCAST_TYPES[0];
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Nagłówek */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Bell className="w-7 h-7 text-mc-green" />
                        Powiadomienia
                    </h1>
                    <p className="text-gray-400">Wyświetlaj ogłoszenia w launcherze</p>
                </div>

                <button onClick={openCreateModal} className="btn btn-primary">
                    <Plus className="w-4 h-4" />
                    Nowe powiadomienie
                </button>
            </div>

            {/* Lista powiadomień */}
            <div className="space-y-4">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="loader" />
                    </div>
                ) : broadcasts.length > 0 ? (
                    broadcasts.map((broadcast) => {
                        const typeInfo = getTypeInfo(broadcast.type);
                        const TypeIcon = typeInfo.icon;

                        return (
                            <div
                                key={broadcast.id}
                                className={`card border-l-4 ${
                                    broadcast.is_active
                                        ? `border-l-${typeInfo.color}-500`
                                        : 'border-l-gray-600 opacity-60'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-4 flex-1">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-${typeInfo.color}-900/30`}>
                                            <TypeIcon className={`w-5 h-5 text-${typeInfo.color}-400`} />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="font-semibold text-white">{broadcast.title}</h3>
                                                {broadcast.priority > 0 && (
                                                    <span className="badge badge-warning">Priorytet: {broadcast.priority}</span>
                                                )}
                                                {!broadcast.is_active && (
                                                    <span className="badge bg-gray-700 text-gray-400">Nieaktywne</span>
                                                )}
                                            </div>
                                            <p className="text-gray-400 text-sm whitespace-pre-wrap">{broadcast.message}</p>
                                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                                <span>Utworzono: {formatDate(broadcast.created_at)}</span>
                                                {broadcast.expires_at && (
                                                    <span>Wygasa: {formatDate(broadcast.expires_at)}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleToggle(broadcast)}
                                            className={`p-2 rounded-lg transition-colors ${
                                                broadcast.is_active
                                                    ? 'text-green-400 hover:bg-green-900/30'
                                                    : 'text-gray-500 hover:bg-mc-gray'
                                            }`}
                                            title={broadcast.is_active ? 'Dezaktywuj' : 'Aktywuj'}
                                        >
                                            {broadcast.is_active ? (
                                                <ToggleRight className="w-5 h-5" />
                                            ) : (
                                                <ToggleLeft className="w-5 h-5" />
                                            )}
                                        </button>
                                        <button
                                            onClick={() => openEditModal(broadcast)}
                                            className="p-2 hover:bg-mc-gray rounded-lg text-blue-400 transition-colors"
                                            title="Edytuj"
                                        >
                                            <Edit2 className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(broadcast)}
                                            className="p-2 hover:bg-red-900/30 rounded-lg text-red-400 transition-colors"
                                            title="Usuń"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="card text-center py-12">
                        <Bell className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-500">Brak powiadomień</p>
                        <p className="text-gray-600 text-sm">Utwórz pierwsze powiadomienie dla graczy</p>
                    </div>
                )}
            </div>

            {/* Modal */}
            {modal.open && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="card w-full max-w-lg animate-fadeIn">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-white">
                                {modal.mode === 'create' ? 'Nowe powiadomienie' : 'Edytuj powiadomienie'}
                            </h3>
                            <button
                                onClick={() => setModal({ open: false, mode: 'create', data: null })}
                                className="p-2 hover:bg-mc-gray rounded-lg text-gray-400"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="label">Tytuł *</label>
                                <input
                                    type="text"
                                    value={form.title}
                                    onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                                    className="input"
                                    placeholder="Nagłówek powiadomienia"
                                    required
                                />
                            </div>

                            <div>
                                <label className="label">Treść *</label>
                                <textarea
                                    value={form.message}
                                    onChange={(e) => setForm(prev => ({ ...prev, message: e.target.value }))}
                                    className="input min-h-[100px] resize-none"
                                    placeholder="Treść powiadomienia..."
                                    required
                                />
                            </div>

                            <div>
                                <label className="label">Typ</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {BROADCAST_TYPES.map((type) => {
                                        const TypeIcon = type.icon;
                                        return (
                                            <label
                                                key={type.value}
                                                className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                                                    form.type === type.value
                                                        ? 'border-mc-accent bg-mc-accent/10'
                                                        : 'border-mc-gray hover:border-mc-light-gray'
                                                }`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="type"
                                                    value={type.value}
                                                    checked={form.type === type.value}
                                                    onChange={(e) => setForm(prev => ({ ...prev, type: e.target.value }))}
                                                    className="hidden"
                                                />
                                                <TypeIcon className={`w-4 h-4 text-${type.color}-400`} />
                                                <span className="text-sm text-white">{type.label}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="label">Priorytet</label>
                                    <input
                                        type="number"
                                        value={form.priority}
                                        onChange={(e) => setForm(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
                                        className="input"
                                        min={0}
                                        max={100}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Wyższy = wyświetlane wyżej</p>
                                </div>

                                <div>
                                    <label className="label">Data wygaśnięcia</label>
                                    <input
                                        type="datetime-local"
                                        value={form.expires_at}
                                        onChange={(e) => setForm(prev => ({ ...prev, expires_at: e.target.value }))}
                                        className="input"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setModal({ open: false, mode: 'create', data: null })}
                                    className="btn btn-secondary flex-1"
                                    disabled={actionLoading}
                                >
                                    Anuluj
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary flex-1"
                                    disabled={actionLoading}
                                >
                                    {actionLoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : modal.mode === 'create' ? (
                                        'Utwórz'
                                    ) : (
                                        'Zapisz'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

function formatDate(dateString) {
    try {
        return format(new Date(dateString), 'dd.MM.yyyy HH:mm', { locale: pl });
    } catch {
        return dateString;
    }
}

export default BroadcastsPage;
