// Registro das rotas novas: nome da rota → { Screen } (componente lazy; cada rota é um arquivo separado no bundle).
// Ligado ao app por boot/App.jsx (entrada nova em main.jsx). Rota que faltar aqui aparece como "Esta tela ainda não está disponível".
import { lazy } from 'react';

export const registry = {
  '': { Screen: lazy(() => import('./Inicio/Inicio.jsx')) },
  luzes: { Screen: lazy(() => import('./Luzes/Luzes.jsx')) },
  clima: { Screen: lazy(() => import('./Clima/Clima.jsx')) },
  tv: { Screen: lazy(() => import('./TV/TV.jsx')) },
  local: { Screen: lazy(() => import('./Local/Local.jsx')) },
  cameras: { Screen: lazy(() => import('./Cameras/Cameras.jsx')) },
  lab: { Screen: lazy(() => import('./Lab/Lab.jsx')) },
  central: { Screen: lazy(() => import('./Central/Central.jsx')) },
};

/** CSS das rotas novas, na ordem de importação que o main.jsx segue (boot.test.mjs confere). */
export const stylesheets = ['./routes.css', './Inicio/inicio.css', './Luzes/luzes.css', './Clima/clima.css', './TV/tv.css', './Local/local.css', './Cameras/cameras.css', './Lab/lab.css', './Central/central.css'];
