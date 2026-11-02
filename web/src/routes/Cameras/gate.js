// Porta de mídia: roda `start(chave)` SÓ com a aba visível e desfaz ao ocultar, trocar a chave ou parar.
// Ocultar fecha tudo (socket, vídeo, URL); reexibir abre no MÁXIMO um stream; trocar de câmera fecha o anterior e abre um;
// trocar oculto não abre nada até voltar; parar (desmontar/sair da rota) fecha uma vez. Lógica pura: o hook React só a liga.
export function createMediaGate({ isVisible, subscribe, start }) {
  let key;
  let stopFn = null;
  let ended = false;
  // Sem chave não há stream: null/undefined significam "ainda não pronto" (nunca viram URL).
  const open = () => { if (ended || stopFn || key === undefined || key === null || !isVisible()) return; stopFn = start(key) || (() => {}); };
  const close = () => { const fn = stopFn; stopFn = null; fn?.(); };
  const unsubscribe = subscribe(() => { if (isVisible()) open(); else close(); });
  return {
    set(next) { if (next === key) return; close(); key = next; open(); },
    stop() { ended = true; unsubscribe(); close(); },
    isOpen: () => !!stopFn,
  };
}
