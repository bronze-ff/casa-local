import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Activity, AirVent, Leaf, MoveVertical, SunDim, Zap, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Cctv, Check, Copy, Droplets, Fan, Film, Flame, Home, House, Lightbulb, LoaderCircle, MapPin, Minus, Monitor, Moon, Plus, Power, Radio, RefreshCw, Settings2, ShieldCheck, Snowflake, Sparkles, Thermometer, Tv, Undo2, Volume2, VolumeX, Wind, X } from 'lucide-react';
import Cameras from './components/Cameras';
import type { Device } from './types';
import { useCasa } from './useCasa';

const RoomScene = lazy(() => import('./components/RoomScene'));
const Location = lazy(() => import('./components/Location'));
const Central = lazy(() => import('./components/Central'));
const AcTimer = lazy(() => import('./components/Central').then(module => ({default: module.AcTimer})));
const NetworkTvs = lazy(() => import('./components/NetworkTvs'));
type Casa = ReturnType<typeof useCasa>;
type Tab = 'luzes' | 'clima' | 'tv' | 'cameras' | 'local' | 'central';
const TABS: [Tab, string, typeof Lightbulb][] = [['luzes', 'Luzes', Lightbulb], ['clima', 'Clima', AirVent], ['tv', 'TV', Tv], ['cameras', 'Câmeras', Cctv], ['local', 'Local', MapPin], ['central', 'Central', Activity]];

const PALETTE: [string, string][] = [
  ['#FF3B30', 'Vermelho'], ['#FF6A2B', 'Laranja'], ['#FFA51F', 'Âmbar'], ['#FFD84D', 'Amarelo'], ['#9BE15D', 'Lima'], ['#34C759', 'Verde'], ['#2ED3B7', 'Turquesa'], ['#FFFFFF', 'Branco frio'],
  ['#34C8FF', 'Ciano'], ['#64A8FF', 'Céu'], ['#2F6BFF', 'Azul'], ['#5E5CE6', 'Índigo'], ['#9B5CF6', 'Violeta'], ['#F25FD0', 'Magenta'], ['#FF7EA6', 'Rosa'], ['#FFD6A0', 'Branco quente'],
];
const MODES: [string, string, typeof Snowflake][] = [['cool', 'Resfriar', Snowflake], ['heat', 'Aquecer', Flame], ['dry', 'Desumidificar', Droplets], ['fan', 'Ventilar', Wind], ['auto', 'Automático', Sparkles]];
// Botões do controle original que não existem no perfil Geonav: funcionam depois de gravados com Aprender.
const AC_EXTRAS: [string, string, typeof Zap][] = [['turbo', 'Turbo', Zap], ['eco', 'Eco', Leaf], ['brisa', 'Brisa', MoveVertical], ['display', 'Display', SunDim]];
const FANS: [string, string][] = [['auto', 'Auto'], ['low', 'Baixa'], ['medium', 'Média'], ['high', 'Alta']];

// O endereço pode trazer um detalhe depois de ":" (ex.: #cameras:cam4 abre a câmera 4 ao vivo).
function hashTarget(): string | null {
  return window.location.hash.slice(1).split(':')[1] ?? null;
}
function initialTab(): Tab {
  const hash = window.location.hash.slice(1).split(':')[0];
  return (TABS.some(([id]) => id === hash) ? hash : 'luzes') as Tab;
}
function locked(device: Device | undefined, casa: Casa) {
  return !device || !!casa.error || !!casa.busy || (casa.data?.mode === 'local' && (!device.configured || device.connection !== 'online'));
}
function statusText(device: Device | undefined, casa: Casa) {
  if (!device) return 'Aparelho indisponível';
  if (casa.data?.mode === 'preview') return 'Prévia · nenhum comando físico';
  if (!device.configured) return 'Aguardando configuração das chaves locais';
  if (device.connection === 'offline') return 'Sem conexão com o aparelho';
  return device.confidence === 'estimated' ? 'Disponível · estado estimado' : 'Disponível';
}
function Footer({device, casa, extra}: {device: Device | undefined; casa: Casa; extra?: string}) {
  const tone = casa.data?.mode === 'preview' ? 'preview' : device?.connection ?? 'offline';
  return <div className={`card-foot tone-${tone}`}><i /><p>{statusText(device, casa)}{extra ? <small>{extra}</small> : null}</p></div>;
}
function PowerCircle({on, label, disabled, busy, onClick}: {on: boolean; label: string; disabled: boolean; busy: boolean; onClick: () => void}) {
  return <button className={`power-circle ${on ? 'on' : ''}`} aria-label={label} aria-pressed={on} disabled={disabled} onClick={onClick}>{busy ? <LoaderCircle className="spin" size={20} /> : <Power size={20} />}</button>;
}

