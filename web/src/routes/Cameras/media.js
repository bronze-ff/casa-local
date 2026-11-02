// Capacidades de som e tela cheia do navegador. Puro: recebe `document` e o vídeo para os testes usarem falsos.

/** 'element' (Fullscreen API, padrão ou webkit), 'video' (iPhone: só o <video> vai a tela cheia) ou null. */
export function fullscreenKind(doc, video) {
  if (doc && (doc.fullscreenEnabled || doc.webkitFullscreenEnabled)) return 'element';
  if (video && video.webkitSupportsFullscreen) return 'video';
  return null;
}

/** true quando o navegador PROVA que há áudio; false quando prova que não há; null quando não dá para saber (o comum em MSE). */
export function audioAvailability(video) {
  if (!video) return null;
  if (video.mozHasAudio === true || video.audioTracks?.length > 0 || video.webkitAudioDecodedByteCount > 0) return true;
  if (video.mozHasAudio === false || video.audioTracks?.length === 0) return false;
  return null;
}

export function enterFullscreen(kind, stage, video) {
  if (kind === 'element') return (stage.requestFullscreen || stage.webkitRequestFullscreen)?.call(stage);
  if (kind === 'video') return video.webkitEnterFullscreen?.();
  return undefined;
}

export const exitFullscreen = (doc) => (doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc);
export const fullscreenElement = (doc) => doc.fullscreenElement || doc.webkitFullscreenElement || null;

/** Todo stream nasce mudo (exigência de autoplay), inclusive ao reabrir a mesma câmera depois de ocultar a aba. */
export const startMuted = (video) => { if (video) video.muted = true; };

/**
 * Som do vídeo, lido DO ELEMENTO (`muted`) e reavaliado em `volumechange`: o botão nunca diz "ligado" com o vídeo mudo,
 * mesmo quando o stream recomeça (ocultar/mostrar a aba, trocar de câmera) sem remontar o botão.
 * `ref` = { current: <video> | null }. Devolve { subscribe, isOn, toggle } para useSyncExternalStore.
 */
export function createSoundControl(ref) {
  const listeners = new Set();
  let bound = null;
  const notify = () => listeners.forEach((fn) => fn());
  const unbind = () => { bound?.removeEventListener?.('volumechange', notify); bound = null; };
  const bind = () => { const el = ref.current; if (el === bound) return; unbind(); bound = el; el?.addEventListener?.('volumechange', notify); };
  return {
    subscribe(fn) { listeners.add(fn); bind(); return () => { listeners.delete(fn); if (!listeners.size) unbind(); }; },
    isOn: () => !!ref.current && !ref.current.muted,
    toggle() { bind(); const el = ref.current; if (el) el.muted = !el.muted; },
  };
}
