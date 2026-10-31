// Store único da casa: snapshot versionado, receipts e exclusão por físico. Sem React e sem importar api.js.
// Comando: pending -> confirmed (só receipt completo por campo) | sent (aceito sem prova) | unknown (inconclusivo)
//          | diverged | error | simulated (prévia). Nenhum timer promove estado; só o usuário inicia novo comando.

const DEVICE_COMMAND = /^\/api\/devices\/([a-z-]+)\/(?:commands|learn)$/;
const MODE_RUN = /^\/api\/scenes\/[a-z0-9-]{1,24}\/run$/;

class BusyError extends Error {
  constructor(message) { super(message); this.status = 0; this.code = 'device_busy'; this.receipt = null; }
}

/** Fase do comando a partir do receipt. Confirmação exige TODOS os campos pedidos em confirmedFields; pedido vazio (key IR) nunca confirma. */
function phaseFromReceipt(receipt) {
  if (!receipt) return 'sent';
  if (receipt.outcome === 'preview') return 'simulated';
  if (receipt.outcome === 'diverged') return 'diverged';
  const requested = Object.keys(receipt.requested || {});
  const confirmed = receipt.confirmedFields || [];
  if (receipt.outcome === 'confirmed' && requested.length > 0 && requested.every((field) => confirmed.includes(field))) return 'confirmed';
  return 'sent';
}

function phaseFromError(error) {
  const receipt = error?.receipt;
  if (!receipt) return error?.status === 0 ? 'unknown' : 'error'; // sem resposta: pode ter saído; 4xx/5xx antes do efeito: nada saiu
  const phase = phaseFromReceipt(receipt);
  if (phase === 'sent') return receipt.delivery === 'not_sent' ? 'error' : 'unknown';
  return phase;
}

/** Aviso de resultado em linguagem humana: parcial nunca é sucesso total e IR aceito não é estado confirmado. */
export function resultNotice(path, result) {
  if (!MODE_RUN.test(path)) return { kind: 'ok' };
  const summary = result?.evidenceSummary || {};
  if (result?.status === 'partial' || summary.operationalFailures > 0 || summary.diverged > 0) {
    return { kind: 'warn', text: 'Modo executado em parte: veja os aparelhos que falharam.' };
  }
  if (!summary.confirmed && summary.unconfirmed > 0) return { kind: 'warn', text: 'Execução aceita; nenhum estado físico confirmado.' };
  return { kind: 'ok' };
}

