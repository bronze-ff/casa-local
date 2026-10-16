import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Alert from './components/Alert';
import './styles.css';

// A bandeja abre uma segunda janela só para alertas (?tray=1&alerta=1): leve, sem o painel inteiro.
const alertWindow = new URLSearchParams(window.location.search).has('alerta');
createRoot(document.getElementById('root')!).render(<React.StrictMode>{alertWindow ? <Alert /> : <App />}</React.StrictMode>);
if (alertWindow) document.body.classList.add('in-alert');
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
