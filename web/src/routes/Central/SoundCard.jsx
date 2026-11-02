import { useEffect, useState } from 'react';
import { Switch } from '../../ui/kit.jsx';
import { initSound, setSound, soundOn } from './sound.js';

/** Som das teclas: opcional, desligado por padrão, vale só neste aparelho (localStorage). Nada toca sem o usuário ligar. */
export function SoundCard() {
  const [on, setOn] = useState(false);
  useEffect(() => { initSound(); setOn(soundOn()); }, []);
  return (
    <section className="card col" aria-label="Som das teclas">
      <h2 className="h2">Som das teclas</h2>
      <div className="row sp wrap">
        <div className="col tight grow"><b>Clique ao tocar nos botões</b><span className="sub">Desligado por padrão. Vale só neste aparelho.</span></div>
        <Switch on={on} label="Som das teclas" onChange={(value) => { setSound(value); setOn(value); }} />
      </div>
    </section>
  );
}
