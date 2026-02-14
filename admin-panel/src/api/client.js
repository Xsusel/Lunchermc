/**
 * Klient API - obsługuje wszystkie żądania do backendu
 */
import axios from 'axios';
import toast from 'react-hot-toast';

// Bazowy URL API
const API_URL = import.meta.env.VITE_API_URL || '/api';

// Tworzymy instancję axios
const api = axios.create({
    baseURL: API_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Interceptor dodający token do żądań
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('adminToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Interceptor obsługujący odpowiedzi i błędy
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const message = error.response?.data?.error || 'Wystąpił błąd połączenia';

        // Obsługa błędu autoryzacji (pomijamy przekierowanie na stronie logowania/2FA)
        if (error.response?.status === 401) {
            const isLoginPage = window.location.pathname === '/login';
            if (!isLoginPage) {
                localStorage.removeItem('adminToken');
                localStorage.removeItem('admin');
                window.location.href = '/login';
                toast.error('Sesja wygasła. Zaloguj się ponownie.');
            }
        } else if (error.response?.status === 403) {
            toast.error('Brak uprawnień do tej akcji');
        } else if (error.response?.status >= 500) {
            toast.error('Błąd serwera. Spróbuj ponownie później.');
        }

        return Promise.reject(error);
    }
);

// ============================================
// FUNKCJE API
// ============================================

export const authApi = {
    // Logowanie administratora
    login: async (username, password) => {
        const response = await api.post('/admin/login', { username, password });
        return response.data;
    },

    // Pobieranie danych zalogowanego admina
    getMe: async () => {
        const response = await api.get('/admin/me');
        return response.data;
    }
};

export const dashboardApi = {
    // Pobieranie statystyk dashboardu
    getStats: async () => {
        const response = await api.get('/admin/dashboard');
        return response.data;
    },

    // Pobieranie statusu serwera MC
    getServerStatus: async () => {
        const response = await api.get('/launcher/server-status');
        return response.data;
    },

    // Pobieranie real-time statusu wszystkich serwerów
    getAllServersStatus: async () => {
        const response = await api.get('/admin/servers/status');
        return response.data;
    }
};

export const usersApi = {
    // Lista użytkowników
    getAll: async (limit = 50, offset = 0) => {
        const response = await api.get(`/admin/users?limit=${limit}&offset=${offset}`);
        return response.data;
    },

    // Szczegóły użytkownika
    getById: async (id) => {
        const response = await api.get(`/admin/users/${id}`);
        return response.data;
    },

    // Banowanie użytkownika
    ban: async (id, reason = '') => {
        const response = await api.post(`/admin/users/${id}/ban`, { reason });
        return response.data;
    },

    // Odbanowanie użytkownika
    unban: async (id) => {
        const response = await api.post(`/admin/users/${id}/unban`);
        return response.data;
    },

    // Usuwanie użytkownika
    delete: async (id) => {
        const response = await api.delete(`/admin/users/${id}`);
        return response.data;
    }
};

export const adminsApi = {
    // Lista administratorów
    getAll: async () => {
        const response = await api.get('/admin/admins');
        return response.data;
    },

    // Zmiana roli administratora
    setRole: async (id, role) => {
        const response = await api.post(`/admin/admins/${id}/role`, { role });
        return response.data;
    }
};

export const configApi = {
    // Pobieranie konfiguracji
    get: async () => {
        const response = await api.get('/admin/config');
        return response.data;
    },

    // Aktualizacja konfiguracji
    update: async (data) => {
        const response = await api.put('/admin/config', data);
        return response.data;
    },

    // Tryb konserwacji
    setMaintenance: async (enabled, message = '') => {
        const response = await api.post('/admin/config/maintenance', { enabled, message });
        return response.data;
    }
};

export const serversApi = {
    // Lista serwerów
    getAll: async () => {
        const response = await api.get('/admin/servers');
        return response.data;
    },

    // Dodawanie serwera
    create: async (data) => {
        const response = await api.post('/admin/servers', data);
        return response.data;
    },

    // Aktualizacja serwera
    update: async (id, data) => {
        const response = await api.put(`/admin/servers/${id}`, data);
        return response.data;
    },

    // Usuwanie serwera
    delete: async (id) => {
        const response = await api.delete(`/admin/servers/${id}`);
        return response.data;
    },

    // Przełączanie statusu
    toggle: async (id) => {
        const response = await api.post(`/admin/servers/${id}/toggle`);
        return response.data;
    },

    // Zmiana kolejności
    reorder: async (ids) => {
        const response = await api.post('/admin/servers/reorder', { ids });
        return response.data;
    }
};

export const modsApi = {
    // Lista modów
    getAll: async () => {
        const response = await api.get('/admin/mods');
        return response.data;
    },

    // Dodawanie moda przez upload
    upload: async (formData) => {
        const response = await api.post('/admin/mods', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },

    // Dodawanie moda przez URL
    addByUrl: async (data) => {
        const response = await api.post('/admin/mods/url', data);
        return response.data;
    },

    // Aktualizacja moda
    update: async (id, data) => {
        const response = await api.put(`/admin/mods/${id}`, data);
        return response.data;
    },

    // Włączanie/wyłączanie moda
    toggle: async (id) => {
        const response = await api.post(`/admin/mods/${id}/toggle`);
        return response.data;
    },

    // Usuwanie moda
    delete: async (id) => {
        const response = await api.delete(`/admin/mods/${id}`);
        return response.data;
    },

    // Synchronizacja z dyskiem
    sync: async () => {
        const response = await api.post('/admin/mods/sync');
        return response.data;
    }
};

export const filesApi = {
    // Lista plików
    getAll: async (type) => {
        const response = await api.get(`/files/admin/list/${type}`);
        return response.data;
    },

    // Dodawanie pliku
    upload: async (type, formData) => {
        const response = await api.post(`/files/admin/upload/${type}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },

    // Przełączanie statusu
    toggle: async (id, type) => {
        const response = await api.put(`/files/admin/${type}/${id}/toggle`);
        return response.data;
    },

    // Usuwanie pliku
    delete: async (id, type) => {
        const response = await api.delete(`/files/admin/${type}/${id}`);
        return response.data;
    },

    // Synchronizacja
    sync: async () => {
        const response = await api.post('/files/admin/sync');
        return response.data;
    }
};

export const broadcastsApi = {
    // Lista powiadomień
    getAll: async () => {
        const response = await api.get('/admin/broadcasts');
        return response.data;
    },

    // Tworzenie powiadomienia
    create: async (data) => {
        const response = await api.post('/admin/broadcasts', data);
        return response.data;
    },

    // Aktualizacja powiadomienia
    update: async (id, data) => {
        const response = await api.put(`/admin/broadcasts/${id}`, data);
        return response.data;
    },

    // Włączanie/wyłączanie powiadomienia
    toggle: async (id) => {
        const response = await api.post(`/admin/broadcasts/${id}/toggle`);
        return response.data;
    },

    // Usuwanie powiadomienia
    delete: async (id) => {
        const response = await api.delete(`/admin/broadcasts/${id}`);
        return response.data;
    }
};

export const logsApi = {
    // Lista logów
    getAll: async (limit = 100, offset = 0, action = null) => {
        let url = `/admin/logs?limit=${limit}&offset=${offset}`;
        if (action) url += `&action=${action}`;
        const response = await api.get(url);
        return response.data;
    }
};

export const launcherVersionsApi = {
    // Lista wersji launchera
    getAll: async () => {
        const response = await api.get('/admin/launcher-versions');
        return response.data;
    },

    // Dodawanie wersji (ręcznie z URL)
    create: async (data) => {
        const response = await api.post('/admin/launcher-versions', data);
        return response.data;
    },

    // Upload pliku launchera (automatyczny SHA256 i URL)
    upload: async (formData, onProgress) => {
        const response = await api.post('/admin/launcher-versions/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 300000, // 5 min timeout
            onUploadProgress: onProgress ? (e) => {
                const percent = Math.round((e.loaded * 100) / e.total);
                onProgress(percent);
            } : undefined
        });
        return response.data;
    },

    // Usuwanie wersji
    delete: async (id) => {
        const response = await api.delete(`/admin/launcher-versions/${id}`);
        return response.data;
    }
};

export const twoFactorApi = {
    // Rozpoczyna konfigurację 2FA
    setup: async () => {
        const response = await api.post('/admin/2fa/setup');
        return response.data;
    },

    // Weryfikuje kod TOTP podczas konfiguracji
    verifySetup: async (token) => {
        const response = await api.post('/admin/2fa/verify-setup', { token });
        return response.data;
    },

    // Wyłącza 2FA
    disable: async (token) => {
        const response = await api.post('/admin/2fa/disable', { token });
        return response.data;
    },

    // Generuje nowe kody zapasowe
    generateBackupCodes: async () => {
        const response = await api.post('/admin/2fa/backup-codes');
        return response.data;
    },

    // Weryfikuje 2FA podczas logowania
    verifyLogin: async (tempToken, token) => {
        const response = await api.post('/admin/2fa/verify-login', { tempToken, token });
        return response.data;
    },

    // Sprawdza status 2FA
    getStatus: async () => {
        const response = await api.get('/admin/2fa/status');
        return response.data;
    }
};

export const systemApi = {
    // Pobieranie statusu systemu
    getStatus: async () => {
        const response = await api.get('/admin/system/status');
        return response.data;
    },

    // Sprawdzanie dostepnych aktualizacji
    checkUpdates: async () => {
        const response = await api.post('/admin/system/check-updates');
        return response.data;
    },

    // Rozpoczecie aktualizacji
    startUpdate: async () => {
        const response = await api.post('/admin/system/update');
        return response.data;
    },

    // Pobieranie logow aktualizacji
    getUpdateLogs: async () => {
        const response = await api.get('/admin/system/update-logs');
        return response.data;
    },

    // Restart uslug
    restart: async () => {
        const response = await api.post('/admin/system/restart');
        return response.data;
    },

    // Tworzenie backupu
    createBackup: async () => {
        const response = await api.post('/admin/system/backup');
        return response.data;
    },

    // Lista backupow
    getBackups: async () => {
        const response = await api.get('/admin/system/backups');
        return response.data;
    },

    // Przywracanie backupu
    restoreBackup: async (filename) => {
        const response = await api.post(`/admin/system/restore/${encodeURIComponent(filename)}`);
        return response.data;
    },

    // Usuwanie backupu
    deleteBackup: async (filename) => {
        const response = await api.delete(`/admin/system/backup/${encodeURIComponent(filename)}`);
        return response.data;
    },

    // Pobieranie backupu (zwraca URL do pobrania)
    downloadBackup: (filename) => {
        const token = localStorage.getItem('adminToken');
        return `${API_URL}/admin/system/backup/${encodeURIComponent(filename)}/download?token=${token}`;
    }
};

export const rulesApi = {
    // Lista wszystkich wersji regulaminu
    getAll: async () => {
        const response = await api.get('/admin/rules');
        return response.data;
    },

    // Szczegóły regulaminu
    getById: async (id) => {
        const response = await api.get(`/admin/rules/${id}`);
        return response.data;
    },

    // Aktywny regulamin
    getActive: async () => {
        const response = await api.get('/admin/rules/active');
        return response.data;
    },

    // Statystyki akceptacji
    getStats: async (rulesId = null) => {
        const url = rulesId ? `/admin/rules/stats?rulesId=${rulesId}` : '/admin/rules/stats';
        const response = await api.get(url);
        return response.data;
    },

    // Tworzenie regulaminu
    create: async (data) => {
        const response = await api.post('/admin/rules', data);
        return response.data;
    },

    // Aktualizacja regulaminu
    update: async (id, data) => {
        const response = await api.put(`/admin/rules/${id}`, data);
        return response.data;
    },

    // Usuwanie regulaminu
    delete: async (id) => {
        const response = await api.delete(`/admin/rules/${id}`);
        return response.data;
    },

    // Aktywacja regulaminu
    activate: async (id) => {
        const response = await api.post(`/admin/rules/${id}/activate`);
        return response.data;
    },

    // Toggle (aktywacja/dezaktywacja)
    toggle: async (id) => {
        const response = await api.post(`/admin/rules/${id}/activate`);
        return response.data;
    },

    // Reset akceptacji
    resetAcceptances: async (id) => {
        const response = await api.post(`/admin/rules/${id}/reset-acceptances`);
        return response.data;
    },

    // Lista akceptacji
    getAcceptances: async (id, limit = 100, offset = 0) => {
        const response = await api.get(`/admin/rules/${id}/acceptances?limit=${limit}&offset=${offset}`);
        return response.data;
    }
};

export const newsApi = {
    // Lista wszystkich wiadomości
    getAll: async (options = {}) => {
        const params = new URLSearchParams();
        if (options.limit) params.append('limit', options.limit);
        if (options.offset) params.append('offset', options.offset);
        if (options.type) params.append('type', options.type);
        if (options.publishedOnly) params.append('publishedOnly', 'true');
        const response = await api.get(`/admin/news?${params.toString()}`);
        return response.data;
    },

    // Szczegóły wiadomości
    getById: async (id) => {
        const response = await api.get(`/admin/news/${id}`);
        return response.data;
    },

    // Statystyki
    getStats: async () => {
        const response = await api.get('/admin/news/stats');
        return response.data;
    },

    // Typy wiadomości
    getTypes: async () => {
        const response = await api.get('/admin/news/types');
        return response.data;
    },

    // Tworzenie wiadomości
    create: async (data) => {
        const response = await api.post('/admin/news', data);
        return response.data;
    },

    // Aktualizacja wiadomości
    update: async (id, data) => {
        const response = await api.put(`/admin/news/${id}`, data);
        return response.data;
    },

    // Usuwanie wiadomości
    delete: async (id) => {
        const response = await api.delete(`/admin/news/${id}`);
        return response.data;
    },

    // Publikacja
    publish: async (id) => {
        const response = await api.post(`/admin/news/${id}/publish`);
        return response.data;
    },

    // Wycofanie publikacji
    unpublish: async (id) => {
        const response = await api.post(`/admin/news/${id}/unpublish`);
        return response.data;
    },

    // Przypnij/odepnij
    togglePinned: async (id) => {
        const response = await api.post(`/admin/news/${id}/pin`);
        return response.data;
    }
};

export default api;
