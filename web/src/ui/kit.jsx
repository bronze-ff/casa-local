import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { CONFIDENCE, phaseView } from './confidence.js';

/** Botão. `reason` explica por que está desabilitado (lido por leitor de tela). `busy` não repete o clique. */
export function Button({ variant = 's', icon, busy = false, disabled = false, reason, className = '', children, onClick, type = 'button', ...rest }) {
  const why = useId();
  const off = disabled || busy;
  return (
    <button type={type} className={`btn ${variant} ${busy ? 'busy' : ''} ${className}`} disabled={off && !busy ? true : undefined} aria-disabled={off || undefined}
      aria-describedby={off && reason ? why : undefined} aria-busy={busy || undefined} onClick={off ? undefined : onClick} {...rest}>
      {icon && <Icon name={icon} />}{children}
      {off && reason && <span id={why} className="sr-only">{reason}</span>}
    </button>
  );
}

export function IconButton({ icon, label, size = 20, className = '', ...rest }) {
  return <button type="button" className={`ib ${className}`} aria-label={label} {...rest}><Icon name={icon} size={size} /></button>;
}

export function Chip({ pressed, children, className = '', ...rest }) {
  return <button type="button" className={`chip ${className}`} aria-pressed={pressed ? 'true' : 'false'} {...rest}>{children}</button>;
}

/** Interruptor: botão com role="switch"; o texto faz parte do alvo de 44 px. */
export function Switch({ on, onChange, label, disabled, children }) {
  return (
    <button type="button" role="switch" className="sw" aria-checked={on ? 'true' : 'false'} aria-label={children ? undefined : label} disabled={disabled} onClick={() => onChange?.(!on)}>
      <span className="t" aria-hidden="true" />{children}
    </button>
  );
}

/** Segmentado: só a opção atual entra no Tab (roving tabindex); setas movem a seleção; indisponível nunca recebe foco. */
export function Segmented({ value, options, onChange, label, disabled }) {
  const refs = useRef([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const move = (from, step) => {
    const at = enabled.indexOf(from);
    const next = enabled[(at + step + enabled.length) % enabled.length];
    onChange?.(options[next].value);
    refs.current[next]?.focus();
  };
  const onKey = (event, index) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); move(index, 1); }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); move(index, -1); }
    else if (event.key === 'Home') { event.preventDefault(); onChange?.(options[enabled[0]].value); refs.current[enabled[0]]?.focus(); }
    else if (event.key === 'End') { event.preventDefault(); const last = enabled[enabled.length - 1]; onChange?.(options[last].value); refs.current[last]?.focus(); }
  };
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button key={o.value} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={on ? 'true' : 'false'} tabIndex={on ? 0 : -1}
            disabled={disabled || o.disabled} onClick={() => onChange?.(o.value)} onKeyDown={(e) => onKey(e, i)}>{o.label}</button>
        );
      })}
    </div>
  );
}

/** Régua nativa: só informa o valor ao pai; quem decide quando enviar é o componente de cima. */
export function Slider({ value, min = 0, max = 100, step = 1, label, onChange, onRelease, disabled }) {
  return (
    <input className="rng" type="range" min={min} max={max} step={step} value={value ?? min} aria-label={label} disabled={disabled}
      onChange={(event) => onChange?.(Number(event.target.value))}
      onPointerUp={() => onRelease?.()} onKeyUp={(event) => { if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') onRelease?.(); }} />
  );
}

/** Estado de serviço ou conexão: ponto + texto (a cor nunca é o único sinal). */
export function Status({ kind = 'off', children }) {
  return <span className={`st ${kind}`}><i className="dot" aria-hidden="true" />{children}</span>;
}

/** Selo de confiança do estado de um aparelho. */
export function Confidence({ kind, children }) {
  const [cls, text] = CONFIDENCE[kind] || CONFIDENCE.unknown;
  return <span className={`cf ${cls}`}><i className="dot" aria-hidden="true" />{text}{children ? <> {children}</> : null}</span>;
}

/** Fase do último comando do aparelho (ou nada, se não há comando). */
export function CommandState({ command }) {
  const view = phaseView(command);
  if (!view) return null;
  return <span className={`st ${view.cls}`} role={command.phase === 'error' ? 'alert' : 'status'} title={view.hint}><i className="dot" aria-hidden="true" />{view.label}</span>;
}

export function Banner({ kind = '', icon, title, children, action }) {
  return (
    <div className={`ban ${kind}`} role={kind === 'err' ? 'alert' : 'status'}>
      {icon && <Icon name={icon} size={22} />}
      <div className="grow">{title && <b>{title}</b>}{children}</div>
      {action}
    </div>
  );
}

export function Empty({ title, children, action }) {
  return <div className="empty"><b>{title}</b>{children && <p className="sub">{children}</p>}{action}</div>;
}

/** Esqueleto estático com o mesmo recorte do conteúdo: sem brilho em loop. */
export function Skeleton({ height = 16, width = '100%', radius }) {
  return <span className="sk" aria-hidden="true" style={{ height, width, borderRadius: radius }} />;
}

export const SimTag = ({ children = 'Simulado' }) => <span className="sim-tag"><Icon name="eye" size={14} />{children}</span>;

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const show = useCallback((text, kind = 'ok') => {
    clearTimeout(timer.current);
    setToast({ text, kind });
    timer.current = setTimeout(() => setToast(null), kind === 'error' ? 6000 : 3000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>{toast.text}</div>}
    </ToastContext.Provider>
  );
}
