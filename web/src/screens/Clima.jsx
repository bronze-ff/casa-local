import { useRef, useState } from 'react';
import { useHome } from '../App.jsx';
import { fmtAgo, fmtTime, usePoll } from '../api.js';
import { Card, Confidence, Dot, Icon, Key, Lcd, PixelBar, Segmented, Stale, useAction, useConfidence } from '../ui.jsx';
import { FANS, MODES, supportedState, temperatures } from './Clima/coverage.js';

const EXTRAS = [['turbo', 'Turbo'], ['eco', 'Eco'], ['brisa', 'Brisa'], ['display', 'Display']];
const SHORT_MODES = { cool: 'Frio', heat: 'Calor', dry: 'Seco', fan: 'Vent.', auto: 'Auto' };
const TIMERS = [30, 60, 120, 240];
const money = (n) => n == null ? '– –' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const number = (n) => n == null ? '– –' : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const label = (list, value) => list.find(([v]) => v === value)?.[1];

function Notice({ children, err }) {
  return <div className={`aviso ${err ? 'err' : ''}`} role="status"><Icon name={err ? 'alert' : 'warn'} size={20} /><span>{children}</span></div>;
}

export default function Clima() {
  const { home, refresh, mode } = useHome();
  const poll = usePoll('/api/state', 5000);
  const routines = usePoll('/api/routines', 20000);
  const energy = usePoll('/api/energy', 20000);
  const [run, busy] = useAction();
  const lock = useRef(false);
  const [learning, setLearning] = useState(false);
  const [draft, setDraft] = useState({ temperature: 24, mode: 'cool', fan: 'auto' });
  const [learningLabel, setLearningLabel] = useState('');
  const [learned, setLearned] = useState('');
  const snapshot = poll.data || home;
  const device = snapshot?.devices?.find((d) => d.id === 'ar-quarto');
  const kind = useConfidence(device);
  const state = device?.state || {};
  const ir = device?.irClimate;
  const preview = mode === 'preview';
  const unknown = ['power', 'temperature', 'mode', 'fan'].some((field) => state[field] == null);
  const reason = poll.error ? 'Sem conexão com o painel.'
    : !device || preview ? null
      : !device.configured ? 'Configure o ar e a central IR no PC de casa.'
        : device.connection !== 'online' ? 'Sem conexão com a central IR.' : null;
  const disabled = busy || !device || !!reason;
  const canLearn = !preview && !!device?.configured && !busy && !poll.error;
  const selected = learning ? draft : state;
  // Estado desconhecido: confere o cadastro pelo padrão de ligar (resfriar · auto), não por nada.
  const baseMode = state.mode ?? 'cool';
  const baseFan = state.fan ?? 'auto';
  const available = temperatures(ir, baseMode, baseFan);
  const templess = !learning && !!ir?.templess?.includes(`${state.mode}/${state.fan}`);
  const timer = routines.data?.timers?.find((item) => item.device === 'ar-quarto');
  const locked = !learning && (disabled || unknown || templess);
  const temp = unknown && !learning ? null : selected.temperature;

  async function action(path, body, okText) {
    if (lock.current) return null;
    lock.current = true;
    try {
      const result = await run(path, body, okText);
      if (result) await Promise.all([poll.reload(), refresh(), energy.reload()]);
      return result;
    } finally { lock.current = false; }
  }
  const command = (values) => action('/api/devices/ar-quarto/commands', { action: 'set', values });
  function choose(field, value) {
    if (learning) { setDraft((old) => ({ ...old, [field]: value })); return; }
    const next = supportedState(ir, field === 'mode' ? value : state.mode, field === 'fan' ? value : state.fan, state.temperature);
    if (next) return command(next);
  }
  async function learn(body, text) {
    if (!canLearn || lock.current) return;
    setLearned('');
    setLearningLabel(text);
    try {
      const result = await action('/api/devices/ar-quarto/learn', body, `Aprendido: ${text}. Teste olhando o aparelho.`);
      if (result) setLearned(text);
    } finally { setLearningLabel(''); }
  }
  async function setTimer(minutes) {
    if (await action('/api/routines/timer', { device: 'ar-quarto', minutes }, minutes ? 'Timer programado.' : 'Timer cancelado.')) await routines.reload();
  }
  const initial = supportedState(ir, 'cool', 'auto', 24);
  const down = () => learning ? setDraft({ ...draft, temperature: draft.temperature - 1 }) : command({ temperature: available.filter((t) => t < state.temperature).at(-1) });
  const up = () => learning ? setDraft({ ...draft, temperature: draft.temperature + 1 }) : command({ temperature: available.find((t) => t > state.temperature) });
  const modeOptions = MODES.map(([value]) => [value, SHORT_MODES[value], !learning && !supportedState(ir, value, state.fan, state.temperature ?? 24)]);
  const fanOptions = FANS.map(([value, text]) => [value, text, !learning && !temperatures(ir, baseMode, value).length]);

  if (!snapshot) return <Lcd role="status">Carregando ar-condicionado…</Lcd>;
  if (!device) return <Card><p className="mut">Ar do quarto indisponível.</p></Card>;
  const spent = ['today', 'month'];
  return (
    <>
      {preview && <Notice>Prévia: comandos simulados, sem enviar IR. Aprender só funciona no modo local.</Notice>}
      <Stale poll={poll} what="estados do ar" />
      {reason && !poll.error && <Notice err>{reason}</Notice>}
      {learning && <Notice>Escolha o estado abaixo, toque em Gravar e, em até 25 s, aperte Ligar no controle do ar já nesse estado, apontado para a central. Para funções extras, toque aqui e aperte o mesmo botão no controle original.</Notice>}
      <Lcd className="stack">
        <div className="row">
          <span className="lbl">{learning ? 'estado a gravar' : `ar do quarto · ${label(MODES, state.mode)?.toLowerCase() || '– –'} · ${label(FANS, state.fan)?.toLowerCase() || '– –'}`}</span>
          <Confidence kind={kind} />
        </div>
        <div style={{ textAlign: 'center' }} aria-live="polite">
          <Dot size={templess ? 64 : 150}>{templess ? 'Auto' : temp == null ? '– –' : `${temp}°`}</Dot>
        </div>
        <PixelBar small value={temp == null || templess ? 0 : temp - 16} max={14} steps={14} />
        <div className="scale"><span>17</span><span>20</span><span>23</span><span>26</span><span>30</span></div>
        <div className="dim" style={{ fontSize: 11 }}>{learning ? 'Gravando: o ar não recebe nada até você tocar em Gravar.' : unknown ? 'Estado estimado desconhecido' : state.power ? 'Ligado · estimado' : 'Desligado · estimado'} · {device.updatedAt ? fmtAgo(device.updatedAt) : 'sem leitura recente'}</div>
      </Lcd>
      {templess && <Notice>Neste modo o controle não envia temperatura; o próprio ar decide. Para escolher, use Resfriar ou Aquecer.</Notice>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Key big center aria-label="Diminuir temperatura" disabled={busy || locked || (learning ? draft.temperature <= 17 : !available.some((t) => t < state.temperature))} onClick={down}>−</Key>
        <Key big center aria-label="Aumentar temperatura" disabled={busy || locked || (learning ? draft.temperature >= 30 : !available.some((t) => t > state.temperature))} onClick={up}>+</Key>
      </div>
      <p className="mut" style={{ fontSize: 11 }}>Estado estimado: o ar não confirma o que recebeu por infravermelho. Usar o controle original pode deixar o painel diferente do aparelho.</p>
      {!learning && (unknown
        ? <Key signal disabled={disabled || !initial || initial.fan !== 'auto' || initial.temperature !== 24} onClick={() => command({ power: true, temperature: 24, mode: 'cool', fan: 'auto' })}>Ligar em 24 °C · resfriar · auto</Key>
        : <Key signal={!state.power} disabled={disabled || (state.power && !!ir && !ir.off)} reason={state.power && !!ir && !ir.off ? 'desligar não aprendido' : undefined} onClick={() => command({ power: !state.power })}>
          <span className="row" style={{ justifyContent: 'flex-start', gap: 10 }}><Icon name="power" size={20} />{state.power ? 'Desligar ar' : 'Ligar ar'}</span>
        </Key>)}
      {!learning && unknown && !!ir?.off && <Key disabled={disabled} onClick={() => command({ power: false })}>Enviar desligar</Key>}
      {!learning && !!ir && !ir.off && <p className="mut" style={{ fontSize: 11 }}>Desligar não aprendido. Use Aprender › Gravar desligar.</p>}
      <span className="lbl">Modo · só o que foi aprendido</span>
      <Segmented label="Modo" value={selected.mode ?? null} options={modeOptions} disabled={busy || (!learning && (disabled || unknown))} onChange={(value) => choose('mode', value)} />
      <span className="lbl">Ventilação</span>
      <Segmented label="Ventilação" value={selected.fan ?? null} options={fanOptions} disabled={busy || (!learning && (disabled || unknown))} onChange={(value) => choose('fan', value)} />
      <span className="lbl">Funções do controle original</span>
      <div role="group" aria-label="Funções do controle original" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {EXTRAS.map(([key, text]) => {
          const calibrated = key === 'turbo' && ir?.turbo && !learning;
          const supported = calibrated || !!ir?.extras?.[key];
          return (
            <Key center key={key} on={calibrated ? !!state.turbo : undefined} disabled={learning ? !canLearn : disabled || !supported || (calibrated && state.power !== true)}
              sub={learning ? ir?.extras?.[key] ? 'Regravar' : 'Gravar' : !supported ? 'Não aprendido' : calibrated ? 'Estimado' : 'Alterna no aparelho'}
              onClick={() => learning ? learn({ key }, text) : calibrated ? command({ turbo: !state.turbo }) : action('/api/devices/ar-quarto/commands', { action: 'key', key })}>
              {text}{calibrated && state.turbo ? ' ligado' : ''}
            </Key>
          );
        })}
      </div>
      <p className="mut" style={{ fontSize: 11 }}>Eco, Brisa e Display alternam no aparelho, sem confirmação de estado. O Turbo calibrado acompanha o estado completo; sem calibração, usa o botão aprendido.</p>
      {learning && (
        <>
          <Key signal disabled={!canLearn} onClick={() => learn({ state: { power: true, ...draft } }, `${draft.temperature} °C · ${label(MODES, draft.mode)} · ${label(FANS, draft.fan)}`)}>Gravar ligar neste estado</Key>
          <Key disabled={!canLearn} onClick={() => learn({ key: 'off' }, 'desligar')}>{ir?.off ? 'Regravar desligar' : 'Gravar desligar'}</Key>
        </>
      )}
      {learningLabel && <Notice>Aguardando {learningLabel}… Aperte o botão no controle original, apontado para a central, em até 25 s. Aguarde a confirmação.</Notice>}
      {learned && <Notice>Aprendido: {learned}. Saia de Aprender e teste olhando o aparelho. Gravar o sinal não confirma que ele funciona no ar.</Notice>}
      {ir && <p className="mut" style={{ fontSize: 11 }}>Cadastro: {Object.entries(ir.origins || {}).map(([origin, count]) => `${count} ${origin}`).join(' · ') || 'sem sinais'}. {ir.calibrated ? 'Quadros calibrados.' : 'Perfil ainda não confirmado olhando o ar.'}</p>}

      <span className="lbl">Desligar em</span>
      <Stale poll={routines} what="timers" />
      {!routines.data && !routines.error && <p role="status" className="mut">Carregando timer…</p>}
      <div role="group" aria-label="Desligar em" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
        {TIMERS.map((minutes) => (
          <Key center key={minutes} disabled={busy || !routines.data || !!routines.error || state.power !== true || !device.configured || preview} onClick={() => setTimer(minutes)}>{minutes < 60 ? `${minutes} min` : `${minutes / 60} h`}</Key>
        ))}
      </div>
      {timer ? (
        <>
          <p className="mut" style={{ fontSize: 12 }}>Desliga às {fmtTime(timer.at)}</p>
          <Key disabled={busy || !!routines.error || preview} onClick={() => setTimer(0)}>Cancelar timer</Key>
          {!!timer.attempts && <Notice err>Tentando desligar novamente após uma falha.</Notice>}
        </>
      ) : routines.data && <p className="mut" style={{ fontSize: 11 }}>Nenhum desligamento programado.</p>}
      {routines.data?.lastError && <Notice err>Falha no agendador: {routines.data.lastError}</Notice>}
      <p className="mut" style={{ fontSize: 11 }}>O PC de casa e o servidor precisam continuar ligados para executar o timer.{preview ? ' Timers indisponíveis na prévia.' : ''}</p>

      <Stale poll={energy} what="estimativas de energia" />
      {!energy.data ? !energy.error && <p role="status" className="mut">Carregando estimativa…</p> : (
        <Lcd className="stack">
          <div className="row"><span className="lbl">gasto do ar</span><Confidence kind={preview ? 'preview' : 'estimated'} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {spent.map((period) => (
              <div key={period} className="stack" style={{ gap: 4 }}>
                <span className="lbl">{period === 'today' ? 'Hoje' : 'Este mês'}</span>
                <Dot size={34}>{money(energy.data[period]?.cost)}</Dot>
                <span className="dim" style={{ fontSize: 12 }}>{number(energy.data[period]?.hours)} h · {number(energy.data[period]?.kwh)} kWh</span>
              </div>
            ))}
          </div>
          <div className="dim" style={{ fontSize: 11 }}>Base: {number(energy.data.config?.watts)} W · {money(energy.data.config?.tariff)}/kWh. Conta pelos comandos do painel. Usar o controle original pode alterar a estimativa; não é uma medição elétrica.</div>
        </Lcd>
      )}
      <Key on={learning} disabled={busy || (!canLearn && !learning)} sub="aponte o controle original · até 25 s" onClick={() => { setLearning((old) => !old); setLearned(''); }}>
        <span className="row" style={{ justifyContent: 'flex-start', gap: 10 }}><Icon name="plus" size={20} />Aprender</span>
      </Key>
    </>
  );
}
