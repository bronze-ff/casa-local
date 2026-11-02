// Transporte HTTP da casa. Sem React. O token de sessão vem do /api/bootstrap e segue em todo POST.
// Regras: um erro HTTP mantém o recibo do corpo; só `invalid_token` (recusado antes de qualquer efeito)
// é repetido UMA vez; timeout, 5xx e falta de rede nunca viram nova tentativa de comando.

export class ApiError extends Error {
  constructor(message, status, code, receipt = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.receipt = receipt; // prova do comando devolvida pelo backend, também em erro
  }
}

export function createApi({ fetchFn = (...args) => globalThis.fetch(...args) } = {}) {
  let token = null;
  let booting = null;

  async function request(path, options = {}) {
    let response;
    try {
      response = await fetchFn(path, { cache: 'no-store', ...options });
    } catch {
      throw new ApiError('Sem conexão com o PC de casa.', 0, 'offline');
    }
    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
    if (!response.ok) {
      if (body?.code === 'invalid_token') token = null;
      throw new ApiError(body?.error || `Falha (${response.status}).`, response.status, body?.code, body?.receipt ?? null);
    }
    return body;
  }

  // Várias telas pedindo o token ao mesmo tempo compartilham UM bootstrap.
  function bootstrap() {
    if (!booting) {
      booting = request('/api/bootstrap')
        .then((data) => { token = data.csrfToken; return data; })
        .finally(() => { booting = null; });
    }
    return booting;
  }

  const get = (path) => request(path);

  async function post(path, body = {}) {
    if (!token) await bootstrap();
    const send = () => request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Casa-Token': token },
      body: JSON.stringify(body),
    });
    try {
      return await send();
    } catch (error) {
      if (error.code !== 'invalid_token') throw error;
      await bootstrap(); // servidor reiniciado trocou o token: renova e repete uma vez
      return send();
    }
  }

  return { bootstrap, get, post, hasToken: () => token != null };
}

const shared = createApi();
export const { bootstrap, get, post } = shared;