function Lights({casa}: {casa: Casa}) {
  const lamps = (casa.data?.devices ?? []).filter(device => device.kind === 'light');
  const [lampId, setLampId] = useState('quarto-luz');
  const lamp = lamps.find(device => device.id === lampId) ?? lamps[0];
  const disabled = locked(lamp, casa);
  const level = lamp?.state.brightness ?? 0;
  const color = lamp?.state.colorHex?.toUpperCase() ?? '#FFD6A0';
  const on = lamp?.state.power === true;
  const setLevel = (value: number) => lamp && void casa.command(lamp.id, {brightness: Math.max(10, Math.min(100, value))});
  const scenes = casa.data?.scenes ?? [];
  const preview = casa.data?.mode === 'preview';
  return <section className="card lights" style={{'--lamp': color} as CSSProperties} aria-label="Luzes">
    <div className="scene-wrap">
      <Suspense fallback={<div className="scene-placeholder" />}>
        <RoomScene unknown={lamp?.state.power == null} power={on} brightness={level} color={color} room={lamp?.roomId ?? 'quarto'} />
      </Suspense>
    </div>
    <div className="lamp-bar">
      <div className="segmented" role="tablist" aria-label="Escolher lâmpada">
        {lamps.map(device => <button key={device.id} role="tab" aria-selected={device.id === lamp?.id} className={device.id === lamp?.id ? 'selected' : ''} onClick={() => setLampId(device.id)}>
          <i className={device.state.power ? 'lit' : ''} style={{'--dot': device.state.colorHex ?? '#FFD6A0'} as CSSProperties} />{device.roomId === 'quarto' ? 'Quarto' : 'Banheiro'}
        </button>)}
      </div>
      <button className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={lamp?.state.power == null ? 'mixed' : on} aria-label={`Luz do ${lamp?.roomId === 'banheiro' ? 'banheiro' : 'quarto'}`} disabled={disabled} onClick={() => lamp && void casa.command(lamp.id, {power: !on})}><span /></button>
    </div>
    <div className="palette" role="group" aria-label="Cor da luz">
      {PALETTE.map(([hex, name]) => <button key={hex} className={color === hex ? 'chosen' : ''} aria-label={name} title={name} aria-pressed={color === hex} disabled={disabled} onClick={() => lamp && void casa.command(lamp.id, {colorHex: hex, ...(on ? {} : {power: true})})}>
        <span style={{background: hex}}>{color === hex ? <Check size={14} strokeWidth={3} /> : null}</span>
      </button>)}
    </div>
    <div className="level" role="group" aria-label={`Brilho ${lamp?.state.brightness == null ? 'desconhecido' : `${level}%`}`}>
      <button className="round" aria-label="Diminuir brilho" disabled={disabled || level <= 10} onClick={() => setLevel(level - 10)}><Minus size={16} /></button>
      <div className="level-bars">
        {[1, 2, 3, 4, 5].map(step => <button key={step} aria-label={`Brilho ${step * 20}%`} className={on && level >= step * 20 - 10 ? 'full' : ''} disabled={disabled} onClick={() => setLevel(step * 20)} />)}
      </div>
      <button className="round" aria-label="Aumentar brilho" disabled={disabled || level >= 100} onClick={() => setLevel(level + 10)}><Plus size={16} /></button>
      <output>{lamp?.state.brightness == null ? '—' : `${level}%`}</output>
    </div>
    <div className="scenes" role="group" aria-label="Cenas">
      {scenes.map(scene => {
        const Icon = scene.id === 'cinema' ? Film : scene.id === 'boa-noite' ? Moon : Home;
        const blocked = !preview && (casa.data?.devices ?? []).some(device => (scene.id === 'cheguei' ? device.id === 'quarto-luz' : device.kind === 'light' || (scene.id === 'boa-noite' && device.kind === 'climate')) && !device.configured);
        return <button key={scene.id} title={scene.description} disabled={!!casa.busy || !!casa.error || blocked} onClick={() => void casa.scene(scene.id, scene.name)}>{casa.busy === scene.id ? <LoaderCircle className="spin" size={15} /> : <Icon size={15} />}{scene.name}</button>;
      })}
    </div>
    <Footer device={lamp} casa={casa} />
  </section>;
}

