import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { homeStore, useHomeStore, usePoll, useStatePoll } from './api.js';
import { layoutFor, parseHash, readTray } from './mode.js';
import ErrorBoundary from './ErrorBoundary.jsx';
import { Icon, Key, Lcd, ToastProvider } from './ui.jsx';
import Inicio from './screens/Inicio.jsx';

const Luzes = lazy(() => import('./screens/Luzes.jsx'));
const Clima = lazy(() => import('./screens/Clima.jsx'));
const TV = lazy(() => import('./screens/TV.jsx'));
const Cameras = lazy(() => import('./screens/Cameras.jsx'));
const Local = lazy(() => import('./screens/Local.jsx'));
const Lab = lazy(() => import('./screens/Lab.jsx'));
const Central = lazy(() => import('./screens/Central.jsx'));
const AlertCard = lazy(() => import('./AlertCard.jsx'));

// Rotas por hash: funciona offline e com o servidor servindo só index.html.
export const ROUTES = {
  '': { title: 'Início', Screen: Inicio, icon: 'home' },
  luzes: { title: 'Luzes', Screen: Luzes, casa: true, icon: 'luz' },
  clima: { title: 'Clima', Screen: Clima, casa: true, icon: 'ar' },
  tv: { title: 'TV', Screen: TV, casa: true, icon: 'tv' },
  local: { title: 'Local', Screen: Local, casa: true, icon: 'pin' },
  cameras: { title: 'Câmeras', Screen: Cameras, icon: 'cam' },
  lab: { title: 'Lab', Screen: Lab, icon: 'lab' },
  central: { title: 'Central', Screen: Central, icon: 'central' },
};
const NAMES = Object.keys(ROUTES);
const DESKTOP_TABS = ['', 'luzes', 'clima', 'tv', 'cameras', 'local', 'lab', 'central'];
const MOBILE_TABS = [['', 'Início', 'home'], ['luzes', 'Casa', 'luz'], ['cameras', 'Câmeras', 'cam'], ['lab', 'Lab', 'lab'], ['central', 'Central', 'central']];

export const href = (name, param) => `#/${name}${param ? `/${param}` : ''}`;

/* A casa: aparelhos, modos e últimas ações, compartilhados por todas as telas. */
const HomeContext = createContext(null);
export const useHome = () => useContext(HomeContext);

// A última casa conhecida vive no homeStore (módulo): ao reabrir o popup da bandeja (#oculto desmonta tudo) a tela já nasce preenchida.

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

