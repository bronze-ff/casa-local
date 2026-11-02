// Onde o foco cai ao abrir um overlay. Funções puras (recebem elementos ou objetos parecidos), testáveis no Node.
export const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

const isField = (el) => ['INPUT', 'SELECT', 'TEXTAREA'].includes(el?.tagName);
const isClose = (el) => el?.dataset?.close === 'true';

/** Primeiro campo; sem campo, o primeiro botão que não seja "Fechar"; sem nada, o primeiro; vazio devolve null. */
export function pickInitialFocus(items = []) {
  const list = [...items];
  return list.find(isField) || list.find((el) => !isClose(el)) || list[0] || null;
}