function LearnBanner({text}: {text: string}) {
  return <p className="learn-banner" role="status"><Radio size={16} /><span>{text}</span></p>;
}

function Climate({casa}: {casa: Casa}) {
  const ac = casa.data?.devices.find(device => device.kind === 'climate');
  const disabled = locked(ac, casa);
  const temperature = ac?.state.temperature;
  const [draft, setDraft] = useState(temperature ?? 24);
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setDraft(temperature ?? 24); }, [temperature]);
  const unknown = !ac || temperature == null || ac.state.mode == null || ac.state.fan == null || ac.state.power == null;
  const on = ac?.state.power === true;
  const send = (values: Record<string, unknown>) => ac && casa.command(ac.id, values);
  // Depois de ligar/desligar, o botão espera 2 s: dois toques rápidos viravam liga-desliga e o
  // estado estimado se perdia do aparelho.
  const [settling, setSettling] = useState(false);
  const togglePower = async () => {
    setSettling(true);
    await send({power: !(ac?.state.power === true)});
    setTimeout(() => setSettling(false), 2000);
  };
  const commit = async (value: number) => { editing.current = false; if (value !== temperature) { const ok = await send({temperature: value}); if (!ok) setDraft(temperature ?? 24); } };
  const modeIndex = Math.max(0, MODES.findIndex(([id]) => id === ac?.state.mode));
  const [, modeLabel, ModeIcon] = MODES[modeIndex];
  const fanIndex = Math.max(0, FANS.findIndex(([id]) => id === ac?.state.fan));
  // Cadastro do ar resumido pelo servidor: quais combinações existem e em quais o controle
  // não envia temperatura (mesmo sinal para todas). Sem resumo (prévia), tudo fica disponível.
  const summary = ac?.irClimate;
  const temps = (mode: string, fan: string) => summary ? summary.coverage[mode]?.[fan] ?? [] : Array.from({length: 14}, (_, i) => i + 17);
  const has = (mode: string, fan: string, temp: number) => temps(mode, fan).includes(temp);
  const templess = (mode?: string | null, fan?: string | null) => !!summary && !!mode && !!fan && summary.templess.includes(`${mode}/${fan}`);
  const nearest = (list: number[], value: number) => list.reduce((best, t) => Math.abs(t - value) < Math.abs(best - value) ? t : best, list[0]);
  // Troca de modo/ventilação só para combinações cadastradas, ajustando o que for preciso.
  const moveTo = (mode: string, fan: string) => {
    const fans = FANS.map(([id]) => id).filter(id => temps(mode, id).length);
    const nextFan = fans.includes(fan) ? fan : fans[0];
    if (!nextFan) return;
    const list = temps(mode, nextFan);
    const temperature = list.includes(draft) ? draft : nearest(list, draft);
    const values: Record<string, unknown> = {};
    if (mode !== ac?.state.mode) values.mode = mode;
    if (nextFan !== ac?.state.fan) values.fan = nextFan;
    if (temperature !== temperature_now) values.temperature = temperature;
    if (Object.keys(values).length) void send(values);
  };
  const temperature_now = ac?.state.temperature;
  const nextMode = () => { for (let step = 1; step <= MODES.length; step++) { const [id] = MODES[(modeIndex + step) % MODES.length]; if (FANS.some(([fan]) => temps(id, fan).length)) return id; } return MODES[modeIndex][0]; };
  const nextFan = () => { const mode = ac?.state.mode ?? 'cool'; for (let step = 1; step <= FANS.length; step++) { const [id] = FANS[(fanIndex + step) % FANS.length]; if (temps(mode, id).length) return id; } return FANS[fanIndex][0]; };
  // Modo aprender: os controles só escolhem o estado a gravar; nada é enviado à central.
  const [learning, setLearning] = useState(false);
  const [target, setTarget] = useState({temperature: 24, mode: 'cool', fan: 'auto'});
  const origins = summary?.origins ?? {};
  const profileStates = (origins['geonav-perfil'] ?? 0) - (summary?.off === 'geonav-perfil' ? 1 : 0);
  const learnedStates = (origins['aprendido'] ?? 0) - (summary?.off === 'aprendido' ? 1 : 0);
  const learnedOff = !!summary?.off;
  const noTemp = !learning && !unknown && templess(ac?.state.mode, ac?.state.fan);
  const currentTemps = !unknown && ac?.state.mode && ac?.state.fan ? temps(ac.state.mode, ac.state.fan) : [];
  const tempMin = learning || !currentTemps.length ? 17 : Math.max(17, currentTemps[0]);
  const tempMax = learning || !currentTemps.length ? 30 : Math.min(30, currentTemps[currentTemps.length - 1]);
  const canStart = !summary || has('cool', 'auto', 24);
  const canLearn = casa.data?.mode === 'local' && !!ac?.configured && !casa.busy && !casa.error;
  const shownTemp = learning ? target.temperature : draft;
  const fraction = Math.max(0, Math.min(1, (shownTemp - 17) / 13));
  const [dragging, setDragging] = useState(false);
  const shownModeIndex = learning ? Math.max(0, MODES.findIndex(([id]) => id === target.mode)) : modeIndex;
  const shownFanIndex = learning ? Math.max(0, FANS.findIndex(([id]) => id === target.fan)) : fanIndex;
  const [, shownModeLabel, ShownModeIcon] = MODES[shownModeIndex];
  const setTemp = (value: number) => { if (learning) setTarget(t => ({...t, temperature: Math.max(17, Math.min(30, value))})); else { setDraft(value); void commit(value); } };
  const controlsOff = learning ? false : disabled || unknown;
  const tempOff = controlsOff || noTemp;
  const learnState = () => { if (ac) void casa.learn(ac.id, {state: {power: true, ...target}}, `${target.temperature} °C · ${MODES[shownModeIndex][1]} · ${FANS[shownFanIndex][1]}`); };
  return <section className={`card climate ${learning ? 'is-learning' : ''}`} aria-label="Ar-condicionado">
    <div className="card-head">
      <div className="title"><Thermometer size={17} /><strong>Quarto</strong><span>Ar Electrolux · via Geonav</span></div>
      <button className={`learn-toggle ${learning ? 'on' : ''}`} aria-pressed={learning} disabled={!canLearn && !learning} onClick={() => setLearning(value => !value)}><Radio size={15} />Aprender</button>
      {learning ? null : <PowerCircle on={on} label={on ? 'Desligar ar-condicionado' : 'Ligar ar-condicionado'} disabled={disabled || unknown || settling} busy={casa.busy === ac?.id} onClick={() => void togglePower()} />}
    </div>
    {learning ? <LearnBanner text="Escolha o estado abaixo, toque em Gravar e, em até 25 s, aperte Ligar no controle do ar já nesse estado, apontado para a central." /> : null}
    <div className={`ac-unit ${on ? 'running' : ''}`} data-fan={ac?.state.turbo ? 'turbo' : ac?.state.fan ?? 'auto'} data-mode={ac?.state.mode ?? 'cool'} aria-hidden="true">
      <div className="ac-body"><span className="ac-led">{temperature ?? '—'}</span><span className="ac-flap" /></div>
      <div className="ac-air">{Array.from({length: 14}, (_, i) => <i key={i} style={{'--i': i} as CSSProperties} />)}</div>
    </div>
    {noTemp
      ? <p className="big-temp no-temp"><output>Auto</output></p>
      : <p className={`big-temp ${unknown && !learning ? 'unknown' : ''}`}><output key={unknown && !learning ? 'unknown' : shownTemp}>{unknown && !learning ? '--' : shownTemp}</output><span>°C</span></p>}
    {noTemp ? <p className="climate-note">No automático o controle do ar não envia temperatura: o próprio ar decide. Para escolher a temperatura, use Resfriar ou Aquecer.</p> : null}
    <div className="temp-row">
      <button className="round" aria-label="Diminuir temperatura" disabled={tempOff || shownTemp <= tempMin} onClick={() => setTemp(shownTemp - 1)}><Minus size={18} /></button>
      <div className={`temp-track ${dragging ? 'dragging' : ''} ${on || learning ? '' : 'idle'} ${tempOff ? 'off' : ''}`} style={{'--f': fraction} as CSSProperties}>
        <span className="temp-rail" aria-hidden="true"><span className="temp-fill" /></span>
        <input type="range" min={17} max={30} step={1} value={shownTemp} aria-label={noTemp ? 'Temperatura não enviada no automático' : 'Temperatura ajustada'} disabled={tempOff} onPointerDown={() => { editing.current = !learning; setDragging(true); }} onLostPointerCapture={() => setDragging(false)} onChange={event => { if (learning) setTarget(t => ({...t, temperature: Number(event.target.value)})); else setDraft(Number(event.target.value)); }} onPointerUp={() => { setDragging(false); if (!learning) void commit(draft); }} onKeyUp={() => { if (!learning) void commit(draft); }} onBlur={() => { if (!learning && editing.current) void commit(draft); }} />
        <div className="temp-scale"><span>17°</span><span>30°</span></div>
      </div>
      <button className="round" aria-label="Aumentar temperatura" disabled={tempOff || shownTemp >= tempMax} onClick={() => setTemp(shownTemp + 1)}><Plus size={18} /></button>
    </div>
    {unknown && !learning ? <button className="primary" disabled={disabled || !canStart} onClick={() => void send({power: true, temperature: 24, mode: 'cool', fan: 'auto'})}><Snowflake size={16} />Ligar em 24 °C · resfriar · auto</button> : null}
    <div className="tiles">
      <button className="tile" disabled={controlsOff} onClick={() => { if (learning) setTarget(t => ({...t, mode: MODES[(shownModeIndex + 1) % MODES.length][0]})); else moveTo(nextMode(), ac?.state.fan ?? 'auto'); }} aria-label={`Modo: ${shownModeLabel}. Tocar para trocar.`}><ShownModeIcon size={18} /><span>Modo</span><strong>{unknown && !learning ? '—' : shownModeLabel}</strong></button>
      <button className="tile" disabled={controlsOff} onClick={() => { if (learning) setTarget(t => ({...t, fan: FANS[(shownFanIndex + 1) % FANS.length][0]})); else moveTo(ac?.state.mode ?? 'cool', nextFan()); }} aria-label={`Ventilação: ${FANS[shownFanIndex][1]}. Tocar para trocar.`}><Fan size={18} /><span>Ventilação</span><strong>{unknown && !learning ? '—' : FANS[shownFanIndex][1]}</strong></button>
    </div>
    <div className="ac-extras" role="group" aria-label="Funções do controle original">
      {AC_EXTRAS.map(([id, label, Icon]) => {
        const learned = !!summary?.extras?.[id];
        // Turbo calibrado é um bit sobre o estado atual: liga e desliga de verdade, com estado estimado.
        if (id === 'turbo' && summary?.turbo && !learning) {
          const active = !!ac?.state.turbo;
          return <button key={id} className={`extra learned ${active ? 'on' : ''}`} aria-pressed={active} disabled={disabled || !on}
            title={!on ? 'Ligue o ar para usar o turbo' : active ? 'Turbo ligado (estimado). Toque para desligar.' : 'Ligar turbo no estado atual'}
            onClick={() => void send({turbo: !active})}>
            <Icon size={16} /><span>{active ? 'Turbo ligado' : label}</span>
          </button>;
        }
        return <button key={id} className={`extra ${learned ? 'learned' : 'missing'}`} disabled={learning ? !canLearn : disabled || !learned}
          title={learning ? `Gravar ${label}: toque aqui e aperte ${label} no controle original` : learned ? `${label}: alterna no aparelho (estado não confirmado)` : `${label} ainda não gravado: use Aprender`}
          onClick={() => { if (!ac) return; if (learning) void casa.learn(ac.id, {key: id}, label); else void casa.key(ac.id, id); }}>
          <Icon size={16} /><span>{label}</span>
        </button>;
      })}
    </div>
    {learning ? <div className="learn-actions">
      <button className="primary" disabled={!canLearn} onClick={learnState}>{casa.busy === ac?.id ? <LoaderCircle className="spin" size={16} /> : <Radio size={16} />}Gravar ligar neste estado</button>
      <button className="pill" disabled={!canLearn} onClick={() => { if (ac) void casa.learn(ac.id, {key: 'off'}, 'desligar'); }}><Power size={16} />{learnedOff ? 'Regravar desligar' : 'Gravar desligar'}</button>
    </div> : null}
    {learning || !ac ? null : <Suspense fallback={null}><AcTimer casa={casa} on={on} /></Suspense>}
    <Footer device={ac} casa={casa} extra={summary ? `Perfil Geonav: ${profileStates} estados${learnedOff ? ' + desligar' : ''}${learnedStates ? ` · ${learnedStates} aprendidos` : ''} · ainda não confirmado olhando o ar` : undefined} />
  </section>;
}

