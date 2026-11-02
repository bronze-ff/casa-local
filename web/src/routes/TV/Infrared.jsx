import { useRef, useState } from 'react';
import { useCommand } from '../../core/hooks.js';
import { useAction } from '../../ui/actions.js';
import { confidenceOf } from '../../ui/confidence.js';
import { Banner, Button, CommandState, Confidence, Empty } from '../../ui/kit.jsx';
import { Remote } from './Remote.jsx';
import { IR_KEYS, LABELS, learnedCount, originText } from './keys.js';

/**
 * TV por infravermelho (Geonav). O estado real da TV NÃO é confirmado: o sinal sai, o efeito não é visto.
 * Aprender grava o código daquele botão (aperte o mesmo no controle original em até 25 s).
 */
export function Infrared({ device, preview }) {
  const [learning, setLearning] = useState(false);
  const [capturing, setCapturing] = useState(null);
  const [run, busy] = useAction();
  const lock = useRef(false);
  const command = useCommand(device?.id);
  if (!device) return <Empty title="TV do quarto não está no cadastro">O servidor não devolveu o controle IR.</Empty>;
  const unavailable = preview || !device.configured || device.connection === 'offline';
  const kind = confidenceOf(device, command);
  const power = device.state?.power;
  const origins = device.irKeys || {};
  const send = async (key) => {
    if (lock.current || unavailable) return;
    lock.current = true;
    if (learning) setCapturing(key);
    try {
      await run(`/api/devices/${device.id}/${learning ? 'learn' : 'commands'}`, learning ? { key } : { action: 'key', key }, learning ? `${LABELS[key]} aprendido. Teste olhando a TV.` : 'Sinal IR enviado. Confira na TV.');
    } finally { lock.current = false; setCapturing(null); }
  };
  return (
    <section className="obj col" aria-label="Controle IR">
      <div className="row sp wrap">
        <div className="col tight"><span className="cap">{(device.name || 'TV do quarto').toLowerCase()}</span><span className="num m">{power == null ? '—' : power ? 'ligada' : 'desligada'}</span></div>
        <span className="row"><Confidence kind={kind} /><CommandState command={command} /></span>
      </div>
      <p className="sub">{device.configured ? 'Controle por infravermelho · Geonav. O estado real da TV não é confirmado: o sinal sai e o efeito não é visto.' : 'Central IR não configurada. Configure-a no PC de casa.'}</p>
      {preview && <Banner kind="info" icon="eye">Prévia: nenhum sinal é enviado.</Banner>}
      {device.connection === 'offline' && <Banner kind="err" icon="alert">Central IR sem conexão.</Banner>}
      {learning && <Banner kind="info" icon="radio" title="Modo Aprender">{capturing ? `Gravando ${LABELS[capturing]}: aperte esse botão no controle original em até 25 s, apontando para a central. Aguarde a conclusão.` : 'Toque em um botão abaixo. Depois aperte o mesmo botão no controle original, apontando para a central, em até 25 s.'}</Banner>}
      <Remote send={send} disabled={busy || unavailable} keys={device.irKeys} learning={learning} />
      <Button variant={learning ? 'p' : 's'} icon="plus" aria-pressed={learning ? 'true' : 'false'} disabled={busy || unavailable} reason={preview ? 'Aprender fica desativado na prévia.' : 'A central IR não está disponível.'} onClick={() => setLearning((old) => !old)}>{learning ? 'Sair de Aprender' : 'Aprender botões'}</Button>
      <details className="codes">
        <summary>Códigos do controle · {learnedCount(origins)} aprendidos</summary>
        <ul className="list-plain rows">{IR_KEYS.map((key) => <li key={key}><span className="grow">{LABELS[key]}</span><span className="sub">{originText(origins[key])}</span></li>)}</ul>
      </details>
      <p className="hint">Códigos genéricos e perfis precisam ser testados na TV. Aprender substitui o código daquele botão. Tecla desabilitada: sem código; use Aprender.</p>
    </section>
  );
}
