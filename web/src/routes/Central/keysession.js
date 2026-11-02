// Sessão da chave dos atalhos (SEGREDO). Cada leitura ou troca só vale enquanto a sessão em que nasceu continua a mesma:
// fechar, reabrir ou sair da tela invalida o que estiver em voo, e a resposta tardia é DESCARTADA (nunca revela a chave).
// Descartar não repete nada: a troca de chave já aconteceu no servidor e a pessoa lê a nova ao tocar de novo em Configurar.
export function createKeySession({ read, rotate }) {
  let generation = 0;
  const stale = (mine) => mine !== generation;
  return {
    /** Abre uma sessão nova (invalida a anterior) e lê a chave. Devolve a chave, ou null se a sessão mudou no meio. Erro só chega se ainda valer. */
    async open() {
      const mine = ++generation;
      try {
        const result = await read();
        return stale(mine) ? null : result?.key ?? null;
      } catch (error) { if (stale(mine)) return null; throw error; }
    },
    /** Troca a chave na sessão ATUAL; se fechar/reabrir/desmontar antes da resposta, a nova chave nunca chega à tela. */
    async rotate() {
      const mine = generation;
      const result = await rotate();
      return stale(mine) ? null : result?.key ?? null;
    },
    /** Fechar ou desmontar: invalida tudo que estiver em voo. */
    close() { generation += 1; },
  };
}
