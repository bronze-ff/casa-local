import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/theme.css';
import './ui/base.css';
import './ui/kit.css';
import './shell/shell.css';
import './routes/routes.css';
import './routes/Inicio/inicio.css';
import './routes/Luzes/luzes.css';
import './routes/Clima/clima.css';
import './routes/TV/tv.css';
import './routes/Local/local.css';
import './routes/Cameras/cameras.css';
import './routes/Lab/lab.css';
import './routes/Central/central.css';
import App from './boot/App.jsx';
import { prepareBoot, registerOffline } from './boot/start.js';

prepareBoot({ search: window.location.search, root: document.documentElement });

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);

registerOffline({ nav: navigator, prod: import.meta.env.PROD });
