import { useState } from 'react';
import { Card, Switch } from '../ui.jsx';
import Energy from './Central/Energy.jsx';
import Health from './Central/Health.jsx';
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

export default function Central() {
  // Colunas mais largas que o .grid padrão: os formulários de rotina e modo precisam de espaço.
  const columns = { gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', alignItems: 'start' };
  return (
    <>
      <div className="grid" style={columns}>
        <Health />
        <Notifications />
      </div>
      <div className="grid" style={columns}>
        <Modes />
        <Routines />
      </div>
      <div className="grid" style={columns}>
        <Energy />
        <Shortcuts />
      </div>
      <div className="grid" style={columns}>
        <SoundCard />
      </div>
    </>
  );
}
