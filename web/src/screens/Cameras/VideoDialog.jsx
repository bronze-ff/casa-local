import { useEffect, useRef } from 'react';
import { Icon } from '../../ui.jsx';

/** Moldura de tela cheia para vídeo (ao vivo e replay): barra de título + palco. */
export function VideoDialog({ label, title, sub, onClose, actions, children }) {
  const ref = useRef();
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog ref={ref} aria-label={label} onCancel={(e) => { e.preventDefault(); onClose(); }} style={{ width: 'min(1000px, calc(100vw - 16px))', padding: 12 }}>
      <div className="stack" style={{ gap: 10 }}>
        <div className="row" style={{ padding: 0, border: 0, flexWrap: 'wrap' }}>
          <button type="button" className="btn ghost" onClick={onClose}><Icon name="back" />Voltar</button>
          <div className="stack" style={{ flex: 1, minWidth: 120 }}>
            <strong style={{ fontSize: 16 }}>{title}</strong>
            <span className="small muted">{sub}</span>
          </div>
          {actions}
          <button type="button" className="btn ghost" aria-label="Fechar" onClick={onClose} style={{ minWidth: 44, padding: 0 }}><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** Camada centralizada sobre o vídeo (carregando, erro, fim). */
export function Overlay({ icon, children }) {
  return (
    <div role="status" style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', justifyItems: 'center', gap: 10, padding: 16, textAlign: 'center', background: 'rgba(0,0,0,.55)', color: 'var(--text-2)' }}>
      <Icon name={icon} size={26} />
      {children}
    </div>
  );
}

export const stageStyle = { position: 'relative', background: '#000', borderRadius: 12, overflow: 'hidden', aspectRatio: '16 / 9', maxHeight: '62dvh', width: '100%', margin: '0 auto' };
export const mediaStyle = { width: '100%', height: '100%', objectFit: 'contain', display: 'block' };
