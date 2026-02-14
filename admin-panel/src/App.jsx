/**
 * Glowny komponent aplikacji
 * Routing, layout, code splitting i error boundary
 */
import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './hooks/useStore';

// Komponenty ladowane synchronicznie (kluczowe dla UX)
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import LoginPage from './pages/LoginPage';

// Lazy-loaded pages (code splitting)
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const ModsPage = lazy(() => import('./pages/ModsPage'));
const ConfigPage = lazy(() => import('./pages/ConfigPage'));
const BroadcastsPage = lazy(() => import('./pages/BroadcastsPage'));
const LogsPage = lazy(() => import('./pages/LogsPage'));
const SystemPage = lazy(() => import('./pages/SystemPage'));
const LauncherVersionsPage = lazy(() => import('./pages/LauncherVersionsPage'));
const RulesPage = lazy(() => import('./pages/RulesPage'));
const NewsPage = lazy(() => import('./pages/NewsPage'));
const SkinsPage = lazy(() => import('./pages/SkinsPage'));
const CurseForgePage = lazy(() => import('./pages/CurseForgePage'));

/**
 * Spinner ladowania dla Suspense
 */
const PageLoader = () => (
    <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
            <div className="loader" />
            <p className="text-sm text-gray-500">Ladowanie strony...</p>
        </div>
    </div>
);

/**
 * Komponent chroniaacy trasy wymagajace autoryzacji
 */
const ProtectedRoute = ({ children }) => {
    const { isAuthenticated } = useAuthStore();
    const token = localStorage.getItem('adminToken');

    if (!isAuthenticated && !token) {
        return <Navigate to="/login" replace />;
    }

    return children;
};

/**
 * Komponent przekierowujacy zalogowanych uzytkownikow
 */
const PublicRoute = ({ children }) => {
    const { isAuthenticated } = useAuthStore();
    const token = localStorage.getItem('adminToken');

    if (isAuthenticated || token) {
        return <Navigate to="/" replace />;
    }

    return children;
};

function App() {
    return (
        <ErrorBoundary>
            <Routes>
                {/* Strona logowania */}
                <Route
                    path="/login"
                    element={
                        <PublicRoute>
                            <LoginPage />
                        </PublicRoute>
                    }
                />

                {/* Chronione trasy w layoucie */}
                <Route
                    path="/"
                    element={
                        <ProtectedRoute>
                            <Layout />
                        </ProtectedRoute>
                    }
                >
                    <Route index element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />
                    <Route path="users" element={<Suspense fallback={<PageLoader />}><UsersPage /></Suspense>} />
                    <Route path="mods" element={<Suspense fallback={<PageLoader />}><ModsPage /></Suspense>} />
                    <Route path="curseforge" element={<Suspense fallback={<PageLoader />}><CurseForgePage /></Suspense>} />
                    <Route path="config" element={<Suspense fallback={<PageLoader />}><ConfigPage /></Suspense>} />
                    <Route path="broadcasts" element={<Suspense fallback={<PageLoader />}><BroadcastsPage /></Suspense>} />
                    <Route path="logs" element={<Suspense fallback={<PageLoader />}><LogsPage /></Suspense>} />
                    <Route path="launcher-versions" element={<Suspense fallback={<PageLoader />}><LauncherVersionsPage /></Suspense>} />
                    <Route path="rules" element={<Suspense fallback={<PageLoader />}><RulesPage /></Suspense>} />
                    <Route path="news" element={<Suspense fallback={<PageLoader />}><NewsPage /></Suspense>} />
                    <Route path="skins" element={<Suspense fallback={<PageLoader />}><SkinsPage /></Suspense>} />
                    <Route path="system" element={<Suspense fallback={<PageLoader />}><SystemPage /></Suspense>} />
                </Route>

                {/* Przekierowanie dla nieznanych tras */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </ErrorBoundary>
    );
}

export default App;
