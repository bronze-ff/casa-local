// Store único da casa: snapshot versionado, receipts e exclusão por físico. Sem React e sem importar api.js.
// Comando: pending -> confirmed (só receipt completo por campo) | sent (aceito sem prova) | unknown (inconclusivo)
//          | diverged | error | simulated (prévia). Nenhum timer promove estado; só o usuário inicia novo comando.
// Toda evidência (snapshot, receipt de sucesso, receipt de erro, resultado de modo) passa pela MESMA guarda de epoch/revision.

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
  if (summary.unconfirmed > 0) {
    return { kind: 'warn', text: summary.confirmed > 0 ? 'Modo executado; parte dos aparelhos não tem confirmação física.' : 'Execução aceita; nenhum estado físico confirmado.' };
  }
  return { kind: 'ok' };
}

/** Relação de uma versão (snapshot ou receipt) com o que já foi aplicado. */
function relation(current, next) {
  if (!current || !next) return 'unversioned';
  if (next.epoch !== current.epoch) return 'other-epoch';
  return next.revision >= current.revision ? 'current' : 'older';
}

export function createHomeStore({ bootstrap: readBootstrap, get, post, ApiError = BusyError, now = () => Date.now() }) {
  const initial = { home: null, homeAt: 0, commands: {}, bootError: null, stateError: null };
  let state = initial;
  const listeners = new Set();
  let generation = 0; // troca a cada bootstrap/reset: invalida só LEITURAS em voo (o comando tem a própria validade, por versão)
  let mutations = 0; // backend antigo sem stateVersion: mutação invalida GET em voo
  let actionSeq = 0;
  let inflightRefresh = null; // { promise, guards }
  let freshFromPost = false; // o último snapshot aplicado veio de um POST: refresh() legado das telas é absorvido até o próximo poll

  const set = (patch) => { state = { ...state, ...patch }; listeners.forEach((listener) => listener()); };
  const versionOf = () => state.home?.stateVersion;

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
    const rel = relation(versionOf(), snapshot.stateVersion);
    if (rel === 'other-epoch') {
      markPendingUnknown();
      bootstrap().catch(() => {});
      return false;
    }
    if (rel === 'older') return false;
    set({ home: { ...state.home, ...snapshot }, homeAt: now(), bootError: null, stateError: null });
    return true;
  }

  async function bootstrap() {
    const mine = ++generation;
    inflightRefresh = null;
    try {
      const data = await readBootstrap();
      if (mine !== generation) return state.home;
      const rel = relation(versionOf(), data?.stateVersion);
      if (rel === 'older') return state.home;
      if (rel === 'other-epoch') markPendingUnknown();
      set({ home: data, homeAt: now(), bootError: null, stateError: null });
      return data;
    } catch (error) {
      if (mine === generation) set({ bootError: error });
      throw error;
    }
  }

  /** guards: quem pediu a leitura. Aplica se ALGUM chamador ainda está vigente (poll oculto não publica; chamador legítimo junto mantém). */
  function refresh({ force = false, isCurrent = () => true } = {}) {
    if (!force && freshFromPost) return Promise.resolve(state.home); // até o próximo poll (force), a verdade mais nova é a do POST
    freshFromPost = false;
    if (inflightRefresh) { inflightRefresh.guards.push(isCurrent); return inflightRefresh.promise; }
    const mineGeneration = generation;
    const mineMutations = mutations;
    const guards = [isCurrent];
    const fresh = () => mineGeneration === generation && mineMutations === mutations && guards.some((guard) => guard());
    const promise = get('/api/state').then(
      (data) => {
        if (fresh()) applySnapshot(data);
        return state.home;
      },
      (error) => {
        if (fresh()) set({ stateError: error }); // erro velho de leitura não derruba a conexão atual nem toca em comandos
        throw error;
      },
    ).finally(() => { if (inflightRefresh?.promise === promise) inflightRefresh = null; });
    inflightRefresh = { promise, guards };
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

  /** Mescla SÓ o observado (reported + metadados reais) de um receipt de versão vigente; nada é inventado nem copiado do desired. */
  function mergeReceipt(deviceId, receipt) {
    const reported = receipt?.reported || {};
    const fields = Object.keys(reported);
    const home = state.home;
    const index = home?.devices?.findIndex((device) => device.id === deviceId) ?? -1;
    if (index < 0 || !fields.length) return;
    const revision = receipt.stateVersion.revision;
    const device = home.devices[index];
    const merged = {
      ...device,
      state: { ...device.state, ...reported },
      observedAt: receipt.observedAt ?? device.observedAt ?? null,
      fieldObservations: { ...device.fieldObservations, ...Object.fromEntries(fields.map((field) => [field, { observedAt: receipt.observedAt, revision }])) },
      confidence: 'reported',
    };
    const devices = home.devices.map((item, i) => (i === index ? merged : item));
    set({ home: { ...home, devices, stateVersion: { ...home.stateVersion, revision: Math.max(home.stateVersion.revision, revision) } } });
  }

  /** Fase final de um receipt já apurada pela guarda: velho/outra epoch nunca confirma nem rebaixa; vira inconclusivo e fica em histórico. */
  function judge(receipt, phase, deviceId, { merge }) {
    const rel = relation(versionOf(), receipt?.stateVersion);
    if (rel === 'older' || rel === 'other-epoch') {
      if (rel === 'other-epoch') { bootstrap().catch(() => {}); }
      return { phase: 'unknown', receipt: null, staleReceipt: receipt };
    }
    if (merge && rel === 'current') mergeReceipt(deviceId, receipt);
    return { phase, receipt: receipt || null, staleReceipt: null };
  }

  function settle(keys, seq, patchFor, { drop = false } = {}) {
    const commands = { ...state.commands };
    let changed = false;
    for (const key of keys) {
      const entry = commands[key];
      if (!entry || entry.seq !== seq || entry.phase !== 'pending') continue; // outra ação ou já marcada inconclusiva: não mexer
      if (drop) delete commands[key]; else commands[key] = { ...entry, ...patchFor(key) };
      changed = true;
    }
    if (changed) set({ commands });
  }

  /** Modo: cada resultado vira estado do SEU físico, com receipt; busy liberado, sem preencher confirmação pela confiança agregada. */
  function settleMode(keys, seq, result) {
    const outcomes = new Map();
    for (const item of result?.results || []) {
      if (!item?.deviceId || item.status === 'skipped') continue;
      const failed = item.status === 'failed' || item.operation === 'failed';
      const base = failed ? phaseFromError({ status: 502, receipt: item.receipt }) : phaseFromReceipt(item.receipt);
      const judged = item.receipt ? judge(item.receipt, base, item.deviceId, { merge: false }) : { phase: failed ? 'error' : 'sent', receipt: null, staleReceipt: null };
      outcomes.set(physicalKey(item.deviceId), { deviceId: item.deviceId, ...judged, message: item.message || null });
    }
    const commands = { ...state.commands };
    for (const key of keys) {
      const entry = commands[key];
      if (!entry || entry.seq !== seq || entry.phase !== 'pending') continue;
      const outcome = outcomes.get(key);
      if (outcome) commands[key] = { ...entry, ...outcome, mode: true }; else delete commands[key];
    }
    set({ commands });
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
      for (const key of target.keys) commands[key] = { seq, deviceId: target.deviceId, phase: 'pending', receipt: null, staleReceipt: null, message: null, startedAt: now() };
      set({ commands });
    }
    try {
      const result = await post(path, body);
      mutations += 1;
      // Backend sem versão e leitura/bootstrap no meio: não há ordem para provar nada; só o snapshot versionado é aceito por versão.
      const legacyRaced = !!result?.state && !result.state.stateVersion && mineGeneration !== generation;
      if (result?.state && !legacyRaced) freshFromPost = applySnapshot(result.state);
      if (target.kind === 'mode') { settleMode(target.keys, seq, result); return result; }
      const receipt = result?.command?.receipt || null;
      const base = legacyRaced ? { phase: 'unknown', receipt: null, staleReceipt: null } : judge(receipt, phaseFromReceipt(receipt), target.deviceId, { merge: false });
      settle(target.keys, seq, () => ({ ...base, message: result?.command?.message || null }));
      return result;
    } catch (error) {
      mutations += 1;
      if (target.kind === 'mode') {
        if (error?.receipt) settle(target.keys, seq, () => ({ phase: phaseFromError(error), receipt: error.receipt, message: error.message || null }));
        else settle(target.keys, seq, null, { drop: true });
        throw error;
      }
      const judged = error?.receipt ? judge(error.receipt, phaseFromError(error), target.deviceId, { merge: true }) : { phase: phaseFromError(error), receipt: null, staleReceipt: null };
      settle(target.keys, seq, () => ({ ...judged, message: error?.message || null }));
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
    reset() { generation += 1; inflightRefresh = null; freshFromPost = false; state = initial; listeners.forEach((listener) => listener()); },
  };
}