function useHash() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash, NAMES));
  useEffect(() => {
    const onHash = () => { setRoute(parseHash(window.location.hash, NAMES)); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

function useLayout(tray) {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return layoutFor(width, tray);
}

/** A bandeja só oferece "Abrir no navegador" quando a janela expõe essa API (evento pywebviewready). */
function useBrowserApi() {
  const [available, setAvailable] = useState(() => !!window.pywebview?.api?.open_browser);
  useEffect(() => {
    const check = () => setAvailable(!!window.pywebview?.api?.open_browser);
    window.addEventListener('pywebviewready', check);
    return () => window.removeEventListener('pywebviewready', check);
  }, []);
  return available;
}

export default function App() {
  const tray = useMemo(() => readTray(window.location.search), []);
  const route = useHash();
  const layout = useLayout(tray);
  // Página "dormente" da bandeja: nada montado, nenhum poll, nenhuma câmera.
  if (route.name === 'oculto') return <div aria-hidden="true" />;
  if (tray === 'alerta') {
    return route.name === 'alerta' ? <ErrorBoundary><Suspense fallback={null}><AlertCard key={route.param} param={route.param} /></Suspense></ErrorBoundary> : <div aria-hidden="true" />;
  }
  // #alerta:... só vale na janela de alerta; no painel normal cai no Início.
  const safe = route.name === 'alerta' ? { name: '', param: '' } : route;
  return <Shell route={safe} layout={layout} tray={tray} />;
}

function Shell({ route, layout, tray }) {
  const { home, bootError, stateError } = useHomeStore();
  const status = useBuildWatch();
  useStatePoll(!!home); // UM poll compartilhado de /api/state; pausa quando a aba está oculta
  const browser = useBrowserApi();

  useEffect(() => {
    let stop = false;
    let timer = null;
    const tryBoot = () => homeStore.bootstrap().catch(() => { if (!stop) timer = setTimeout(tryBoot, 4000); });
    tryBoot();
    return () => { stop = true; clearTimeout(timer); };
  }, []);

  // O POST já devolve o snapshot e a store o aplica; refresh() das telas é absorvido uma vez após o comando.
  const refresh = useCallback(() => homeStore.refresh().catch(() => { /* o próximo ciclo tenta de novo */ }), []);
  const applySnapshot = homeStore.applySnapshot;

  const current = ROUTES[route.name];
  const Screen = current.Screen;
  const mode = status.data?.mode || home?.mode;
  const online = !stateError && !bootError;
  const rail = layout === 'wide' && route.name === '';
  const link = (name) => ({ href: href(name), 'aria-current': route.name === name ? 'page' : undefined });
  const led = (
    <span className="lcd" style={{ padding: '6px 10px', borderRadius: 'var(--r-seg)' }} role="status">
      <span className={`led ${!online ? 'off' : mode === 'preview' ? 'env' : ''}`}>{!online ? 'sem conexão' : mode === 'preview' ? 'prévia' : 'rede local'}</span>
    </span>
  );

  const content = !home ? (
    <div className="page">
      <Lcd role="status">
        <span className="lbl">casa local</span>
        <div style={{ fontSize: 20 }}>{bootError ? bootError.message : 'Abrindo sua casa…'}</div>
        {bootError && <div className="dim">Tentando de novo a cada 4 s.</div>}
      </Lcd>
    </div>
  ) : (
    <main className="page">
      <h1 className="page-title">{current.title}</h1>
      <ErrorBoundary key={route.name}>
        <Suspense fallback={<Lcd role="status">Carregando…</Lcd>}>
          <Screen param={route.param} />
        </Suspense>
      </ErrorBoundary>
    </main>
  );

  return (
    <ToastProvider>
      <HomeContext.Provider value={{ home, refresh, applySnapshot, mode, route, layout, tray }}>
        <div className={`app ${layout} ${rail ? 'rail' : ''}`}>
          {mode === 'preview' && <div className="faixa-sim" aria-hidden="true" />}
          {(layout === 'desktop' || layout === 'wide') && (
            <aside className="side">
              {!rail && <div className="brand"><span>Casa Local</span></div>}
              <nav className="nav" aria-label="Seções">
                {DESKTOP_TABS.map((name) => (
                  <a key={name} {...link(name)} aria-label={rail ? ROUTES[name].title : undefined} title={rail ? ROUTES[name].title : undefined}>
                    <Icon name={ROUTES[name].icon} size={rail ? 24 : 20} />{!rail && ROUTES[name].title}
                  </a>
                ))}
              </nav>
              <div className="foot">{!rail && led}</div>
            </aside>
          )}
          <div style={{ minWidth: 0 }}>
            {layout === 'mobile' && (
              <div className="page" style={{ paddingBottom: 0 }}>
                <header className="hdr">
                  <a className="crumb" href={href('')}>Casa Local · {current.title}</a>
                  {led}
                </header>
                {current.casa && (
                  <nav className="casa-tabs" aria-label="Casa">
                    {['luzes', 'clima', 'tv', 'local'].map((name) => <a key={name} {...link(name)}>{ROUTES[name].title}</a>)}
                  </nav>
                )}
              </div>
            )}
            {layout === 'tray' && (
              <div className="page" style={{ paddingBottom: 0 }}>
                <nav className="trayicons" aria-label="Seções">
                  {DESKTOP_TABS.map((name) => <a key={name} {...link(name)} aria-label={ROUTES[name].title}><Icon name={ROUTES[name].icon} size={20} /></a>)}
                </nav>
                {browser && (
                  <Key className="out" style={{ width: '100%' }} sub="painel completo no navegador padrão"
                    onClick={() => window.pywebview.api.open_browser(window.location.hash.replace(/^#\/?/, ''))}>
                    <span className="row" style={{ justifyContent: 'flex-start', gap: 10 }}><Icon name="ext" size={20} />Abrir no navegador</span>
                  </Key>
                )}
              </div>
            )}
            {content}
          </div>
          {layout === 'mobile' && (
            <nav className="tabbar" aria-label="Seções">
              {MOBILE_TABS.map(([name, label, icon]) => {
                const active = (current.casa ? 'luzes' : route.name) === name;
                return (
                  <a key={name} href={href(name)} aria-current={active ? 'page' : undefined}>
                    <Icon name={icon} size={20} />{label}<i className="pip" />
                  </a>
                );
              })}
            </nav>
          )}
        </div>
      </HomeContext.Provider>
    </ToastProvider>
  );
}