export function createHomeStore({ bootstrap: readBootstrap, get, post, ApiError = BusyError, now = () => Date.now() }) {
  const initial = { home: null, commands: {}, bootError: null, stateError: null };
  let state = initial;
  const listeners = new Set();
  let generation = 0; // troca a cada bootstrap/reset: resposta de geração anterior é descartada
  let mutations = 0; // backend antigo sem stateVersion: mutação invalida GET em voo
  let actionSeq = 0;
  let inflightRefresh = null;
  let freshFromPost = false; // o último snapshot aplicado veio de um POST: refresh() legado das telas é absorvido até o próximo poll

  const set = (patch) => { state = { ...state, ...patch }; listeners.forEach((listener) => listener()); };
  const epochOf = (snapshot) => snapshot?.stateVersion?.epoch;

  function markPendingUnknown() {
    const commands = { ...state.commands };
    let changed = false;
    for (const [key, entry] of Object.entries(commands)) {
      if (entry.phase === 'pending') { commands[key] = { ...entry, phase: 'unknown', message: 'O servidor reiniciou: resultado desconhecido.' }; changed = true; }
    }
    if (changed) set({ commands });
  }

  /** Mesma epoch: só avança (revision >= aplicada). Epoch diferente: pede bootstrap, nunca substitui às cegas. */
  function applySnapshot(snapshot) {
    if (!snapshot) return false;
    const current = state.home?.stateVersion;
    const next = snapshot.stateVersion;
    if (current && next) {
      if (next.epoch !== current.epoch) {
        markPendingUnknown();
        bootstrap().catch(() => {});
        return false;
      }
      if (next.revision < current.revision) return false;
    }
    set({ home: { ...state.home, ...snapshot }, bootError: null, stateError: null });
    return true;
  }

  async function bootstrap() {
    const mine = ++generation;
    inflightRefresh = null;
    try {
      const data = await readBootstrap();
      if (mine !== generation) return state.home;
      const current = state.home?.stateVersion;
      if (current && data?.stateVersion && data.stateVersion.epoch === current.epoch && data.stateVersion.revision < current.revision) return state.home;
      if (current && data?.stateVersion && data.stateVersion.epoch !== current.epoch) markPendingUnknown();
      set({ home: data, bootError: null, stateError: null });
      return data;
    } catch (error) {
      if (mine === generation) set({ bootError: error });
      throw error;
    }
  }

  function refresh({ force = false } = {}) {
    if (!force && freshFromPost) return Promise.resolve(state.home); // até o próximo poll (force), a verdade mais nova é a do POST
    freshFromPost = false;
    if (inflightRefresh) return inflightRefresh;
    const mineGeneration = generation;
    const mineMutations = mutations;
    const promise = get('/api/state').then(
      (data) => {
        if (mineGeneration === generation && mineMutations === mutations) applySnapshot(data);
        return state.home;
      },
      (error) => {
        if (mineGeneration === generation) set({ stateError: error }); // erro de leitura não é falha de comando e não toca em busy
        throw error;
      },
    ).finally(() => { if (inflightRefresh === promise) inflightRefresh = null; });
    inflightRefresh = promise;
    return promise;
  }

  const physicalKey = (deviceId) => state.home?.devices?.find((device) => device.id === deviceId)?.physicalId || `d:${deviceId}`;

  /** Chaves físicas que o POST reserva. Vazio = ação genérica (configuração, câmeras…), com busy local no consumidor. */
  function keysFor(path) {
    const device = DEVICE_COMMAND.exec(path);
    if (device) return { kind: 'device', deviceId: device[1], keys: [physicalKey(device[1])] };
    if (MODE_RUN.test(path)) return { kind: 'mode', deviceId: null, keys: [...new Set((state.home?.devices || []).map((d) => d.physicalId || `d:${d.id}`))] };
    return { kind: 'generic', deviceId: null, keys: [] };
  }

  function settle(keys, seq, patch, { drop = false } = {}) {
    const commands = { ...state.commands };
    let changed = false;
    for (const key of keys) {
      const entry = commands[key];
      if (!entry || entry.seq !== seq || entry.phase !== 'pending') continue; // outra ação ou já marcada inconclusiva: não mexer
      if (drop) delete commands[key]; else commands[key] = { ...entry, ...patch };
      changed = true;
    }
    if (changed) set({ commands });
  }

  async function run(path, body = {}) {
    const target = keysFor(path);
    const busy = target.keys.find((key) => state.commands[key]?.phase === 'pending');
    if (busy) throw new ApiError('Esse aparelho já está recebendo um comando. Espere terminar.', 0, 'device_busy');
    const seq = ++actionSeq;
    const mineGeneration = generation;
    mutations += 1;
    if (target.keys.length) {
      const commands = { ...state.commands };
      for (const key of target.keys) commands[key] = { seq, deviceId: target.deviceId, phase: 'pending', receipt: null, message: null, startedAt: now() };
      set({ commands });
    }
    try {
      const result = await post(path, body);
      mutations += 1;
      if (mineGeneration === generation && result?.state) freshFromPost = applySnapshot(result.state);
      const receipt = result?.command?.receipt || null;
      let phase = phaseFromReceipt(receipt);
      const epoch = epochOf(state.home);
      if (receipt?.stateVersion?.epoch && epoch && receipt.stateVersion.epoch !== epoch) phase = 'unknown';
      settle(target.keys, seq, { phase, receipt, message: result?.command?.message || null }, { drop: target.kind === 'mode' });
      return result;
    } catch (error) {
      mutations += 1;
      settle(target.keys, seq, { phase: phaseFromError(error), receipt: error?.receipt || null, message: error?.message || null }, { drop: target.kind === 'mode' && !error?.receipt });
      throw error;
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    bootstrap,
    applySnapshot,
    refresh,
    run,
    commandFor: (deviceId) => state.commands[physicalKey(deviceId)] || null,
    reset() { generation += 1; inflightRefresh = null; state = initial; listeners.forEach((listener) => listener()); },
  };
}
