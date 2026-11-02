import { useRef, useState } from 'react';
import { useCommand, useHome, usePoll } from '../../core/hooks.js';
import { fmtAgo, fmtTime } from '../../core/format.js';
import { useAction } from '../../ui/actions.js';
import { confidenceOf } from '../../ui/confidence.js';
import { Icon } from '../../ui/Icon.jsx';
import { Banner, Button, CommandState, Confidence, Empty, IconButton, Segmented, Skeleton } from '../../ui/kit.jsx';
import { Overlay } from '../../ui/Overlay.jsx';
import { Dial } from './Dial.jsx';
import { EnergyCard } from './Energy.jsx';
import { ExtrasPanel } from './Extras.jsx';
import { TimerPanel } from './Timer.jsx';
import { FANS, MODES, labelOf, supportedState, temperatures } from './coverage.js';

const DEVICE = 'ar-quarto';
const BASE = `/api/devices/${DEVICE}`;

/**
 * Clima por infravermelho. O ar NÃO informa o que está fazendo: tudo aqui é o último comando enviado (ESTIMADO).
 * Dial: arrastar só muda a tela; um único comando sai ao soltar. Sem Aplicar extra (só o brilho usa rascunho + Aplicar).
 */
export default function Clima() {
  const { home, homeAt, stateError } = useHome();
  const routines = usePoll('/api/routines', 20000);
  const energy = usePoll('/api/energy', 20000);
  const command = useCommand(DEVICE);
  const [run, busy] = useAction();
  const lock = useRef(false);
  const [learning, setLearning] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [draft, setDraft] = useState({ temperature: 24, mode: 'cool', fan: 'auto' });
  const [waiting, setWaiting] = useState('');
  const [learned, setLearned] = useState('');

  const device = home?.devices?.find((d) => d.id === DEVICE);
  if (!home) return <div className="col" role="status"><Skeleton height={28} width="30%" /><Skeleton height={320} /></div>;
  if (!device) return <Empty title="Ar do quarto indisponível">O servidor não devolveu este aparelho.</Empty>;

  const state = device.state || {};
  const ir = device.irClimate;
  const preview = home.mode === 'preview';
  const unknown = ['power', 'temperature', 'mode', 'fan'].some((field) => state[field] == null);
  const reason = stateError ? 'Sem conexão com o painel.'
    : preview ? null
      : !device.configured ? 'Configure o ar e a central IR no PC de casa.'
        : device.connection !== 'online' ? 'Sem conexão com a central IR.' : null;
  const blocked = busy || !!reason;
  const canLearn = !preview && !!device.configured && !busy && !stateError;
  const selected = learning ? draft : state;
  const baseMode = state.mode ?? 'cool';
  const baseFan = state.fan ?? 'auto';
  const available = temperatures(ir, baseMode, baseFan);
  const templess = !learning && !!ir?.templess?.includes(`${state.mode}/${state.fan}`);
  const noSignal = !learning && !!ir && !templess && available.length === 0; // cadastro existe e este modo/ventilação não tem nenhum sinal
  const locked = !learning && (blocked || unknown || templess || noSignal);
  const temp = unknown && !learning ? null : selected.temperature;
  const timer = routines.data?.timers?.find((item) => item.device === DEVICE);
  const kind = confidenceOf(device, command);
  const initial = supportedState(ir, 'cool', 'auto', 24);

  async function action(path, body, okText) {
    if (lock.current || stateError) return null; // sem conexão: o banner promete bloqueio, o handler também cumpre
    lock.current = true;
    try {
      const result = await run(path, body, okText);
      if (result) energy.reload();
      return result;
    } finally { lock.current = false; }
  }
  const send = (values) => action(`${BASE}/commands`, { action: 'set', values });
  function choose(field, value) {
    if (learning) { setDraft((old) => ({ ...old, [field]: value })); return undefined; }
    const next = supportedState(ir, field === 'mode' ? value : state.mode, field === 'fan' ? value : state.fan, state.temperature);
    return next ? send(next) : undefined;
  }
  async function learn(body, text) {
    if (!canLearn || lock.current) return;
    setLearned(''); setWaiting(text);
    try {
      const result = await action(`${BASE}/learn`, body, `Aprendido: ${text}. Teste olhando o aparelho.`);
      if (result) setLearned(text);
    } finally { setWaiting(''); }
  }
  async function setTimer(minutes) {
    if (await action('/api/routines/timer', { device: DEVICE, minutes }, minutes ? 'Timer programado.' : 'Timer cancelado.')) routines.reload();
  }
  const step = (direction) => (learning
    ? setDraft((old) => ({ ...old, temperature: old.temperature + direction }))
    : send({ temperature: direction < 0 ? available.filter((t) => t < state.temperature).at(-1) : available.find((t) => t > state.temperature) }));

  const modeOptions = MODES.map(({ value, short }) => ({ value, label: short, disabled: !learning && !supportedState(ir, value, state.fan, state.temperature ?? 24) }));
  const fanOptions = FANS.map(({ value, label }) => ({ value, label, disabled: !learning && !temperatures(ir, baseMode, value).length }));

  return (
    <div className="col">
      {stateError && <Banner kind="warn" icon="off" title="Sem conexão com o PC de casa">Mostrando o último estado conhecido, {fmtAgo(homeAt)}. Os comandos ficam bloqueados.</Banner>}
      {preview && <Banner kind="info" icon="eye">Prévia: os comandos são simulados e nenhum sinal IR é enviado. Aprender só funciona no modo local.</Banner>}
      {reason && !stateError && <Banner kind="err" icon="alert">{reason}</Banner>}
      {learning && <Banner kind="info" icon="radio" title="Modo Aprender">Escolha o estado, toque em Gravar e, em até 25 s, aperte Ligar no controle do ar já nesse estado, apontado para a central. Para as funções extras, abra Funções extras e aperte o mesmo botão no controle original.</Banner>}
      <div className="stage two">
        <section className="obj warm col" aria-label="Temperatura do ar">
          <div className="row sp wrap">
            <span className="cap">{learning ? 'Estado a gravar' : `Ar do quarto · ${labelOf(MODES, state.mode)?.toLowerCase() || '—'} · ${labelOf(FANS, state.fan)?.toLowerCase() || '—'}`}</span>
            <span className="row"><Confidence kind={kind} /><CommandState command={command} /></span>
          </div>
          <Dial label="Temperatura do ar" unit=" graus" min={17} max={30} values={learning ? undefined : available} value={templess || temp == null ? null : temp} disabled={busy || locked || templess}
            onCommit={(value) => (learning ? setDraft((old) => ({ ...old, temperature: value })) : available.includes(value) ? send({ temperature: value }) : null)}>
            {(shown) => (
              <>
                <span className="num xl" aria-live="polite">{templess ? 'Auto' : shown == null ? '—' : <>{shown}<sup>°</sup></>}</span>
                <span className="sub">{learning ? 'gravando' : templess ? 'o ar decide' : 'estimado'}</span>
              </>
            )}
          </Dial>
          <div className="row" style={{ justifyContent: 'center', gap: 20 }}>
            <IconButton icon="minus" label="Diminuir temperatura" className="step round" size={28} disabled={busy || locked || (learning ? draft.temperature <= 17 : !available.some((t) => t < state.temperature))} onClick={() => step(-1)} />
            <IconButton icon="plus" label="Aumentar temperatura" className="step round" size={28} disabled={busy || locked || (learning ? draft.temperature >= 30 : !available.some((t) => t > state.temperature))} onClick={() => step(1)} />
          </div>
          <p className="sub" style={{ textAlign: 'center' }}>
            {learning ? 'Gravando: o ar não recebe nada até você tocar em Gravar.' : unknown ? 'Estado estimado desconhecido' : state.power ? 'Ligado · estimado' : 'Desligado · estimado'} · {device.updatedAt ? `último envio ${fmtAgo(device.updatedAt)}` : 'sem envio recente'}
          </p>
          <p className="hint">O ar não confirma o que recebeu por infravermelho. Usar o controle original deixa o painel diferente do aparelho.</p>
          {noSignal && <Banner kind="warn" icon="alert">Nenhuma temperatura aprendida para este modo e ventilação. Use Aprender para gravar os sinais.</Banner>}
          {templess && <Banner kind="warn" icon="alert">Neste modo o controle não envia temperatura; o próprio ar decide. Para escolher, use Resfriar ou Aquecer.</Banner>}
          {!learning && (unknown
            ? <Button variant="p" disabled={blocked || !initial || initial.fan !== 'auto' || initial.temperature !== 24} reason={blocked ? reason : 'Esse estado inicial não foi aprendido.'} onClick={() => send({ power: true, temperature: 24, mode: 'cool', fan: 'auto' })}>Ligar em 24 °C · resfriar · auto</Button>
            : <Button variant={state.power ? 's' : 'p'} icon="power" busy={busy} disabled={blocked || (state.power && !!ir && !ir.off)} reason={state.power && !!ir && !ir.off ? 'Desligar ainda não foi aprendido. Use Aprender › Gravar desligar.' : reason || undefined} onClick={() => send({ power: !state.power })}>{state.power ? 'Desligar o ar' : 'Ligar o ar'}</Button>)}
          {!learning && unknown && !!ir?.off && <Button variant="s" disabled={blocked} reason={reason || undefined} onClick={() => send({ power: false })}>Enviar desligar</Button>}
          {!learning && !!ir && !ir.off && <p className="hint">Desligar ainda não foi aprendido. Use Aprender › Gravar desligar.</p>}
        </section>

        <div className="col">
          <h2 className="cap">Modo · só o que foi aprendido</h2>
          <Segmented label="Modo" value={selected.mode ?? null} options={modeOptions} disabled={busy || (!learning && (blocked || unknown))} onChange={(value) => choose('mode', value)} />
          <h2 className="cap">Ventilação</h2>
          <Segmented label="Ventilação" value={selected.fan ?? null} options={fanOptions} disabled={busy || (!learning && (blocked || unknown))} onChange={(value) => choose('fan', value)} />
          <div className="grid two">
            <Button variant="s" icon="fan" aria-haspopup="dialog" onClick={() => setSheet('extras')}>Funções extras</Button>
            <Button variant="s" icon="clock" aria-haspopup="dialog" onClick={() => setSheet('timer')}>{timer ? `Desliga às ${fmtTime(timer.at)}` : 'Timer'}</Button>
          </div>
          {learning && (
            <div className="col">
              <Button variant="p" busy={!!waiting} disabled={!canLearn} reason="Não é possível gravar agora." onClick={() => learn({ state: { power: true, ...draft } }, `${draft.temperature} °C · ${labelOf(MODES, draft.mode)} · ${labelOf(FANS, draft.fan)}`)}>Gravar ligar neste estado</Button>
              <Button variant="s" disabled={!canLearn} reason="Não é possível gravar agora." onClick={() => learn({ key: 'off' }, 'desligar')}>{ir?.off ? 'Regravar desligar' : 'Gravar desligar'}</Button>
            </div>
          )}
          {waiting && <Banner kind="info" icon="clock" role="status">Aguardando {waiting}… Aperte o botão no controle original, apontado para a central, em até 25 s.</Banner>}
          {learned && <Banner kind="warn" icon="alert">Aprendido: {learned}. Saia de Aprender e teste olhando o aparelho. Gravar o sinal não confirma que ele funciona no ar.</Banner>}
          {ir && <p className="hint">Cadastro: {Object.entries(ir.origins || {}).map(([origin, count]) => `${count} ${origin}`).join(' · ') || 'sem sinais'}. {ir.calibrated ? 'Quadros calibrados.' : 'Perfil ainda não confirmado olhando o ar.'}</p>}
          <Button variant={learning ? 'p' : 's'} icon="plus" aria-pressed={learning ? 'true' : 'false'} disabled={busy || (!canLearn && !learning)} reason="Aprender só funciona no modo local, com a central IR conectada." onClick={() => { setLearning((old) => !old); setLearned(''); }}>{learning ? 'Sair de Aprender' : 'Aprender'}</Button>
          <EnergyCard energy={energy} preview={preview} />
        </div>
      </div>

      <Overlay open={sheet === 'extras'} onClose={() => setSheet(null)} title="Funções do controle original" kind="sheet">
        <ExtrasPanel ir={ir} state={state} learning={learning} canLearn={canLearn} disabled={blocked || unknown} busy={busy}
          onTurbo={(turbo) => send({ turbo })} onKey={(key) => action(`${BASE}/commands`, { action: 'key', key })} onLearn={learn} />
      </Overlay>
      <Overlay open={sheet === 'timer'} onClose={() => setSheet(null)} title="Desligar o ar em" kind="sheet">
        <TimerPanel routines={routines} timer={timer} state={state} device={device} preview={preview} busy={busy} onSet={setTimer} />
      </Overlay>
    </div>
  );
}
