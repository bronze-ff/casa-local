import { useState } from 'react';
import { BedDouble, BookOpen, Check, Coffee, Film, House, Minus, Moon, Pencil, Plus, Power, Sofa, Sparkles, Sun, Trash2, X, type LucideIcon } from 'lucide-react';
import { FANS, MODES, PALETTE } from '../constants';
import type { Device, Mode, ModeStep } from '../types';
import type { useCasa } from '../useCasa';

type Casa = ReturnType<typeof useCasa>;

export const MODE_ICONS: Record<string, LucideIcon> = {home: House, film: Film, moon: Moon, book: BookOpen, sun: Sun, sofa: Sofa, coffee: Coffee, bed: BedDouble, power: Power};
const ICON_NAMES: Record<string, string> = {home: 'Casa', film: 'Filme', moon: 'Noite', book: 'Leitura', sun: 'Dia', sofa: 'Sofá', coffee: 'Café', bed: 'Cama', power: 'Tudo'};
const LIGHTS: [string, string][] = [['quarto-luz', 'Luz do quarto'], ['banheiro-luz', 'Luz do banheiro']];
const LEVELS = [10, 25, 50, 75, 100];
type Choice = 'skip' | 'off' | 'on';

const choiceOf = (step?: ModeStep): Choice => !step ? 'skip' : step.power ? 'on' : 'off';

function Choices({value, onChange, labels}: {value: Choice; onChange: (value: Choice) => void; labels: [string, string]}) {
  return <div className="segmented mode-choice" role="radiogroup">
    {([['skip', 'Não mexer'], ['off', labels[0]], ['on', labels[1]]] as [Choice, string][]).map(([id, label]) =>
      <button key={id} role="radio" aria-checked={value === id} className={value === id ? 'selected' : ''} onClick={() => onChange(id)}>{label}</button>)}
  </div>;
}

function LightStep({label, step, onChange}: {label: string; step?: ModeStep; onChange: (step?: ModeStep) => void}) {
  const choice = choiceOf(step);
  const on = step?.power ? step : null;
  return <fieldset className="mode-device">
    <legend>{label}</legend>
    <Choices value={choice} labels={['Apagar', 'Acender']} onChange={value => onChange(value === 'skip' ? undefined : value === 'off' ? {power: false} : {power: true, brightness: 75, colorHex: '#FFD6A0'})} />
    {on ? <>
      <div className="mode-swatches" role="radiogroup" aria-label={`Cor da ${label.toLowerCase()}`}>
        {PALETTE.map(([hex, name]) => <button key={hex} role="radio" aria-checked={on.colorHex === hex} aria-label={name} title={name} className={on.colorHex === hex ? 'chosen' : ''} style={{background: hex}} onClick={() => onChange({...on, colorHex: hex})}>
          {on.colorHex === hex ? <Check size={12} strokeWidth={3} /> : null}
        </button>)}
      </div>
      <div className="mode-levels" role="radiogroup" aria-label="Brilho">
        <span>Brilho</span>
        {LEVELS.map(level => <button key={level} role="radio" aria-checked={on.brightness === level} className={on.brightness === level ? 'on' : ''} onClick={() => onChange({...on, brightness: level})}>{level}%</button>)}
      </div>
    </> : null}
  </fieldset>;
}

function ClimateStep({ac, step, onChange}: {ac?: Device; step?: ModeStep; onChange: (step?: ModeStep) => void}) {
  const choice = choiceOf(step);
  const on = step?.power ? step : null;
  // Só combinações gravadas no controle (mesma regra da aba Clima); sem resumo (prévia), todas valem.
  const coverage = ac?.irClimate?.coverage;
  const temps = (mode: string, fan: string) => coverage ? coverage[mode]?.[fan] ?? [] : Array.from({length: 14}, (_, i) => i + 17);
  const missing = on && !temps(on.mode!, on.fan!).includes(on.temperature!);
  return <fieldset className="mode-device">
    <legend>Ar do quarto</legend>
    <Choices value={choice} labels={['Desligar', 'Ligar']} onChange={value => onChange(value === 'skip' ? undefined : value === 'off' ? {power: false} : {power: true, temperature: 24, mode: 'cool', fan: 'auto', keepIfOn: true})} />
    {on ? <>
      <div className="mode-temp">
        <button className="round" aria-label="Menos 1 grau" disabled={on.temperature! <= 17} onClick={() => onChange({...on, temperature: on.temperature! - 1})}><Minus size={15} /></button>
        <output>{on.temperature} °C</output>
        <button className="round" aria-label="Mais 1 grau" disabled={on.temperature! >= 30} onClick={() => onChange({...on, temperature: on.temperature! + 1})}><Plus size={15} /></button>
      </div>
      <div className="mode-levels" role="radiogroup" aria-label="Modo do ar">
        <span>Modo</span>
        {MODES.map(([id, label, Icon]) => <button key={id} role="radio" aria-checked={on.mode === id} className={on.mode === id ? 'on' : ''} title={label} onClick={() => onChange({...on, mode: id})}><Icon size={14} /><span className="mode-label">{label}</span></button>)}
      </div>
      <div className="mode-levels" role="radiogroup" aria-label="Ventilação">
        <span>Ventilação</span>
        {FANS.map(([id, label]) => <button key={id} role="radio" aria-checked={on.fan === id} className={on.fan === id ? 'on' : ''} onClick={() => onChange({...on, fan: id})}>{label}</button>)}
      </div>
      <label className="mode-keep"><input type="checkbox" checked={!!on.keepIfOn} onChange={event => onChange({...on, keepIfOn: event.target.checked})} />
        <span>Se o ar já estiver ligado, deixar como está<small>Ex.: ligado pelo celular antes de chegar. O painel sabe o estado pelo último comando dele.</small></span></label>
      {missing ? <p className="mode-warn">Esse ajuste não está gravado no controle do ar. Escolha outra temperatura, modo ou ventilação.</p> : null}
    </> : null}
  </fieldset>;
}

