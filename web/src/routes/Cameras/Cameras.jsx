import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHome, usePoll } from '../../core/hooks.js';
import { fmtAgo } from '../../core/format.js';
import { hrefFor } from '../../core/route.js';
import { Icon } from '../../ui/Icon.jsx';
import { Banner, Button, IconButton, Segmented, Skeleton } from '../../ui/kit.jsx';
import { Live } from './Live.jsx';
import { Motion } from './Motion.jsx';
import { Replay } from './Replay.jsx';
import { FILTERS, parseCameraParam, visibleCameras } from './motion.js';
import { replayWindow, rewindWindow } from './replay.js';
import { useGridFrames } from './useFrames.js';

function Tile({ camera, frame, moving, bell, onOpen }) {
  return (
    <button type="button" className="tile" onClick={onOpen} aria-label={`Abrir ${camera.name} ao vivo`}>
      {frame?.url && <img src={frame.url} alt="" />}
      {!frame?.url && <span className="lb tl-ab">{frame?.failed ? 'sem imagem' : 'carregando…'}</span>}
      {bell && <span className="lb tr-ab"><Icon name="bell" size={14} label="Avisa movimento" /></span>}
      {moving && <span className="lb bell-mov">Movimento</span>}
      <span className="lb bl-ab">{camera.name}{frame?.at ? ` · ${fmtAgo(frame.at)}` : ''}</span>
    </button>
  );
}

/**
 * Câmeras: grade de quadros parados com idade, ao vivo (MSE com MJPEG de reserva), replay do DVR, movimento e avisos por computador.
 * Ao abrir só LÊ. Tudo que escreve (visto, sino, avisos, sessão de replay) é toque do usuário. Aba oculta, troca de rota e
 * desmontagem fecham sockets, vídeo e URLs. A bandeja tem o mesmo ao vivo e o mesmo replay do navegador.
 */
export default function Cameras({ param = '' }) {
  const { home, homeAt, stateError } = useHome();
  const preview = home?.mode === 'preview';
  const cams = usePoll(preview ? null : '/api/cameras', 30000);
  const motion = usePoll('/api/motion', 15000);
  const [filter, setFilter] = useState('todas');
  const [liveId, setLiveId] = useState(null);
  const [replay, setReplay] = useState(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const handled = useRef('');

  const all = useMemo(() => cams.data?.cameras ?? [], [cams.data]);
  const available = cams.data?.available === true;
  const offset = motion.data?.dvrOffset ?? 0;
  const shown = visibleCameras(all, filter, motion.data?.notify);
  const index = liveId === null ? -1 : shown.findIndex((c) => c.id === liveId);
  const frames = useGridFrames(shown.map((c) => c.id), !home || preview || !available || filter === 'movimento' || liveId !== null || !!replay, tick);
  const movingNow = new Set((motion.data?.events ?? []).filter((e) => e.end === null).map((e) => e.camera));

  // Links de fora do app: #/cameras/cam2 (ao vivo), #/cameras/replay:cam2:<início> (replay: pede o toque para buscar) e #/cameras/avisos.
  useEffect(() => {
    if (handled.current === param || !cams.data || !(motion.data || motion.error)) return;
    handled.current = param;
    const action = parseCameraParam(param, all);
    if (!action) return;
    if (action.type === 'replay') {
      setLiveId(null);
      setReplay({ ...replayWindow(all.find((c) => c.id === action.id), { start: action.start, end: null }, offset), autoStart: false });
    } else if (action.type === 'avisos') { setLiveId(null); setFilter('movimento'); setAlertsOpen(true); } else { setFilter('todas'); setLiveId(action.id); }
  }, [param, cams.data, motion.data, motion.error, all, offset]);

  const leave = () => { if (param) window.location.hash = hrefFor('cameras'); };
  const closeLive = () => { setLiveId(null); leave(); };
  const closeReplay = () => { setReplay(null); leave(); };
  const move = useCallback((step) => setLiveId((id) => { const at = shown.findIndex((c) => c.id === id); return at < 0 ? id : shown[(at + step + shown.length) % shown.length].id; }), [shown.map((c) => c.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const rewind = (camera) => { setLiveId(null); setReplay({ ...rewindWindow(camera, offset), autoStart: true }); };
  const openEvent = (event) => {
    const camera = all.find((c) => c.id === event.camera);
    if (!camera) return;
    setReplay({ ...replayWindow(camera, event, offset), autoStart: true });
  };
  if (!home) return <div className="col" role="status"><Skeleton height={28} width="30%" /><Skeleton height={300} /></div>;
  const newest = Math.max(0, ...shown.map((c) => frames[c.id]?.at ?? 0));
  const blocked = !!stateError;

  return (
    <div className="col">
      {stateError && <Banner kind="warn" icon="off" title="Sem conexão com o PC de casa">Mostrando o último dado conhecido, {fmtAgo(homeAt)}. Visto, sinos e avisos ficam bloqueados.</Banner>}
      <section className="card col" aria-label="Câmeras">
        <div className="row sp wrap">
          <h2 className="h2">Câmeras{all.length ? ` · ${all.length}` : ''}</h2>
          {!preview && available && filter !== 'movimento' && <IconButton icon="refresh" label="Atualizar imagens agora" onClick={() => setTick((n) => n + 1)} />}
        </div>
        <Segmented label="Filtrar câmeras" value={filter} onChange={setFilter} options={FILTERS.map(([value, text]) => ({ value, label: value === 'movimento' && motion.data?.unseen ? `${text} (${motion.data.unseen})` : text }))} />
        {preview ? <Banner kind="info" icon="eye">As câmeras só funcionam no modo local, no PC de casa. Aqui você vê só os avisos de movimento.</Banner> : (
          <>
            {cams.stale && <Banner kind="warn" icon="off">Sem conexão com as câmeras. Mostrando o último dado conhecido.</Banner>}
            {cams.data && !available && <Banner kind="err" icon="alert" title="Câmeras indisponíveis" action={<Button variant="s" onClick={cams.reload}>Verificar</Button>}>O serviço de câmeras (go2rtc) não está rodando no PC de casa.</Banner>}
            {!cams.data && !cams.error && <p className="sub" role="status">Abrindo câmeras…</p>}
            {cams.error && !cams.data && <Banner kind="err" icon="alert" title="Não foi possível ler as câmeras">{cams.error.message}</Banner>}
          </>
        )}
        {filter === 'movimento' || preview ? <Motion cameras={all} motion={motion} onOpen={openEvent} openAlerts={alertsOpen} blocked={blocked} /> : cams.data && available ? (
          <>
            <div className="mosaic">{shown.map((c) => <Tile key={c.id} camera={c} frame={frames[c.id]} moving={movingNow.has(c.id)} bell={(motion.data?.notify ?? []).includes(c.id)} onOpen={() => setLiveId(c.id)} />)}</div>
            <p className="sub" role="status">{shown.length} de {all.length} · {newest ? `Quadros parados · atualizado ${fmtAgo(newest)}` : 'Atualização automática dos quadros'}. Vídeo só ao abrir uma câmera.</p>
          </>
        ) : null}
      </section>
      {index >= 0 && <Live cameras={shown} index={index} poster={frames[liveId]?.url} move={move} close={closeLive} rewind={rewind} />}
      {replay && <Replay key={`${replay.camera.id}-${replay.start}`} {...replay} close={closeReplay} goLive={() => { const id = replay.camera.id; setReplay(null); setFilter('todas'); setLiveId(id); }} />}
    </div>
  );
}
