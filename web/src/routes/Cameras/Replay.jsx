import { useEffect, useMemo, useRef, useState } from 'react';
import { post } from '../../core/api.js';
import { usePoll, useVisible } from '../../core/hooks.js';
import { Icon } from '../../ui/Icon.jsx';
import { Banner, Button, Status } from '../../ui/kit.jsx';
import { MediaControls } from './MediaControls.jsx';
import { MediaDialog, StageNote } from './MediaDialog.jsx';
import { startMuted } from './media.js';
import { attachMse, mseSupported } from './mse.js';
import { buildHits, clampSeek, clock, createSessionQueue, isOngoing, keyTarget, nextHit, percentAt, replayKey, stamp, timeAtX } from './replay.js';
import { useMediaGate } from './useMedia.js';

/** Linha do tempo arrastável com marcas de movimento e teclado (setas ±10 s, Home, End). */
export function Timeline({ from, to, now, hits, seek }) {
  const track = useRef(null);
  const dragging = useRef(false);
  const [preview, setPreview] = useState(null);
  const at = (x) => { const box = track.current.getBoundingClientRect(); return timeAtX(x, box.left, box.width, from, to); };
  const next = nextHit(hits, now);
  return (
    <div className="col tight">
      <div ref={track} className="timeline" role="slider" tabIndex={0} aria-label="Linha do tempo da gravação" aria-valuemin={Math.round(from)} aria-valuemax={Math.round(to)} aria-valuenow={Math.round(now)} aria-valuetext={clock(now)}
        onKeyDown={(e) => { const target = keyTarget(e.key, now, from, to); if (target === undefined) return; e.preventDefault(); seek(target); }}
        onPointerDown={(e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sem captura */ } dragging.current = true; setPreview(at(e.clientX)); }}
        onPointerMove={(e) => { if (dragging.current) setPreview(at(e.clientX)); }}
        onPointerUp={(e) => { if (dragging.current) { dragging.current = false; seek(at(e.clientX)); setPreview(null); } }}
        onPointerCancel={() => { dragging.current = false; setPreview(null); }}>
        <span className="tl-track" />
        {hits.map(([s, e], i) => <i key={i} className="tl-hit" style={{ left: `${percentAt(s, from, to)}%`, width: `max(4px, ${percentAt(e, from, to) - percentAt(s, from, to)}%)` }} />)}
        <b className="tl-now" style={{ left: `${percentAt(preview ?? now, from, to)}%` }}>{preview !== null && <em className="mono">{clock(preview)}</em>}</b>
      </div>
      <div className="row wrap sp mono sub">
        <span>{clock(from)}</span>
        <Button variant="s" icon="next" disabled={next === undefined} reason="Não há outro movimento nesta janela." onClick={() => next !== undefined && seek(next - 3)}>{next === undefined ? 'Sem outro movimento' : `Próximo movimento ${clock(next)}`}</Button>
        <span>{clock(to)}</span>
      </div>
    </div>
  );
}

/**
 * Replay do DVR: abre uma sessão (POST .../replay) SÓ quando começa (toque do usuário; link de fora pede o toque em "Buscar gravação"),
 * assiste pelo WebSocket e encerra a sessão ao sair. Voltar/avançar troca a sessão anterior numa chamada só.
 */
