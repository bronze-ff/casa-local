import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useState } from 'react';
import { bootstrap, get, usePoll } from './api.js';
import { Icon, ToastProvider } from './ui.jsx';
import Inicio from './screens/Inicio.jsx';

const Luzes = lazy(() => import('./screens/Luzes.jsx'));
const Clima = lazy(() => import('./screens/Clima.jsx'));
const TV = lazy(() => import('./screens/TV.jsx'));
const Cameras = lazy(() => import('./screens/Cameras.jsx'));
const Local = lazy(() => import('./screens/Local.jsx'));
const Lab = lazy(() => import('./screens/Lab.jsx'));
const Central = lazy(() => import('./screens/Central.jsx'));

// Rotas por hash: funciona offline e com o servidor servindo só index.html.
export const ROUTES = {
  '': { title: 'Início', Screen: Inicio },
  luzes: { title: 'Luzes', Screen: Luzes, casa: true },
  clima: { title: 'Clima', Screen: Clima, casa: true },
  tv: { title: 'TV', Screen: TV, casa: true },
  local: { title: 'Local', Screen: Local, casa: true },
  cameras: { title: 'Câmeras', Screen: Cameras },
  lab: { title: 'Lab', Screen: Lab },
  central: { title: 'Central', Screen: Central },
};
const DESKTOP_TABS = ['', 'luzes', 'clima', 'tv', 'cameras', 'local', 'lab', 'central'];
const MOBILE_TABS = [['', 'Início', 'home'], ['luzes', 'Casa', 'bulb'], ['cameras', 'Câmeras', 'camera'], ['lab', 'Lab', 'server'], ['central', 'Central', 'bell']];

const readRoute = () => {
  // Aceita também o formato das notificações antigas: #cameras:replay:cam2:1730000000.
  const raw = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));
  const cut = raw.search(/[/:]/);
  const name = cut < 0 ? raw : raw.slice(0, cut);
  return { name: ROUTES[name] ? name : '', param: cut < 0 ? '' : raw.slice(cut + 1) };
};
export const href = (name, param) => `#/${name}${param ? `/${param}` : ''}`;

/* A casa: aparelhos, modos e últimas ações, compartilhados por todas as telas. */
const HomeContext = createContext(null);
export const useHome = () => useContext(HomeContext);

function useBuildWatch() {
  // O backend informa o script publicado; se mudou desde que abrimos, recarrega uma vez.
  const status = usePoll('/api/status', 30000);
  const loaded = document.querySelector('script[type="module"][src^="/assets/"]')?.getAttribute('src');
  useEffect(() => {
    const build = status.data?.build;
    if (build && loaded && build !== loaded) window.location.reload();
  }, [status.data, loaded]);
  return status;
}

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [home, setHome] = useState(null);
  const [bootError, setBootError] = useState(null);
  const status = useBuildWatch();
  const state = usePoll(home ? '/api/state' : null, 5000);

  useEffect(() => {
    const onHash = () => { setRoute(readRoute()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    let stop = false;
    const tryBoot = async () => {
      try {
        const data = await bootstrap();
        if (!stop) { setHome(data); setBootError(null); }
      } catch (error) {
        if (!stop) { setBootError(error); setTimeout(tryBoot, 4000); }
      }
    };
    tryBoot();
    return () => { stop = true; };
  }, []);

  useEffect(() => { if (state.data) setHome((old) => ({ ...old, ...state.data })); }, [state.data]);

  const refresh = useCallback(async () => {
    try { const data = await get('/api/state'); setHome((old) => ({ ...old, ...data })); } catch { /* o próximo ciclo tenta de novo */ }
  }, []);

  const current = ROUTES[route.name];
  const Screen = current.Screen;
  const mode = status.data?.mode || home?.mode;
  const online = !state.error && !bootError;
  const mobileActive = current.casa ? 'luzes' : route.name;

  return (
    <ToastProvider>
      <HomeContext.Provider value={{ home, refresh, mode, route }}>
        <div className="shell">
          <div className="wrap">
            <header className="topbar">
              <a href={href('')} className="brand" style={{ color: 'var(--text)' }}>
                <Icon name="home" size={26} />
                <span>Casa Local</span>
              </a>
              <span className="pill" role="status">
                <span className={`dot ${online ? 'vivo' : 'warn'}`} />
                {!online ? 'sem conexão' : mode === 'preview' ? 'prévia' : 'rede local'}
              </span>
              <nav className="tabs" aria-label="Seções">
                {DESKTOP_TABS.map((name) => (
                  <a key={name} href={href(name)} aria-current={route.name === name ? 'page' : undefined}>{ROUTES[name].title}</a>
                ))}
              </nav>
            </header>

            {current.casa && (
              <nav className="subtabs" aria-label="Casa">
                {['luzes', 'clima', 'tv', 'local'].map((name) => (
                  <a key={name} href={href(name)} aria-current={route.name === name ? 'page' : undefined}>{ROUTES[name].title}</a>
                ))}
              </nav>
            )}

            {!home ? (
              <p className="muted" role="status">{bootError ? `${bootError.message} Tentando de novo…` : 'Abrindo sua casa…'}</p>
            ) : (
              <Suspense fallback={<p className="muted" role="status">Carregando…</p>}>
                <main style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <Screen param={route.param} />
                </main>
              </Suspense>
            )}
          </div>

          <nav className="bottombar" aria-label="Seções">
            {MOBILE_TABS.map(([name, label, icon]) => (
              <a key={name} href={href(name)} aria-current={mobileActive === name ? 'page' : undefined}>
                <Icon name={icon} size={22} />{label}
              </a>
            ))}
          </nav>
        </div>
      </HomeContext.Provider>
    </ToastProvider>
  );
}
