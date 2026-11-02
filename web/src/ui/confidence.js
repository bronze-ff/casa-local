// Confiança de um estado e fase de um comando, em linguagem humana. Funções puras.
// O selo vem do backend (reported/estimated/preview/unknown) e o estado do COMANDO o refina. Nenhum timer promove nada.

const FROM_BACKEND = { reported: 'reported', estimated: 'estimated', preview: 'preview' };
// Fase do comando que sobrepõe o selo. unknown (sem resposta) conta como "enviado, sem retorno": nunca vira confirmado.
const FROM_COMMAND = { pending: 'pending', sent: 'sent', unknown: 'sent', diverged: 'diverged' };

export function confidenceOf(device, command) {
  if (!device) return 'unknown';
  return FROM_COMMAND[command?.phase] || FROM_BACKEND[device.confidence] || 'unknown';
}

/** [classe CSS, texto]. */
export const CONFIDENCE = {
  reported: ['rep', 'Confirmado'],
  pending: ['env', 'Enviando…'],
  sent: ['env', 'Enviado · sem retorno'],
  diverged: ['div', 'Divergente'],
  estimated: ['est', 'Estimado'],
  preview: ['sim', 'Simulado'],
  unknown: ['unk', 'Desconhecido'],
};

/** Fase de um comando: classe, rótulo curto e frase de apoio. */
export const PHASE = {
  pending: ['pend', 'Enviando…', 'Saiu daqui e ainda não há resposta. Nada é repetido sozinho.'],
  sent: ['sent', 'Enviado', 'O aparelho aceitou, mas ainda não relatou o novo estado.'],
  unknown: ['part', 'Sem resposta', 'Pode ter chegado ao aparelho. O resultado é desconhecido.'],
  diverged: ['div', 'Divergente', 'O aparelho relatou algo diferente do pedido. Vale o que ele relatou.'],
  confirmed: ['ok', 'Confirmado', 'O aparelho relatou exatamente o que foi pedido.'],
  error: ['err', 'Não enviado', 'O comando não chegou ao aparelho. Nada mudou.'],
  simulated: ['sim', 'Simulado', 'Prévia: nada foi enviado.'],
};

export function phaseView(command) {
  const entry = PHASE[command?.phase];
  return entry ? { cls: entry[0], label: entry[1], hint: entry[2] } : null;
}