function Television({casa}: {casa: Casa}) {
  const tv = casa.data?.devices.find(device => device.kind === 'tv');
  const disabled = locked(tv, casa);
  const [learning, setLearning] = useState(false);
  const canLearn = casa.data?.mode === 'local' && !!tv?.configured && !casa.busy && !casa.error;
  const keys = tv?.irKeys ?? {};
  const learnedCount = Object.values(keys).filter(origin => origin === 'aprendido').length;
  const standardCount = Object.values(keys).filter(origin => origin === 'samsung-padrao').length;
  const profileCount = Object.values(keys).filter(origin => origin === 'geonav-perfil').length;
  const labels: Record<string, string> = {power: 'Liga/desliga', up: 'Cima', down: 'Baixo', left: 'Esquerda', right: 'Direita', ok: 'OK', back: 'Voltar', home: 'Início', source: 'Entrada', volume_up: 'Volume +', volume_down: 'Volume −', mute: 'Mudo'};
  // No modo aprender, tocar um botão grava o sinal do controle original em vez de enviar.
  const key = (name: string) => { if (!tv) return; if (learning) void casa.learn(tv.id, {key: name}, labels[name] ?? name); else void casa.key(tv.id, name); };
  const off = learning ? !canLearn : disabled;
  // Fora do Aprender, tecla sem código fica desativada; candidatas genéricas ganham marca e dica.
  const kp = (name: string) => ({
    disabled: off || (!learning && !!tv?.irKeys && !(name in tv.irKeys)),
    'data-origin': tv?.irKeys?.[name],
    title: tv?.irKeys?.[name] === 'samsung-padrao' ? 'Código Samsung genérico, ainda não confirmado nesta TV' : undefined,
  });
  return <section className={`card tv ${learning ? 'is-learning' : ''}`} aria-label="TV">
    <div className="card-head">
      <div className="title"><Tv size={17} /><strong>TV Samsung</strong><span>Quarto · via Geonav</span></div>
      <button className={`learn-toggle ${learning ? 'on' : ''}`} aria-pressed={learning} disabled={!canLearn && !learning} onClick={() => setLearning(value => !value)}><Radio size={15} />Aprender</button>
      <PowerCircle on={tv?.state.power === true} label={learning ? 'Aprender liga/desliga' : 'Ligar ou desligar a TV'} disabled={kp('power').disabled} busy={casa.busy === tv?.id} onClick={() => key('power')} />
    </div>
    {learning ? <LearnBanner text="Toque no botão aqui e, em até 25 s, aperte o mesmo botão no controle da TV apontado para a central." /> : null}
    <div className="remote">
      <div className="dpad">
        <button className="up" aria-label="Cima" {...kp('up')} onClick={() => key('up')}><ArrowUp size={20} /></button>
        <button className="left" aria-label="Esquerda" {...kp('left')} onClick={() => key('left')}><ArrowLeft size={20} /></button>
        <button className="ok" aria-label="Confirmar" {...kp('ok')} onClick={() => key('ok')}>OK</button>
        <button className="right" aria-label="Direita" {...kp('right')} onClick={() => key('right')}><ArrowRight size={20} /></button>
        <button className="down" aria-label="Baixo" {...kp('down')} onClick={() => key('down')}><ArrowDown size={20} /></button>
      </div>
      <div className="remote-row">
        <button className="pill" {...kp('back')} onClick={() => key('back')}><Undo2 size={17} />Voltar</button>
        <button className="pill" {...kp('home')} onClick={() => key('home')}><House size={17} />Início</button>
        <button className="pill" {...kp('source')} onClick={() => key('source')}><Monitor size={17} />Entrada</button>
      </div>
      <div className="volume">
        <button aria-label="Diminuir volume" {...kp('volume_down')} onClick={() => key('volume_down')}><Minus size={18} /></button>
        <span><Volume2 size={16} />Volume</span>
        <button aria-label="Aumentar volume" {...kp('volume_up')} onClick={() => key('volume_up')}><Plus size={18} /></button>
        <button className="mute" aria-label="Silenciar" {...kp('mute')} onClick={() => key('mute')}><VolumeX size={18} /></button>
      </div>
    </div>
    <Footer device={tv} casa={casa} extra={`${profileCount} do perfil Geonav · ${learnedCount} aprendidos · ${standardCount} padrão Samsung · Confira olhando a TV; Power alterna`} />
  </section>;
}

