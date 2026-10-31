import { clickHook } from '../../ui.jsx';

const KEY = 'casa-som';
let ctx = null;

const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

/** Tique curto de tecla (WebAudio, ~35 ms). O contexto nasce no primeiro clique, que já é um gesto do usuário. */
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
  } catch { /* sem áudio: o clique segue mudo */ }
}

export const soundOn = () => clickHook.fn === tick;

export function setSound(on) {
  clickHook.fn = on ? tick : null;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* sem armazenamento: vale só nesta sessão */ }
}

// Desligado por padrão: só liga se o usuário já tinha ligado antes.
if (read()) clickHook.fn = tick;
