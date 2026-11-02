// Store única da casa, sem React e sem importar o transporte (recebe bootstrap/get/post).
// Comando por aparelho físico: pending → confirmed | sent | unknown | diverged | error | simulated.
//   confirmed  só com recibo completo: todo campo pedido está em confirmedFields
//   sent       o servidor aceitou, sem prova do estado (inclui tecla IR: pedido vazio nunca confirma)
//   unknown    sem resposta ou resposta fora de ordem: pode ter saído, não se sabe
// Nenhum timer promove estado; só o usuário inicia um novo comando.
// Toda evidência (snapshot, recibo de sucesso, recibo de erro, resultado de modo) passa pela MESMA guarda de epoch/revision.

const DEVICE_PATH = /^\/api\/devices\/([a-z-]+)\/(?:commands|learn)$/;
const MODE_PATH = /^\/api\/scenes\/[a-z0-9-]{1,24}\/run$/;

class BusyError extends Error {
  constructor(message) { super(message); this.status = 0; this.code = 'device_busy'; this.receipt = null; }
}

/** Fase do comando segundo o recibo. */
export function phaseOfReceipt(receipt) {
  if (!receipt) return 'sent';
  if (receipt.outcome === 'preview') return 'simulated';
  if (receipt.outcome === 'diverged') return 'diverged';
  const asked = Object.keys(receipt.requested || {});
  const proved = receipt.confirmedFields || [];
  const complete = receipt.outcome === 'confirmed' && asked.length > 0 && asked.every((field) => proved.includes(field));
  return complete ? 'confirmed' : 'sent';
}

/** Fase quando o POST falhou. Sem resposta: pode ter saído. Erro do servidor antes do efeito: nada saiu. */
export function phaseOfError(error) {
  const receipt = error?.receipt;
  // Sem recibo: sem resposta (status 0) ou falha que não veio do transporte (sem status numérico) pode ter saído.
  if (!receipt) return typeof error?.status !== 'number' || error.status === 0 ? 'unknown' : 'error';
  const phase = phaseOfReceipt(receipt);
  if (phase === 'sent') return receipt.delivery === 'not_sent' ? 'error' : 'unknown';
  return phase;
}

/** Aviso em linguagem humana para o resultado de um modo: parcial nunca é sucesso, IR aceito não é estado confirmado. */
export function resultNotice(path, result) {
  if (!MODE_PATH.test(path)) return { kind: 'ok' };
  const sum = result?.evidenceSummary || {};
  if (result?.status === 'partial' || sum.operationalFailures > 0 || sum.diverged > 0) {
    return { kind: 'warn', text: 'Modo executado em parte: veja os aparelhos que falharam.' };
  }
  if (sum.unconfirmed > 0) {
    return { kind: 'warn', text: sum.confirmed > 0 ? 'Modo executado; parte dos aparelhos não tem confirmação física.' : 'Execução aceita; nenhum estado físico confirmado.' };
  }
  return { kind: 'ok' };
}

/** Recusa comprovada ANTES de qualquer envio: o servidor respondeu 4xx. Sem resposta (0) ou 5xx/proxy não prova nada. */
const rejectedBeforeSend = (error) => typeof error?.status === 'number' && error.status >= 400 && error.status < 500;

/** Como uma versão (snapshot ou recibo) se relaciona com a já aplicada. */
function relationOf(applied, incoming) {
  if (!applied || !incoming) return 'unversioned';
  if (incoming.epoch !== applied.epoch) return 'other-epoch';
  return incoming.revision >= applied.revision ? 'current' : 'older';
}

