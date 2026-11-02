import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { home as store } from '../core/home.js';
import { useBrowserApi, useHome, usePoll, useStatePoll } from '../core/hooks.js';
import { hrefFor } from '../core/route.js';
import { Icon } from '../ui/Icon.jsx';
import { Overlay } from '../ui/Overlay.jsx';
import { Banner, Empty, IconButton, Skeleton, Status, ToastProvider } from '../ui/kit.jsx';
import Boundary from './Boundary.jsx';
import { ShellContext } from './context.js';
import { DESTINATIONS, MOBILE_TABS, MORE, SIDEBAR, connectionOf, mobileTabActive } from './nav.js';
import { LABEL } from './theme-logic.js';
import { useTheme } from './theme.js';

/** O backend informa o script publicado; se mudou desde que abrimos, recarrega uma vez. */
function useBuildWatch() {
  const status = usePoll('/api/status', 30000);
  const loaded = document.querySelector('script[type="module"][src^="/assets/"]')?.getAttribute('src');
  useEffect(() => {
    const build = status.data?.build;
    if (build && loaded && build !== loaded) window.location.reload();
  }, [status.data, loaded]);
  return status;
}

/** Abre a casa; sem resposta, tenta de novo a cada 4 s (sem empilhar tentativas). */
function useBootstrap() {
  useEffect(() => {
    let stop = false;
    let timer = null;
    const attempt = () => store.bootstrap().catch(() => { if (!stop) timer = setTimeout(attempt, 4000); });
    attempt();
    return () => { stop = true; clearTimeout(timer); };
  }, []);
}

const NavLink = ({ name, route, label, size = 22, onClick }) => (
  <a className="navi" href={hrefFor(name)} aria-current={route.name === name ? 'page' : undefined} onClick={onClick}>
    <Icon name={DESTINATIONS[name].icon} size={size} /><span className="navi-t">{label ?? DESTINATIONS[name].title}</span>
  </a>
);

export default function Shell({ route, layout, tray, registry = {} }) {
  const { home, bootError, stateError } = useHome();
  const status = useBuildWatch();
  useStatePoll(!!home); // UM poll compartilhado de /api/state; o núcleo pausa com a aba oculta
  useBootstrap();
  const browser = useBrowserApi();
  const [theme, cycleTheme] = useTheme(tray);
  const [more, setMore] = useState(false);

  const refresh = useCallback(() => store.refresh().catch(() => { /* o próximo ciclo tenta de novo */ }), []);
  const mode = status.data?.mode || home?.mode;
  const online = !stateError && !bootError;
  const connection = connectionOf({ online, mode });
  const current = DESTINATIONS[route.name] || DESTINATIONS[''];
  const Screen = registry[route.name]?.Screen;
  const value = useMemo(() => ({ home, refresh, applySnapshot: store.applySnapshot, mode, route, layout, tray }), [home, refresh, mode, route, layout, tray]);

  const body = !home ? (
    <div className="boot" role="status">
      <span className="cap">Casa Local</span>
      <p className="h1">{bootError ? 'Sem conexão com o PC de casa' : 'Abrindo sua casa…'}</p>
      {bootError ? <p className="sub">{bootError.message} Tentando de novo a cada 4 s.</p> : <div className="col" aria-hidden="true"><Skeleton height={20} width="40%" /><Skeleton height={120} /></div>}
    </div>
  ) : (
    <Boundary key={route.name}>
      <Suspense fallback={<div className="col" role="status" aria-label="Carregando a tela"><Skeleton height={28} width="30%" /><Skeleton height={160} /><Skeleton height={160} /></div>}>
        {Screen ? <Screen param={route.param} /> : <Empty title="Esta tela ainda não está disponível">O painel novo está sendo montado por partes.</Empty>}
      </Suspense>
    </Boundary>
  );

  const chip = <Status kind={connection.kind === 'ok' ? 'ok' : connection.kind === 'err' ? 'err' : 'sim'}>{connection.label}</Status>;
  const themeButton = <IconButton icon={theme === 'escuro' ? 'moon' : 'sun'} label={LABEL[theme]} onClick={cycleTheme} />;

  return (
    <ToastProvider>
      <ShellContext.Provider value={value}>
        <a className="skip" href="#conteudo">Pular para o conteúdo</a>
        <div className={`app ${layout}`}>
          {(layout === 'tablet' || layout === 'desktop' || layout === 'wide') && (
            <aside className="side">
              <div className="brand"><span className="mk"><Icon name="home" size={18} /></span><span className="navi-t">Casa</span></div>
              <nav className="nav" aria-label="Seções">{SIDEBAR.map((name) => <NavLink key={name} name={name} route={route} />)}</nav>
              <div className="foot">{chip}{themeButton}</div>
            </aside>
          )}
          <div className="col-main">
            {mode === 'preview' && <Banner kind="info" icon="eye" title="Prévia">Esta casa está em modo de prévia: nada é enviado nem alterado nos aparelhos.</Banner>}
            {layout === 'tray' && (
              <header className="tray-head">
                <nav className="trayicons" aria-label="Seções">
                  {SIDEBAR.map((name) => <a key={name} className="ib" href={hrefFor(name)} aria-label={DESTINATIONS[name].title} aria-current={route.name === name ? 'page' : undefined}><Icon name={DESTINATIONS[name].icon} /></a>)}
                </nav>
                <div className="row">{chip}{browser && <button type="button" className="btn s" onClick={() => window.pywebview.api.open_browser(window.location.hash.replace(/^#\/?/, ''))}><Icon name="ext" />Abrir no navegador</button>}</div>
              </header>
            )}
            {layout === 'mobile' && <header className="m-head"><h1 className="h2 grow">{current.title}</h1>{chip}{themeButton}</header>}
            <main id="conteudo" className="page" tabIndex={-1}>
              {layout !== 'mobile' && layout !== 'tray' && <h1 className="h1 page-title">{current.title}</h1>}
              {body}
            </main>
          </div>
          {layout === 'mobile' && (
            <>
              <nav className="tabbar" aria-label="Seções">
                {MOBILE_TABS.map((name) => <NavLink key={name} name={name} route={route} size={22} />)}
                <button type="button" className="navi" aria-haspopup="dialog" aria-current={mobileTabActive(route.name) === 'mais' ? 'page' : undefined} onClick={() => setMore(true)}>
                  <Icon name="more" size={22} /><span className="navi-t">Mais</span>
                </button>
              </nav>
              <Overlay open={more} onClose={() => setMore(false)} title="Mais" kind="sheet">
                <nav className="col" aria-label="Mais seções">{MORE.map((name) => <NavLink key={name} name={name} route={route} onClick={() => setMore(false)} />)}</nav>
              </Overlay>
            </>
          )}
        </div>
      </ShellContext.Provider>
    </ToastProvider>
  );
}
