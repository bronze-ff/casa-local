import { useEffect, useMemo, useState } from 'react';
import { useHome, usePoll } from '../../core/hooks.js';
import { get } from '../../core/api.js';
import { fmtAgo } from '../../core/format.js';
import { Banner, Skeleton } from '../../ui/kit.jsx';
import { useShell } from '../../shell/context.js';
import { ClimateObject, LabCard, LastMotion, LightObject, Modes, OtherDevices, Presence, RecentActions, useClock, useHistory } from './Parts.jsx';
import { WideCameras } from './Wide.jsx';
import { ambientOf, greetingFor } from './view.js';

/**
 * Início: aparelhos como objetos (luz e ar protagonistas), presença e modos numa faixa, relógio secundário.
 * Tudo é dado real do servidor; nada é simulado fora da prévia. Layouts: celular/tablet/desktop em uma coluna que se abre,
 * tela larga com quadros parados das câmeras, bandeja compacta.
 */
export default function Inicio() {
  const shell = useShell();
  const { home, homeAt, stateError } = useHome();
  const layout = shell?.layout || 'desktop';
  const tray = layout === 'tray';
  const wide = layout === 'wide';
  const mode = home?.mode;
  const preview = mode === 'preview';
  const now = useClock();
  const location = usePoll('/api/location', 60000);
  const motion = usePoll(preview ? null : '/api/motion', tray ? 30000 : 15000);
  const lab = usePoll('/api/homelab', wide ? 5000 : 15000);
  const history = useHistory(lab, wide);
  const [cameras, setCameras] = useState([]);
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
  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const banners = (
    <>
      {stateError && <Banner kind="warn" icon="off" title="Sem conexão com o PC de casa">Mostrando o último estado conhecido, {fmtAgo(homeAt)}. Os comandos ficam bloqueados.</Banner>}
      {preview && <Banner kind="info" icon="eye">Prévia: nada físico é acionado e as câmeras ficam desligadas.</Banner>}
    </>
  );
  const head = (
    <header className="row sp wrap inicio-head">
      <div className="col tight"><span className="cap">{day} · <span className="mono">{time}</span></span>{!tray && <h2 className="h1">{greetingFor(now)}</h2>}</div>
      <Presence location={location.data} compact={tray} />
    </header>
  );
  const summary = ambientOf(devices);

  if (tray) {
    return (
      <div className="col inicio tray">
        {banners}
        {head}
        <Modes scenes={home.scenes} devices={devices} blocked={blocked} />
        {lights.map((d) => <LightObject key={d.id} device={d} blocked={blocked} />)}
        {climates.map((d) => <ClimateObject key={d.id} device={d} />)}
        <OtherDevices devices={others} />
        {!preview && <LastMotion motion={motion} cameraNames={names} compact />}
        <LabCard lab={lab} compact blocked={blocked} />
      </div>
    );
  }
  return (
    <div className={`col inicio ${wide ? 'wide' : ''}`}>
      {banners}
      {head}
      <Modes scenes={home.scenes} devices={devices} blocked={blocked} />
      <div className="inicio-grid">
        <div className="objs">
          {lights.map((d, i) => <LightObject key={d.id} device={d} large={i === 0} blocked={blocked} />)}
          {climates.map((d) => <ClimateObject key={d.id} device={d} />)}
        </div>
        <aside className="col side-col">
          <OtherDevices devices={others} />
          {summary.length > 0 && <ul className="list-plain summary" aria-label="Resumo do ambiente">{summary.map(([label, value]) => <li key={label}><span className="cap">{label}</span><b>{value}</b></li>)}</ul>}
          {!preview && !wide && <LastMotion motion={motion} cameraNames={names} />}
          <LabCard lab={lab} blocked={blocked} history={wide ? history : undefined} />
          <RecentActions actions={home.recentActions} />
        </aside>
        {wide && <div className="cams"><WideCameras cameras={cameras} motion={motion} available={!preview} /></div>}
      </div>
    </div>
  );
}