function ModeForm({initial, ac, busy, onSave, onCancel}: {initial?: Mode; ac?: Device; busy: boolean; onSave: (body: Record<string, unknown>) => void; onCancel: () => void}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? 'home');
  const [steps, setSteps] = useState<Record<string, ModeStep>>(initial?.steps ?? {});
  const set = (device: string) => (step?: ModeStep) => setSteps(current => {
    const next = {...current};
    if (step) next[device] = step; else delete next[device];
    return next;
  });
  const ac_on = steps['ar-quarto']?.power ? steps['ar-quarto'] : null;
  const coverage = ac?.irClimate?.coverage;
  const acMissing = !!ac_on && !!coverage && !(coverage[ac_on.mode!]?.[ac_on.fan!] ?? []).includes(ac_on.temperature!);
  const valid = name.trim().length > 0 && Object.keys(steps).length > 0 && !acMissing;
  return <div className="routine-form mode-form">
    <label className="loc-field"><span>Nome</span><input value={name} maxLength={30} placeholder="Ex.: Leitura, Filme, Cheguei" onChange={event => setName(event.target.value)} /></label>
    <div className="mode-icons" role="radiogroup" aria-label="Ícone">
      {Object.entries(MODE_ICONS).map(([id, Icon]) => <button key={id} role="radio" aria-checked={icon === id} aria-label={ICON_NAMES[id]} title={ICON_NAMES[id]} className={icon === id ? 'on' : ''} onClick={() => setIcon(id)}><Icon size={16} /></button>)}
    </div>
    {LIGHTS.map(([id, label]) => <LightStep key={id} label={label} step={steps[id]} onChange={set(id)} />)}
    <ClimateStep ac={ac} step={steps['ar-quarto']} onChange={set('ar-quarto')} />
    {!Object.keys(steps).length ? <p className="loc-hint">Escolha o que o modo faz em pelo menos um aparelho.</p> : null}
    <div className="routine-actions">
      <button className="pill" onClick={onCancel}><X size={15} />Cancelar</button>
      <button className="pill accent" disabled={!valid || busy} onClick={() => onSave({...(initial ? {id: initial.id} : {}), name: name.trim(), icon, steps})}><Check size={15} />Salvar modo</button>
    </div>
  </div>;
}

/** Modos da casa na aba Central: criar, editar e apagar (os botões ficam na aba Luzes e na bandeja). */
export default function ModesCard({casa}: {casa: Casa}) {
  const [editing, setEditing] = useState<Mode | 'new' | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const modes = casa.data?.scenes ?? [];
  const ac = casa.data?.devices.find(device => device.kind === 'climate');
  const busy = casa.busy === 'modes';
  const save = async (body: Record<string, unknown>) => { if (await casa.post('modes', '/api/modes', body, 'Modo salvo')) setEditing(null); };
  return <section className="central-block" aria-labelledby="modes-title">
    <div className="central-head"><h3 id="modes-title"><Sparkles size={16} />Modos</h3>{editing ? null : <button className="link" disabled={modes.length >= 12} onClick={() => setEditing('new')}><Plus size={14} />Novo</button>}</div>
    {editing ? <ModeForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? undefined : editing} ac={ac} busy={busy} onCancel={() => setEditing(null)} onSave={body => void save(body)} /> : null}
    <ul className="routine-list">{modes.map(mode => {
      const Icon = MODE_ICONS[mode.icon] ?? House;
      return <li key={mode.id} className="routine mode-row">
        <Icon size={16} className="mode-row-icon" />
        <div><strong>{mode.name}</strong><span>{mode.description}</span></div>
        <button className="icon-btn" aria-label={`Editar ${mode.name}`} onClick={() => setEditing(mode)}><Pencil size={14} /></button>
        {confirm === mode.id ? <button className="link danger" onClick={() => { setConfirm(null); void casa.post('modes', `/api/modes/${mode.id}/remove`, {}, 'Modo apagado'); }}>Apagar?</button>
          : <button className="icon-btn" aria-label={`Apagar ${mode.name}`} onClick={() => setConfirm(mode.id)}><Trash2 size={14} /></button>}
      </li>;
    })}</ul>
    <p className="loc-hint">Cada modo ajusta luzes e ar de uma vez. Use na aba Luzes, no menu da bandeja ou numa rotina (horário ou chegada/saída de um lugar).</p>
  </section>;
}
