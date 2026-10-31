import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { homeStore, useHomeStore } from './api.js';
import { resultNotice } from './homeStore.js';

/* Ícones de traço 24x24 (2 px, pontas redondas), herdam a cor do texto. Nomes e aliases antigos preservados (os de modo ficam gravados no servidor). */
const GLYPHS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  luz: 'M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.200 1 2.100h5c0-.9.4-1.600 1-2.100A6 6 0 0012 3z',
  ar: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5',
  tv: 'M4 5h16a1 1 0 011 1v11a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zM8 21h8',
  cam: 'M3 7h11a2 2 0 012 2v6a2 2 0 01-2 2H3zM16 11l5-3v8l-5-3',
  pin: 'M12 21s7-6.200 7-11a7 7 0 00-14 0c0 4.800 7 11 7 11zM12 12.500a2.500 2.500 0 100-5 2.500 2.500 0 000 5z',
  lab: 'M4 5h16v5H4zM4 14h16v5H4zM8 7.500h.01M8 16.500h.01',
  central: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M16 9h4M4 15h4M16 15h4',
  moon: 'M20 14.500A8.500 8.500 0 119.500 4a7 7 0 0010.500 10.500z',
  book: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19a2 2 0 012-2h13',
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.900 4.900l1.400 1.400M17.700 17.700l1.400 1.400M2 12h2M20 12h2M4.900 19.100l1.400-1.400M17.700 6.300l1.400-1.400',
  sofa: 'M5 11V8a3 3 0 013-3h8a3 3 0 013 3v3M3 14a2 2 0 014 0v2h10v-2a2 2 0 014 0v4H3zM6 18v2M18 18v2',
  coffee: 'M4 9h13v6a4 4 0 01-4 4H8a4 4 0 01-4-4zM17 10h1.500a2.500 2.500 0 010 5H17M8 3v3M12 3v3',
  bed: 'M3 19V6M3 15h18v4M21 15v-3a3 3 0 00-3-3h-8v6M7 11.500a1.500 1.500 0 100-3',
  power: 'M12 3v9M6.400 6.600a8 8 0 1011.200 0',
  bell: 'M6 17V11a6 6 0 0112 0v6l2 2H4zM10 21a2 2 0 004 0',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  ext: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  up: 'M5 15l7-7 7 7',
  refresh: 'M20 11a8 8 0 10-2.300 5.700M20 4v7h-7',
  radio: 'M5 12a7 7 0 0114 0M8 12a4 4 0 018 0M12 13v8M12 12h.01',
  door: 'M6 21V4a1 1 0 011-1h10a1 1 0 011 1v17M3 21h18M14 12h.01',
  fan: 'M12 12c0-4 1-8 4-8s3 4-4 8zM12 12c4 0 8 1 8 4s-4 3-8-4zM12 12c0 4-1 8-4 8s-3-4 4-8zM12 12c-4 0-8-1-8-4s4-3 8 4z',
  game: 'M7 8h10a5 5 0 015 5v1a3 3 0 01-5.200 2l-1.300-1.500h-5L8.200 16A3 3 0 013 14v-1a5 5 0 014-5zM8 11v3M6.500 12.500h3M16 12h.01M18 13.500h.01',
};
const ALIASES = { bulb: 'luz', camera: 'cam', server: 'lab', snow: 'ar', external: 'ext', warn: 'alert', next: 'back', left: 'back', right: 'back', down: 'up' };
const FLIP = { next: 'scaleX(-1)', right: 'scaleX(-1)', down: 'scaleY(-1)' };

export function Icon({ name, size = 20, label, style }) {
  const d = GLYPHS[name] || GLYPHS[ALIASES[name]] || GLYPHS.home;
  return (
    <span className="ic" style={{ '--icw': `${size}px`, ...style }} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={FLIP[name] ? { transform: FLIP[name] } : undefined}><path d={d} /></svg>
    </span>
  );
}

/** Gancho global opcional do clique sonoro (E5): Key e Switch chamam clickHook.fn?.() a cada acionamento aceito. */
export const clickHook = { fn: null };

