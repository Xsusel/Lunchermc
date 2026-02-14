/**
 * Główny layout aplikacji z sidebar i header
 */
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore, useUIStore } from '../hooks/useStore';
import {
    LayoutDashboard,
    Users,
    Package,
    Settings,
    Bell,
    FileText,
    LogOut,
    Menu,
    X,
    Gamepad2,
    Server,
    Download,
    ScrollText,
    Newspaper,
    Shirt,
    Box
} from 'lucide-react';

// Elementy nawigacji
const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/users', label: 'Użytkownicy', icon: Users },
    { path: '/mods', label: 'Mody', icon: Package },
    { path: '/curseforge', label: 'CurseForge', icon: Box },
    { path: '/config', label: 'Serwery', icon: Settings },
    { path: '/broadcasts', label: 'Powiadomienia', icon: Bell },
    { path: '/rules', label: 'Regulamin', icon: ScrollText },
    { path: '/news', label: 'Aktualnosci', icon: Newspaper },
    { path: '/skins', label: 'Skiny', icon: Shirt },
    { path: '/logs', label: 'Logi', icon: FileText },
    { path: '/launcher-versions', label: 'Wersje Launchera', icon: Download },
    { path: '/system', label: 'System', icon: Server }
];

function Layout() {
    const navigate = useNavigate();
    const { admin, logout } = useAuthStore();
    const { sidebarOpen, toggleSidebar } = useUIStore();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="min-h-screen flex">
            {/* Sidebar */}
            <aside
                className={`
                    fixed lg:static inset-y-0 left-0 z-50
                    w-64 bg-mc-dark border-r border-mc-gray
                    transform transition-transform duration-300 ease-in-out
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:w-20'}
                `}
            >
                {/* Logo */}
                <div className="h-16 flex items-center justify-between px-4 border-b border-mc-gray">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-mc-accent rounded-lg flex items-center justify-center">
                            <Gamepad2 className="w-6 h-6 text-white" />
                        </div>
                        {sidebarOpen && (
                            <div>
                                <h1 className="font-bold text-white">XsusLauncher</h1>
                                <p className="text-xs text-gray-500">Panel Admina</p>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={toggleSidebar}
                        className="lg:hidden p-2 hover:bg-mc-gray rounded-lg"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Nawigacja */}
                <nav className="p-4 space-y-1">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === '/'}
                            className={({ isActive }) =>
                                `sidebar-link ${isActive ? 'active' : ''}`
                            }
                        >
                            <item.icon className="w-5 h-5 flex-shrink-0" />
                            {sidebarOpen && <span>{item.label}</span>}
                        </NavLink>
                    ))}
                </nav>

                {/* Dolna sekcja */}
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-mc-gray">
                    {sidebarOpen && admin && (
                        <div className="mb-3 px-2">
                            <p className="text-sm text-gray-400">Zalogowany jako:</p>
                            <p className="text-white font-medium">{admin.username}</p>
                        </div>
                    )}
                    <button
                        onClick={handleLogout}
                        className="sidebar-link w-full text-red-400 hover:text-red-300 hover:bg-red-900/20"
                    >
                        <LogOut className="w-5 h-5 flex-shrink-0" />
                        {sidebarOpen && <span>Wyloguj</span>}
                    </button>
                </div>
            </aside>

            {/* Overlay na mobile */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={toggleSidebar}
                />
            )}

            {/* Główna zawartość */}
            <main className="flex-1 flex flex-col min-h-screen">
                {/* Header */}
                <header className="h-16 bg-mc-dark border-b border-mc-gray flex items-center justify-between px-6">
                    <button
                        onClick={toggleSidebar}
                        className="p-2 hover:bg-mc-gray rounded-lg lg:hidden"
                    >
                        <Menu className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-4">
                        <div className="hidden sm:flex items-center gap-2 text-sm text-gray-400">
                            <div className="w-2 h-2 rounded-full bg-mc-green animate-pulse" />
                            <span>API Online</span>
                        </div>
                    </div>
                </header>

                {/* Zawartość strony */}
                <div className="flex-1 p-6 overflow-auto">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}

export default Layout;
