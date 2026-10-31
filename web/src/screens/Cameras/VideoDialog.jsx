import { useEffect, useRef } from 'react';
import { Icon, Key } from '../../ui.jsx';

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
          <Key center onClick={onClose}><Icon name="back" />Voltar</Key>
          <div className="stack" style={{ flex: 1, minWidth: 120 }}>
            <strong style={{ fontSize: 14 }}>{title}</strong>
            <span className="small muted">{sub}</span>
          </div>
          {actions}
          <Key center aria-label="Fechar" onClick={onClose} style={{ minWidth: 44, padding: 0 }}><Icon name="close" /></Key>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** Camada centralizada sobre o vídeo (carregando, erro, fim). */
export function Overlay({ icon, children }) {
  return (
    <div role="status" style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', justifyItems: 'center', gap: 10, padding: 16, textAlign: 'center', background: 'rgba(0,0,0,.55)', color: 'var(--lcd-fg)' }}>
      <Icon name={icon} size={26} />
      {children}
    </div>
  );
}

export const stageStyle = { position: 'relative', background: '#000', borderRadius: 'var(--r-tecla)', overflow: 'hidden', aspectRatio: '16 / 9', maxHeight: '54dvh', width: '100%', margin: '0 auto' };
export const mediaStyle = { width: '100%', height: '100%', objectFit: 'contain', display: 'block' };
