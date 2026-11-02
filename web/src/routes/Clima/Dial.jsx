import { useMemo, useRef, useState } from 'react';
import { angleToProgress, createDial, thumbPoint } from './dial.js';

const ARC = 'M43.43 156.57 A80 80 0 1 1 156.57 156.57';

/**
 * Dial de 270°. Arrastar ou usar as setas só muda o que aparece; o comando sai UMA vez, ao soltar o ponteiro ou a tecla.
 * `children(valorMostrado)` desenha o número no centro. `values` limita ao que tem sinal aprendido.
 */
export function Dial({ value, min, max, values, label, unit = '', disabled, onCommit, children }) {
  const [drag, setDrag] = useState(null);
  const box = useRef(null);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  const signature = values ? values.join(',') : '';
  const control = useMemo(() => createDial({ min, max, values, onCommit: (v) => { Promise.resolve(commit.current(v)).finally(() => setDrag(null)); } }), [min, max, signature]);
  const known = value != null && Number.isFinite(Number(value));
  const shown = drag ?? (known ? Number(value) : min);
  const progress = (shown - min) / (max - min);
  const thumb = thumbPoint(progress);
  const fromPointer = (event) => {
    const rect = box.current.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    return angleToProgress((Math.atan2(dy, dx) * 180) / Math.PI);
  };
  const onKeyDown = (event) => {
    const map = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, Home: 'home', End: 'end' };
    if (disabled || !(event.key in map)) return;
    event.preventDefault();
    if (drag == null) control.start(known ? Number(value) : min);
    setDrag(control.key(map[event.key]));
  };
  const finish = () => { if (control.release() == null) setDrag(null); };
  return (
    <div ref={box} className={`dial ${disabled ? 'off' : ''}`} role="slider" tabIndex={disabled ? -1 : 0} aria-label={label}
      aria-valuemin={min} aria-valuemax={max} aria-valuenow={known || drag != null ? shown : undefined} aria-valuetext={known || drag != null ? `${shown}${unit}` : 'desconhecido'} aria-disabled={disabled ? 'true' : undefined}
      onKeyDown={onKeyDown}
      onKeyUp={(event) => { if (!disabled && (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End')) finish(); }}
      onPointerDown={(event) => { if (disabled) return; event.currentTarget.setPointerCapture?.(event.pointerId); control.start(known ? Number(value) : min); setDrag(control.move(fromPointer(event))); }}
      onPointerMove={(event) => { if (!disabled && event.buttons) setDrag(control.move(fromPointer(event))); }}
      onPointerUp={() => { if (!disabled) finish(); }}
      onPointerCancel={() => setDrag(null)}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <path className="trk" d={ARC} pathLength="100" />
        {(known || drag != null) && <path className="val" d={ARC} pathLength="100" strokeDasharray={`${Math.round(progress * 1000) / 10} 100`} />}
        <circle className="thumb" r="13" cx="0" cy="0" style={{ transform: `translate(${thumb.x.toFixed(2)}px, ${thumb.y.toFixed(2)}px)` }} />
      </svg>
      <div className="dial-read">{children(known || drag != null ? shown : null)}</div>
    </div>
  );
}
