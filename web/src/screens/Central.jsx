import { useState } from 'react';
import { usePoll } from '../api.js';
import { useHome } from '../App.jsx';
import { Card, Switch } from '../ui.jsx';
import Energy from './Central/Energy.jsx';
import Health, { TITLE } from './Central/Health.jsx';
import Modes from './Central/Modes.jsx';
import Notifications from './Central/Notifications.jsx';
import Routines from './Central/Routines.jsx';
import Shortcuts from './Central/Shortcuts.jsx';
import { setSound, soundOn } from './Central/Sound.js';

function SoundCard() {
  const [on, setOn] = useState(soundOn);
  return (
    <Card title="Som das teclas">
      <div className="list">
        <div>
          <span>Clique ao tocar nas teclas<small>Desligado por padrão. Vale só neste aparelho.</small></span>
          <Switch on={on} label="Som das teclas" onChange={(v) => { setSound(v); setOn(v); }} />
        </div>
      </div>
    </Card>
  );
}

export const SECTIONS = [['saude', 'Saúde'], ['avisos', 'Avisos'], ['modos', 'Modos'], ['rotinas', 'Rotinas'], ['energia', 'Energia'], ['atalhos', 'Atalhos'], ['som', 'Som']];

/** Resumo da saúde só com o que o servidor devolveu; ausente não vira número inventado. */
export function summaryOf(health, scenes) {
  const items = [];
  if (health) {
    const bad = (health.checks || []).filter((check) => check.state !== 'ok').length;
    items.push(['Sistema', TITLE[health.state] || health.state], ['Avisos', String(bad)]);
    const machine = health.machine || {};
    if (machine.memory) items.push(['Memória', `${machine.memory.used}%`]);
    if (machine.disk) items.push(['Disco livre', `${machine.disk.freeGb} GB`]);
  }
  if (Array.isArray(scenes)) items.push(['Modos', String(scenes.length)]);
  return items;
}

const goTo = (id) => {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
};

export default function Central() {
  const { home } = useHome();
  const health = usePoll('/api/health', 20000);
  const summary = summaryOf(health.data, home?.scenes);
  return (
    <>
      <section className="mod" aria-label="Resumo da central">
        {summary.length > 0 && <div className="summary">{summary.map(([label, value]) => <div key={label}><span className="lbl">{label}</span><b>{value}</b></div>)}</div>}
        <nav className="hub-nav" aria-label="Seções da central">
          {SECTIONS.map(([id, label]) => <button key={id} type="button" onClick={() => goTo(id)}>{label}</button>)}
        </nav>
      </section>
      <div className="masonry">
        <div id="saude" className="hub-section"><Health poll={health} /></div>
        <div id="avisos" className="hub-section"><Notifications /></div>
        <div id="modos" className="hub-section"><Modes /></div>
        <div id="rotinas" className="hub-section"><Routines /></div>
        <div id="energia" className="hub-section"><Energy /></div>
        <div id="atalhos" className="hub-section"><Shortcuts /></div>
        <div id="som" className="hub-section"><SoundCard /></div>
      </div>
    </>
  );
}
