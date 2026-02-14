/**
 * Strona zarzadzania uzytkownikami
 * Z funkcjami bulk, filtrowania i paginacji
 */
import { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { usersApi } from '../api/client';
import {
    Users, Search, Ban, UserCheck, Trash2,
    ChevronLeft, ChevronRight, Loader2,
    CheckSquare, Square, Filter, XCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

function UsersPage() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // all, active, banned
    const [pagination, setPagination] = useState({
        total: 0,
        limit: 20,
        offset: 0
    });

    // Bulk selection
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkLoading, setBulkLoading] = useState(false);

    // Modal do banowania
    const [banModal, setBanModal] = useState({ open: false, user: null, reason: '' });
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        loadUsers();
    }, [pagination.offset]);

    // Reset selection when users change
    useEffect(() => {
        setSelectedIds(new Set());
    }, [users]);

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
            toast.error('Blad ladowania uzytkownikow');
        } finally {
            setLoading(false);
        }
    };

    const handleBan = async () => {
        if (!banModal.user) return;

        setActionLoading(true);
        try {
            await usersApi.ban(banModal.user.id, banModal.reason);
            toast.success(`Uzytkownik ${banModal.user.username} zostal zbanowany`);
            setBanModal({ open: false, user: null, reason: '' });
            loadUsers();
        } catch (error) {
            toast.error('Blad banowania uzytkownika');
        } finally {
            setActionLoading(false);
        }
    };

    const handleUnban = async (user) => {
        try {
            await usersApi.unban(user.id);
            toast.success(`Uzytkownik ${user.username} zostal odbanowany`);
            loadUsers();
        } catch (error) {
            toast.error('Blad odbanowania uzytkownika');
        }
    };

    const handleDelete = async (user) => {
        if (!confirm(`Czy na pewno chcesz usunac uzytkownika ${user.username}?`)) return;

        try {
            await usersApi.delete(user.id);
            toast.success('Uzytkownik zostal usuniety');
            loadUsers();
        } catch (error) {
            toast.error('Blad usuwania uzytkownika');
        }
    };

    // Filtrowanie uzytkownikow - po wyszukiwaniu i statusie
    const filteredUsers = useMemo(() => {
        return users.filter(user => {
            const matchesSearch = user.username.toLowerCase().includes(search.toLowerCase());
            const matchesStatus =
                statusFilter === 'all' ? true :
                statusFilter === 'active' ? !user.is_banned :
                statusFilter === 'banned' ? user.is_banned :
                true;
            return matchesSearch && matchesStatus;
        });
    }, [users, search, statusFilter]);

    // Bulk selection helpers
    const allVisibleSelected = filteredUsers.length > 0 && filteredUsers.every(u => selectedIds.has(u.id));
    const someSelected = selectedIds.size > 0;

    const toggleSelectAll = () => {
        if (allVisibleSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredUsers.map(u => u.id)));
        }
    };

    const toggleSelect = (id) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    // Bulk actions
    const handleBulkBan = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Czy na pewno chcesz zbanowac ${selectedIds.size} uzytkownikow?`)) return;

        setBulkLoading(true);
        let success = 0;
        let failed = 0;

        for (const id of selectedIds) {
            try {
                await usersApi.ban(id, 'Bulk ban');
                success++;
            } catch {
                failed++;
            }
        }

        setBulkLoading(false);
        setSelectedIds(new Set());
        toast.success(`Zbanowano ${success} uzytkownikow${failed > 0 ? `, ${failed} bledow` : ''}`);
        loadUsers();
    };

    const handleBulkUnban = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Czy na pewno chcesz odbanowac ${selectedIds.size} uzytkownikow?`)) return;

        setBulkLoading(true);
        let success = 0;
        let failed = 0;

        for (const id of selectedIds) {
            try {
                await usersApi.unban(id);
                success++;
            } catch {
                failed++;
            }
        }

        setBulkLoading(false);
        setSelectedIds(new Set());
        toast.success(`Odbanowano ${success} uzytkownikow${failed > 0 ? `, ${failed} bledow` : ''}`);
        loadUsers();
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Czy na pewno chcesz USUNAC ${selectedIds.size} uzytkownikow? Tej operacji nie mozna cofnac!`)) return;

        setBulkLoading(true);
        let success = 0;
        let failed = 0;

        for (const id of selectedIds) {
            try {
                await usersApi.delete(id);
                success++;
            } catch {
                failed++;
            }
        }

        setBulkLoading(false);
        setSelectedIds(new Set());
        toast.success(`Usunieto ${success} uzytkownikow${failed > 0 ? `, ${failed} bledow` : ''}`);
        loadUsers();
    };

    const totalPages = Math.ceil(pagination.total / pagination.limit);
    const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Naglowek */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Users className="w-7 h-7 text-mc-green" />
                        Uzytkownicy
                    </h1>
                    <p className="text-gray-400">Zarzadzaj kontami graczy ({pagination.total})</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                    {/* Filtr statusu */}
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="input pl-10 pr-8 appearance-none"
                        >
                            <option value="all">Wszyscy</option>
                            <option value="active">Aktywni</option>
                            <option value="banned">Zbanowani</option>
                        </select>
                    </div>

                    {/* Wyszukiwarka */}
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Szukaj uzytkownika..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="input pl-10"
                        />
                        {search && (
                            <button
                                onClick={() => setSearch('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                            >
                                <XCircle className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Bulk actions bar */}
            {someSelected && (
                <div className="card flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-mc-dark/80 border border-mc-accent/30">
                    <span className="text-sm text-gray-300">
                        Zaznaczono <strong className="text-white">{selectedIds.size}</strong> uzytkownikow
                    </span>
                    <div className="flex gap-2 flex-wrap">
                        <button
                            onClick={handleBulkBan}
                            disabled={bulkLoading}
                            className="btn btn-sm bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50 border border-yellow-700/30 flex items-center gap-1"
                        >
                            {bulkLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
                            Zbanuj zaznaczonych
                        </button>
                        <button
                            onClick={handleBulkUnban}
                            disabled={bulkLoading}
                            className="btn btn-sm bg-green-900/30 text-green-400 hover:bg-green-900/50 border border-green-700/30 flex items-center gap-1"
                        >
                            {bulkLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                            Odbanuj zaznaczonych
                        </button>
                        <button
                            onClick={handleBulkDelete}
                            disabled={bulkLoading}
                            className="btn btn-sm bg-red-900/30 text-red-400 hover:bg-red-900/50 border border-red-700/30 flex items-center gap-1"
                        >
                            {bulkLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            Usun zaznaczonych
                        </button>
                        <button
                            onClick={() => setSelectedIds(new Set())}
                            disabled={bulkLoading}
                            className="btn btn-sm btn-secondary flex items-center gap-1"
                        >
                            <XCircle className="w-3 h-3" />
                            Odznacz
                        </button>
                    </div>
                </div>
            )}

            {/* Tabela uzytkownikow */}
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
                                        <th className="w-10">
                                            <button
                                                onClick={toggleSelectAll}
                                                className="p-1 hover:bg-mc-gray rounded transition-colors"
                                                title={allVisibleSelected ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
                                            >
                                                {allVisibleSelected ? (
                                                    <CheckSquare className="w-4 h-4 text-mc-green" />
                                                ) : (
                                                    <Square className="w-4 h-4 text-gray-500" />
                                                )}
                                            </button>
                                        </th>
                                        <th>ID</th>
                                        <th>Nazwa uzytkownika</th>
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
                                            <tr
                                                key={user.id}
                                                className={selectedIds.has(user.id) ? 'bg-mc-accent/10' : ''}
                                            >
                                                <td>
                                                    <button
                                                        onClick={() => toggleSelect(user.id)}
                                                        className="p-1 hover:bg-mc-gray rounded transition-colors"
                                                    >
                                                        {selectedIds.has(user.id) ? (
                                                            <CheckSquare className="w-4 h-4 text-mc-green" />
                                                        ) : (
                                                            <Square className="w-4 h-4 text-gray-500" />
                                                        )}
                                                    </button>
                                                </td>
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
                                                            title="Usun"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={8} className="text-center text-gray-500 py-8">
                                                {search || statusFilter !== 'all' ? 'Nie znaleziono uzytkownikow' : 'Brak uzytkownikow'}
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
                                    Strona {currentPage} z {totalPages} (lacznie {pagination.total} uzytkownikow)
                                </p>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setPagination(prev => ({
                                            ...prev,
                                            offset: 0
                                        }))}
                                        disabled={pagination.offset === 0}
                                        className="btn btn-secondary btn-sm disabled:opacity-50"
                                        title="Pierwsza strona"
                                    >
                                        1
                                    </button>
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

                                    {/* Page number indicators */}
                                    {generatePageNumbers(currentPage, totalPages).map((pageNum, idx) => (
                                        pageNum === '...' ? (
                                            <span key={`dots-${idx}`} className="text-gray-500 px-1">...</span>
                                        ) : (
                                            <button
                                                key={pageNum}
                                                onClick={() => setPagination(prev => ({
                                                    ...prev,
                                                    offset: (pageNum - 1) * prev.limit
                                                }))}
                                                className={`btn btn-sm min-w-[32px] ${
                                                    pageNum === currentPage
                                                        ? 'btn-primary'
                                                        : 'btn-secondary'
                                                }`}
                                            >
                                                {pageNum}
                                            </button>
                                        )
                                    ))}

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
                                    <button
                                        onClick={() => setPagination(prev => ({
                                            ...prev,
                                            offset: (totalPages - 1) * prev.limit
                                        }))}
                                        disabled={currentPage >= totalPages}
                                        className="btn btn-secondary btn-sm disabled:opacity-50"
                                        title="Ostatnia strona"
                                    >
                                        {totalPages}
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
                            Zbanuj uzytkownika: {banModal.user?.username}
                        </h3>

                        <div className="mb-4">
                            <label className="label">Powod bana (opcjonalnie)</label>
                            <textarea
                                value={banModal.reason}
                                onChange={(e) => setBanModal(prev => ({ ...prev, reason: e.target.value }))}
                                className="input min-h-[100px] resize-none"
                                placeholder="Podaj powod bana..."
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

function generatePageNumbers(current, total) {
    if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i + 1);
    }

    const pages = [];
    if (current <= 3) {
        pages.push(1, 2, 3, 4, '...', total);
    } else if (current >= total - 2) {
        pages.push(1, '...', total - 3, total - 2, total - 1, total);
    } else {
        pages.push(1, '...', current - 1, current, current + 1, '...', total);
    }
    return pages;
}

export default UsersPage;
