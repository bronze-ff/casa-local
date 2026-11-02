// Som das teclas: OPCIONAL, desligado por padrão, vale só neste aparelho. Nada toca sem o usuário ligar.
const KEY = 'casa-som';
let ctx = null;
let installed = false;

export const readSound = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

/** Tique curto (WebAudio, ~35 ms). O contexto nasce no primeiro toque, que já é um gesto do usuário. */
function tick() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1800, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.03);
    gain.gain.setValueAtTime(0.04, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.04);
  } catch { /* sem áudio: o toque segue mudo */ }
}

/** Toques em botões habilitados fazem o tique. Um único ouvinte no documento. */
const onClick = (event) => { const el = event.target?.closest?.('button, [role="switch"], [role="radio"]'); if (el && !el.disabled) tick(); };

/** Liga/desliga o ouvinte conforme a preferência salva. Chame no início do app e na tela da Central. */
export function applySound(on, doc = typeof document === 'undefined' ? null : document) {
  if (!doc) return false;
  if (on && !installed) { doc.addEventListener('click', onClick, true); installed = true; }
  if (!on && installed) { doc.removeEventListener('click', onClick, true); installed = false; }
  return installed;
}

export function setSound(on) {
  applySound(on);
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* sem armazenamento: vale só nesta sessão */ }
}

export const initSound = () => applySound(readSound());
export const soundOn = () => installed;
