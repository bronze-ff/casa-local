import { lazy, Suspense, useMemo } from 'react';
import { useLayout, useRoute } from '../core/hooks.js';
import { readTray } from '../core/route.js';
import Boundary from './Boundary.jsx';
import Shell from './Shell.jsx';
import { resolveRoute } from './nav.js';

// A janela de alerta é carregada sob demanda: o painel normal nunca baixa esse código.
const Alert = lazy(() => import('./Alert.jsx'));

/**
 * Ponto de entrada. `registry` mapeia o nome da rota para { Screen } (componentes lazy, um por rota).
 * Os guardas ficam ANTES de qualquer hook de dados: dormente não monta Shell, então não há poll, câmera nem store em uso.
 */
export default function Root({ registry }) {
  const tray = useMemo(() => readTray(window.location.search), []);
  const route = useRoute();
  const layout = useLayout(tray);
  const view = resolveRoute(route, tray);
  if (view.kind === 'dormant') return <div aria-hidden="true" />;
  if (view.kind === 'alert') {
    return <Boundary><Suspense fallback={null}><Alert key={view.param} param={view.param} /></Suspense></Boundary>;
  }
  return <Shell route={view.route} layout={layout} tray={tray} registry={registry} />;
}
