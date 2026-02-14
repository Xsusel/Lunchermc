/**
 * Strona zarzadzania regulaminem serwera
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { rulesApi } from '../api/client';
import {
    ScrollText, Plus, Edit3, Trash2, CheckCircle, XCircle,
    Shield, RotateCcw, Users, Loader2, GripVertical,
    ChevronDown, ChevronUp, Eye
} from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

function RulesPage() {
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);

    // Modal edycji/tworzenia
    const [modal, setModal] = useState({ open: false, rule: null });
    const [form, setForm] = useState({
        version: '',
        title: 'Regulamin Serwera',
        content: '',
        requiresAcceptance: true
    });
    const [saving, setSaving] = useState(false);

    // Expanded row
    const [expandedId, setExpandedId] = useState(null);

    // Drag and drop
    const dragItem = useRef(null);
    const dragOverItem = useRef(null);

    useEffect(() => {
        loadRules();
        loadStats();
    }, []);

    const loadRules = async () => {
        try {
            setLoading(true);
            const response = await rulesApi.getAll();
            if (response.success) {
                setRules(response.data || []);
            }
        } catch (error) {
            toast.error('Blad ladowania regulaminow');
        } finally {
            setLoading(false);
        }
    };

    const loadStats = async () => {
        try {
            const response = await rulesApi.getStats();
            if (response.success) {
                setStats(response.data);
            }
        } catch {
            // Stats may not be available if no active rules exist
        }
    };

    const openCreateModal = () => {
        setForm({
            version: '',
            title: 'Regulamin Serwera',
            content: '',
            requiresAcceptance: true
        });
        setModal({ open: true, rule: null });
    };

    const openEditModal = (rule) => {
        setForm({
            version: rule.version,
            title: rule.title,
            content: rule.content,
            requiresAcceptance: !!rule.requires_acceptance
        });
        setModal({ open: true, rule });
    };

    const handleSave = async () => {
        if (!form.version.trim() || !form.content.trim()) {
            toast.error('Wersja i tresc regulaminu sa wymagane');
            return;
        }

        setSaving(true);
        try {
            if (modal.rule) {
                await rulesApi.update(modal.rule.id, form);
                toast.success('Regulamin zostal zaktualizowany');
            } else {
                await rulesApi.create(form);
                toast.success('Regulamin zostal utworzony');
            }
            setModal({ open: false, rule: null });
            loadRules();
            loadStats();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Blad zapisu regulaminu');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (rule) => {
        if (rule.is_active) {
            toast.error('Nie mozna usunac aktywnego regulaminu');
            return;
        }
        if (!confirm(`Czy na pewno chcesz usunac regulamin v${rule.version}?`)) return;

        try {
            await rulesApi.delete(rule.id);
            toast.success('Regulamin zostal usuniety');
            loadRules();
            loadStats();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Blad usuwania regulaminu');
        }
    };

    const handleActivate = async (rule) => {
        if (rule.is_active) return;
        if (!confirm(`Czy na pewno chcesz aktywowac regulamin v${rule.version}? Poprzedni regulamin zostanie dezaktywowany.`)) return;

        try {
            await rulesApi.activate(rule.id);
            toast.success(`Regulamin v${rule.version} zostal aktywowany`);
            loadRules();
            loadStats();
        } catch (error) {
            toast.error('Blad aktywacji regulaminu');
        }
    };

    const handleResetAcceptances = async (rule) => {
        if (!confirm(`Czy na pewno chcesz zresetowac akceptacje regulaminu v${rule.version}? Wszyscy gracze beda musieli go ponownie zaakceptowac.`)) return;

        try {
            const response = await rulesApi.resetAcceptances(rule.id);
            toast.success(response.message || 'Akceptacje zostaly zresetowane');
            loadRules();
            loadStats();
        } catch (error) {
            toast.error('Blad resetowania akceptacji');
        }
    };

    // Drag handlers
    const handleDragStart = (index) => {
        dragItem.current = index;
    };

    const handleDragEnter = (index) => {
        dragOverItem.current = index;
    };

    const handleDragEnd = () => {
        if (dragItem.current === null || dragOverItem.current === null) return;
        if (dragItem.current === dragOverItem.current) return;

        const reordered = [...rules];
        const draggedItem = reordered[dragItem.current];
        reordered.splice(dragItem.current, 1);
        reordered.splice(dragOverItem.current, 0, draggedItem);

        setRules(reordered);
        dragItem.current = null;
        dragOverItem.current = null;
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Naglowek */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <ScrollText className="w-7 h-7 text-mc-green" />
                        Regulamin Serwera
                    </h1>
                    <p className="text-gray-400">Zarzadzaj wersjami regulaminu serwera</p>
                </div>

                <button onClick={openCreateModal} className="btn btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Nowy regulamin
                </button>
            </div>

            {/* Statystyki akceptacji */}
            {stats && (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="card">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-green-900/30 rounded-lg">
                                <Shield className="w-5 h-5 text-green-400" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-400">Aktywna wersja</p>
                                <p className="text-lg font-bold text-white">{stats.rulesVersion || 'Brak'}</p>
                            </div>
                        </div>
                    </div>
                    <div className="card">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-900/30 rounded-lg">
                                <Users className="w-5 h-5 text-blue-400" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-400">Zaakceptowali</p>
                                <p className="text-lg font-bold text-white">{stats.acceptedCount || 0}</p>
                            </div>
                        </div>
                    </div>
                    <div className="card">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-yellow-900/30 rounded-lg">
                                <Users className="w-5 h-5 text-yellow-400" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-400">Oczekujacy</p>
                                <p className="text-lg font-bold text-white">{stats.pendingCount || 0}</p>
                            </div>
                        </div>
                    </div>
                    <div className="card">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-900/30 rounded-lg">
                                <CheckCircle className="w-5 h-5 text-purple-400" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-400">Akceptacja</p>
                                <p className="text-lg font-bold text-white">{stats.acceptanceRate || 0}%</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Lista regulaminow */}
            <div className="card overflow-hidden p-0">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="loader" />
                    </div>
                ) : rules.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                        <ScrollText className="w-12 h-12 mb-4 opacity-50" />
                        <p>Brak regulaminow</p>
                        <p className="text-sm">Kliknij "Nowy regulamin" aby utworzyc pierwszy</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th className="w-10"></th>
                                    <th>Wersja</th>
                                    <th>Tytul</th>
                                    <th>Status</th>
                                    <th>Wymaga akceptacji</th>
                                    <th>Akceptacje</th>
                                    <th>Data utworzenia</th>
                                    <th>Autor</th>
                                    <th className="text-right">Akcje</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rules.map((rule, index) => (
                                    <>
                                        <tr
                                            key={rule.id}
                                            draggable
                                            onDragStart={() => handleDragStart(index)}
                                            onDragEnter={() => handleDragEnter(index)}
                                            onDragEnd={handleDragEnd}
                                            onDragOver={(e) => e.preventDefault()}
                                            className={`cursor-move ${rule.is_active ? 'bg-green-900/10' : ''}`}
                                        >
                                            <td>
                                                <GripVertical className="w-4 h-4 text-gray-600" />
                                            </td>
                                            <td>
                                                <span className="font-mono font-medium text-white">v{rule.version}</span>
                                            </td>
                                            <td>
                                                <button
                                                    onClick={() => setExpandedId(expandedId === rule.id ? null : rule.id)}
                                                    className="flex items-center gap-1 text-white hover:text-mc-green transition-colors"
                                                >
                                                    {rule.title}
                                                    {expandedId === rule.id ? (
                                                        <ChevronUp className="w-3 h-3" />
                                                    ) : (
                                                        <ChevronDown className="w-3 h-3" />
                                                    )}
                                                </button>
                                            </td>
                                            <td>
                                                {rule.is_active ? (
                                                    <span className="badge badge-success">Aktywny</span>
                                                ) : (
                                                    <span className="badge badge-secondary">Nieaktywny</span>
                                                )}
                                            </td>
                                            <td>
                                                {rule.requires_acceptance ? (
                                                    <CheckCircle className="w-4 h-4 text-green-400" />
                                                ) : (
                                                    <XCircle className="w-4 h-4 text-gray-500" />
                                                )}
                                            </td>
                                            <td className="text-gray-400">
                                                {rule.acceptance_count || 0}
                                            </td>
                                            <td className="text-gray-400 text-sm">
                                                {formatDate(rule.created_at)}
                                            </td>
                                            <td className="text-gray-400 text-sm">
                                                {rule.created_by_username || '-'}
                                            </td>
                                            <td>
                                                <div className="flex items-center justify-end gap-1">
                                                    {!rule.is_active && (
                                                        <button
                                                            onClick={() => handleActivate(rule)}
                                                            className="p-2 hover:bg-green-900/30 rounded-lg text-green-400 transition-colors"
                                                            title="Aktywuj"
                                                        >
                                                            <Shield className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    {rule.is_active && (
                                                        <button
                                                            onClick={() => handleResetAcceptances(rule)}
                                                            className="p-2 hover:bg-yellow-900/30 rounded-lg text-yellow-400 transition-colors"
                                                            title="Resetuj akceptacje"
                                                        >
                                                            <RotateCcw className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => openEditModal(rule)}
                                                        className="p-2 hover:bg-blue-900/30 rounded-lg text-blue-400 transition-colors"
                                                        title="Edytuj"
                                                    >
                                                        <Edit3 className="w-4 h-4" />
                                                    </button>
                                                    {!rule.is_active && (
                                                        <button
                                                            onClick={() => handleDelete(rule)}
                                                            className="p-2 hover:bg-red-900/30 rounded-lg text-red-400 transition-colors"
                                                            title="Usun"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                        {expandedId === rule.id && (
                                            <tr key={`${rule.id}-expanded`}>
                                                <td colSpan={9} className="bg-mc-dark/50 p-4">
                                                    <div className="max-h-64 overflow-y-auto">
                                                        <h4 className="text-sm font-semibold text-gray-300 mb-2">Tresc regulaminu:</h4>
                                                        <div className="text-sm text-gray-400 whitespace-pre-wrap">
                                                            {rule.content}
                                                        </div>
                                                    </div>
                                                    {rule.activated_at && (
                                                        <p className="text-xs text-gray-500 mt-3">
                                                            Aktywowany: {formatDate(rule.activated_at)}
                                                        </p>
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                    </>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal tworzenia/edycji */}
            {modal.open && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="card w-full max-w-2xl animate-fadeIn max-h-[90vh] overflow-y-auto">
                        <h3 className="text-lg font-semibold text-white mb-4">
                            {modal.rule ? `Edytuj regulamin v${modal.rule.version}` : 'Nowy regulamin'}
                        </h3>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="label">Wersja</label>
                                    <input
                                        type="text"
                                        value={form.version}
                                        onChange={(e) => setForm({ ...form, version: e.target.value })}
                                        className="input"
                                        placeholder="np. 1.0"
                                    />
                                </div>
                                <div>
                                    <label className="label">Tytul</label>
                                    <input
                                        type="text"
                                        value={form.title}
                                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                                        className="input"
                                        placeholder="Regulamin Serwera"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="label">Tresc regulaminu</label>
                                <textarea
                                    value={form.content}
                                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                                    className="input min-h-[300px] resize-y font-mono text-sm"
                                    placeholder="Wpisz tresc regulaminu..."
                                />
                            </div>

                            <div className="flex items-center gap-3">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={form.requiresAcceptance}
                                        onChange={(e) => setForm({ ...form, requiresAcceptance: e.target.checked })}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-mc-green"></div>
                                </label>
                                <span className="text-sm text-gray-300">Wymagaj akceptacji przez graczy</span>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setModal({ open: false, rule: null })}
                                className="btn btn-secondary flex-1"
                                disabled={saving}
                            >
                                Anuluj
                            </button>
                            <button
                                onClick={handleSave}
                                className="btn btn-primary flex-1"
                                disabled={saving}
                            >
                                {saving ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : modal.rule ? (
                                    'Zapisz zmiany'
                                ) : (
                                    'Utworz regulamin'
                                )}
                            </button>
                        </div>
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
        return dateString || '-';
    }
}

export default RulesPage;