function SettingsSheet({casa, close}: {casa: Casa; close: () => void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  const hub = casa.data?.hub as {message?: string; configuredCount?: number; version?: string} | undefined;
  const actions = casa.data?.recentActions as unknown as {id: string; name?: string; message: string; status?: string; createdAt?: string}[] | undefined;
  return <dialog ref={dialog} className="sheet" onCancel={close} onClick={event => { if (event.target === event.currentTarget) close(); }} aria-labelledby="sheet-title">
    <div className="sheet-head"><h2 id="sheet-title">Sua central</h2><button className="round ghost" aria-label="Fechar" onClick={close}><X size={18} /></button></div>
    <div className="sheet-block"><ShieldCheck size={20} /><div><strong>Tudo fica na sua rede</strong><p>{hub?.message ?? 'Servidor privado no PC de casa.'} Acesso só pela rede local e pelo seu Tailscale, sem login de marcas.</p></div></div>
    <dl className="facts">
      <div><dt>Modo</dt><dd>{casa.data?.mode === 'preview' ? 'Prévia (simulação)' : 'Local'}</dd></div>
      <div><dt>Aparelhos configurados</dt><dd>{hub?.configuredCount ?? 0} de {casa.data?.devices.length ?? 4}</dd></div>
      <div><dt>Versão</dt><dd>{hub?.version ?? '—'}</dd></div>
    </dl>
    {(hub?.configuredCount ?? 0) < (casa.data?.devices.length ?? 0) ? <p className="sheet-note">Aparelhos sem chave local só respondem depois de configurados no PC de casa. As câmeras já funcionam.</p> : null}
    <div className="address"><code>{window.location.origin}</code><button className="round ghost" aria-label="Copiar endereço" onClick={async () => { try { await navigator.clipboard.writeText(window.location.origin); setCopied(true); } catch { setCopied(false); } }}>{copied ? <Check size={16} /> : <Copy size={16} />}</button></div>
    <h3>Últimas ações</h3>
    {actions?.length ? <ul className="activity">{actions.slice(0, 5).map(action => <li key={action.id}><i className={action.status === 'failed' ? 'failed' : ''} /><div><strong>{action.name}</strong><p>{action.message}</p></div>{action.createdAt ? <time dateTime={action.createdAt}>{new Date(action.createdAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}</time> : null}</li>)}</ul> : <p className="sheet-note">Nenhuma ação ainda.</p>}
  </dialog>;
}

export default function App() {
  const casa = useCasa();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [sheet, setSheet] = useState(false);
  const [target, setTarget] = useState<string | null>(hashTarget);
  const tray = new URLSearchParams(window.location.search).has('tray');
  // A bandeja marca #oculto ao fechar o popup: desmonta câmeras e cena 3D para não gastar CPU escondida.
  const [asleep, setAsleep] = useState(() => window.location.hash === '#oculto');
  // A bandeja mantém a página aberta por dias: ao fechar o popup (ou voltar à aba), confere se há
  // painel novo publicado e recarrega só nesse caso.
  useEffect(() => {
    const current = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src');
    if (!current) return;
    const check = async () => {
      try {
        // Pela API: o service worker não intercepta /api/, então a resposta é sempre a do servidor.
        const status = await (await fetch('/api/status', {cache: 'no-store'})).json() as {build?: string | null};
        if (status.build && status.build !== current) {
          // No máximo uma recarga por minuto para a mesma versão: com o PC lento, a página pode
          // vir da cópia guardada de novo, e recarregar sem parar só piora.
          let last = '';
          try { last = sessionStorage.getItem('casa-reload') ?? ''; } catch { /* sem armazenamento */ }
          const [build, at] = last.split('|');
          if (build === status.build && Date.now() - Number(at) < 60000) return;
          try { sessionStorage.setItem('casa-reload', `${status.build}|${Date.now()}`); } catch { /* sem armazenamento */ }
          window.location.reload();
        }
      } catch { /* sem rede: tenta na próxima vez */ }
    };
    // Ao fechar e também ao abrir o popup: quem ficou dormindo desde antes de uma atualização
    // recarrega na primeira abertura, e a bandeja devolve o painel certo após o recarregamento.
    void check();
    const onVisible = () => { if (!document.hidden) void check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [asleep]);
  useEffect(() => { document.body.classList.toggle('in-tray', tray); }, [tray]);
  useEffect(() => {
    const onHash = () => { setAsleep(window.location.hash === '#oculto'); setTab(initialTab()); setTarget(hashTarget()); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  // Trocar de aba consome o atalho da bandeja (#cameras:cam4): voltar a Câmeras não reabre a câmera.
  const choose = (next: Tab) => { setTab(next); setTarget(null); history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${next}`); };
  const preview = casa.data?.mode === 'preview';
  // Bandeja única: o mesmo painel do celular, com as abas embaixo; dormindo enquanto escondido.
  if (tray && asleep) return <div className="tray-panel" />;
  const pill = casa.error ? ['offline', 'Sem conexão'] : !casa.data ? ['loading', 'Conectando'] : preview ? ['preview', 'Prévia'] : ['local', 'Rede local'];
  return <div className="stage">
    <div className="pop">
      <header className="top">
        <div className="brand"><span className="mark"><House size={16} /></span><strong>Casa</strong></div>
        <span className={`pill-status ${pill[0]}`}><i />{pill[1]}</span>
        <button className="round ghost" aria-label="Central e últimas ações" onClick={() => setSheet(true)}><Settings2 size={18} /></button>
      </header>
      <main className="body">
        {casa.error && !['cameras', 'local', 'central'].includes(tab) ? <div className="alert" role="alert"><p>{casa.error}</p><button onClick={() => void casa.connect()}><RefreshCw size={15} />Tentar de novo</button></div> : null}
        {tab === 'cameras' ? <Cameras casa={casa} openCamera={target} />
          : tab === 'local' ? <Suspense fallback={null}><Location casa={casa} /></Suspense>
          : tab === 'central' ? <Suspense fallback={null}><Central casa={casa} /></Suspense>
          : !casa.data ? <div className="empty"><LoaderCircle className={casa.error ? '' : 'spin'} size={24} /><p>{casa.error ? 'Aguardando a central' : 'Abrindo sua casa'}</p></div>
          : tab === 'luzes' ? <Lights casa={casa} /> : tab === 'clima' ? <Climate casa={casa} />
          : <><Television casa={casa} /><Suspense fallback={null}><NetworkTvs casa={casa} /></Suspense></>}
      </main>
      <nav className="tabs" aria-label="Seções">
        {TABS.map(([id, label, Icon]) => <button key={id} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => choose(id)}><Icon size={20} /><span>{label}</span></button>)}
      </nav>
      <div className={`toast ${casa.notice ? 'visible' : ''}`} role="status" aria-live="polite">{casa.notice}</div>
    </div>
    {sheet ? <SettingsSheet casa={casa} close={() => setSheet(false)} /> : null}
  </div>;
}
