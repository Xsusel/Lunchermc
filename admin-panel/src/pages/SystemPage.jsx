/**
 * Strona zarzadzania systemem
 * Aktualizacje, backup, restart
 */
import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { systemApi } from '../api/client';
import {
    Server, RefreshCw, Download, GitBranch,
    HardDrive, Clock, AlertTriangle, CheckCircle,
    XCircle, Loader2, Archive, RotateCcw, Play,
    Terminal, Github
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

    useEffect(() => {
        loadStatus();
        loadBackups();
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
            </div>
        </div>
    );
}

export default SystemPage;
