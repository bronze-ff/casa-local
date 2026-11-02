// "Pular para o conteúdo": leva o foco ao <main> SEM mudar o hash. Mudar o hash (#conteudo) faria o roteador
// tratar "conteudo" como rota desconhecida e voltar ao Início. O <main id="conteudo"> tem tabIndex -1: focável, fora do Tab.
export function skipToContent(event, doc = document) {
  event.preventDefault();
  doc.getElementById('conteudo')?.focus({ preventScroll: false });
}
