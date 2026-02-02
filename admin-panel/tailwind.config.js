/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './index.html',
        './src/**/*.{js,jsx}'
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                // Kolory Minecraft
                'mc-green': '#44ff44',
                'mc-dark': '#1a1a1a',
                'mc-darker': '#0f0f0f',
                'mc-gray': '#2d2d2d',
                'mc-light-gray': '#3d3d3d',
                'mc-text': '#e0e0e0',
                'mc-accent': '#00aa00',
                'mc-gold': '#ffaa00',
                'mc-red': '#ff5555',
                'mc-blue': '#5555ff'
            },
            fontFamily: {
                'minecraft': ['Minecraft', 'Courier New', 'monospace']
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite'
            }
        }
    },
    plugins: []
};
