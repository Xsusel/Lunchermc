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

        // Obsługa błędu autoryzacji
        if (error.response?.status === 401) {
            localStorage.removeItem('adminToken');
            localStorage.removeItem('admin');
            window.location.href = '/login';
            toast.error('Sesja wygasła. Zaloguj się ponownie.');
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

    // Dodawanie wersji
    create: async (data) => {
        const response = await api.post('/admin/launcher-versions', data);
        return response.data;
    },

    // Usuwanie wersji
    delete: async (id) => {
        const response = await api.delete(`/admin/launcher-versions/${id}`);
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
    }
};

export default api;
