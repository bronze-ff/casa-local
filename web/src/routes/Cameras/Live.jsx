import { useRef, useState } from 'react';
import { useVisible } from '../../core/hooks.js';
import { Icon } from '../../ui/Icon.jsx';
import { Button, Status } from '../../ui/kit.jsx';
import { MediaControls } from './MediaControls.jsx';
import { MediaDialog, StageNote } from './MediaDialog.jsx';
import { startMuted } from './media.js';
import { attachMse, mseSupported } from './mse.js';
import { useMediaGate } from './useMedia.js';

const BLANK = 'data:,';

/** Ao vivo: MSE por WebSocket; se falhar (ou o navegador não tiver MSE), cai para MJPEG. Aba oculta fecha tudo. */
export function Live({ cameras, index, poster, move, close, rewind }) {
  const cam = cameras[index];
  const video = useRef(null);
  const img = useRef(null);
  const touch = useRef(null);
  const stage = useRef(null);
  const [state, setState] = useState(() => ({ cam: cam.id, status: 'loading', mjpeg: !mseSupported() }));
  // Trocar de câmera recomeça do zero (sem efeito: o estado carrega a câmera a que pertence).
  const fresh = (id) => ({ cam: id, status: 'loading', mjpeg: !mseSupported() });
  const set = (patch) => setState((old) => ({ ...(old.cam === cam.id ? old : fresh(cam.id)), ...patch })); // atualização funcional: nunca sobrescreve um patch mais novo
  const visible = useVisible();
  const current = state.cam === cam.id ? state : { cam: cam.id, status: 'loading', mjpeg: !mseSupported() };

  useMediaGate(`${cam.id}|${current.mjpeg ? 'mjpeg' : 'mse'}`, (key) => {
    const [id, how] = key.split('|');
    set({ status: 'loading' });
    if (how === 'mjpeg') {
      const el = img.current;
      if (!el) return undefined;
      el.src = `/api/cameras/${id}/live.mjpeg`;
      return () => { el.src = BLANK; };
    }
    startMuted(video.current); // cada stream nasce mudo, também ao reabrir a mesma câmera
    if (video.current) return attachMse(video.current, `/api/cameras/${id}/ws`, () => set({ status: 'live' }), () => set({ mjpeg: true }));
    return undefined;
  });

  const onKeyDown = (event) => { if (event.key === 'ArrowLeft') move(-1); else if (event.key === 'ArrowRight') move(1); };
  const onTouchEnd = (event) => {
    const from = touch.current; touch.current = null;
    if (!from) return;
    const t = event.changedTouches[0];
    const dx = t.clientX - from.x; const dy = t.clientY - from.y;
    if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.4) close();
    else if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.4) move(dx < 0 ? 1 : -1);
  };
  const label = !visible ? 'Pausado (aba oculta)' : current.status === 'live' ? 'Ao vivo' : current.status === 'failed' ? 'Sem sinal' : 'Conectando';
  return (
    <MediaDialog label={`Ao vivo: ${cam.name}`} title={cam.name} sub={`Canal ${cam.id.replace('cam', '')}`} onClose={close} onKeyDown={onKeyDown}
      actions={<><Status kind={visible && current.status === 'live' ? 'ok' : current.status === 'failed' ? 'err' : 'part'}>{label}</Status><Button variant="s" icon="refresh" onClick={() => rewind(cam)}>Rever 1 min</Button></>}>
      <div ref={stage} className="stage" onTouchStart={(e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; }} onTouchEnd={onTouchEnd}>
        {poster && current.status !== 'live' && <img className="media" src={poster} alt="" />}
        {current.mjpeg ? (
          <img ref={img} className="media over" src={BLANK} alt={`Imagem ao vivo: ${cam.name}`}
            onLoad={(e) => { if (!e.currentTarget.src.startsWith('data:')) set({ status: 'live' }); }}
            onError={(e) => { if (!e.currentTarget.src.startsWith('data:')) set({ status: 'failed' }); }} />
        ) : <video ref={video} className="media over" muted autoPlay playsInline aria-label={`Vídeo ao vivo: ${cam.name}`} />}
        {current.status === 'loading' && <StageNote icon="refresh"><span>Carregando…</span></StageNote>}
        {current.status === 'failed' && <StageNote icon="alert"><span>A transmissão não abriu. Tente de novo em instantes.</span></StageNote>}
      </div>
      <MediaControls key={`${cam.id}|${current.mjpeg ? 'mjpeg' : 'mse'}`} video={video} stage={stage} sound={!current.mjpeg} />
      <div className="row">
        <Button variant="s" className="grow" aria-label="Câmera anterior" disabled={cameras.length < 2} reason="Há só uma câmera." onClick={() => move(-1)}><Icon name="back" />Anterior</Button>
        <Button variant="s" className="grow" aria-label="Próxima câmera" disabled={cameras.length < 2} reason="Há só uma câmera." onClick={() => move(1)}>Próxima<Icon name="next" /></Button>
      </div>
    </MediaDialog>
  );
}

/** Bandeja: sem WebSocket nem MJPEG, só um quadro ampliado (o ao vivo abre no navegador). */
export function FrameView({ title, sub, src, close }) {
  const [broken, setBroken] = useState(false);
  return (
    <MediaDialog label={`Quadro: ${title}`} title={title} sub={sub} onClose={close}>
      <div className="stage">{src && !broken ? <img className="media" src={src} alt={`Quadro de ${title}`} onError={() => setBroken(true)} /> : <StageNote icon="alert"><span>Sem imagem.</span></StageNote>}</div>
      <p className="hint">Para ver ao vivo, use “Abrir no navegador” no topo da bandeja.</p>
    </MediaDialog>
  );
}
