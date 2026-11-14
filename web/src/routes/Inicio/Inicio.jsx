import { useEffect, useMemo, useState } from 'react';
import { useHome, usePoll } from '../../core/hooks.js';
import { get } from '../../core/api.js';
import { fmtAgo } from '../../core/format.js';
import { hrefFor } from '../../core/route.js';
import { Icon } from '../../ui/Icon.jsx';
import { Banner, Chip, Skeleton } from '../../ui/kit.jsx';
import { useShell } from '../../shell/context.js';
import { ClimateObject, LabCard, LastMotion, LightObject, Modes, OtherDevices, Presence, RecentActions, Tiles, useClock, useHistory } from './Parts.jsx';
import { HeroCameras, WideCameras } from './Wide.jsx';
import { DEVICE_FILTERS, ambientOf, greetingFor, headlineOf, showsIn } from './view.js';

/**
 * Início: resumo da casa no desenho "Vidro". Cabeçalho com data, saudação e linha-resumo (o que está sem conexão vira link
 * de atenção); modos em cartões; câmera em destaque com miniaturas; data, hora e o ar ao lado; e a grade de aparelhos com
 * filtros. Tudo é dado real do servidor; nada é simulado fora da prévia. Celular empilha; bandeja segue compacta.
 */
export default function Inicio() {
  const shell = useShell();
  const { home, homeAt, stateError } = useHome();
  const layout = shell?.layout || 'desktop';
  const tray = layout === 'tray';
  const wide = layout === 'wide';
  const mobile = layout === 'mobile';
  const mode = home?.mode;
  const preview = mode === 'preview';
  const now = useClock();
  const location = usePoll('/api/location', 60000);
  const motion = usePoll(preview ? null : '/api/motion', tray ? 30000 : 15000);
  const lab = usePoll('/api/homelab', wide ? 5000 : 15000);
  const history = useHistory(lab, wide);
  const [cameras, setCameras] = useState([]);
  const [filter, setFilter] = useState('tudo');
  useEffect(() => {
    if (preview) return;
    get('/api/cameras').then((data) => setCameras(data.cameras || [])).catch(() => {});
  }, [preview]);
  const names = useMemo(() => Object.fromEntries(cameras.map((c) => [c.id, c.name])), [cameras]);

  if (!home) return <div className="col" role="status"><Skeleton height={28} width="30%" /><Skeleton height={240} /></div>;
  const blocked = !!stateError; // o banner promete bloqueio: botões E handlers o cumprem
  const devices = home.devices || [];
  const lights = devices.filter((d) => d.kind === 'light');
  const climates = devices.filter((d) => d.kind === 'climate');
  const others = devices.filter((d) => d.kind !== 'light' && d.kind !== 'climate');
  const day = now.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  const longDay = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const banners = (
    <>
      {stateError && <Banner kind="warn" icon="off" title="Sem conexão com o PC de casa">Mostrando o último estado conhecido, {fmtAgo(homeAt)}. Os comandos ficam bloqueados.</Banner>}
      {preview && <Banner kind="info" icon="eye">Prévia: nada físico é acionado e as câmeras ficam desligadas.</Banner>}
    </>
  );

  if (tray) {
    return (
      <div className="col inicio tray">
        {banners}
        <header className="row sp wrap inicio-head">
          <div className="col tight"><span className="sub">{day} · <span className="mono">{time}</span></span></div>
          <Presence location={location.data} compact />
        </header>
        {!preview && <LastMotion motion={motion} cameraNames={names} compact />}
        {climates.map((d) => <ClimateObject key={d.id} device={d} blocked={blocked} />)}
        {lights.map((d) => <LightObject key={d.id} device={d} blocked={blocked} />)}
        <Modes scenes={home.scenes} devices={devices} blocked={blocked} />
        <OtherDevices devices={others} />
        <LabCard lab={lab} compact blocked={blocked} />
      </div>
    );
  }

  const headline = headlineOf(devices);
  const summary = ambientOf(devices);
  const [lead, ...restClimates] = climates;
  const show = (kind) => showsIn(filter, kind);
  return (
    <div className={`col inicio ${wide ? 'wide' : ''}`}>
      {banners}
      <header className="page-head inicio-head">
        <div className="col">
          <span className="eyebrow">{longDay.charAt(0).toUpperCase() + longDay.slice(1)}</span>
          <h1 className="h1">{greetingFor(now)}</h1>
          <p className="sub headline">
            {headline.parts.join(' · ')}
            {headline.offline.map((d) => <span key={d.id}> · <a className="warn-link" href={hrefFor(d.kind === 'tv' ? 'tv' : d.kind === 'climate' ? 'clima' : 'luzes', d.kind === 'light' ? d.id : undefined)}>{d.name.toLowerCase()} sem conexão</a></span>)}
          </p>
        </div>
        {!mobile && <a className="btn p" href={hrefFor('cameras')}><Icon name="cam" size={18} />Todas as câmeras</a>}
      </header>
      {mobile && <Presence location={location.data} />}
      <Modes scenes={home.scenes} devices={devices} blocked={blocked} />
      <div className="hero">
        {!preview && (mobile ? <LastMotion motion={motion} cameraNames={names} /> : <HeroCameras cameras={cameras} motion={motion} available={!preview} />)}
        <div className="hero-side">
          {!mobile && <Tiles now={now} />}
          {lead ? <ClimateObject device={lead} blocked={blocked} /> : <LabCard lab={lab} blocked={blocked} />}
        </div>
      </div>
      <div className="row wrap filters" role="group" aria-label="Mostrar aparelhos">
        {DEVICE_FILTERS.map(([id, label]) => <Chip key={id} pressed={filter === id} onClick={() => setFilter(id)}>{label}</Chip>)}
      </div>
      <div className="inicio-grid">
        <div className="objs">
          {show('light') && lights.map((d, i) => <LightObject key={d.id} device={d} large={i === 0 && filter !== 'tudo'} blocked={blocked} />)}
          {show('climate') && (filter === 'ar' ? climates : restClimates).map((d) => <ClimateObject key={d.id} device={d} blocked={blocked} />)}
        </div>
        <aside className="col side-col">
          {show('tv') && <OtherDevices devices={others} />}
          {filter === 'tudo' && summary.length > 0 && <ul className="list-plain summary sand" aria-label="Resumo do ambiente">{summary.map(([label, value]) => <li key={label}><span className="cap">{label}</span><b>{value}</b></li>)}</ul>}
          {(show('lab') && lead) && <LabCard lab={lab} blocked={blocked} history={wide ? history : undefined} />}
          {filter === 'tudo' && <RecentActions actions={home.recentActions} />}
        </aside>
        {wide && filter === 'tudo' && <div className="cams"><WideCameras cameras={cameras} motion={motion} available={!preview} /></div>}
      </div>
    </div>
  );
}