/** Chave liga/desliga: input switch nativo (háptico no iOS 18). */
export function Switch({ on, onChange, label, disabled }) {
  return (
    <label className="hit">
      <input type="checkbox" className="sw" role="switch" switch="" aria-label={label} checked={!!on} disabled={disabled} onChange={(event) => { clickHook.fn?.(); onChange(event.target.checked); }} />
    </label>
  );
}

/** Grupo de escolha única. options: [[value, label, indisponível?], ...] */
export function Segmented({ value, options, onChange, label, disabled }) {
  const usable = options.filter(([, , unavailable]) => !unavailable);
  const stop = usable.some(([v]) => v === value) ? value : usable[0]?.[0]; // só uma opção entra na ordem do Tab
  // Setas movem a escolha entre as opções disponíveis (padrão ARIA de radiogroup).
  const onKeyDown = (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step || disabled || !usable.length) return;
    const next = usable[(Math.max(0, usable.findIndex(([v]) => v === stop)) + step + usable.length) % usable.length][0];
    if (next !== value) { clickHook.fn?.(); onChange(next); }
    event.currentTarget.querySelectorAll('button:not(:disabled)')[usable.findIndex(([v]) => v === next)]?.focus();
    event.preventDefault();
  };
  return (
    <div className="seg" role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map(([v, text, unavailable]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} tabIndex={v === stop ? 0 : -1} className={unavailable ? 'x' : ''} disabled={disabled || unavailable} onClick={() => { if (v !== value) { clickHook.fn?.(); onChange(v); } }}>{text}</button>
      ))}
    </div>
  );
}

/** Barra de pixels. signal: true pinta todo o preenchido de sinal; número pinta só aquele pixel (1 = primeiro). */
export function PixelBar({ value, max = 100, steps = 10, current, signal, small, onBody, className = '' }) {
  const filled = Math.max(0, Math.min(steps, Math.round(((Number(value) || 0) / max) * steps)));
  return (
    <div className={`px ${small ? 'sm' : ''} ${onBody ? 'on-body' : ''} ${className}`} aria-hidden="true">
      {Array.from({ length: steps }, (_, index) => {
        const n = index + 1;
        const kind = signal === true && n <= filled ? 's' : signal && n === signal ? 's' : current && n === current && n <= filled ? 'd' : n <= filled ? 'f' : '';
        return <i key={n} className={kind} />;
      })}
    </div>
  );
}

/** Medidor simples sobre o corpo (0-100 %). */
export function Bar({ pct, warn }) {
  return <PixelBar value={pct} max={100} steps={20} small onBody signal={warn ? true : undefined} />;
}

/** Controle deslizante de pixels: arrastar ou setas; Home/End vão aos extremos. */
export function PixelSlider({ value, min = 0, max = 100, step = 1, onChange, label, disabled, onBody }) {
  const ref = useRef();
  const cells = Math.max(2, Math.min(20, Math.round((max - min) / step) + 1));
  const unit = (max - min) / (cells - 1);
  const snap = (raw) => Math.max(min, Math.min(max, Math.round(min + Math.round((raw - min) / unit) * unit)));
  const at = (event) => {
    const box = ref.current.getBoundingClientRect();
    return snap(min + ((event.clientX - box.left) / box.width) * (max - min));
  };
  const index = Math.round(((Number(value) || min) - min) / unit);
  const move = (event) => { if (!disabled) onChange(at(event)); };
  const onKey = (event) => {
    const keys = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 };
    if (disabled) return;
    if (event.key in keys) onChange(Math.max(min, Math.min(max, (Number(value) || min) + keys[event.key] * step)));
    else if (event.key === 'Home') onChange(min);
    else if (event.key === 'End') onChange(max);
    else return;
    event.preventDefault();
  };
  return (
    <div ref={ref} className="pxs" role="slider" tabIndex={disabled ? -1 : 0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Number(value) || min} aria-disabled={!!disabled}
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); move(event); }}
      onPointerMove={(event) => { if (event.buttons) move(event); }} onKeyDown={onKey}>
      <PixelBar value={index + 1} max={cells} steps={cells} onBody={onBody} />
    </div>
  );
}

/* ===== Controles expressivos: dial (arco) e controle vertical =====
   O arrasto altera só o rascunho (a tela); o comando sai UMA vez, ao soltar (ou ao soltar a tecla). Nunca por quadro. */
