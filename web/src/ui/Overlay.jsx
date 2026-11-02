import { useEffect, useId, useRef } from 'react';
import { Icon } from './Icon.jsx';
import { FOCUSABLE, pickInitialFocus } from './focus.js';

/**
 * Janela sobre a tela: <dialog> nativo em showModal(). O navegador põe o diálogo na camada superior da JANELA (não da prancha),
 * prende o Tab, inertiza o fundo e fecha com Esc. Aqui ficam o foco inicial e a volta do foco ao botão que abriu.
 * kind: 'dialog' (centro) | 'sheet' (celular: sobe da base; acima disso vira diálogo) | 'panel' (≥1100 px: lateral).
 * O conteúdo só existe enquanto aberto; fechado, nada fica na ordem de Tab.
 */
export function Overlay({ open, onClose, title, kind = 'dialog', footer, children }) {
  const ref = useRef(null);
  const opener = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      dialog.showModal();
      (pickInitialFocus([...dialog.querySelectorAll(FOCUSABLE)]) || dialog).focus?.();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => () => { if (ref.current?.open) ref.current.close(); }, []);

  const restoreFocus = () => { const el = opener.current; opener.current = null; if (el?.isConnected) el.focus?.(); };

  return (
    <dialog ref={ref} className={`ov ov-${kind}`} aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClose={restoreFocus}
      onClick={(event) => { if (event.target === ref.current) onClose(); }}>
      {open && (
        <div className="ov-box">
          <div className="ov-head">
            <h2 id={titleId} className="h2">{title}</h2>
            <button type="button" className="ib" data-close="true" aria-label="Fechar" onClick={onClose}><Icon name="close" /></button>
          </div>
          <div className="ov-body">{children}</div>
          {footer && <div className="ov-foot">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
