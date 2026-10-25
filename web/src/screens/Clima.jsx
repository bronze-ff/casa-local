import { useRef, useState } from 'react';
import { useHome } from '../App.jsx';
import { fmtAgo, fmtTime, usePoll } from '../api.js';
import { Card, Icon, Stale, useAction } from '../ui.jsx';
import { FANS, MODES, supportedState, temperatures } from './Clima/coverage.js';

const EXTRAS = [['turbo', 'Turbo'], ['eco', 'Eco'], ['brisa', 'Brisa'], ['display', 'Display']];
const money = (n) => n == null ? '– –' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const number = (n) => n == null ? '– –' : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const gridStyle = { gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' };

export default function Clima({ param }) {
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
  const state = device?.state || {};
  const ir = device?.irClimate;
  const preview = mode === 'preview';
  const unknown = ['power', 'temperature', 'mode', 'fan'].some((field) => state[field] == null);
  const disabled = busy || !!poll.error || !device || (!preview && (!device.configured || device.connection !== 'online'));
  const canLearn = !preview && !!device?.configured && !busy && !poll.error;
  const selected = learning ? draft : state;
  // Estado desconhecido: confere o cadastro pelo padrão de ligar (resfriar · auto), não por nada.
  const baseMode = state.mode ?? 'cool';
  const baseFan = state.fan ?? 'auto';
  const available = temperatures(ir, baseMode, baseFan);
  const templess = !learning && !!ir?.templess?.includes(`${state.mode}/${state.fan}`);
  const timer = routines.data?.timers?.find((item) => item.device === 'ar-quarto');

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
  async function learn(body, label) {
    if (!canLearn || lock.current) return;
    setLearned('');
    setLearningLabel(label);
    try {
      const result = await action('/api/devices/ar-quarto/learn', body, `Aprendido: ${label}. Teste olhando o aparelho.`);
      if (result) setLearned(label);
    } finally { setLearningLabel(''); }
  }
  async function setTimer(minutes) {
    if (await action('/api/routines/timer', { device: 'ar-quarto', minutes }, minutes ? 'Timer programado.' : 'Timer cancelado.')) await routines.reload();
  }
  const initial = supportedState(ir, 'cool', 'auto', 24);

  return <>
    <h1 style={{ fontSize: 28, fontWeight: 600 }}>Ar do quarto</h1>
    {preview && <p className="notice info">Prévia: comandos simulados, sem enviar IR. Aprender só funciona no modo local.</p>}
    <Stale poll={poll} what="estados do ar" />
    {!snapshot ? <p role="status">Carregando ar-condicionado…</p> : !device ? <Card><p className="muted">Ar do quarto indisponível.</p></Card> : <>
      {!preview && device.connection !== 'online' && <p className="notice">{device.configured ? 'Sem conexão com a central IR.' : 'Configure o ar e a central IR no PC de casa.'}</p>}
      <div className="grid" style={gridStyle}>
        <Card title="Electrolux · via Geonav" aside={<button type="button" className={`btn ${learning ? 'primary' : ''}`} aria-pressed={learning} disabled={busy || (!canLearn && !learning)} onClick={() => { setLearning((old) => !old); setLearned(''); }}>Aprender</button>}>
          {learning && <p className="notice info">Escolha o estado abaixo, toque em Gravar e, em até 25 s, aperte Ligar no controle do ar já nesse estado, apontado para a central. Para funções extras, toque aqui e aperte o mesmo botão no controle original.</p>}
          <p className="label">{learning ? 'Estado a gravar' : unknown ? 'Estado desconhecido' : state.power ? 'Ligado · estimado' : 'Desligado · estimado'}</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <button type="button" className="btn" style={{ padding: '0 12px' }} aria-label="Diminuir temperatura" disabled={busy || (!learning && (disabled || unknown || templess)) || (learning ? draft.temperature <= 17 : !available.some((t) => t < state.temperature))} onClick={() => learning ? setDraft({ ...draft, temperature: draft.temperature - 1 }) : command({ temperature: available.filter((t) => t < state.temperature).at(-1) })}><Icon name="minus" /></button>
            <output className="mono num" aria-live="polite" style={{ fontSize: 48, color: !learning && state.power ? 'var(--accent)' : 'var(--text)', whiteSpace: 'nowrap' }}>{unknown && !learning ? '– –' : templess ? 'Auto' : selected.temperature}<span className="small">{!templess && (!unknown || learning) ? ' °C' : ''}</span></output>
            <button type="button" className="btn" style={{ padding: '0 12px' }} aria-label="Aumentar temperatura" disabled={busy || (!learning && (disabled || unknown || templess)) || (learning ? draft.temperature >= 30 : !available.some((t) => t > state.temperature))} onClick={() => learning ? setDraft({ ...draft, temperature: draft.temperature + 1 }) : command({ temperature: available.find((t) => t > state.temperature) })}><Icon name="plus" /></button>
          </div>
          <p className="small muted">Estado estimado: o ar não confirma o que recebeu por infravermelho. Usar o controle original pode deixar o painel diferente do aparelho.</p>
          {templess && <p className="notice info">Neste modo o controle não envia temperatura; o próprio ar decide. Para escolher, use Resfriar ou Aquecer.</p>}
          <label className="field">Temperatura {learning ? 'a gravar' : 'cadastrada'}
            <select value={selected.temperature ?? ''} disabled={busy || (!learning && (disabled || unknown || templess))} onChange={(event) => learning ? setDraft({ ...draft, temperature: Number(event.target.value) }) : command({ temperature: Number(event.target.value) })}>
              <option value="" disabled>– –</option>
              {Array.from({ length: 14 }, (_, i) => i + 17).map((t) => <option key={t} value={t} disabled={!learning && !available.includes(t)}>{t} °C{!learning && !available.includes(t) ? ' · não aprendido' : ''}</option>)}
            </select>
          </label>
          {!learning && <>
            {unknown ? <button type="button" className="btn primary big" disabled={disabled || !initial || initial.fan !== 'auto' || initial.temperature !== 24} onClick={() => command({ power: true, temperature: 24, mode: 'cool', fan: 'auto' })}>Ligar em 24 °C · resfriar · auto</button> : <button type="button" className={`btn big ${state.power ? 'primary' : ''}`} disabled={disabled || (state.power && !!ir && !ir.off)} onClick={() => command({ power: !state.power })}><Icon name="power" />{state.power ? 'Desligar ar' : 'Ligar ar'}</button>}
            {unknown && !!ir?.off && <button type="button" className="btn" disabled={disabled} onClick={() => command({ power: false })}>Enviar desligar</button>}
            {!!ir && !ir.off && <p className="small muted">Desligar não aprendido. Use Aprender › Gravar desligar.</p>}
          </>}
          <p className="small muted">{device.confidence === 'preview' ? 'Simulado' : device.confidence === 'unknown' ? 'Sem estado conhecido' : 'Estado estimado'} · {device.updatedAt ? fmtAgo(device.updatedAt) : 'sem leitura recente'}</p>
        </Card>
        <Card title={learning ? 'Preparar aprendizado' : 'Modo e ventilação'}>
          <label className="field">Modo
            <select value={selected.mode ?? ''} disabled={busy || (!learning && (disabled || unknown))} onChange={(event) => choose('mode', event.target.value)}>
              <option value="" disabled>– –</option>
              {MODES.map(([value, label]) => { const supported = !!supportedState(ir, value, state.fan, state.temperature ?? 24); return <option key={value} value={value} disabled={!learning && !supported}>{label}{!learning && !supported ? ' · não aprendido' : ''}</option>; })}
            </select>
          </label>
          <label className="field">Ventilação
            <select value={selected.fan ?? ''} disabled={busy || (!learning && (disabled || unknown))} onChange={(event) => choose('fan', event.target.value)}>
              <option value="" disabled>– –</option>
              {FANS.map(([value, label]) => <option key={value} value={value} disabled={!learning && !temperatures(ir, baseMode, value).length}>{label}{!learning && !temperatures(ir, baseMode, value).length ? ' · não aprendido' : ''}</option>)}
            </select>
          </label>
          <h3 style={{ fontSize: 16 }}>Funções do controle original</h3>
          <div role="group" aria-label="Funções do controle original" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            {EXTRAS.map(([key, label]) => {
              const calibrated = key === 'turbo' && ir?.turbo && !learning;
              const supported = calibrated || !!ir?.extras?.[key];
              return <button type="button" className={`btn ${calibrated && state.turbo ? 'primary' : ''}`} key={key} disabled={learning ? !canLearn : disabled || !supported || (calibrated && state.power !== true)} aria-pressed={calibrated ? !!state.turbo : undefined} style={{ minHeight: 60, flexDirection: 'column', gap: 0, borderStyle: supported ? 'solid' : 'dashed' }} onClick={() => learning ? learn({ key }, label) : calibrated ? command({ turbo: !state.turbo }) : action('/api/devices/ar-quarto/commands', { action: 'key', key })}>
                {label}{calibrated && state.turbo ? ' ligado' : ''}<span className="small muted">{learning ? ir?.extras?.[key] ? 'Regravar' : 'Gravar' : !supported ? 'Não aprendido' : calibrated ? 'Estimado' : 'Alterna no aparelho'}</span>
              </button>;
            })}
          </div>
          <p className="small muted">Eco, Brisa e Display alternam no aparelho, sem confirmação de estado. O Turbo calibrado acompanha o estado completo; sem calibração, usa o botão aprendido.</p>
          {learning && <>
            <button type="button" className="btn primary" disabled={!canLearn} onClick={() => learn({ state: { power: true, ...draft } }, `${draft.temperature} °C · ${MODES.find(([v]) => v === draft.mode)[1]} · ${FANS.find(([v]) => v === draft.fan)[1]}`)}>Gravar ligar neste estado</button>
            <button type="button" className="btn" disabled={!canLearn} onClick={() => learn({ key: 'off' }, 'desligar')}>{ir?.off ? 'Regravar desligar' : 'Gravar desligar'}</button>
          </>}
          {learningLabel && <p role="status" className="notice info">Aguardando {learningLabel}… Aperte o botão no controle original, apontado para a central, em até 25 s. Aguarde a confirmação.</p>}
          {learned && <p role="status" className="notice info">Aprendido: {learned}. Saia de Aprender e teste olhando o aparelho. Gravar o sinal não confirma que ele funciona no ar.</p>}
          {ir && <p className="small muted">Cadastro: {Object.entries(ir.origins || {}).map(([origin, count]) => `${count} ${origin}`).join(' · ') || 'sem sinais'}. {ir.calibrated ? 'Quadros calibrados.' : 'Perfil ainda não confirmado olhando o ar.'}</p>}
        </Card>
        <Card title="Desligar em">
          <Stale poll={routines} what="timers" />
          {!routines.data && !routines.error && <p role="status" className="muted">Carregando timer…</p>}
          <div role="group" aria-label="Desligar em" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[30, 60, 120, 240].map((minutes) => <button type="button" className="btn chip" key={minutes} disabled={busy || !routines.data || !!routines.error || state.power !== true || !device.configured || preview} onClick={() => setTimer(minutes)}>{minutes < 60 ? `${minutes} min` : `${minutes / 60} h`}</button>)}
          </div>
          {timer ? <><p className="mono num">Desliga às {fmtTime(timer.at)}</p><button type="button" className="btn" disabled={busy || !!routines.error || preview} onClick={() => setTimer(0)}>Cancelar timer</button>{!!timer.attempts && <p className="notice">Tentando desligar novamente após uma falha.</p>}</> : routines.data && <p className="small muted">Nenhum desligamento programado.</p>}
          {routines.data?.lastError && <p className="notice">Falha no agendador: {routines.data.lastError}</p>}
          <p className="small muted">O PC de casa e o servidor precisam continuar ligados para executar o timer.{preview ? ' Timers indisponíveis na prévia.' : ''}</p>
        </Card>
        <Card title="Gasto estimado">
          <Stale poll={energy} what="estimativas de energia" />
          {!energy.data ? !energy.error && <p role="status" className="muted">Carregando estimativa…</p> : <>
            {['today', 'month'].map((period) => <div className="row" key={period}><div className="stack"><span className="label">{period === 'today' ? 'Hoje' : 'Este mês'}</span><span className="small muted">{number(energy.data[period]?.hours)} h · {number(energy.data[period]?.kwh)} kWh</span></div><strong className="mono num" style={{ fontSize: 24 }}>{money(energy.data[period]?.cost)}</strong></div>)}
            <p className="small muted">Base: {number(energy.data.config?.watts)} W · {money(energy.data.config?.tariff)}/kWh. Conta pelos comandos do painel. Usar o controle original pode alterar a estimativa; não é uma medição elétrica.</p>
          </>}
        </Card>
      </div>
    </>}
  </>;
}
