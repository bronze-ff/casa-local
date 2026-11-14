import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { get } from '../core/api.js';
import { home as store } from '../core/home.js';
import { useBrowserApi, useHome, usePoll, useStatePoll } from '../core/hooks.js';
import { hrefFor } from '../core/route.js';
import { Icon } from '../ui/Icon.jsx';
import { Overlay } from '../ui/Overlay.jsx';
import { Banner, Empty, IconButton, Skeleton, Status, ToastProvider } from '../ui/kit.jsx';
import Boundary from './Boundary.jsx';
import { ShellContext } from './context.js';
import { DESTINATIONS, MAIN, MORE, connectionOf, mobileTabActive, searchItems } from './nav.js';
import { skipToContent } from './skip.js';
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

/** Busca da barra superior: seções, aparelhos e câmeras. Ctrl+K (ou ⌘K) foca; setas escolhem; Enter abre. A lista de câmeras
 *  só é lida quando a busca recebe foco pela primeira vez (abrir a tela continua só lendo o necessário). */
function Search({ devices }) {
  const [query, setQuery] = useState('');
  const [cameras, setCameras] = useState(null);
  const [pick, setPick] = useState(0);
  const input = useRef(null);
  useEffect(() => {
    const onKey = (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); input.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const items = useMemo(() => searchItems(query, devices, cameras || []), [query, devices, cameras]);
  const go = (item) => { if (!item) return; window.location.hash = hrefFor(item.name, item.param).replace(/^#/, ''); setQuery(''); input.current?.blur(); };
  const onFocus = () => { if (cameras === null) { setCameras([]); get('/api/cameras').then((d) => setCameras(d.cameras || [])).catch(() => {}); } };
  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setPick((p) => Math.min(p + 1, items.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setPick((p) => Math.max(p - 1, 0)); }
    else if (event.key === 'Enter') { event.preventDefault(); go(items[pick]); }
    else if (event.key === 'Escape') { setQuery(''); }
  };
  const mac = /Mac|iP(hone|ad)/.test(navigator.platform || '');
  return (
    <div className="search">
      <label>
        <Icon name="search" size={18} />
        <input ref={input} type="search" value={query} placeholder="Buscar aparelhos, câmeras e seções…" aria-label="Buscar" role="combobox" aria-expanded={items.length > 0} aria-controls="busca-lista" aria-autocomplete="list"
          onFocus={onFocus} onChange={(e) => { setQuery(e.target.value); setPick(0); }} onKeyDown={onKeyDown} onBlur={() => setTimeout(() => setQuery(''), 150)} />
        <span className="kbd" aria-hidden="true">{mac ? '⌘K' : 'Ctrl K'}</span>
      </label>
      {items.length > 0 && (
        <ul id="busca-lista" className="found" role="listbox" aria-label="Resultados">
          {items.map((item, i) => (
            <li key={item.key}><a href={hrefFor(item.name, item.param)} role="option" aria-selected={i === pick} onMouseDown={(e) => { e.preventDefault(); go(item); }}><Icon name={item.icon} size={18} />{item.label}<small>{item.kind}</small></a></li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Pessoas no pé da barra lateral: rostos empilhados e uma frase honesta (sem posição continua "sem posição"). */
function People({ location }) {
  const people = location?.people || [];
  if (!people.length) return null;
  const placed = people.filter((p) => p.last && !p.stale);
  const names = people.map((p) => p.name).join(' e ');
  const line = placed.length ? `${placed.length} com posição recente` : 'sem posição';
  return (
    <a className="who" href={hrefFor('local')} aria-label={`Pessoas: ${names}, ${line}`}>
      <span className="faces" aria-hidden="true">{people.slice(0, 3).map((p) => <span key={p.id}>{(p.name || '?').slice(0, 2).toUpperCase()}</span>)}</span>
      <span className="navi-t"><b>{people.length === 1 ? names : `${people.length} pessoas`}</b><small>{people.length === 1 ? line : `${names} · ${line}`}</small></span>
    </a>
  );
}

export default function Shell({ route, layout, tray, registry = {} }) {
  const { home, bootError, stateError } = useHome();
  const status = useBuildWatch();
  useStatePoll(!!home); // UM poll compartilhado de /api/state; o núcleo pausa com a aba oculta
  useBootstrap();
  const browser = useBrowserApi();
  const [theme, cycleTheme] = useTheme(tray);
  const [more, setMore] = useState(false);
  const roomy = layout === 'tablet' || layout === 'desktop' || layout === 'wide';
  const location = usePoll(roomy && home ? '/api/location' : null, 60000);

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
        <a className="skip" href="#conteudo" onClick={skipToContent}>Pular para o conteúdo</a>
        <div className={`app ${layout}`}>
          {roomy && (
            <aside className="side">
              <div className="brand"><span className="mk"><Icon name="home" size={20} /></span><span className="navi-t"><b>Casa Local</b><small>{home ? `${(home.devices || []).length} aparelhos · ${connection.label.toLowerCase()}` : 'abrindo…'}</small></span></div>
              <span className="cap nav-cap">Casa</span>
              <nav className="nav" aria-label="Seções">{MAIN.map((name) => <NavLink key={name} name={name} route={route} size={20} />)}</nav>
              <span className="cap nav-cap">Mais</span>
              <nav className="nav minor" aria-label="Outras seções">{MORE.map((name) => <NavLink key={name} name={name} route={route} size={20} />)}</nav>
              <div className="foot"><People location={location.data} /></div>
            </aside>
          )}
          <div className="col-main">
            {roomy && (
              <header className="topbar">
                <Search devices={home?.devices || []} />
                <span className="grow" />
                {chip}
                {themeButton}
                <a className="me" href={hrefFor('local')} aria-label="Pessoas e lugares">{(location.data?.people?.[0]?.name || 'Casa').slice(0, 1).toUpperCase()}</a>
              </header>
            )}
            {mode === 'preview' && <Banner kind="info" icon="eye" title="Prévia">Esta casa está em modo de prévia: nada é enviado nem alterado nos aparelhos.</Banner>}
            {layout === 'tray' && (
              <header className="tray-head">
                <nav className="trayicons" aria-label="Seções">
                  {MAIN.map((name) => <a key={name} className="ib" href={hrefFor(name)} aria-label={DESTINATIONS[name].title} aria-current={route.name === name ? 'page' : undefined}><Icon name={DESTINATIONS[name].icon} /></a>)}
                  <button type="button" className="ib" aria-label="Mais" aria-haspopup="dialog" aria-current={mobileTabActive(route.name) === 'mais' ? 'page' : undefined} onClick={() => setMore(true)}><Icon name="more" /></button>
                </nav>
                <div className="row">{chip}{browser && <button type="button" className="btn s" onClick={() => window.pywebview.api.open_browser(window.location.hash.replace(/^#\/?/, ''))}><Icon name="ext" />Abrir no navegador</button>}</div>
              </header>
            )}
            {layout === 'mobile' && <header className="m-head"><h1 className="h2 grow">{current.title}</h1>{chip}{themeButton}</header>}
            <main id="conteudo" className="page" tabIndex={-1}>
              {roomy && route.name !== '' && (
                <header className="page-head"><div className="col"><span className="eyebrow">{current.hint}</span><h1 className="h1 page-title">{current.title}</h1></div></header>
              )}
              {body}
            </main>
          </div>
          {layout === 'mobile' && (
            <>
              <nav className="tabbar" aria-label="Seções">
                {MAIN.map((name) => <NavLink key={name} name={name} route={route} size={22} />)}
                <button type="button" className="navi" aria-haspopup="dialog" aria-current={mobileTabActive(route.name) === 'mais' ? 'page' : undefined} onClick={() => setMore(true)}>
                  <Icon name="more" size={22} /><span className="navi-t">Mais</span>
                </button>
              </nav>
            </>
          )}
          {(layout === 'mobile' || layout === 'tray') && (
            <Overlay open={more} onClose={() => setMore(false)} title="Mais" kind="sheet">
              <nav className="col" aria-label="Mais seções">{MORE.map((name) => <NavLink key={name} name={name} route={route} onClick={() => setMore(false)} />)}</nav>
            </Overlay>
          )}
        </div>
      </ShellContext.Provider>
    </ToastProvider>
  );
}