export function Replay({ camera, start, from, to, offset, autoStart, close, goLive }) {
  const nowDvr = () => Date.now() / 1000 + offset;
  const video = useRef(null);
  const stage = useRef(null);
  const held = useRef(false);
  const base = useRef(null);
  const [started, setStarted] = useState(!!autoStart);
  const [anchor, setAnchor] = useState(Math.floor(start));
  const [replayId, setReplayId] = useState(null);
  const [status, setStatus] = useState(mseSupported() ? (autoStart ? 'loading' : 'idle') : 'unsupported');
  const [error, setError] = useState('');
  const [played, setPlayed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [resume, setResume] = useState(0); // cada retomada da aba abre UMA sessão nova
  const visible = useVisible();
  const wasHidden = useRef(false);
  const queue = useMemo(() => createSessionQueue({ open: ({ camera: id, start: s, replace }) => post(`/api/cameras/${id}/replay`, { start: s, ...(replace ? { replace } : {}) }), close: (id) => post(`/api/replays/${id}/close`, {}) }), []);

  useEffect(() => () => queue.dispose(), [queue]); // sair da tela encerra a sessão no servidor

  useEffect(() => {
    if (!started || !mseSupported()) return undefined;
    let live = true;
    setStatus('loading'); setReplayId(null); setPlayed(0); setPaused(false); setError('');
    held.current = false; base.current = null;
    queue.request({ camera: camera.id, start: anchor }).then((id) => { if (live && id) setReplayId(id); }, (e) => { if (live) { setError(e.message); setStatus('failed'); } });
    return () => { live = false; };
  }, [started, anchor, camera.id, queue, resume]);

  // Só há stream com a busca iniciada, MSE suportado e id válido; antes disso a chave é undefined e nada abre.
  useMediaGate(replayKey({ started, supported: mseSupported(), id: replayId }), (id) => (video.current ? (startMuted(video.current), attachMse(video.current, `/api/replays/${id}/ws`, () => setStatus('live'), () => setStatus('failed'), { replay: true, held: () => held.current, onEnd: () => setStatus('ended') })) : undefined));

  const position = anchor + played;
  useEffect(() => { // aba oculta: fecha o socket E a sessão no servidor e descarta abertura pendente; ao voltar, UMA abertura na posição em que parou (sem repetir comando sozinho)
    if (!started || !mseSupported()) return;
    if (!visible) { wasHidden.current = true; queue.suspend(); setReplayId(null); setStatus('paused'); } else if (wasHidden.current) { wasHidden.current = false; setStatus('loading'); setAnchor(Math.floor(position)); setResume((n) => n + 1); }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const seek = (t) => { if (!started) setStarted(true); setAnchor(clampSeek(t, nowDvr())); };

  const motion = usePoll(`/api/motion/${camera.id}`, 10000);
  const hitsAll = useMemo(() => buildHits(motion.data?.events, nowDvr()), [motion.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const ongoing = isOngoing(motion.data?.events, to);
  const upper = Math.min(nowDvr() - 5, Math.max(to, position + 30));
  const hits = hitsAll.filter(([s, e]) => e >= from && s <= upper);
  const atNow = nowDvr() - position < 90;
  const toggle = () => { const el = video.current; if (!el) return; held.current = !el.paused; if (el.paused) el.play(); else el.pause(); setPaused(held.current); };

  return (
    <MediaDialog label={`Gravação: ${camera.name}`} title={camera.name} sub={`Gravação do DVR · ${stamp(position)}`} onClose={close} actions={<Button variant="s" icon="radio" onClick={goLive}>Ao vivo</Button>}>
      <div ref={stage} className="media-stage">
        <video ref={video} className="media" muted autoPlay playsInline aria-label={`Gravação de ${camera.name}`}
          onTimeUpdate={(e) => { const t = e.currentTarget.currentTime; if (base.current === null) base.current = t; setPlayed(Math.max(0, t - base.current)); }} />
        {status === 'idle' && <StageNote icon="clock"><span>Esta gravação só é buscada no DVR quando você pedir.</span><Button variant="p" onClick={() => setStarted(true)}>Buscar gravação</Button></StageNote>}
        {status === 'paused' && <StageNote icon="refresh"><span>Gravação pausada enquanto a aba está oculta. Ela volta sozinha ao reabrir.</span></StageNote>}
        {status === 'loading' && <StageNote icon="refresh"><span>Buscando a gravação no DVR…</span></StageNote>}
        {status === 'failed' && <StageNote icon="alert"><span>{error || 'O DVR não entregou a gravação desse horário (pode não ter sido gravado).'}</span></StageNote>}
        {status === 'ended' && <StageNote icon="refresh"><span>{atNow ? 'Você chegou ao momento atual da gravação.' : 'Fim deste trecho da gravação. Avance ou volte para continuar.'}</span>{atNow && <Button variant="p" icon="radio" onClick={goLive}>Ver ao vivo</Button>}</StageNote>}
        {status === 'unsupported' && <StageNote icon="alert"><span>Este navegador não toca a gravação. Use o Chrome, o Edge ou o Safari atualizado.</span></StageNote>}
      </div>
      <MediaControls key={replayId || 'sem-sessao'} video={video} stage={stage} />
      {ongoing && status !== 'ended' && <Button variant="s" onClick={goLive}><Status kind="part">Movimento ainda acontecendo</Status>Ver ao vivo</Button>}
      {motion.stale && <Banner kind="warn" icon="off">Sem conexão para ler os movimentos. As marcas mostram o último dado conhecido.</Banner>}
      <Timeline from={from} to={upper} now={position} hits={hits} seek={seek} />
      <div className="row" style={{ justifyContent: 'center' }} role="group" aria-label="Controle da gravação">
        <Button variant="s" icon="back" aria-label="Voltar 30 segundos" onClick={() => seek(position - 30)}>30 s</Button>
        <Button variant={status === 'live' ? 'p' : 's'} aria-label={paused ? 'Continuar' : 'Pausar'} disabled={status !== 'live'} reason="A gravação ainda não está tocando." onClick={toggle}>{paused ? 'Continuar' : 'Pausar'}</Button>
        <Button variant="s" aria-label="Avançar 30 segundos" onClick={() => seek(position + 30)}>30 s<Icon name="next" /></Button>
      </div>
    </MediaDialog>
  );
}
