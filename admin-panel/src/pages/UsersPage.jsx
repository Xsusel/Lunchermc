/**
 * Strona zarządzania użytkownikami
 */
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { usersApi } from '../api/client';
import {
    Users, Search, Ban, UserCheck, Trash2,
    ChevronLeft, ChevronRight, Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

function UsersPage() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [pagination, setPagination] = useState({
        total: 0,
        limit: 20,
        offset: 0
    });

    // Modal do banowania
    const [banModal, setBanModal] = useState({ open: false, user: null, reason: '' });
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        loadUsers();
    }, [pagination.offset]);

    const loadUsers = async () => {
        try {
            setLoading(true);
            const response = await usersApi.getAll(pagination.limit, pagination.offset);
            if (response.success) {
                setUsers(response.data.users);
                setPagination(prev => ({
                    ...prev,
                    total: response.data.pagination.total
                }));
            }
        } catch (error) {
            toast.error('Błąd ładowania użytkowników');
        } finally {
            setLoading(false);
        }
    };

    const handleBan = async () => {
        if (!banModal.user) return;

        setActionLoading(true);
        try {
            await usersApi.ban(banModal.user.id, banModal.reason);
            toast.success(`Użytkownik ${banModal.user.username} został zbanowany`);
            setBanModal({ open: false, user: null, reason: '' });
            loadUsers();
        } catch (error) {
            toast.error('Błąd banowania użytkownika');
        } finally {
            setActionLoading(false);
        }
    };

    const handleUnban = async (user) => {
        try {
            await usersApi.unban(user.id);
            toast.success(`Użytkownik ${user.username} został odbanowany`);
            loadUsers();
        } catch (error) {
            toast.error('Błąd odbanowania użytkownika');
        }
    };

    const handleDelete = async (user) => {
        if (!confirm(`Czy na pewno chcesz usunąć użytkownika ${user.username}?`)) return;

        try {
            await usersApi.delete(user.id);
            toast.success('Użytkownik został usunięty');
            loadUsers();
        } catch (error) {
            toast.error('Błąd usuwania użytkownika');
        }
    };

    // Filtrowanie użytkowników
    const filteredUsers = users.filter(user =>
        user.username.toLowerCase().includes(search.toLowerCase())
    );

    const totalPages = Math.ceil(pagination.total / pagination.limit);
    const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Nagłówek */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Users className="w-7 h-7 text-mc-green" />
                        Użytkownicy
                    </h1>
                    <p className="text-gray-400">Zarządzaj kontami graczy ({pagination.total})</p>
                </div>

                {/* Wyszukiwarka */}
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Szukaj użytkownika..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="input pl-10"
                    />
                </div>
            </div>

            {/* Tabela użytkowników */}
            <div className="card overflow-hidden p-0">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="loader" />
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Nazwa użytkownika</th>
                                        <th>Status</th>
                                        <th>Data rejestracji</th>
                                        <th>Ostatnie logowanie</th>
                                        <th>Czas gry</th>
                                        <th className="text-right">Akcje</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.length > 0 ? (
                                        filteredUsers.map((user) => (
                                            <tr key={user.id}>
                                                <td className="text-gray-500">#{user.id}</td>
                                                <td>
                                                    <span className="font-medium text-white">{user.username}</span>
                                                </td>
                                                <td>
                                                    {user.is_banned ? (
                                                        <span className="badge badge-error">
                                                            Zbanowany
                                                        </span>
                                                    ) : (
                                                        <span className="badge badge-success">
                                                            Aktywny
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="text-gray-400 text-sm">
                                                    {formatDate(user.created_at)}
                                                </td>
                                                <td className="text-gray-400 text-sm">
                                                    {user.last_login ? formatDate(user.last_login) : 'Nigdy'}
                                                </td>
                                                <td className="text-gray-400 text-sm">
                                                    {formatPlaytime(user.total_playtime)}
                                                </td>
                                                <td>
                                                    <div className="flex items-center justify-end gap-2">
                                                        {user.is_banned ? (
                                                            <button
                                                                onClick={() => handleUnban(user)}
                                                                className="p-2 hover:bg-green-900/30 rounded-lg text-green-400 transition-colors"
                                                                title="Odbanuj"
                                                            >
                                                                <UserCheck className="w-4 h-4" />
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => setBanModal({ open: true, user, reason: '' })}
                                                                className="p-2 hover:bg-yellow-900/30 rounded-lg text-yellow-400 transition-colors"
                                                                title="Zbanuj"
                                                            >
                                                                <Ban className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleDelete(user)}
                                                            className="p-2 hover:bg-red-900/30 rounded-lg text-red-400 transition-colors"
                                                            title="Usuń"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={7} className="text-center text-gray-500 py-8">
                                                {search ? 'Nie znaleziono użytkowników' : 'Brak użytkowników'}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Paginacja */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between px-4 py-3 border-t border-mc-gray">
                                <p className="text-sm text-gray-500">
                                    Strona {currentPage} z {totalPages}
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
                                    </button>
                                    <button
                                        onClick={() => setPagination(prev => ({
                                            ...prev,
                                            offset: prev.offset + prev.limit
                                        }))}
                                        disabled={currentPage >= totalPages}
                                        className="btn btn-secondary btn-sm disabled:opacity-50"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Modal banowania */}
            {banModal.open && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="card w-full max-w-md animate-fadeIn">
                        <h3 className="text-lg font-semibold text-white mb-4">
                            Zbanuj użytkownika: {banModal.user?.username}
                        </h3>

                        <div className="mb-4">
                            <label className="label">Powód bana (opcjonalnie)</label>
                            <textarea
                                value={banModal.reason}
                                onChange={(e) => setBanModal(prev => ({ ...prev, reason: e.target.value }))}
                                className="input min-h-[100px] resize-none"
                                placeholder="Podaj powód bana..."
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setBanModal({ open: false, user: null, reason: '' })}
                                className="btn btn-secondary flex-1"
                                disabled={actionLoading}
                            >
                                Anuluj
                            </button>
                            <button
                                onClick={handleBan}
                                className="btn btn-danger flex-1"
                                disabled={actionLoading}
                            >
                                {actionLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    'Zbanuj'
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
        return dateString;
    }
}

function formatPlaytime(minutes) {
    if (!minutes) return '0 min';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
        return `${hours}h ${mins}m`;
    }
    return `${mins} min`;
}

export default UsersPage;
