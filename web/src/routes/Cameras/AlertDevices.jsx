import { useState } from 'react';
import { usePoll } from '../../core/hooks.js';
import { useAction } from '../../ui/actions.js';
import { Icon } from '../../ui/Icon.jsx';
import { Banner, Button, Chip, Segmented, Status, Switch } from '../../ui/kit.jsx';
import { FOREVER, pausedText } from './motion.js';

const MODES = [{ value: 'watched', label: 'Monitoradas' }, { value: 'some', label: 'Só estas' }, { value: 'none', label: 'Nenhuma' }];

/** "Onde avisar": regra de aviso de movimento de cada bandeja (computador): renomear, remover (com confirmação), câmeras, tela cheia e pausa. */
export function AlertDevices({ cameras, open, blocked }) {
  const poll = usePoll('/api/alert-devices', 20000);
  const [run, busy] = useAction();
  const [renaming, setRenaming] = useState(null);
  const [removing, setRemoving] = useState(null);
  const data = poll.data;
  const now = data?.now ?? Date.now() / 1000;
  const off = blocked || busy;
  const change = async (path, body, okText) => { if (blocked) return null; const result = await run(path, body, okText); if (result) poll.reload(); return result; };
  const update = (id, body) => change(`/api/alert-devices/${id}`, body);
  return (
    <details className="alert-devices" open={open || undefined}>
      <summary><Icon name="bell" size={16} /><strong>Onde avisar</strong>{data && <span className="sub">{data.devices.length} {data.devices.length === 1 ? 'computador' : 'computadores'}</span>}</summary>
      <div className="col">
        {poll.stale && <Banner kind="warn" icon="off">Sem conexão com a lista de computadores. Mostrando o último dado conhecido.</Banner>}
        {data && data.devices.length === 0 && <p className="sub">Nenhuma bandeja se apresentou ainda. Ela aparece aqui sozinha depois de atualizada no computador.</p>}
        {data?.devices.map((device) => {
          const paused = pausedText(device.pausedUntil, now);
          return (
            <div key={device.id} className="col device">
              <div className="row wrap">
                {renaming?.id === device.id ? (
                  <form className="row grow" onSubmit={(e) => { e.preventDefault(); update(device.id, { name: renaming.name }).then((r) => r && setRenaming(null)); }}>
                    <label className="sr-only" htmlFor={`nome-${device.id}`}>Nome do computador</label>
                    <input id={`nome-${device.id}`} className="inp grow" value={renaming.name} maxLength={30} onChange={(e) => setRenaming({ id: device.id, name: e.target.value })} />
                    <Button variant="p" type="submit" disabled={off || !renaming.name.trim()} reason="Escreva um nome.">Salvar</Button>
                    <Button variant="s" onClick={() => setRenaming(null)}>Cancelar</Button>
                  </form>
                ) : (
                  <>
                    <strong className="grow">{device.name}</strong>
                    <Status kind={device.busy ? 'part' : device.online ? 'ok' : 'off'}>{device.busy ? 'em tela cheia' : device.online ? 'conectado' : 'desligado'}</Status>
                    <Button variant="s" aria-label={`Renomear ${device.name}`} onClick={() => setRenaming({ id: device.id, name: device.name })}>Renomear</Button>
                    {removing === device.id
                      ? <Button variant="d" disabled={off} reason="Sem conexão com o painel." onClick={() => { setRemoving(null); change(`/api/alert-devices/${device.id}/remove`, {}, 'Computador removido'); }}>Remover mesmo</Button>
                      : <Button variant="s" aria-label={`Remover ${device.name}`} onClick={() => setRemoving(device.id)}>Remover</Button>}
                  </>
                )}
              </div>
              <Segmented label={`Câmeras que avisam em ${device.name}`} value={device.mode} options={MODES} disabled={off} onChange={(mode) => update(device.id, { mode })} />
              {device.mode === 'some' && (
                <div role="group" aria-label="Câmeras" className="row wrap">
                  {cameras.map((c) => { const on = device.cameras.includes(c.id); return <Chip key={c.id} pressed={on} disabled={off} onClick={() => update(device.id, { cameras: on ? device.cameras.filter((x) => x !== c.id) : [...device.cameras, c.id] })}>{c.name}</Chip>; })}
                </div>
              )}
              {device.mode !== 'none' && (
                <>
                  <div className="row sp"><span className="col tight"><span>Segurar com jogo ou vídeo em tela cheia</span><span className="sub">Os alertas esperam e chegam num resumo quando você sair da tela cheia.</span></span><Switch on={device.game} label={`Segurar alertas em tela cheia em ${device.name}`} disabled={off} onChange={(game) => update(device.id, { game })} /></div>
                  <div className="row wrap">
                    {paused ? (
                      <><span>{paused}</span><Button variant="s" disabled={off} reason="Sem conexão com o painel." onClick={() => update(device.id, { pausedUntil: 0 })}>Reativar</Button></>
                    ) : (
                      <><span className="sub">Pausar</span>
                        <Button variant="s" disabled={off} reason="Sem conexão com o painel." onClick={() => update(device.id, { pausedUntil: Math.floor(now) + 3600 })}>1 h</Button>
                        <Button variant="s" disabled={off} reason="Sem conexão com o painel." onClick={() => update(device.id, { pausedUntil: Math.floor(now) + 14400 })}>4 h</Button>
                        <Button variant="s" disabled={off} reason="Sem conexão com o painel." onClick={() => update(device.id, { pausedUntil: FOREVER })}>Até reativar</Button></>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
        <p className="hint">“Monitoradas” segue o sino de cada câmera. A contagem de movimentos e a ordem das câmeras são iguais em todo lugar; isto só escolhe onde o alerta aparece.</p>
      </div>
    </details>
  );
}
