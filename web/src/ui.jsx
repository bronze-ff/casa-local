import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { homeStore, useHomeStore } from './api.js';
import { resultNotice } from './homeStore.js';

/* Ícones de pixel 12x12 (pixel de 2 px, '#' = aceso), herdam a cor do texto. Os 18 primeiros vêm do hub;
   o resto foi desenhado no mesmo grid (a Aquarela revisa). */
const GLYPHS = {
  home: ['.....##.....', '....####....', '...######...', '..########..', '.##########.', '..#......#..', '..#.##...#..', '..#.##...#..', '..#......#..', '..#..##..#..', '..#..##..#..', '..########..'],
  luz: ['....####....', '...#....#...', '..#......#..', '..#......#..', '..#..##..#..', '...#.##.#...', '....#..#....', '....####....', '....#..#....', '....####....', '.....##.....', '............'],
  ar: ['.....##.....', '..#..##..#..', '...#.##.#...', '....####....', '####.##.####', '####.##.####', '....####....', '...#.##.#...', '..#..##..#..', '.....##.....', '............', '............'],
  tv: ['............', '############', '#..........#', '#..........#', '#..........#', '#..........#', '#..........#', '############', '.....##.....', '...######...', '............', '............'],
  cam: ['............', '............', '########....', '#......#..##', '#......#.###', '#......#####', '#......#####', '#......#.###', '#......#..##', '########....', '............', '............'],
  pin: ['....####....', '...#....#...', '..#..##..#..', '..#.#..#.#..', '..#..##..#..', '...#....#...', '...#....#...', '....#..#....', '....#..#....', '.....##.....', '............', '............'],
  lab: ['############', '#..........#', '#.#........#', '#..#.......#', '#.#..###...#', '#..........#', '############', '.....##.....', '...######...', '............', '............', '............'],
  central: ['#####..#####', '#...#..#...#', '#...#..#...#', '#####..#####', '............', '............', '#####..#####', '#...#..#.#.#', '#...#..##.##', '#####..#####', '............', '............'],
  film: ['............', '############', '#.#......#.#', '############', '#.#......#.#', '#.#......#.#', '############', '#.#......#.#', '############', '............', '............', '............'],
  moon: ['....####....', '..###.......', '.###........', '.##.........', '###.........', '###.........', '###.........', '###........#', '.###......##', '.#####..###.', '...######...', '............'],
  book: ['............', '.####..####.', '#....##....#', '#.##.##.##.#', '#....##....#', '#.##.##.##.#', '#....##....#', '#....##....#', '.####..####.', '............', '............', '............'],
  sun: ['.....##.....', '.#...##...#.', '..#......#..', '....####....', '...######...', '##.######.##', '##.######.##', '...######...', '....####....', '..#......#..', '.#...##...#.', '.....##.....'],
  sofa: ['............', '..########..', '..#......#..', '###......###', '#.#......#.#', '#.########.#', '#..........#', '############', '.#........#.', '............', '............', '............'],
  coffee: ['..#..#..#...', '...#..#..#..', '..#..#..#...', '............', '#########...', '#.......####', '#.......#..#', '#.......####', '.#.....#....', '..#####.....', '############', '............'],
  bed: ['............', '#...........', '#...........', '#.##........', '#.##.#######', '############', '#..........#', '############', '#..........#', '............', '............', '............'],
  power: ['.....##.....', '..#..##..#..', '.#...##...#.', '#....##....#', '#..........#', '#..........#', '#..........#', '.#........#.', '..#......#..', '...######...', '............', '............'],
  bell: ['.....##.....', '....####....', '...#....#...', '...#....#...', '...#....#...', '..#......#..', '..#......#..', '.##########.', '............', '.....##.....', '............', '............'],
  alert: ['.....##.....', '.....##.....', '....#..#....', '....#..#....', '...#.##.#...', '...#.##.#...', '..#..##..#..', '..#......#..', '.#...##...#.', '.#........#.', '############', '............'],
  ext: ['......######', '..........##', '.........#.#', '####....#..#', '#......#...#', '#.....#.....', '#....#......', '#..........#', '#..........#', '#..........#', '#..........#', '############'],
  plus: ['............', '............', '.....##.....', '.....##.....', '.....##.....', '..########..', '..########..', '.....##.....', '.....##.....', '.....##.....', '............', '............'],
  minus: ['............', '............', '............', '............', '............', '..########..', '..########..', '............', '............', '............', '............', '............'],
  close: ['............', '.##......##.', '..##....##..', '...##..##...', '....####....', '.....##.....', '.....##.....', '....####....', '...##..##...', '..##....##..', '.##......##.', '............'],
  back: ['............', '......##....', '.....##.....', '....##......', '...##.......', '..##........', '..##........', '...##.......', '....##......', '.....##.....', '......##....', '............'],
  up: ['............', '............', '............', '.....##.....', '....####....', '...##..##...', '..##....##..', '.##......##.', '##........##', '............', '............', '............'],
  refresh: ['....####....', '..##....##.#', '.#........##', '.#.......###', '.#..........', '.#..........', '.#........#.', '.#........#.', '..##....##..', '....####....', '............', '............'],
  radio: ['............', '..#......#..', '.#..#..#..#.', '#..#.##.#..#', '#..#.##.#..#', '.#..#..#..#.', '..#......#..', '......##....', '......##....', '......##....', '............', '............'],
  door: ['..########..', '..#......#..', '..#......#..', '..#......#..', '..#......#..', '..#.....##..', '..#......#..', '..#......#..', '..#......#..', '..#......#..', '############', '............'],
  fan: ['....##......', '...####..##.', '...###..####', '....##..####', '.....#.##...', '......##....', '....##.#....', '####..##....', '####..###...', '.##..####...', '......##....', '............'],
  game: ['............', '............', '.##########.', '#..#....#..#', '#.###..#.#.#', '#..#....#..#', '#....##....#', '.##......##.', '............', '............', '............', '............'],
};
// Nomes antigos do painel e do backend (os 9 de modo ficam gravados no servidor: nomes exatos).
const ALIASES = { bulb: 'luz', camera: 'cam', server: 'lab', snow: 'ar', external: 'ext', warn: 'alert', next: 'back', left: 'back', right: 'back', down: 'up' };
const FLIP = { next: 'x', right: 'x', down: 'y' };
const mirrored = (rows, axis) => (axis === 'x' ? rows.map((row) => [...row].reverse().join('')) : [...rows].reverse());

const pathOf = (name) => {
  const key = GLYPHS[name] ? name : ALIASES[name] || 'home';
  let rows = GLYPHS[key];
  if (FLIP[name]) rows = mirrored(rows, FLIP[name]);
  let d = '';
  rows.forEach((row, y) => { for (let x = 0; x < 12; x++) if (row[x] === '#') d += `M${x * 2} ${y * 2}h2v2h-2z`; });
  return d;
};
const pathCache = {};

export function Icon({ name, size = 20, label, style }) {
  const d = pathCache[name] || (pathCache[name] = pathOf(name));
  return (
    <span className="ic" style={{ '--icw': `${size}px`, ...style }} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      <svg viewBox="0 0 24 24" fill="currentColor"><path d={d} /></svg>
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
/** Número ou palavra curta em Doto (só em 20, 34, 64 ou 150 px). */
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