export function createStore({ bootstrap: readBootstrap, get, post, ApiError = BusyError, now = () => Date.now() }) {
  const EMPTY = { home: null, homeAt: 0, commands: {}, bootError: null, stateError: null };
  let state = EMPTY;
  const listeners = new Set();
  let era = 0;          // muda a cada bootstrap/reset: invalida só LEITURAS em voo
  let mutations = 0;    // backend sem stateVersion: uma mutação invalida o GET em voo
  let actionSeq = 0;
  let reading = null;   // { promise, guards, era } — a leitura FÍSICA é única; bootstrap/reset só invalidam o commit dela
  let postIsNewest = false; // o último snapshot veio de um POST: refresh() "legado" é absorvido até o próximo poll

  const publish = (patch) => { state = { ...state, ...patch }; listeners.forEach((fn) => fn()); };
  const appliedVersion = () => state.home?.stateVersion;
  const physicalOf = (deviceId) => state.home?.devices?.find((d) => d.id === deviceId)?.physicalId || `d:${deviceId}`;

  function markPendingUnknown() {
    const commands = { ...state.commands };
    let changed = false;
    for (const [key, entry] of Object.entries(commands)) {
      if (entry.phase === 'pending') { commands[key] = { ...entry, phase: 'unknown', message: 'O servidor reiniciou: resultado desconhecido.' }; changed = true; }
    }
    if (changed) publish({ commands });
  }

  /** Mesma epoch: só avança. Outra epoch: pede bootstrap, nunca substitui às cegas. */
  function applySnapshot(snapshot) {
    if (!snapshot) return false;
    const rel = relationOf(appliedVersion(), snapshot.stateVersion);
    if (rel === 'other-epoch') { markPendingUnknown(); bootstrap().catch(() => {}); return false; }
    if (rel === 'older') return false;
    publish({ home: { ...state.home, ...snapshot }, homeAt: now(), bootError: null, stateError: null });
    return true;
  }

  async function bootstrap() {
    const mine = ++era; // invalida o commit de leituras em voo; a leitura física continua única (reading não é zerado)
    try {
      const data = await readBootstrap();
      if (mine !== era) return state.home;
      const rel = relationOf(appliedVersion(), data?.stateVersion);
      if (rel === 'older') return state.home;
      if (rel === 'other-epoch') markPendingUnknown();
      publish({ home: data, homeAt: now(), bootError: null, stateError: null });
      return data;
    } catch (error) {
      if (mine === era) publish({ bootError: error });
      throw error;
    }
  }

  /** Leitura de /api/state, single-flight. Aplica se ALGUM chamador ainda está vigente (poll oculto não publica). */
  function refresh({ force = false, isCurrent = () => true } = {}) {
    if (!force && postIsNewest) return Promise.resolve(state.home);
    postIsNewest = false;
    if (reading) {
      if (reading.era === era) { reading.guards.push(isCurrent); return reading.promise; }
      // A leitura em voo foi invalidada (bootstrap/reset): o resultado dela será descartado. Espera ela terminar e lê de novo.
      return reading.promise.then(() => {}, () => {}).then(() => refresh({ force: true, isCurrent }));
    }
    const startEra = era;
    const startMutations = mutations;
    const guards = [isCurrent];
    const valid = () => startEra === era && startMutations === mutations && guards.some((guard) => guard());
    const promise = get('/api/state').then(
      (data) => { if (valid()) applySnapshot(data); return state.home; },
      (error) => { if (valid()) publish({ stateError: error }); throw error; },
    ).finally(() => { if (reading?.promise === promise) reading = null; });
    reading = { promise, guards, era: startEra };
    return promise;
  }

  /** Quais chaves físicas o POST reserva. Vazio = ação genérica (configuração, câmeras…). */
  function targetOf(path) {
    const device = DEVICE_PATH.exec(path);
    if (device) return { kind: 'device', deviceId: device[1], keys: [physicalOf(device[1])] };
    if (MODE_PATH.test(path)) return { kind: 'mode', deviceId: null, keys: [...new Set((state.home?.devices || []).map((d) => d.physicalId || `d:${d.id}`))] };
    return { kind: 'generic', deviceId: null, keys: [] };
  }

  /** Mescla SÓ o observado (reported + metadados reais) de um recibo de versão vigente. */
  function mergeObserved(deviceId, receipt) {
    const reported = receipt?.reported || {};
    const fields = Object.keys(reported);
    const home = state.home;
    const index = home?.devices?.findIndex((d) => d.id === deviceId) ?? -1;
    if (index < 0 || !fields.length) return;
    const revision = receipt.stateVersion.revision;
    const device = home.devices[index];
    const merged = {
      ...device,
      state: { ...device.state, ...reported },
      observedAt: receipt.observedAt ?? device.observedAt ?? null,
      fieldObservations: { ...device.fieldObservations, ...Object.fromEntries(fields.map((f) => [f, { observedAt: receipt.observedAt, revision }])) },
      confidence: 'reported',
    };
    const devices = home.devices.map((d, i) => (i === index ? merged : d));
    publish({ home: { ...home, devices, stateVersion: { ...home.stateVersion, revision: Math.max(home.stateVersion.revision, revision) } } });
  }

  /** Julga um recibo contra a versão aplicada: velho ou de outra epoch nunca confirma nem rebaixa. */
  function judge(receipt, phase, deviceId, { merge }) {
    const rel = relationOf(appliedVersion(), receipt?.stateVersion);
    if (rel === 'older' || rel === 'other-epoch') {
      if (rel === 'other-epoch') bootstrap().catch(() => {});
      return { phase: 'unknown', receipt: null, staleReceipt: receipt };
    }
    if (merge && rel === 'current') mergeObserved(deviceId, receipt);
    return { phase, receipt: receipt || null, staleReceipt: null };
  }

  /** Só acerta a entrada da MESMA ação (seq) ainda pendente; outra ação ou entrada já inconclusiva fica como está. */
  function settle(keys, seq, patchFor, { drop = false } = {}) {
    const commands = { ...state.commands };
    let changed = false;
    for (const key of keys) {
      const entry = commands[key];
      if (!entry || entry.seq !== seq || entry.phase !== 'pending') continue;
      if (drop) delete commands[key]; else commands[key] = { ...entry, ...patchFor(key) };
      changed = true;
    }
    if (changed) publish({ commands });
  }

  /** Modo: cada resultado vira o estado do SEU físico, com recibo. Libera o busy sem inventar confirmação. */
  function settleMode(keys, seq, result) {
    const byKey = new Map();
    for (const item of result?.results || []) {
      if (!item?.deviceId || item.status === 'skipped') continue;
      const failed = item.status === 'failed' || item.operation === 'failed';
      const phase = failed ? phaseOfError({ status: 502, receipt: item.receipt }) : phaseOfReceipt(item.receipt);
      const judged = item.receipt ? judge(item.receipt, phase, item.deviceId, { merge: false }) : { phase: failed ? 'error' : 'sent', receipt: null, staleReceipt: null };
      byKey.set(physicalOf(item.deviceId), { deviceId: item.deviceId, ...judged, message: item.message || null });
    }
    const commands = { ...state.commands };
    for (const key of keys) {
      const entry = commands[key];
      if (!entry || entry.seq !== seq || entry.phase !== 'pending') continue;
      const outcome = byKey.get(key);
      if (outcome) commands[key] = { ...entry, ...outcome, mode: true }; else delete commands[key];
    }
    publish({ commands });
  }

  async function run(path, body = {}) {
    const target = targetOf(path);
    if (target.keys.some((key) => state.commands[key]?.phase === 'pending')) {
      throw new ApiError('Esse aparelho já está recebendo um comando. Espere terminar.', 0, 'device_busy');
    }
    const seq = ++actionSeq;
    const startEra = era;
    mutations += 1;
    if (target.keys.length) {
      const commands = { ...state.commands };
      for (const key of target.keys) commands[key] = { seq, deviceId: target.deviceId, phase: 'pending', receipt: null, staleReceipt: null, message: null, startedAt: now() };
      publish({ commands });
    }
    try {
      const result = await post(path, body);
      mutations += 1;
      // Backend sem versão e bootstrap no meio: não há ordem para provar nada.
      const racedUnversioned = !!result?.state && !result.state.stateVersion && startEra !== era;
      if (result?.state && !racedUnversioned) postIsNewest = applySnapshot(result.state);
      if (target.kind === 'mode') { settleMode(target.keys, seq, result); return result; }
      const receipt = result?.command?.receipt || null;
      const verdict = racedUnversioned ? { phase: 'unknown', receipt: null, staleReceipt: null } : judge(receipt, phaseOfReceipt(receipt), target.deviceId, { merge: false });
      settle(target.keys, seq, () => ({ ...verdict, message: result?.command?.message || null }));
      return result;
    } catch (error) {
      mutations += 1;
      if (target.kind === 'mode') {
        if (error?.receipt) settle(target.keys, seq, () => ({ phase: phaseOfError(error), receipt: error.receipt, message: error.message || null }));
        else if (rejectedBeforeSend(error)) settle(target.keys, seq, null, { drop: true }); // nada saiu: libera
        else settle(target.keys, seq, () => ({ phase: 'unknown', receipt: null, staleReceipt: null, message: error?.message || null, mode: true })); // pode ter saído
        throw error;
      }
      const verdict = error?.receipt ? judge(error.receipt, phaseOfError(error), target.deviceId, { merge: true }) : { phase: phaseOfError(error), receipt: null, staleReceipt: null };
      settle(target.keys, seq, () => ({ ...verdict, message: error?.message || null }));
      throw error;
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    bootstrap,
    applySnapshot,
    refresh,
    run,
    commandFor: (deviceId) => state.commands[physicalOf(deviceId)] || null,
    reset() { era += 1; postIsNewest = false; state = EMPTY; listeners.forEach((fn) => fn()); },
  };
}
