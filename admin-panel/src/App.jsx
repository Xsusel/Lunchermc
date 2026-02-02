/**
 * Główny komponent aplikacji
 * Routing i layout
 */
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './hooks/useStore';

// Strony
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import ModsPage from './pages/ModsPage';
import ConfigPage from './pages/ConfigPage';
import BroadcastsPage from './pages/BroadcastsPage';
import LogsPage from './pages/LogsPage';

// Komponenty
import Layout from './components/Layout';

/**
 * Komponent chroniący trasy wymagające autoryzacji
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
 * Komponent przekierowujący zalogowanych użytkowników
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
                <Route index element={<DashboardPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="mods" element={<ModsPage />} />
                <Route path="config" element={<ConfigPage />} />
                <Route path="broadcasts" element={<BroadcastsPage />} />
                <Route path="logs" element={<LogsPage />} />
            </Route>

            {/* Przekierowanie dla nieznanych tras */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default App;
