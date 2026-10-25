import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../ui.jsx';
import { attachMse, mseSupported } from './mse.js';
import { Overlay, VideoDialog, mediaStyle, stageStyle } from './VideoDialog.jsx';

const BLANK = 'data:,';

/** Ao vivo: MSE por WebSocket; se falhar (ou o navegador não tiver MSE), cai para MJPEG. */
export default function Live({ cameras, index, poster, move, close, rewind }) {
  const cam = cameras[index];
  const video = useRef();
  const img = useRef();
  const touch = useRef(null);
  const [status, setStatus] = useState('loading');
  const [mjpeg, setMjpeg] = useState(!mseSupported);

  useEffect(() => { setStatus('loading'); setMjpeg(!mseSupported); }, [cam.id]);

  useEffect(() => {
    if (!mjpeg && video.current) return attachMse(video.current, `/api/cameras/${cam.id}/ws`, () => setStatus('live'), () => setMjpeg(true));
  }, [cam.id, mjpeg]);

  // O <img> do MJPEG precisa ser esvaziado ao sair, senão o navegador mantém a conexão aberta.
  useEffect(() => {
    const el = img.current;
    if (mjpeg && el) {
      el.src = `/api/cameras/${cam.id}/live.mjpeg`;
      return () => { el.src = BLANK; };
    }
  }, [cam.id, mjpeg]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'ArrowLeft') move(-1); if (e.key === 'ArrowRight') move(1); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move]);

  const onTouchEnd = (e) => {
    const from = touch.current;
    touch.current = null;
    if (!from) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - from.x;
    const dy = t.clientY - from.y;
    if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.4) close();
    else if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.4) move(dx < 0 ? 1 : -1);
  };

  const state = status === 'live' ? 'Ao vivo' : status === 'failed' ? 'Sem sinal' : 'Conectando';
  return (
    <VideoDialog
      label={`Ao vivo: ${cam.name}`}
      title={cam.name}
      sub={`Canal ${cam.id.replace('cam', '')}`}
      onClose={close}
      actions={(
        <>
          <span className="pill"><span className={`dot ${status === 'live' ? '' : 'warn'}`} />{state}</span>
          <button type="button" className="btn" onClick={() => rewind(cam)}><Icon name="refresh" />Rever 1 min</button>
        </>
      )}
    >
      <div style={stageStyle} onTouchStart={(e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; }} onTouchEnd={onTouchEnd}>
        {poster && status !== 'live' && <img src={poster} alt="" style={mediaStyle} />}
        {mjpeg ? (
          <img ref={img} src={BLANK} alt={`Imagem ao vivo: ${cam.name}`} style={{ ...mediaStyle, position: 'absolute', inset: 0 }}
            onLoad={(e) => { if (!e.currentTarget.src.startsWith('data:')) setStatus('live'); }}
            onError={(e) => { if (!e.currentTarget.src.startsWith('data:')) setStatus('failed'); }} />
        ) : (
          <video ref={video} muted autoPlay playsInline aria-label={`Vídeo ao vivo: ${cam.name}`} style={{ ...mediaStyle, position: 'absolute', inset: 0 }} />
        )}
        {status === 'loading' && <Overlay icon="refresh"><span>Carregando…</span></Overlay>}
        {status === 'failed' && <Overlay icon="warn"><span>A transmissão não abriu. Tente de novo em instantes.</span></Overlay>}
      </div>
      <div className="row" style={{ border: 0, padding: 0 }}>
        <button type="button" className="btn" aria-label="Câmera anterior" onClick={() => move(-1)}><Icon name="left" />Anterior</button>
        <button type="button" className="btn" aria-label="Próxima câmera" onClick={() => move(1)}>Próxima<Icon name="right" /></button>
      </div>
    </VideoDialog>
  );
}
