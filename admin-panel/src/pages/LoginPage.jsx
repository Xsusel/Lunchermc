/**
 * Strona logowania do panelu administracyjnego
 * Obsluguje rowniez weryfikacje 2FA
 */
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../hooks/useStore';
import { authApi, twoFactorApi } from '../api/client';
import { Gamepad2, Eye, EyeOff, Loader2, Shield, ArrowLeft } from 'lucide-react';

function LoginPage() {
    const navigate = useNavigate();
    const { login } = useAuthStore();

    const [formData, setFormData] = useState({
        username: '',
        password: ''
    });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Stan 2FA
    const [requires2FA, setRequires2FA] = useState(false);
    const [tempToken, setTempToken] = useState('');
    const [twoFACode, setTwoFACode] = useState('');
    const twoFAInputRef = useRef(null);

    // Auto-focus na pole 2FA gdy sie pojawi
    useEffect(() => {
        if (requires2FA && twoFAInputRef.current) {
            twoFAInputRef.current.focus();
        }
    }, [requires2FA]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await authApi.login(formData.username, formData.password);

            if (response.success) {
                // Sprawdzamy czy wymagana jest weryfikacja 2FA
                if (response.data.requires2FA) {
                    setRequires2FA(true);
                    setTempToken(response.data.tempToken);
                    setLoading(false);
                    return;
                }

                login(response.data.admin, response.data.token);
                toast.success('Zalogowano pomyslnie!');
                navigate('/');
            }
        } catch (err) {
            const message = err.response?.data?.error || 'Blad logowania';
            setError(message);
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    const handle2FASubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await twoFactorApi.verifyLogin(tempToken, twoFACode);

            if (response.success) {
                login(response.data.admin, response.data.token);
                toast.success('Zalogowano pomyslnie!');
                navigate('/');
            }
        } catch (err) {
            const message = err.response?.data?.error || 'Nieprawidlowy kod 2FA';
            setError(message);
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    const handleBack = () => {
        setRequires2FA(false);
        setTempToken('');
        setTwoFACode('');
        setError('');
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-mc-darker via-mc-dark to-mc-darker">
            {/* Tlo z efektem */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-mc-accent/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-mc-green/10 rounded-full blur-3xl" />
            </div>

            {/* Formularz */}
            <div className="relative w-full max-w-md">
                <div className="card animate-fadeIn">
                    {/* Logo */}
                    <div className="text-center mb-8">
                        <div className="w-20 h-20 bg-gradient-to-br from-mc-accent to-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-mc-accent/20">
                            {requires2FA ? (
                                <Shield className="w-10 h-10 text-white" />
                            ) : (
                                <Gamepad2 className="w-10 h-10 text-white" />
                            )}
                        </div>
                        <h1 className="text-2xl font-bold text-white">XsusLauncher</h1>
                        <p className="text-gray-400 mt-1">
                            {requires2FA ? 'Weryfikacja dwuetapowa' : 'Panel Administracyjny'}
                        </p>
                    </div>

                    {/* Formularz logowania lub 2FA */}
                    {requires2FA ? (
                        <form onSubmit={handle2FASubmit} className="space-y-5">
                            {/* Blad */}
                            {error && (
                                <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm animate-fadeIn">
                                    {error}
                                </div>
                            )}

                            <div className="p-3 bg-mc-accent/10 border border-mc-accent/30 rounded-lg text-mc-accent text-sm">
                                Wprowadz 6-cyfrowy kod z aplikacji uwierzytelniajace lub kod zapasowy.
                            </div>

                            {/* Kod 2FA */}
                            <div>
                                <label htmlFor="twoFACode" className="label">
                                    Kod weryfikacyjny
                                </label>
                                <input
                                    ref={twoFAInputRef}
                                    type="text"
                                    id="twoFACode"
                                    value={twoFACode}
                                    onChange={(e) => {
                                        setTwoFACode(e.target.value);
                                        setError('');
                                    }}
                                    className="input text-center text-2xl tracking-widest font-mono"
                                    placeholder="000000"
                                    maxLength={9}
                                    autoComplete="one-time-code"
                                    required
                                    disabled={loading}
                                />
                            </div>

                            {/* Przyciski */}
                            <button
                                type="submit"
                                disabled={loading || !twoFACode.trim()}
                                className="btn btn-primary w-full py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Weryfikacja...
                                    </>
                                ) : (
                                    'Zweryfikuj'
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={handleBack}
                                className="btn btn-secondary w-full py-2 flex items-center justify-center gap-2"
                                disabled={loading}
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Powrot do logowania
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            {/* Blad */}
                            {error && (
                                <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm animate-fadeIn">
                                    {error}
                                </div>
                            )}

                            {/* Nazwa uzytkownika */}
                            <div>
                                <label htmlFor="username" className="label">
                                    Nazwa uzytkownika
                                </label>
                                <input
                                    type="text"
                                    id="username"
                                    name="username"
                                    value={formData.username}
                                    onChange={handleChange}
                                    className="input"
                                    placeholder="admin"
                                    required
                                    autoFocus
                                    disabled={loading}
                                />
                            </div>

                            {/* Haslo */}
                            <div>
                                <label htmlFor="password" className="label">
                                    Haslo
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        id="password"
                                        name="password"
                                        value={formData.password}
                                        onChange={handleChange}
                                        className="input pr-12"
                                        placeholder="••••••••"
                                        required
                                        disabled={loading}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                                    >
                                        {showPassword ? (
                                            <EyeOff className="w-5 h-5" />
                                        ) : (
                                            <Eye className="w-5 h-5" />
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Przycisk */}
                            <button
                                type="submit"
                                disabled={loading}
                                className="btn btn-primary w-full py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Logowanie...
                                    </>
                                ) : (
                                    'Zaloguj sie'
                                )}
                            </button>
                        </form>
                    )}

                    {/* Stopka */}
                    <p className="text-center text-gray-500 text-sm mt-6">
                        XsusLauncher Admin Panel v1.0
                    </p>
                </div>
            </div>
        </div>
    );
}

export default LoginPage;
