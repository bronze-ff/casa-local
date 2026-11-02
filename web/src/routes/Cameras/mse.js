// Vídeo por WebSocket + MediaSource (go2rtc, modo "mse"). Tudo que depende do navegador é lido NA HORA DA CHAMADA
// (globalThis), para os testes trocarem WebSocket/MediaSource/URL por falsos sem rede.
const CODECS = ['avc1.640029', 'avc1.64002A', 'avc1.640033', 'hvc1.1.6.L153.B0', 'mp4a.40.2', 'mp4a.40.5', 'flac', 'opus'];

const sourceClass = () => globalThis.window?.ManagedMediaSource ?? globalThis.window?.MediaSource;
export const mseSupported = () => !!sourceClass();

/**
 * Liga `video` ao WebSocket `path`. Devolve a função que desfaz tudo (fecha o socket e solta o vídeo), idempotente.
 * opts.replay: não corre atrás do ao vivo; opts.held(): true enquanto o usuário pausou; opts.onEnd: o socket fechou depois de tocar.
 * `onFail` dispara no máximo UMA vez (erro do servidor seguido do fechamento = um único fallback).
 */
export function attachMse(video, path, onPlaying, onFail, opts = {}) {
  const Source = sourceClass();
  const managed = Source !== globalThis.window.MediaSource;
  const source = new Source();
  const ws = new globalThis.WebSocket(`${globalThis.location.protocol === 'https:' ? 'wss' : 'ws'}://${globalThis.location.host}${path}`);
  ws.binaryType = 'arraybuffer';
  let buffer = null;
  let queue = [];
  let ready = 0;
  let playing = false;
  let closed = false;
  let failed = false;
  let objectUrl = null;
  const fail = () => { if (!failed && !closed) { failed = true; onFail(); } };

  // Só pede o stream quando o socket abriu E o MediaSource está pronto, o que vier por último.
  const hello = () => {
    if (!closed && ++ready === 2) ws.send(JSON.stringify({ type: 'mse', value: CODECS.filter((c) => Source.isTypeSupported(`video/mp4; codecs="${c}"`)).join() }));
  };
  const pump = () => {
    if (!buffer || buffer.updating) return;
    if (queue.length) {
      const merged = new Uint8Array(queue.reduce((n, b) => n + b.byteLength, 0));
      let at = 0;
      for (const chunk of queue) { merged.set(new Uint8Array(chunk), at); at += chunk.byteLength; }
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
  if (managed) { video.disableRemotePlayback = true; video.srcObject = source; } else { objectUrl = globalThis.URL.createObjectURL(source); video.src = objectUrl; }

  ws.onopen = hello;
  ws.onmessage = (event) => {
    if (closed) return;
    if (typeof event.data === 'string') {
      const message = JSON.parse(event.data);
      if (message.type === 'mse' && !buffer) {
        buffer = source.addSourceBuffer(message.value);
        buffer.mode = 'segments';
        buffer.addEventListener('updateend', pump);
      } else if (message.type === 'error' && !playing) fail();
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
    if (closed) return;
    closed = true;
    ws.onopen = null; ws.onmessage = null; ws.onclose = null;
    ws.close();
    if (objectUrl) { globalThis.URL.revokeObjectURL(objectUrl); objectUrl = null; }
    video.removeEventListener('playing', onPlay);
    video.pause();
    video.removeAttribute('src');
    video.srcObject = null;
    video.load();
  };
}
