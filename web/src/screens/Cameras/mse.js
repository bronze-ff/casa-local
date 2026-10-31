// Vídeo por WebSocket + MediaSource (go2rtc "mse"): mesma técnica do painel antigo.
const CODECS = ['avc1.640029', 'avc1.64002A', 'avc1.640033', 'hvc1.1.6.L153.B0', 'mp4a.40.2', 'mp4a.40.5', 'flac', 'opus'];
const MS = window.ManagedMediaSource ?? window.MediaSource;
export const mseSupported = !!MS;

/**
 * Liga `video` ao WebSocket `path`. Devolve a função que desfaz tudo (fecha o socket e solta o vídeo).
 * opts.replay: não corre atrás do ao vivo; opts.held(): true enquanto o usuário pausou; opts.onEnd: socket fechou depois de tocar.
 */
export function attachMse(video, path, onPlaying, onFail, opts = {}) {
  const source = new MS();
  const managed = MS !== window.MediaSource;
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${path}`);
  ws.binaryType = 'arraybuffer';
  let buffer = null;
  let queue = [];
  let ready = 0;
  let playing = false;
  let closed = false;
  let failed = false;
  let objectUrl = null;
  const fail = () => { if (!failed && !closed) { failed = true; onFail(); } }; // um único fallback, mesmo com erro + fechamento

  // Pede o stream quando o socket abriu E o MediaSource está pronto (o que vier por último).
  const hello = () => {
    if (!closed && ++ready === 2) ws.send(JSON.stringify({ type: 'mse', value: CODECS.filter((c) => MS.isTypeSupported(`video/mp4; codecs="${c}"`)).join() }));
  };
  const pump = () => {
    if (!buffer || buffer.updating) return;
    if (queue.length) {
      const merged = new Uint8Array(queue.reduce((n, b) => n + b.byteLength, 0));
      let at = 0;
      for (const b of queue) { merged.set(new Uint8Array(b), at); at += b.byteLength; }
      queue = [];
      try { buffer.appendBuffer(merged); } catch { /* buffer cheio: o próximo ciclo limpa */ }
    } else if (buffer.buffered.length) {
      const end = buffer.buffered.end(buffer.buffered.length - 1);
      const begin = buffer.buffered.start(0);
      if (opts.replay) {
        if (video.currentTime - begin > 10) try { buffer.remove(begin, video.currentTime - 5); } catch { /* ignora */ }
      } else {
        if (end - video.currentTime > 1.2) video.currentTime = end - 0.2; // ao vivo: não acumula atraso
        if (end - begin > 10) try { buffer.remove(begin, end - 6); } catch { /* ignora */ }
      }
    }
  };

  source.addEventListener('sourceopen', hello, { once: true });
  if (managed) { video.disableRemotePlayback = true; video.srcObject = source; } else { objectUrl = URL.createObjectURL(source); video.src = objectUrl; }

  ws.onopen = hello;
  ws.onmessage = (event) => {
    if (closed) return;
    if (typeof event.data === 'string') {
      const msg = JSON.parse(event.data);
      if (msg.type === 'mse' && !buffer) {
        buffer = source.addSourceBuffer(msg.value);
        buffer.mode = 'segments';
        buffer.addEventListener('updateend', pump);
      } else if (msg.type === 'error' && !playing) fail();
    } else {
      queue.push(event.data);
      pump();
      if (video.paused && !opts.held?.()) video.play().catch(() => {});
    }
  };
  ws.onclose = () => { if (!closed) { if (playing) opts.onEnd?.(); else fail(); } };

  const onPlay = () => { if (!playing) { playing = true; onPlaying(); } };
  video.addEventListener('playing', onPlay);
  return () => {
    if (closed) return; // idempotente: fechar duas vezes não repete efeito
    closed = true;
    ws.onopen = null; ws.onmessage = null; ws.onclose = null;
    ws.close();
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    video.removeEventListener('playing', onPlay);
    video.pause();
    video.removeAttribute('src');
    video.srcObject = null;
    video.load();
  };
}
