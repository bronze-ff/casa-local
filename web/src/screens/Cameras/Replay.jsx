import { useEffect, useMemo, useRef, useState } from 'react';
import { post, usePoll } from '../../api.js';
import { Icon, Key, Status } from '../../ui.jsx';
import { attachMse, mseSupported } from './mse.js';
import { useWhileVisible } from './useMedia.js';
import { Overlay, VideoDialog, mediaStyle, stageStyle } from './VideoDialog.jsx';

const clock = (t) => new Date(t * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const stamp = (t) => new Date(t * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

function Timeline({ from, to, now, hits, seek }) {
  const track = useRef();
  const dragging = useRef(false);
  const [preview, setPreview] = useState(null);
  const span = Math.max(1, to - from);
  const pct = (t) => `${Math.min(100, Math.max(0, ((t - from) / span) * 100))}%`;
  const at = (x) => {
    const box = track.current.getBoundingClientRect();
    return from + Math.min(1, Math.max(0, (x - box.left) / box.width)) * span;
  };
  const next = hits.map(([s]) => s).find((s) => s > now + 2);

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Linha do tempo da gravação"
        aria-valuemin={Math.round(from)}
        aria-valuemax={Math.round(to)}
        aria-valuenow={Math.round(now)}
        aria-valuetext={clock(now)}
        onKeyDown={(e) => {
          const to_ = { ArrowLeft: now - 10, ArrowRight: now + 10, Home: from, End: to }[e.key];
          if (to_ === undefined) return;
          e.preventDefault();
          seek(to_);
        }}
        onPointerDown={(e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sem captura */ } dragging.current = true; setPreview(at(e.clientX)); }}
        onPointerMove={(e) => { if (dragging.current) setPreview(at(e.clientX)); }}
        onPointerUp={(e) => { if (dragging.current) { dragging.current = false; seek(at(e.clientX)); setPreview(null); } }}
        onPointerCancel={() => { dragging.current = false; setPreview(null); }}
        style={{ position: 'relative', height: 44, touchAction: 'none', cursor: 'pointer' }}
      >
        <span style={{ position: 'absolute', left: 0, right: 0, top: 18, height: 8, borderRadius: 4, background: 'color-mix(in srgb, var(--ink) 18%, transparent)' }} />
        {hits.map(([s, e], i) => (
          <i key={i} style={{ position: 'absolute', top: 18, height: 8, borderRadius: 2, background: 'var(--sinal)', left: pct(s), width: `max(4px, calc(${pct(e)} - ${pct(s)}))` }} />
        ))}
        <b style={{ position: 'absolute', top: 8, width: 4, height: 28, marginLeft: -2, borderRadius: 2, background: 'var(--ink)', left: pct(preview ?? now) }}>
          {preview !== null && <em className="mono small" style={{ position: 'absolute', bottom: 32, left: -30, width: 64, textAlign: 'center', fontStyle: 'normal' }}>{clock(preview)}</em>}
        </b>
      </div>
      <div className="row mono small muted" style={{ padding: 0, border: 0, flexWrap: 'wrap' }}>
        <span>{clock(from)}</span>
        <Key center disabled={next === undefined} onClick={() => next !== undefined && seek(next - 3)}>
          <Icon name="next" size={16} />{next === undefined ? 'Sem outro movimento' : `Próximo movimento ${clock(next)}`}
        </Key>
        <span>{clock(to)}</span>
      </div>
    </div>
  );
}

/**
 * Replay do DVR: abre uma sessão (POST .../replay), assiste pelo WebSocket e fecha ao sair.
 * Voltar/avançar troca a sessão anterior pela nova numa chamada só (`replace`).
 */
