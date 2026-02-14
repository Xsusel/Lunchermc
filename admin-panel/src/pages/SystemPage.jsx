/**
 * Strona zarzadzania systemem
 * Aktualizacje, backup, restart, 2FA
 */
import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { systemApi, twoFactorApi } from '../api/client';
import {
    Server, RefreshCw, Download, GitBranch,
    HardDrive, Clock, AlertTriangle, CheckCircle,
    XCircle, Loader2, Archive, RotateCcw, Play,
    Terminal, Github, Shield, ShieldCheck, ShieldOff,
    Key, Copy, Eye, EyeOff
} from 'lucide-react';

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    return parts.join(' ') || '< 1m';
}

function SystemPage() {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [checkingUpdates, setCheckingUpdates] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [restarting, setRestarting] = useState(false);
    const [creatingBackup, setCreatingBackup] = useState(false);
    const [updateInfo, setUpdateInfo] = useState(null);
    const [updateLogs, setUpdateLogs] = useState([]);
    const [backups, setBackups] = useState([]);
    const logsEndRef = useRef(null);

    // Stan 2FA
    const [twoFAEnabled, setTwoFAEnabled] = useState(false);
    const [twoFALoading, setTwoFALoading] = useState(false);
    const [twoFASetupData, setTwoFASetupData] = useState(null);
    const [twoFAVerifyCode, setTwoFAVerifyCode] = useState('');
    const [twoFADisableCode, setTwoFADisableCode] = useState('');
    const [backupCodes, setBackupCodes] = useState(null);
    const [showSecret, setShowSecret] = useState(false);
    const [showDisableForm, setShowDisableForm] = useState(false);

    useEffect(() => {
        loadStatus();
        loadBackups();
        load2FAStatus();
    }, []);

    // Auto-scroll logs
    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [updateLogs]);

    // Polling for update logs when update is in progress
    useEffect(() => {
        let interval;
        if (updating || status?.updateStatus?.inProgress) {
            interval = setInterval(async () => {
                try {
                    const response = await systemApi.getUpdateLogs();
                    if (response.success) {
                        setUpdateLogs(response.data.logs || []);
                        if (!response.data.inProgress) {
                            setUpdating(false);
                            loadStatus();
                            if (response.data.error) {
                                toast.error('Aktualizacja nie powiodla sie');
                            } else {
                                toast.success('Aktualizacja zakonczona!');
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error fetching update logs:', error);
                }
            }, 2000);
        }
        return () => clearInterval(interval);
    }, [updating, status?.updateStatus?.inProgress]);

    const loadStatus = async () => {
        try {
            setLoading(true);
            const response = await systemApi.getStatus();
            if (response.success) {
                setStatus(response.data);
                if (response.data.updateStatus?.inProgress) {
                    setUpdating(true);
                }
            }
        } catch (error) {
            toast.error('Blad ladowania statusu systemu');
        } finally {
            setLoading(false);
        }
    };

    const loadBackups = async () => {
        try {
            const response = await systemApi.getBackups();
            if (response.success) {
                setBackups(response.data || []);
            }
        } catch (error) {
            console.error('Error loading backups:', error);
        }
    };

    const handleCheckUpdates = async () => {
        setCheckingUpdates(true);
        try {
            const response = await systemApi.checkUpdates();
            if (response.success) {
                setUpdateInfo(response.data);
                if (response.data.updatesAvailable) {
                    toast.success(`Dostepne ${response.data.behindCommits} aktualizacji`);
                } else {
                    toast.success('System jest aktualny');
                }
            }
        } catch (error) {
            toast.error('Blad sprawdzania aktualizacji');
        } finally {
            setCheckingUpdates(false);
        }
    };

    const handleStartUpdate = async () => {
        if (!confirm('Czy na pewno chcesz rozpoczac aktualizacje? Moze to chwile potrwac.')) {
            return;
        }

        setUpdating(true);
        setUpdateLogs([]);
        try {
            const response = await systemApi.startUpdate();
            if (response.success) {
                toast.success('Aktualizacja rozpoczeta');
            }
        } catch (error) {
            toast.error('Blad rozpoczynania aktualizacji');
            setUpdating(false);
        }
    };

    const handleRestart = async () => {
        if (!confirm('Czy na pewno chcesz zrestartowac uslugi?')) {
            return;
        }

        setRestarting(true);
        try {
            const response = await systemApi.restart();
            if (response.success) {
                toast.success(response.message);
            }
        } catch (error) {
            toast.error('Blad restartowania uslug');
        } finally {
            setRestarting(false);
        }
    };

    const handleCreateBackup = async () => {
        setCreatingBackup(true);
        try {
            const response = await systemApi.createBackup();
            if (response.success) {
                toast.success('Backup zostal utworzony');
                loadBackups();
            }
        } catch (error) {
            toast.error('Blad tworzenia backupu');
        } finally {
            setCreatingBackup(false);
        }
    };

    // ---- 2FA Handlers ----

    const load2FAStatus = async () => {
        try {
            const response = await twoFactorApi.getStatus();
            if (response.success) {
                setTwoFAEnabled(response.data.enabled);
            }
        } catch (error) {
            console.error('Error loading 2FA status:', error);
        }
    };

    const handleSetup2FA = async () => {
        setTwoFALoading(true);
        try {
            const response = await twoFactorApi.setup();
            if (response.success) {
                setTwoFASetupData(response.data);
                setTwoFAVerifyCode('');
                setBackupCodes(null);
            }
        } catch (error) {
            const msg = error.response?.data?.error || 'Blad konfiguracji 2FA';
            toast.error(msg);
        } finally {
            setTwoFALoading(false);
        }
    };

    const handleVerifySetup = async () => {
        if (!twoFAVerifyCode.trim()) return;
        setTwoFALoading(true);
        try {
            const response = await twoFactorApi.verifySetup(twoFAVerifyCode);
            if (response.success) {
                setTwoFAEnabled(true);
                setTwoFASetupData(null);
                setTwoFAVerifyCode('');
                setBackupCodes(response.data.backupCodes);
                toast.success('2FA zostalo wlaczone pomyslnie!');
            }
        } catch (error) {
            const msg = error.response?.data?.error || 'Nieprawidlowy kod weryfikacyjny';
            toast.error(msg);
        } finally {
            setTwoFALoading(false);
        }
    };

    const handleDisable2FA = async () => {
        if (!twoFADisableCode.trim()) return;
        setTwoFALoading(true);
        try {
            const response = await twoFactorApi.disable(twoFADisableCode);
            if (response.success) {
                setTwoFAEnabled(false);
                setTwoFADisableCode('');
                setShowDisableForm(false);
                setBackupCodes(null);
                toast.success('2FA zostalo wylaczone');
            }
        } catch (error) {
            const msg = error.response?.data?.error || 'Nieprawidlowy kod 2FA';
            toast.error(msg);
        } finally {
            setTwoFALoading(false);
        }
    };

    const handleRegenerateBackupCodes = async () => {
        if (!confirm('Czy na pewno chcesz wygenerowac nowe kody zapasowe? Stare kody przestan dzialac.')) {
            return;
        }
        setTwoFALoading(true);
        try {
            const response = await twoFactorApi.generateBackupCodes();
            if (response.success) {
                setBackupCodes(response.data.backupCodes);
                toast.success('Nowe kody zapasowe zostaly wygenerowane');
            }
        } catch (error) {
            toast.error('Blad generowania kodow zapasowych');
        } finally {
            setTwoFALoading(false);
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            toast.success('Skopiowano do schowka');
        }).catch(() => {
            toast.error('Nie udalo sie skopiowac');
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="loader" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Naglowek */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Server className="w-7 h-7 text-mc-green" />
                        Zarzadzanie Systemem
                    </h1>
                    <p className="text-gray-400">Aktualizacje, backup i restart uslug</p>
                </div>

                <button
                    onClick={loadStatus}
                    className="btn btn-secondary"
                    disabled={loading}
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Odswiez
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Status Git */}
                <div className="card">
                    <div className="card-header">
                        <Github className="w-5 h-5 text-mc-green" />
                        Repozytorium Git
                    </div>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 bg-mc-darker rounded-lg">
                                <p className="text-sm text-gray-400">Branch</p>
                                <p className="font-mono text-white">{status?.git?.branch || 'N/A'}</p>
                            </div>
                            <div className="p-3 bg-mc-darker rounded-lg">
                                <p className="text-sm text-gray-400">Commit</p>
                                <p className="font-mono text-white">{status?.git?.commit || 'N/A'}</p>
                            </div>
                        </div>

                        <div className="p-3 bg-mc-darker rounded-lg">
                            <p className="text-sm text-gray-400">Remote</p>
                            <p className="font-mono text-xs text-white break-all">{status?.git?.remote || 'N/A'}</p>
                        </div>

                        {status?.git?.updatesAvailable && (
                            <div className="p-3 bg-yellow-900/20 border border-yellow-800 rounded-lg flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                                <p className="text-yellow-300">
                                    Dostepne {status.git.behindCommits} nowych commitow
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Status systemu */}
                <div className="card">
                    <div className="card-header">
                        <HardDrive className="w-5 h-5 text-mc-green" />
                        Status Systemu
                    </div>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 bg-mc-darker rounded-lg">
                                <p className="text-sm text-gray-400">Uptime</p>
                                <p className="font-medium text-white flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-mc-green" />
                                    {formatUptime(status?.system?.uptime || 0)}
                                </p>
                            </div>
                            <div className="p-3 bg-mc-darker rounded-lg">
                                <p className="text-sm text-gray-400">Node.js</p>
                                <p className="font-mono text-white">{status?.system?.nodeVersion || 'N/A'}</p>
                            </div>
                        </div>

                        <div className="p-3 bg-mc-darker rounded-lg">
                            <p className="text-sm text-gray-400 mb-2">Dysk</p>
                            <div className="w-full h-2 bg-mc-gray rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-mc-green"
                                    style={{ width: `${status?.disk?.total ? (status.disk.used / status.disk.total * 100) : 0}%` }}
                                />
                            </div>
                            <p className="text-xs text-gray-400 mt-1">
                                {formatBytes(status?.disk?.used || 0)} / {formatBytes(status?.disk?.total || 0)}
                                ({formatBytes(status?.disk?.free || 0)} wolne)
                            </p>
                        </div>
                    </div>
                </div>

                {/* Aktualizacje */}
                <div className="card lg:col-span-2">
                    <div className="card-header">
                        <Download className="w-5 h-5 text-mc-green" />
                        Aktualizacje z GitHub
                    </div>

                    <div className="space-y-4">
                        <div className="flex flex-wrap gap-3">
                            <button
                                onClick={handleCheckUpdates}
                                disabled={checkingUpdates || updating}
                                className="btn btn-secondary"
                            >
                                {checkingUpdates ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <RefreshCw className="w-4 h-4" />
                                )}
                                Sprawdz aktualizacje
                            </button>

                            <button
                                onClick={handleStartUpdate}
                                disabled={updating || (!updateInfo?.updatesAvailable && !status?.git?.updatesAvailable)}
                                className="btn btn-primary"
                            >
                                {updating ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Play className="w-4 h-4" />
                                )}
                                {updating ? 'Aktualizowanie...' : 'Zainstaluj aktualizacje'}
                            </button>

                            <button
                                onClick={handleRestart}
                                disabled={restarting || updating}
                                className="btn btn-warning"
                            >
                                {restarting ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <RotateCcw className="w-4 h-4" />
                                )}
                                Restart uslug
                            </button>
                        </div>

                        {/* Lista zmian */}
                        {updateInfo?.changes?.length > 0 && (
                            <div className="p-4 bg-mc-darker rounded-lg">
                                <p className="text-sm text-gray-400 mb-2">Dostepne zmiany:</p>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {updateInfo.changes.map((change, i) => (
                                        <div key={i} className="flex items-start gap-2 text-sm">
                                            <code className="text-mc-accent">{change.hash}</code>
                                            <span className="text-white">{change.message}</span>
                                            <span className="text-gray-500 ml-auto">{change.date}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Logi aktualizacji */}
                        {(updating || updateLogs.length > 0) && (
                            <div className="p-4 bg-black rounded-lg">
                                <div className="flex items-center gap-2 mb-2">
                                    <Terminal className="w-4 h-4 text-mc-green" />
                                    <p className="text-sm text-gray-400">Logi aktualizacji</p>
                                </div>
                                <div className="font-mono text-xs text-green-400 space-y-1 max-h-64 overflow-y-auto">
                                    {updateLogs.map((log, i) => (
                                        <div key={i}>
                                            <span className="text-gray-600">[{new Date(log.timestamp).toLocaleTimeString()}]</span>{' '}
                                            {log.message}
                                        </div>
                                    ))}
                                    <div ref={logsEndRef} />
                                </div>
                            </div>
                        )}

                        {/* Status aktualizacji */}
                        {status?.updateStatus?.step && !updating && (
                            <div className={`p-3 rounded-lg flex items-center gap-2 ${
                                status.updateStatus.error
                                    ? 'bg-red-900/20 border border-red-800'
                                    : 'bg-green-900/20 border border-green-800'
                            }`}>
                                {status.updateStatus.error ? (
                                    <XCircle className="w-5 h-5 text-red-500" />
                                ) : (
                                    <CheckCircle className="w-5 h-5 text-green-500" />
                                )}
                                <div>
                                    <p className={status.updateStatus.error ? 'text-red-300' : 'text-green-300'}>
                                        {status.updateStatus.step}
                                    </p>
                                    {status.updateStatus.completedAt && (
                                        <p className="text-xs text-gray-400">
                                            {new Date(status.updateStatus.completedAt).toLocaleString('pl-PL')}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Backup */}
                <div className="card lg:col-span-2">
                    <div className="card-header">
                        <Archive className="w-5 h-5 text-mc-green" />
                        Backup
                    </div>

                    <div className="space-y-4">
                        <button
                            onClick={handleCreateBackup}
                            disabled={creatingBackup}
                            className="btn btn-secondary"
                        >
                            {creatingBackup ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Archive className="w-4 h-4" />
                            )}
                            Utworz backup
                        </button>

                        {backups.length > 0 && (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="text-left text-sm text-gray-400 border-b border-mc-gray">
                                            <th className="py-2 px-3">Nazwa pliku</th>
                                            <th className="py-2 px-3">Rozmiar</th>
                                            <th className="py-2 px-3">Data utworzenia</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {backups.map((backup, i) => (
                                            <tr key={i} className="border-b border-mc-gray/50 hover:bg-mc-gray/20">
                                                <td className="py-2 px-3 font-mono text-sm text-white">
                                                    {backup.filename}
                                                </td>
                                                <td className="py-2 px-3 text-gray-400">
                                                    {formatBytes(backup.size)}
                                                </td>
                                                <td className="py-2 px-3 text-gray-400">
                                                    {new Date(backup.created).toLocaleString('pl-PL')}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {backups.length === 0 && (
                            <p className="text-gray-500 text-center py-4">
                                Brak backupow. Utworz pierwszy backup powyzej.
                            </p>
                        )}
                    </div>
                </div>

                {/* Uwierzytelnianie dwuetapowe (2FA) */}
                <div className="card lg:col-span-2">
                    <div className="card-header">
                        <Shield className="w-5 h-5 text-mc-green" />
                        Uwierzytelnianie dwuetapowe (2FA)
                    </div>

                    <div className="space-y-4">
                        {/* Status 2FA */}
                        <div className={`p-3 rounded-lg flex items-center gap-3 ${
                            twoFAEnabled
                                ? 'bg-green-900/20 border border-green-800'
                                : 'bg-yellow-900/20 border border-yellow-800'
                        }`}>
                            {twoFAEnabled ? (
                                <ShieldCheck className="w-5 h-5 text-green-500" />
                            ) : (
                                <ShieldOff className="w-5 h-5 text-yellow-500" />
                            )}
                            <div>
                                <p className={twoFAEnabled ? 'text-green-300' : 'text-yellow-300'}>
                                    {twoFAEnabled
                                        ? '2FA jest wlaczone - Twoje konto jest chronione dodatkowym uwierzytelnianiem'
                                        : '2FA jest wylaczone - Zalecamy wlaczenie dla lepszego bezpieczenstwa'
                                    }
                                </p>
                            </div>
                        </div>

                        {/* Przyciski akcji */}
                        {!twoFAEnabled && !twoFASetupData && (
                            <button
                                onClick={handleSetup2FA}
                                disabled={twoFALoading}
                                className="btn btn-primary"
                            >
                                {twoFALoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Shield className="w-4 h-4" />
                                )}
                                Wlacz 2FA
                            </button>
                        )}

                        {/* Setup flow - wyswietlanie sekretu i otpauth URI */}
                        {twoFASetupData && !twoFAEnabled && (
                            <div className="space-y-4">
                                <div className="p-4 bg-mc-darker rounded-lg space-y-3">
                                    <p className="text-sm text-gray-400">
                                        Skonfiguruj aplikacje uwierzytelniajaca (np. Google Authenticator, Authy)
                                        uzywajac ponizszego sekretu lub URI:
                                    </p>

                                    {/* Secret */}
                                    <div>
                                        <p className="text-xs text-gray-500 mb-1">Sekret (Base32):</p>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 p-2 bg-black rounded font-mono text-sm text-mc-accent break-all">
                                                {showSecret ? twoFASetupData.secret : '************************************'}
                                            </code>
                                            <button
                                                onClick={() => setShowSecret(!showSecret)}
                                                className="btn btn-secondary p-2"
                                                title={showSecret ? 'Ukryj' : 'Pokaz'}
                                            >
                                                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                            <button
                                                onClick={() => copyToClipboard(twoFASetupData.secret)}
                                                className="btn btn-secondary p-2"
                                                title="Kopiuj sekret"
                                            >
                                                <Copy className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* OTPAuth URI */}
                                    <div>
                                        <p className="text-xs text-gray-500 mb-1">OTPAuth URI (do skanowania):</p>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 p-2 bg-black rounded font-mono text-xs text-gray-300 break-all max-h-20 overflow-y-auto">
                                                {twoFASetupData.otpauthUri}
                                            </code>
                                            <button
                                                onClick={() => copyToClipboard(twoFASetupData.otpauthUri)}
                                                className="btn btn-secondary p-2"
                                                title="Kopiuj URI"
                                            >
                                                <Copy className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Weryfikacja kodu */}
                                <div className="p-4 bg-mc-darker rounded-lg space-y-3">
                                    <p className="text-sm text-gray-400">
                                        Wprowadz 6-cyfrowy kod z aplikacji aby potwierdzic konfiguracje:
                                    </p>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="text"
                                            value={twoFAVerifyCode}
                                            onChange={(e) => setTwoFAVerifyCode(e.target.value)}
                                            className="input text-center text-xl tracking-widest font-mono w-48"
                                            placeholder="000000"
                                            maxLength={6}
                                            autoComplete="one-time-code"
                                        />
                                        <button
                                            onClick={handleVerifySetup}
                                            disabled={twoFALoading || twoFAVerifyCode.length < 6}
                                            className="btn btn-primary"
                                        >
                                            {twoFALoading ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <CheckCircle className="w-4 h-4" />
                                            )}
                                            Potwierdz
                                        </button>
                                        <button
                                            onClick={() => {
                                                setTwoFASetupData(null);
                                                setTwoFAVerifyCode('');
                                                setShowSecret(false);
                                            }}
                                            className="btn btn-secondary"
                                        >
                                            Anuluj
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Kody zapasowe - wyswietlane po wlaczeniu 2FA lub po regeneracji */}
                        {backupCodes && (
                            <div className="p-4 bg-mc-darker rounded-lg space-y-3">
                                <div className="flex items-center gap-2">
                                    <Key className="w-5 h-5 text-yellow-500" />
                                    <p className="text-white font-medium">Kody zapasowe</p>
                                </div>
                                <p className="text-sm text-gray-400">
                                    Zapisz te kody w bezpiecznym miejscu. Kazdy kod moze byc uzyty tylko raz.
                                    Uzywaj ich gdy nie masz dostepu do aplikacji uwierzytelniajace.
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {backupCodes.map((code, i) => (
                                        <div key={i} className="p-2 bg-black rounded text-center">
                                            <code className="font-mono text-sm text-mc-accent">{code}</code>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    onClick={() => copyToClipboard(backupCodes.join('\n'))}
                                    className="btn btn-secondary"
                                >
                                    <Copy className="w-4 h-4" />
                                    Kopiuj wszystkie kody
                                </button>
                            </div>
                        )}

                        {/* Akcje gdy 2FA jest wlaczone */}
                        {twoFAEnabled && (
                            <div className="flex flex-wrap gap-3">
                                <button
                                    onClick={handleRegenerateBackupCodes}
                                    disabled={twoFALoading}
                                    className="btn btn-secondary"
                                >
                                    {twoFALoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Key className="w-4 h-4" />
                                    )}
                                    Nowe kody zapasowe
                                </button>

                                {!showDisableForm ? (
                                    <button
                                        onClick={() => setShowDisableForm(true)}
                                        className="btn btn-secondary text-red-400 hover:text-red-300"
                                    >
                                        <ShieldOff className="w-4 h-4" />
                                        Wylacz 2FA
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-2 w-full mt-2 p-3 bg-red-900/20 border border-red-800 rounded-lg">
                                        <p className="text-sm text-red-300 mr-2">Wprowadz kod 2FA aby wylaczyc:</p>
                                        <input
                                            type="text"
                                            value={twoFADisableCode}
                                            onChange={(e) => setTwoFADisableCode(e.target.value)}
                                            className="input text-center font-mono w-36"
                                            placeholder="000000"
                                            maxLength={6}
                                        />
                                        <button
                                            onClick={handleDisable2FA}
                                            disabled={twoFALoading || twoFADisableCode.length < 6}
                                            className="btn bg-red-600 hover:bg-red-700 text-white"
                                        >
                                            {twoFALoading ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                'Potwierdz'
                                            )}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowDisableForm(false);
                                                setTwoFADisableCode('');
                                            }}
                                            className="btn btn-secondary"
                                        >
                                            Anuluj
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default SystemPage;
