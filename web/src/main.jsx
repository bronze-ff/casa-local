import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/doto/latin-900.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import './tokens.css';
import App from './App.jsx';
import { readTray } from './mode.js';
import './screens/Central/Sound.js';

// A bandeja é sempre Noite (antes da primeira pintura, para não piscar o tema do sistema).
if (readTray(window.location.search)) document.documentElement.dataset.theme = 'noite';

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);

// Cópia offline: abre o painel mesmo com o PC de casa lento ou fora (sw.js nunca guarda /api/).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