export default function Replay({ camera, start, from, to, offset, close, goLive }) {
  const nowDvr = () => Date.now() / 1000 + offset;
  const video = useRef();
  const [anchor, setAnchor] = useState(Math.floor(start));
  const [replayId, setReplayId] = useState(null);
  const [status, setStatus] = useState(mseSupported ? 'loading' : 'unsupported');
  const [error, setError] = useState('');
  const [played, setPlayed] = useState(0);
  const [paused, setPaused] = useState(false);
  const held = useRef(false);
  const base = useRef(null);
  const current = useRef(null);
  const chain = useRef(Promise.resolve());

  const closeSession = (id) => { post(`/api/replays/${id}/close`, {}).catch(() => {}); };

  // Pedidos em fila: nunca dois "abrir" ao mesmo tempo (o servidor limita a 2 sessões).
  useEffect(() => {
    if (!mseSupported) return;
    let cancelled = false;
    setStatus('loading'); setReplayId(null); setPlayed(0); setPaused(false); setError('');
    held.current = false; base.current = null;
    chain.current = chain.current.then(async () => {
      if (cancelled) return;
      const replace = current.current;
      current.current = null;
      try {
        const opened = await post(`/api/cameras/${camera.id}/replay`, { start: anchor, ...(replace ? { replace } : {}) });
        if (cancelled) { closeSession(opened.id); return; }
        current.current = opened.id;
        setReplayId(opened.id);
      } catch (e) {
        if (!cancelled) { setError(e.message); setStatus('failed'); }
      }
    });
    return () => { cancelled = true; };
  }, [camera.id, anchor]);

  // Sair da tela encerra a sessão no servidor (ele também apaga sozinho depois de ~17 min).
  useEffect(() => () => { if (current.current) closeSession(current.current); }, []);

  // Aba oculta fecha o WebSocket e solta o vídeo; ao voltar, reabre a sessão na posição em que parou (uma só sessão: `replace`).
  const tabVisible = useWhileVisible(() => {
    if (replayId && video.current) {
      return attachMse(video.current, `/api/replays/${replayId}/ws`, () => setStatus('live'), () => setStatus('failed'),
        { replay: true, held: () => held.current, onEnd: () => setStatus('ended') });
    }
    return undefined;
  }, [replayId]);
  const hidden = useRef(false);
  useEffect(() => {
    if (!mseSupported) return;
    if (!tabVisible) { hidden.current = true; setStatus('paused'); } else if (hidden.current) { hidden.current = false; setStatus('loading'); setAnchor(Math.floor(anchor + played)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabVisible]);

  const position = anchor + played;
  const seek = (t) => setAnchor(Math.min(Math.floor(nowDvr()) - 10, Math.floor(t)));

  const motion = usePoll(`/api/motion/${camera.id}`, 10000);
  const { hits, ongoing } = useMemo(() => {
    const list = [];
    for (const event of motion.data?.events ?? []) {
      for (const [s, e] of event.hits ?? [[event.start, event.end]]) list.push([s, e ?? Math.max(s + 5, nowDvr())]);
    }
    return { hits: list.sort((a, b) => a[0] - b[0]), ongoing: (motion.data?.events ?? []).some((e) => e.end === null && e.start <= to + 60) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motion.data, to]);

  const upper = Math.min(nowDvr() - 5, Math.max(to, position + 30));
  const visible = hits.filter(([s, e]) => e >= from && s <= upper);
  const atNow = nowDvr() - position < 90;

  const toggle = () => {
    const el = video.current;
    if (!el) return;
    held.current = !el.paused;
    if (el.paused) el.play(); else el.pause();
    setPaused(held.current);
  };

  return (
    <VideoDialog
      label={`Gravação: ${camera.name}`}
      title={camera.name}
      sub={`Gravação do DVR · ${stamp(position)}`}
      onClose={close}
      actions={<Key center onClick={goLive}><Icon name="radio" />Ao vivo</Key>}
    >
      <div style={stageStyle}>
        <video
          ref={video}
          muted
          autoPlay
          playsInline
          aria-label={`Gravação de ${camera.name}`}
          style={mediaStyle}
          onTimeUpdate={(e) => {
            const t = e.currentTarget.currentTime;
            if (base.current === null) base.current = t;
            setPlayed(Math.max(0, t - base.current));
          }}
        />
        {status === 'paused' && <Overlay icon="refresh"><span>Gravação pausada enquanto a aba está oculta. Ela volta sozinha ao reabrir.</span></Overlay>}
        {status === 'loading' && <Overlay icon="refresh"><span>Buscando a gravação no DVR…</span></Overlay>}
        {status === 'failed' && <Overlay icon="warn"><span>{error || 'O DVR não entregou a gravação desse horário (pode não ter sido gravado).'}</span></Overlay>}
        {status === 'ended' && (
          <Overlay icon="refresh">
            <span>{atNow ? 'Você chegou ao momento atual da gravação.' : 'Fim deste trecho da gravação. Avance ou volte para continuar.'}</span>
            {atNow && <Key center signal onClick={goLive}><Icon name="radio" />Ver ao vivo</Key>}
          </Overlay>
        )}
        {status === 'unsupported' && <Overlay icon="warn"><span>Este navegador não toca a gravação. Use o Chrome, o Edge ou o Safari atualizado.</span></Overlay>}
      </div>
      {ongoing && status !== 'ended' && (
        <Key onClick={goLive}><Status kind="warn">Movimento ainda acontecendo</Status>Ver ao vivo</Key>
      )}
      <Timeline from={from} to={upper} now={position} hits={visible} seek={seek} />
      <div className="row" style={{ border: 0, padding: 0, justifyContent: 'center' }} role="group" aria-label="Controle da gravação">
        <Key center aria-label="Voltar 30 segundos" onClick={() => seek(position - 30)}><Icon name="left" size={18} />30 s</Key>
        <Key center signal={status === 'live'} aria-label={paused ? 'Continuar' : 'Pausar'} disabled={status !== 'live'} onClick={toggle} style={{ minWidth: 96 }}>{paused ? 'Continuar' : 'Pausar'}</Key>
        <Key center aria-label="Avançar 30 segundos" onClick={() => seek(position + 30)}>30 s<Icon name="right" size={18} /></Key>
      </div>
    </VideoDialog>
  );
}
