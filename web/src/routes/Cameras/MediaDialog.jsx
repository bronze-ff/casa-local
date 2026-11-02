import { useEffect, useRef } from 'react';
import { Icon } from '../../ui/Icon.jsx';

/**
 * Moldura de vídeo (ao vivo, replay, quadro): <dialog> nativo em showModal (camada superior da janela, Tab preso, Esc fecha).
 * O foco volta ao botão que abriu. O vídeo só existe enquanto a moldura está montada.
 */
export function MediaDialog({ label, title, sub, onClose, onKeyDown, actions, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    dialog?.showModal();
    return () => { if (dialog?.open) dialog.close(); if (opener?.isConnected) opener.focus?.(); };
  }, []);
  return (
    <dialog ref={ref} className="media-dialog" aria-label={label} onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={onKeyDown}>
      <div className="col">
        <div className="row wrap">
          <button type="button" className="btn s" onClick={onClose}><Icon name="back" />Voltar</button>
          <div className="grow col tight"><strong>{title}</strong><span className="sub">{sub}</span></div>
          {actions}
          <button type="button" className="ib" aria-label="Fechar" onClick={onClose}><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** Camada sobre o vídeo (carregando, erro, fim). */
export function StageNote({ icon, children }) {
  return <div role="status" className="stage-note"><Icon name={icon} size={26} />{children}</div>;
}
