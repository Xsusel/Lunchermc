/**
 * Store globalnego stanu aplikacji (Zustand)
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Store dla autoryzacji
export const useAuthStore = create(
    persist(
        (set, get) => ({
            // Stan
            admin: null,
            token: null,
            isAuthenticated: false,

            // Akcje
            login: (admin, token) => {
                localStorage.setItem('adminToken', token);
                set({
                    admin,
                    token,
                    isAuthenticated: true
                });
            },

            logout: () => {
                localStorage.removeItem('adminToken');
                set({
                    admin: null,
                    token: null,
                    isAuthenticated: false
                });
            },

            // Sprawdzanie czy jest zalogowany
            checkAuth: () => {
                const token = localStorage.getItem('adminToken');
                if (token && !get().isAuthenticated) {
                    // Token jest w localStorage ale stan nie jest ustawiony
                    // Można tutaj dodać weryfikację tokenu z API
                    return true;
                }
                return get().isAuthenticated;
            }
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({
                admin: state.admin,
                isAuthenticated: state.isAuthenticated
            })
        }
    )
);

// Store dla UI
export const useUIStore = create((set) => ({
    // Stan
    sidebarOpen: true,
    loading: false,
    modalOpen: null,
    modalData: null,

    // Akcje
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    setLoading: (loading) => set({ loading }),

    openModal: (modalName, data = null) => set({
        modalOpen: modalName,
        modalData: data
    }),

    closeModal: () => set({
        modalOpen: null,
        modalData: null
    })
}));

// Store dla danych (cache)
export const useDataStore = create((set, get) => ({
    // Dane
    users: [],
    mods: [],
    broadcasts: [],
    config: null,
    stats: null,

    // Timestampy ostatniego pobrania
    lastFetch: {
        users: null,
        mods: null,
        broadcasts: null,
        config: null,
        stats: null
    },

    // Settery
    setUsers: (users) => set({
        users,
        lastFetch: { ...get().lastFetch, users: Date.now() }
    }),

    setMods: (mods) => set({
        mods,
        lastFetch: { ...get().lastFetch, mods: Date.now() }
    }),

    setBroadcasts: (broadcasts) => set({
        broadcasts,
        lastFetch: { ...get().lastFetch, broadcasts: Date.now() }
    }),

    setConfig: (config) => set({
        config,
        lastFetch: { ...get().lastFetch, config: Date.now() }
    }),

    setStats: (stats) => set({
        stats,
        lastFetch: { ...get().lastFetch, stats: Date.now() }
    }),

    // Sprawdzanie czy dane są świeże (5 minut)
    isDataFresh: (key) => {
        const lastFetch = get().lastFetch[key];
        if (!lastFetch) return false;
        return Date.now() - lastFetch < 5 * 60 * 1000;
    },

    // Czyszczenie cache
    clearCache: () => set({
        users: [],
        mods: [],
        broadcasts: [],
        config: null,
        stats: null,
        lastFetch: {
            users: null,
            mods: null,
            broadcasts: null,
            config: null,
            stats: null
        }
    })
}));
