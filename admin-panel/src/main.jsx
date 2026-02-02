/**
 * Główny punkt wejścia aplikacji React
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            <App />
            <Toaster
                position="top-right"
                toastOptions={{
                    duration: 4000,
                    style: {
                        background: '#2d2d2d',
                        color: '#e0e0e0',
                        border: '1px solid #3d3d3d'
                    },
                    success: {
                        iconTheme: {
                            primary: '#44ff44',
                            secondary: '#1a1a1a'
                        }
                    },
                    error: {
                        iconTheme: {
                            primary: '#ff5555',
                            secondary: '#1a1a1a'
                        }
                    }
                }}
            />
        </BrowserRouter>
    </React.StrictMode>
);
