import { useEffect, useMemo, useState } from 'react';
import { useCommand } from '../../core/hooks.js';
import { fmtAgo, fmtTime } from '../../core/format.js';
import { hrefFor } from '../../core/route.js';
import { useAction } from '../../ui/actions.js';
import { confidenceOf } from '../../ui/confidence.js';
import { Icon, ICON_NAMES } from '../../ui/Icon.jsx';
import { Banner, Button, CommandState, Confidence, IconButton, Switch } from '../../ui/kit.jsx';
import { guarded } from '../guard.js';
import { HISTORY_SCALE, emptyHistory, pushSample, sparkPoints } from './history.js';
import { gameText, deviceView, meters, newestEvent, stepLabel, whereIs } from './view.js';

/** Acumula amostras REAIS do computador enquanto a tela larga está aberta (uma por leitura nova do servidor). */
export function useHistory(lab, enabled) {
  const [history, setHistory] = useState(emptyHistory);
  const at = lab.at;
  useEffect(() => {
    if (!enabled || !lab.data?.stats || !at) return;
    setHistory((old) => pushSample(old, lab.data.stats, at));
  }, [enabled, at]);
  return history;
}

export function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(timer); }, []);
  return now;
}

/** Quem está onde, com a idade da posição. Cada pessoa leva ao Local. */
export function Presence({ location, compact }) {
  const people = location?.people || [];
  if (!people.length) return null;
  return (
    <ul className="list-plain presence" aria-label="Pessoas">
      {people.map((p) => (
        <li key={p.id}>
          <a className="chip" href={hrefFor('local')}>
            <span className="avatar" aria-hidden="true">{(p.name || '?').slice(0, 1).toUpperCase()}</span>
            <span className="col tight"><b>{p.name}</b>{!compact && <span className="sub">{whereIs(p, location.places, fmtAgo)}</span>}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Modos da casa. O resultado mostra cada aparelho: parcial nunca parece sucesso, IR aceito não é estado confirmado. */
export function Modes({ scenes = [], devices = [], limit, blocked = false }) {
  const [run] = useAction();
  const [running, setRunning] = useState(null);
  const [last, setLast] = useState(null);
  const shown = scenes.slice(0, limit);
  if (!shown.length) return null;
  const start = guarded(blocked, async (scene) => {
    if (running) return;
    setRunning(scene.id);
    try {
      const result = await run(`/api/scenes/${scene.id}/run`, {}, `${scene.name} aplicado`);
      if (result) setLast({ scene, result });
    } finally { setRunning(null); }
  });
  const name = (id) => devices.find((d) => d.id === id)?.name || id;
  const steps = last?.result?.results || [];
  const partial = last?.result?.status === 'partial';
  return (
    <section className="col" aria-label="Modos">
      <div className="row wrap modes">
        {shown.map((scene) => (
          <Button key={scene.id} variant="s" icon={ICON_NAMES.includes(scene.icon) ? scene.icon : 'sun'} busy={running === scene.id} disabled={blocked || (!!running && running !== scene.id)} reason={blocked ? 'Sem conexão com o painel.' : 'Outro modo está rodando.'} onClick={() => start(scene)}>{scene.name}</Button>
        ))}
      </div>
      {last && (
        <Banner kind={partial ? 'warn' : last.result?.status === 'preview' ? '' : 'info'} icon={partial ? 'alert' : 'check'} title={`${last.scene.name}: ${partial ? 'parcial' : last.result?.status === 'preview' ? 'simulado' : 'enviado'}`}>
          <ul className="list-plain steps">
            {steps.map((item) => <li key={item.deviceId}><span>{name(item.deviceId)}</span><b>{stepLabel(item)}</b>{item.message ? <span className="sub"> · {item.message}</span> : null}</li>)}
          </ul>
          {!partial && last.result?.status !== 'preview' && <span className="sub">Infravermelho não devolve confirmação: confira no aparelho.</span>}
        </Banner>
      )}
    </section>
  );
}

/** Luz como objeto: número grande do brilho RELATADO, estado do comando e chave direta. */
export function LightObject({ device, large, blocked = false }) {
  const command = useCommand(device.id);
  const [run, busy] = useAction();
  const view = deviceView(device);
  const kind = confidenceOf(device, command);
  const lit = device.state?.power === true;
  const offline = view.sub === 'sem conexão';
  const toggle = guarded(blocked || offline, () => run(`/api/devices/${device.id}/commands`, { action: 'set', values: { power: !lit } }));
  return (
    <section className={`obj ${lit ? 'warm' : ''} ${large ? 'big' : 'small'} col`} aria-label={device.name}>
      <div className="row sp wrap"><span className="cap">Luz</span><span className="row"><Confidence kind={kind} /><CommandState command={command} /></span></div>
      <h2 className="h2">{device.name}</h2>
      <div className="obj-main">
        <div className="col tight grow">
          <span className={`num ${large ? 'xl' : 'm'}${view.known && lit ? '' : ' word'}`} aria-live="polite">{view.known && lit ? <>{device.state.brightness ?? '—'}<span className="u">%</span></> : view.value}</span>
          <span className="sub">{view.known ? (lit ? 'brilho relatado pela luz' : 'relatado pela luz') : view.sub}{device.updatedAt ? ` · ${fmtAgo(device.updatedAt)}` : ''}</span>
        </div>
        <IconButton icon="power" className={`big round ${lit ? 'on' : ''}`} size={26} label={lit ? `Apagar ${device.name.toLowerCase()}` : `Ligar ${device.name.toLowerCase()}`} aria-pressed={lit ? 'true' : 'false'} disabled={blocked || busy || offline || device.state?.power == null} onClick={toggle} />
      </div>
      {(blocked || offline) && <p className="hint" role="status">{blocked ? 'Sem conexão com o painel.' : 'Sem conexão com a lâmpada.'}</p>}
      {large && <a className="btn g" href={hrefFor('luzes', device.id)}>Brilho e cor em Luzes</a>}
    </section>
  );
}

/** Ar como objeto: temperatura ESTIMADA (último comando enviado), nunca leitura. */
export function ClimateObject({ device }) {
  const command = useCommand(device.id);
  const view = deviceView(device);
  const kind = confidenceOf(device, command);
  return (
    <section className="obj col" aria-label={device.name}>
      <div className="row sp wrap"><span className="cap">Ar · infravermelho</span><span className="row"><Confidence kind={kind} /><CommandState command={command} /></span></div>
      <h2 className="h2">{device.name}</h2>
      <div className="row climate-row">
        <div className="ring" aria-hidden="true"><span className="num l">{view.value}</span></div>
        <div className="col tight grow">
          <span className="sub">{view.sub || 'sem último envio'}</span>
          <p className="hint">O ar não informa o que faz. Este número é o último comando enviado, não uma leitura.</p>
        </div>
      </div>
      <a className="btn s" href={hrefFor('clima')}>Abrir Clima</a>
    </section>
  );
}

/** Demais aparelhos: linha curta com estado e atalho para a tela deles. */
export function OtherDevices({ devices }) {
  if (!devices.length) return null;
  return (
    <section className="sand col" aria-label="Outros aparelhos">
      <h2 className="cap">Outros aparelhos</h2>
      <ul className="list-plain rows">
        {devices.map((d) => {
          const view = deviceView(d);
          return <li key={d.id}><span className="grow col tight"><b>{d.name}</b><span className="sub">{view.sub || ' '}</span></span><span className="num s">{view.value}</span><a className="ib" href={hrefFor(d.kind === 'tv' ? 'tv' : 'luzes')} aria-label={`Abrir ${d.name}`}><Icon name={d.kind === 'tv' ? 'tv' : 'luz'} /></a></li>;
        })}
      </ul>
    </section>
  );
}

/** Último movimento: foto parada com câmera e hora. Só aparece com câmeras disponíveis (não na prévia). */
export function LastMotion({ motion, cameraNames, compact }) {
  const latest = useMemo(() => newestEvent(motion.data?.events), [motion.data]);
  const fresh = latest && (motion.data?.unseenBy?.[latest.camera] || 0) > 0;
  const name = latest && (cameraNames[latest.camera] || latest.camera);
  return (
    <section className="card col" aria-label="Último movimento">
      <div className="row sp"><h2 className="h2">Último movimento</h2><a className="btn g" href={hrefFor('cameras')}>Câmeras</a></div>
      {motion.stale && <p className="sub">Sem conexão com as câmeras. Mostrando o último dado conhecido.</p>}
      {!latest ? <p className="sub">{motion.data ? 'Nenhum movimento registrado.' : 'Lendo as câmeras…'}</p> : (
        <a className="fr" href={hrefFor('cameras', latest.camera)} style={{ height: compact ? 96 : 170 }} aria-label={`Movimento em ${name}, ${fmtTime(latest.start)}`}>
          {latest.photo && <img src={`/api/motion/${latest.id}.jpg`} alt="" />}
          <span className="lb tl-ab">{name}</span>
          <span className="lb bl-ab">foto, não vídeo · {fmtTime(latest.start)} · {latest.count}×</span>
          {fresh && <span className="lb tr-ab">Novo</span>}
        </a>
      )}
    </section>
  );
}

/** Home lab: modo Lab/Jogo, o que o servidor diz que está acontecendo e medidores atuais (sem histórico inventado). */
export function LabCard({ lab, compact, blocked = false, history }) {
  const [run, busy] = useAction();
  const d = lab.data;
  if (d && !d.enabled) return null;
  const game = d?.mode === 'jogo';
  const toggle = guarded(blocked, async () => { if (await run('/api/homelab', { mode: game ? 'lab' : 'jogo' }, game ? 'Voltando ao normal…' : 'Ligando o modo jogo…')) lab.reload(); });
  const readings = meters(d?.stats);
  return (
    <section className="sand col" aria-label="Home lab">
      <div className="row sp"><h2 className="h2">Home lab</h2>{!compact && <a className="btn g" href={hrefFor('lab')}>Abrir Lab</a>}</div>
      {lab.stale && <p className="sub">Sem conexão com o home lab. Mostrando o último dado conhecido.</p>}
      <div className="row sp"><div className="col tight"><span className="num m">{!d ? '—' : game ? 'Jogo' : 'Lab'}</span><span className="sub">{d ? gameText(d) : 'Lendo o home lab…'}</span></div>
        <Switch on={game} label="Modo jogo" disabled={blocked || !d || busy || !!d?.step} onChange={toggle} /></div>
      {blocked && <p className="hint" role="status">Sem conexão com o painel. O modo jogo fica bloqueado.</p>}
      <div className="meters">
        {readings.map((m) => <div key={m.key} className={m.warn ? 'warn' : ''}><span className="cap">{m.label}</span><b className="num s">{m.value}</b></div>)}
      </div>
      {history && (
        <div className="col" aria-label="Histórico do computador">
          <h3 className="cap">Histórico desde que esta tela abriu</h3>
          <div className="meters hist">
            {readings.map((m) => {
              const samples = history[m.key] || [];
              const points = sparkPoints(samples, { hi: HISTORY_SCALE[m.key] });
              return (
                <div key={m.key}>
                  <span className="cap">{m.label}</span>
                  {points ? <svg viewBox="0 0 120 32" className="spark" role="img" aria-label={`${m.label}: ${samples.length} amostras reais`}><polyline points={points} /></svg> : <span className="sub">ainda sem histórico</span>}
                  <span className="sub">{samples.length ? `última amostra ${fmtAgo(samples.at(-1).at)}` : 'sem amostra'}</span>
                </div>
              );
            })}
          </div>
          <p className="hint">Só amostras reais lidas enquanto esta tela está aberta (até 24). O servidor entrega apenas o valor atual; nada é preenchido com zero.</p>
        </div>
      )}
    </section>
  );
}

export function RecentActions({ actions = [] }) {
  if (!actions.length) return null;
  return (
    <section className="col" aria-label="Últimas ações">
      <h2 className="cap">Últimas ações</h2>
      <ol className="list-plain tl-list">
        {actions.slice(0, 5).map((a) => (
          <li key={a.id} className={a.status === 'failed' ? 'bad' : ''}><span className="mono mut">{fmtTime(a.createdAt)}</span><span className="grow col tight"><b>{a.name}</b><span className="sub">{a.message}</span></span></li>
        ))}
      </ol>
    </section>
  );
}
