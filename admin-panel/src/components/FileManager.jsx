import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { filesApi } from '../api/client';
import {
    FileCode, Upload, Trash2, ToggleLeft, ToggleRight,
    Loader2, Package, RefreshCw
} from 'lucide-react';

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function FileManager({ type, title }) {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploadLoading, setUploadLoading] = useState(false);
    const fileInputRef = useRef(null);

    useEffect(() => {
        loadFiles();
    }, [type]);

    const loadFiles = async () => {
        try {
            setLoading(true);
            const response = await filesApi.getAll(type);
            if (response.success) {
                setFiles(response.data);
            }
        } catch (error) {
            toast.error('Błąd ładowania plików');
        } finally {
            setLoading(false);
        }
    };

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploadLoading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('name', file.name.replace(/\.[^.]+$/, ''));
            formData.append('is_required', 'true');

            await filesApi.upload(type, formData);
            toast.success('Plik został przesłany');
            loadFiles();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Błąd przesyłania pliku');
        } finally {
            setUploadLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleToggle = async (file) => {
        try {
            await filesApi.toggle(file.id);
            toast.success(file.is_enabled ? 'Plik wyłączony' : 'Plik włączony');
            loadFiles();
        } catch (error) {
            toast.error('Błąd zmiany statusu');
        }
    };

    const handleDelete = async (file) => {
        if (!confirm(`Czy na pewno chcesz usunąć "${file.name}"?`)) return;

        try {
            await filesApi.delete(file.id);
            toast.success('Plik został usunięty');
            loadFiles();
        } catch (error) {
            toast.error('Błąd usuwania pliku');
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
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">{title}</h2>
                <div className="flex gap-2">
                    <button
                        onClick={loadFiles}
                        className="btn btn-secondary p-2"
                        title="Odśwież"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="btn btn-primary"
                        disabled={uploadLoading}
                    >
                        {uploadLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <>
                                <Upload className="w-4 h-4" />
                                Prześlij plik
                            </>
                        )}
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={handleUpload}
                    />
                </div>
            </div>

            <div className="card overflow-hidden p-0">
                {files.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Nazwa</th>
                                    <th>Plik</th>
                                    <th>Rozmiar</th>
                                    <th>Status</th>
                                    <th className="text-right">Akcje</th>
                                </tr>
                            </thead>
                            <tbody>
                                {files.map((file) => (
                                    <tr key={file.id}>
                                        <td>
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-mc-gray rounded-lg flex items-center justify-center">
                                                    <FileCode className="w-5 h-5 text-mc-green" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-white">{file.name}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="text-gray-400 text-sm font-mono">
                                            {file.filename}
                                        </td>
                                        <td className="text-gray-400 text-sm">
                                            {formatBytes(file.file_size)}
                                        </td>
                                        <td>
                                            <button
                                                onClick={() => handleToggle(file)}
                                                className={`flex items-center gap-1 text-sm ${
                                                    file.is_enabled ? 'text-green-400' : 'text-gray-500'
                                                }`}
                                            >
                                                {file.is_enabled ? (
                                                    <ToggleRight className="w-5 h-5" />
                                                ) : (
                                                    <ToggleLeft className="w-5 h-5" />
                                                )}
                                                {file.is_enabled ? 'Włączony' : 'Wyłączony'}
                                            </button>
                                        </td>
                                        <td>
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => handleDelete(file)}
                                                    className="p-2 hover:bg-red-900/30 rounded-lg text-red-400 transition-colors"
                                                    title="Usuń"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="text-center py-12">
                        <Package className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-500">Brak plików</p>
                        <p className="text-gray-600 text-sm">Dodaj pierwszy plik klikając przycisk powyżej</p>
                    </div>
                )}
            </div>
        </div>
    );
}