const SWEEP = 270; const START = 135;
export const progressToAngle = (progress) => START + SWEEP * Math.max(0, Math.min(1, progress));
/** Ângulo (graus, horário a partir de +x) -> progresso 0..1; a zona morta embaixo cai na extremidade mais próxima. */
export function angleToProgress(angle) {
  const rel = (((angle - START) % 360) + 360) % 360;
  if (rel <= SWEEP) return rel / SWEEP;
  return rel - SWEEP < (360 - SWEEP) / 2 ? 1 : 0;
}
/** Controlador puro do dial: `values` limita ao que existe (cobertura IR esparsa nunca vira temperatura sem sinal). */
export function dialController({ min, max, values, onCommit }) {
  const list = values?.length ? [...values].sort((a, b) => a - b) : Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const nearest = (raw) => list.reduce((best, v) => (Math.abs(v - raw) < Math.abs(best - raw) ? v : best), list[0]);
  let first = null; let current = null;
  return {
    start(value) { first = value; current = value; },
    move(progress) { current = nearest(min + Math.max(0, Math.min(1, progress)) * (max - min)); return current; },
    key(direction) {
      if (direction === 'home') current = list[0];
      else if (direction === 'end') current = list[list.length - 1];
      else current = list[Math.max(0, Math.min(list.length - 1, list.indexOf(nearest(current ?? list[0])) + direction))];
      return current;
    },
    draft: () => current,
    release() {
      if (current == null || current === first) return null;
      const value = current;
      first = value;
      onCommit(value);
      return value;
    },
  };
}

