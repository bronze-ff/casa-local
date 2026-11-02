// Preparo do celular (POST que devolve a credencial). Resposta que chega depois de o usuário fechar o diálogo, trocar de
// pessoa ou sair da tela é DESCARTADA: a credencial nunca reabre o painel sozinha. A ação já aconteceu no servidor (a pessoa
// pode pedir de novo em "Celular"), mas nada do segredo chega à tela, ao estado ou ao log.
export function createPrepare({ call, onReady }) {
  let generation = 0;
  return {
    async start(args) {
      const mine = ++generation; // um novo pedido invalida o anterior
      const result = await call(args);
      if (mine !== generation || !result?.phone) return null;
      onReady(result.phone, args);
      return result.phone;
    },
    invalidate() { generation += 1; },
  };
}
