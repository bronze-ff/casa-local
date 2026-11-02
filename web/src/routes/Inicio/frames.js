// Quadros da tela larga: 4 câmeras, no máximo 3 pedidos ao mesmo tempo, um ciclo a cada 4 s, parado com a aba oculta.
// Só imagens paradas: nenhum vídeo contínuo. Lógica pura aqui; o hook que usa fetch/URL fica em Wide.jsx.
export const WIDE_CAMS = 4;
export const WIDE_PARALLEL = 3;
export const WIDE_EVERY = 4000;

/** Percorre `ids` com no máximo `parallel` pedidos simultâneos. Devolve quantos carregou. */
export async function runCycle({ ids, parallel = WIDE_PARALLEL, load, stopped = () => false }) {
  const queue = [...ids];
  let done = 0;
  await Promise.all(Array.from({ length: Math.min(parallel, queue.length) }, async () => {
    while (queue.length && !stopped()) { await load(queue.shift()); done += 1; }
  }));
  return done;
}

/** As câmeras com aviso ligado vêm primeiro; corta em WIDE_CAMS. */
export const pickWide = (cameras = [], notify = []) => [...cameras].sort((a, b) => Number(notify.includes(b.id)) - Number(notify.includes(a.id))).slice(0, WIDE_CAMS);
