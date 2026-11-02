// Registro das rotas novas: nome da rota → { Screen } (componente lazy; cada rota é um arquivo separado no bundle).
// NÃO está ligado ao app: o main.jsx legado continua sendo a entrada até a troca (M6). Rotas ainda não escritas ficam de fora
// e o Shell mostra "Esta tela ainda não está disponível" para elas.
import { lazy } from 'react';

export const registry = {
  '': { Screen: lazy(() => import('./Inicio/Inicio.jsx')) },
  luzes: { Screen: lazy(() => import('./Luzes/Luzes.jsx')) },
  clima: { Screen: lazy(() => import('./Clima/Clima.jsx')) },
  tv: { Screen: lazy(() => import('./TV/TV.jsx')) },
  local: { Screen: lazy(() => import('./Local/Local.jsx')) },
  cameras: { Screen: lazy(() => import('./Cameras/Cameras.jsx')) },
  // M5: lab, central
};

/** CSS das rotas novas, na ordem de importação que o main.jsx novo deve seguir (M6). */
export const stylesheets = ['./routes.css', './Inicio/inicio.css', './Luzes/luzes.css', './Clima/clima.css', './TV/tv.css', './Local/local.css', './Cameras/cameras.css'];
