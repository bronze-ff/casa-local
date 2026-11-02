// Proteção de handler: quando o painel está bloqueado (sem conexão), a ação NÃO roda, mesmo se um clique chegar ao handler.
// O botão desabilitado é a primeira barreira; esta é a segunda (defesa em profundidade).
export const guarded = (blocked, fn) => (...args) => (blocked ? Promise.resolve(null) : fn(...args));
