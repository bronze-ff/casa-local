import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { post } from './api.js';

/* Ícones de traço (sem emoji), herdam a cor do texto. */
const PATHS = {
  home: 'M3 11 12 4l9 7v9H3z',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  camera: 'M3 8a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 10l5-3v10l-5-3',
  server: 'M4 4h16v7H4zM4 13h16v7H4zM8 7.5h.01M8 16.5h.01',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0',
  snow: 'M12 2v20M4.9 6.5l14.2 11M4.9 17.5l14.2-11M9 4l3 2 3-2M9 20l3-2 3 2',
  tv: 'M3 6h18v12H3zM8 21h8',
  pin: 'M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  power: 'M12 3v9M6.3 7.3a8 8 0 1 0 11.4 0',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  back: 'M15 5l-7 7 7 7',
  next: 'm9 6 6 6-6 6',
  up: 'm6 15 6-6 6 6',
  down: 'm6 9 6 6 6-6',
  left: 'm15 6-6 6 6 6',
  right: 'm9 6 6 6-6 6',
  close: 'M6 6l12 12M18 6 6 18',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  warn: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  radio: 'M5 12a7 7 0 0 1 14 0M8.5 12a3.5 3.5 0 0 1 7 0M12 12h.01',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  door: 'M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17M3 21h18M15 12h.01',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  fan: 'M12 12c0-4 2-8 5-8 2 0 3 2 1 4l-6 4zm0 0c4 0 8 2 8 5 0 2-2 3-4 1l-4-6zm0 0c0 4-2 8-5 8-2 0-3-2-1-4l6-4zm0 0c-4 0-8-2-8-5 0-2 2-3 4-1l4 6z',
  game: 'M6 10h4M8 8v4M15 11h.01M18 9h.01M7 5h10a4 4 0 0 1 4 4v6a3 3 0 0 1-5.5 1.7L14 15h-4l-1.5 1.7A3 3 0 0 1 3 15V9a4 4 0 0 1 4-4z',
};

export function Icon({ name, size = 20, label, style }) {
  const d = PATHS[name] || PATHS.home;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={style}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      {d.split(/(?=M)/).map((part, i) => <path key={i} d={part} />)}
    </svg>
  );
}

export function Switch({ on, onChange, label, disabled }) {
  return (
    <button type="button" className="switch" role="switch" aria-checked={!!on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

/** Grupo de escolha única. options: [[value, label], ...] */
export function Segmented({ value, options, onChange, label, disabled }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} disabled={disabled} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

export function Bar({ pct, warn }) {
  const width = Math.max(0, Math.min(100, Number(pct) || 0));
  return <div className="bar"><span className={warn ? 'warn' : ''} style={{ width: `${width}%` }} /></div>;
}

export function Card({ title, aside, children, className = '', ...rest }) {
  return (
    <section className={`card entra ${className}`} {...rest}>
      {(title || aside) && <div className="card-head">{title && <h2>{title}</h2>}{aside}</div>}
      {children}
    </section>
  );
}

export function Stale({ poll, what = 'dados' }) {
  if (!poll.error) return null;
  return (
    <div className="notice" role="status">
      <Icon name="warn" size={18} style={{ color: 'var(--accent)', flex: 'none', marginTop: 2 }} />
      <span style={{ flex: 1 }}>{poll.data ? `Mostrando ${what} de ${new Date(poll.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}: ${poll.error.message}` : poll.error.message}</span>
      <button type="button" className="btn ghost" style={{ minHeight: 32 }} onClick={poll.reload}>Tentar de novo</button>
    </div>
  );
}

/* Avisos curtos na tela (sucesso ou erro de uma ação). */
const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const show = useCallback((text, kind = 'ok') => {
    clearTimeout(timer.current);
    setToast({ text, kind });
    timer.current = setTimeout(() => setToast(null), kind === 'error' ? 5000 : 2500);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>{toast.text}</div>}
    </ToastContext.Provider>
  );
}

/** Ação com POST: mostra erro no toast e devolve o resultado (ou null). */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (path, body, okText) => {
    setBusy(true);
    try {
      const result = await post(path, body);
      if (okText) toast(okText);
      return result;
    } catch (error) {
      toast(error.message, 'error');
      return null;
    } finally {
      setBusy(false);
    }
  }, [toast]);
  return [run, busy];
}

/** Diálogo nativo (fecha com Esc, prende o foco). */
export function Modal({ open, onClose, title, children }) {
  const ref = useRef();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-label={title}>
      <div className="card-head" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 20 }}>{title}</h2>
        <button type="button" className="btn ghost" aria-label="Fechar" onClick={onClose} style={{ minWidth: 44 }}><Icon name="close" /></button>
      </div>
      {open && children}
    </dialog>
  );
}
