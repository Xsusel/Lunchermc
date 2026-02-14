/**
 * Error Boundary - przechwytuje bledy renderowania React
 * Wyswietla przyjazny komunikat i umozliwia odswiez strone
 */
import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null
        };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ errorInfo });

        // Logowanie bledu do konsoli
        console.error('[ErrorBoundary] Przechwycono blad renderowania:');
        console.error('Blad:', error);
        console.error('Stos komponentow:', errorInfo?.componentStack);
    }

    handleRefresh = () => {
        window.location.reload();
    };

    handleReset = () => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null
        });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-mc-darker flex items-center justify-center p-6">
                    <div className="max-w-md w-full text-center">
                        <div className="w-16 h-16 bg-red-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
                            <AlertTriangle className="w-8 h-8 text-red-400" />
                        </div>

                        <h1 className="text-2xl font-bold text-white mb-2">
                            Cos poszlo nie tak
                        </h1>
                        <p className="text-gray-400 mb-6">
                            Wystapil nieoczekiwany blad podczas renderowania strony.
                            Sprobuj odswiezyc strone lub wrocic do poprzedniej.
                        </p>

                        {/* Szczegoly bledu (zwijane) */}
                        {this.state.error && (
                            <details className="mb-6 text-left">
                                <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-300 transition-colors">
                                    Szczegoly bledu
                                </summary>
                                <div className="mt-2 p-3 bg-mc-dark rounded-lg border border-mc-gray overflow-auto max-h-48">
                                    <p className="text-red-400 text-xs font-mono break-all">
                                        {this.state.error.toString()}
                                    </p>
                                    {this.state.errorInfo?.componentStack && (
                                        <pre className="text-gray-500 text-xs mt-2 whitespace-pre-wrap">
                                            {this.state.errorInfo.componentStack}
                                        </pre>
                                    )}
                                </div>
                            </details>
                        )}

                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={this.handleReset}
                                className="btn btn-secondary"
                            >
                                Sprobuj ponownie
                            </button>
                            <button
                                onClick={this.handleRefresh}
                                className="btn btn-primary flex items-center gap-2"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Odswiez strone
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