/** Dial: arco SVG de 270°, polegar arrastável e teclado. render(valor) desenha o número central. */
export function Dial({ value, min, max, values, label, disabled, onCommit, render, unit = '' }) {
  const [drag, setDrag] = useState(null);
  const box = useRef(null);
  const commit = useRef(null);
  commit.current = (v) => { Promise.resolve(onCommit(v)).finally(() => setDrag(null)); };
  const ctl = useMemo(() => dialController({ min, max, values, onCommit: (v) => commit.current(v) }), [min, max, values ? values.join(',') : '']); // estável durante o arrasto
  const known = value != null && Number.isFinite(Number(value));
  const shown = drag ?? (known ? Number(value) : min);
  const progress = (shown - min) / (max - min);
  const angle = (progressToAngle(progress) * Math.PI) / 180;
  const tx = 100 + 80 * Math.cos(angle); const ty = 100 + 80 * Math.sin(angle);
  const fromPointer = (event) => {
    const rect = box.current.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2); const dy = event.clientY - (rect.top + rect.height / 2);
    return angleToProgress((Math.atan2(dy, dx) * 180) / Math.PI);
  };
  const begin = () => { if (drag == null) ctl.start(known ? Number(value) : min); };
  const onKeyDown = (event) => {
    const map = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, Home: 'home', End: 'end' };
    if (disabled || !(event.key in map)) return;
    event.preventDefault();
    begin();
    setDrag(ctl.key(map[event.key]));
  };
  const finish = () => { if (ctl.release() == null) setDrag(null); };
  return (
    <div ref={box} className="dial" role="slider" tabIndex={disabled ? -1 : 0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={known ? shown : undefined} aria-valuetext={known ? `${shown}${unit}` : 'desconhecido'} aria-disabled={!!disabled}
      onKeyDown={onKeyDown} onKeyUp={(event) => { if (!disabled && (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End')) finish(); }}
      onPointerDown={(event) => { if (disabled) return; event.currentTarget.setPointerCapture(event.pointerId); ctl.start(known ? Number(value) : min); setDrag(ctl.move(fromPointer(event))); }}
      onPointerMove={(event) => { if (!disabled && event.buttons) setDrag(ctl.move(fromPointer(event))); }}
      onPointerUp={() => { if (!disabled) finish(); }} onPointerCancel={() => setDrag(null)}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <defs><linearGradient id="dialgrad" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="var(--cool)" /><stop offset="1" stopColor="var(--warm)" /></linearGradient></defs>
        <path className="trk" d="M43.43 156.57 A80 80 0 1 1 156.57 156.57" pathLength="100" />
        {known && <path className="val" d="M43.43 156.57 A80 80 0 1 1 156.57 156.57" pathLength="100" strokeDasharray={`${Math.round(progress * 1000) / 10} 100`} />}
        <circle className="thumb-d" r="13" cx="0" cy="0" style={{ transform: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px)` }} />
      </svg>
      <div className="dial-read">{render(known || drag != null ? shown : null)}</div>
    </div>
  );
}

/** Controle vertical (brilho): arrasto altera só o rascunho do pai (onChange); quem aplica é o botão Aplicar. */
export function VSlider({ value, min = 10, max = 100, step = 10, label, disabled, onChange }) {
  const ref = useRef(null);
  const clamp = (raw) => Math.max(min, Math.min(max, Math.round(raw / step) * step));
  const at = (event) => {
    const rect = ref.current.getBoundingClientRect();
    return clamp(min + (1 - (event.clientY - rect.top) / rect.height) * (max - min));
  };
  const onKey = (event) => {
    const keys = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step };
    if (disabled) return;
    if (event.key in keys) onChange(clamp((Number(value) || min) + keys[event.key]));
    else if (event.key === 'Home') onChange(min);
    else if (event.key === 'End') onChange(max);
    else return;
    event.preventDefault();
  };
  const k = (((Number(value) || min) - min) / (max - min));
  return (
    <div ref={ref} className="vslider" role="slider" tabIndex={disabled ? -1 : 0} aria-orientation="vertical" aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Number(value) || min} aria-disabled={!!disabled}
      onPointerDown={(event) => { if (disabled) return; event.currentTarget.setPointerCapture(event.pointerId); onChange(at(event)); }}
      onPointerMove={(event) => { if (!disabled && event.buttons) onChange(at(event)); }} onKeyDown={onKey}>
      <div className="fillv" style={{ '--k': k }} />
    </div>
  );
}

export function Spark({ values = [], hi = Infinity, className = '' }) {
  const top = Math.max(...values, Number.isFinite(hi) ? hi : 0, 1);
  return (
    <div className={`spark ${className}`} aria-hidden="true">
      {values.map((v, index) => <i key={index} className={v >= hi ? 'hi' : ''} style={{ height: `${Math.round(((Number(v) || 0) / top) * 100)}%` }} />)}
    </div>
  );
}

/** Teclas físicas. disabled mostra o motivo (reason) em texto; loading troca o texto pela barra marchando. */
export function Key({ children, sub, on, big, signal, loading, center, disabled, reason, className = '', onClick, ...button }) {
  const cls = ['key', big && 'big', signal && 'sig', center && 'c', on && 'is-on', loading && 'is-load', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} disabled={disabled} aria-busy={loading || undefined} aria-pressed={on === undefined ? undefined : !!on}
      onClick={loading ? undefined : (event) => { clickHook.fn?.(); onClick?.(event); }} {...button}>
      {children}
      {sub && <small>{sub}</small>}
      {disabled && reason && <span className="why">{reason}</span>}
    </button>
  );
}

export function Lcd({ children, className = '', ...rest }) {
  return <div className={`lcd ${className}`} {...rest}>{children}</div>;
}

const DOT_SIZES = [20, 34, 64, 150];
/** Número ou palavra curta em sans de números grandes (só em 20, 34, 64 ou 150 px; a Doto de pixel foi superada). */
export function Dot({ children, size = 34, style, className = '' }) {
  const px = DOT_SIZES.includes(size) ? size : 34;
  const timed = typeof children === 'string' && children.includes(':');
  return (
    <span className={`dot ${className}`} style={{ fontSize: px, lineHeight: px >= 64 ? 0.85 : 1, ...style }} role={timed ? 'img' : undefined} aria-label={timed ? children : undefined}>
      {timed ? children.split(':').flatMap((part, index) => (index ? [<i key={`c${index}`} className="dc" aria-hidden="true" />, part] : [part])) : children}
    </span>
  );
}

/* Confiança no estado: vem do backend; o estado do COMANDO (store por físico) a refina, sem timer e sem updatedAt. */
const KINDS = { reported: 'reported', estimated: 'estimated', preview: 'preview' };
/** pending = enviando; sent/unknown = aceito sem prova ou inconclusivo; diverged = leitura contrária ao pedido. Confirmado/erro/prévia usam a confiança do backend. */
const COMMAND_KIND = { pending: 'pending', sent: 'sent', unknown: 'sent', diverged: 'diverged' };
export function confidenceOf(device, command) {
  if (!device) return 'unknown';
  return COMMAND_KIND[command?.phase] || KINDS[device.confidence] || 'unknown';
}
export function useConfidence(device) {
  useHomeStore();
  return confidenceOf(device, device ? homeStore.commandFor(device.id) : null);
}

const CONFIDENCE = {
  reported: ['rep', 'Confirmado'], pending: ['env', 'Enviando…'], sent: ['env', 'Enviado · sem retorno'], diverged: ['unk', 'Divergente'], estimated: ['est', 'Estimado'], preview: ['sim', 'Simulado'], unknown: ['unk', 'Desconhecido'],
};
/** Estado de serviço ou conexão: quadrado + texto (a cor nunca é o único sinal). */
export function Status({ kind = 'off', children }) {
  return <span className={`st ${kind}`}>{children}</span>;
}

/** Selo "Novo" / "Movimento". */
export function Badge({ children }) {
  return <span className="tag">{children}</span>;
}

export function Confidence({ kind, children }) {
  const [cls, text] = CONFIDENCE[kind] || CONFIDENCE.unknown;
  return <span className={`cf ${cls}`}>{text}{children ? <> {children}</> : null}</span>;
}

/** Cartão de aparelho: nome, valor em Doto, confiança. sim = hachura azul (prévia). */
export function Tile({ name, value, off, sim, confidence, aside, children }) {
  return (
    <div className={`tile ${sim ? 'sim' : ''}`}>
      <div className="row"><span className="n">{name}</span>{aside}</div>
      <span className={`v dot ${off ? 'off' : ''}`}>{value}</span>
      {children}
      {confidence && <Confidence kind={confidence} />}
    </div>
  );
}

export function Card({ title, aside, children, className = '', ...rest }) {
  return (
    <section className={`mod ${className}`} {...rest}>
      {(title || aside) && <div className="mod-head">{title && <h2>{title}</h2>}{aside}</div>}
      {children}
    </section>
  );
}

export function Stale({ poll, what = 'dados' }) {
  if (!poll.error) return null;
  const when = poll.at ? new Date(poll.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <div className="aviso err" role="status">
      <Icon name="alert" size={20} />
      <span>{poll.data ? `Mostrando ${what} de ${when}: ${poll.error.message}` : poll.error.message}</span>
      <button type="button" className="act" onClick={poll.reload}>Tentar de novo</button>
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

/** Ação com POST: mostra erro no toast e devolve o resultado (ou null). Aparelho e modo passam pela store (exclusão por físico); o resto mantém busy local. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (path, body, okText) => {
    setBusy(true);
    try {
      const result = await homeStore.run(path, body);
      const notice = resultNotice(path, result);
      if (notice.kind === 'warn') toast(notice.text, 'warn');
      else if (okText) toast(okText);
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

/** Bottom sheet nativo (dialog): Esc fecha, foco fica contido e volta ao botão que abriu. O conteúdo fica na árvore mesmo fechado. */
export function Sheet({ open, onClose, title, children }) {
  const ref = useRef();
  const opener = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) { opener.current = document.activeElement; el.showModal(); }
    if (!open && el.open) { el.close(); opener.current?.focus?.(); opener.current = null; }
  }, [open]);
  return (
    <dialog ref={ref} className="sheet" onClose={() => { opener.current?.focus?.(); onClose(); }} aria-label={title}
      onClick={(event) => { if (event.target === ref.current) onClose(); }}>
      <div className="sheet-handle" aria-hidden="true" />
      <div className="mod-head" style={{ marginBottom: 12 }}>
        <h2>{title}</h2>
        <Key center aria-label="Fechar" onClick={onClose} style={{ minWidth: 44 }}><Icon name="close" /></Key>
      </div>
      <div className="stack" style={{ gap: 12 }}>{children}</div>
    </dialog>
  );
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
      <div className="mod-head" style={{ marginBottom: 14 }}>
        <h2>{title}</h2>
        <Key center aria-label="Fechar" onClick={onClose} style={{ minWidth: 44 }}><Icon name="close" /></Key>
      </div>
      {open && children}
    </dialog>
  );
}
