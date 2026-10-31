import { useState } from 'react';
import { usePoll } from '../../api.js';
import { Icon, Key, Segmented, Stale, Status, Switch, useAction } from '../../ui.jsx';

const FOREVER = 4102444800; // o backend entende 2100-01-01 como "até reativar"
const MODES = [['watched', 'Monitoradas'], ['some', 'Só estas'], ['none', 'Nenhuma']];

function pausedText(until, now) {
  if (until <= now) return null;
  if (until >= FOREVER) return 'Pausado até reativar';
  const d = new Date(until * 1000);
  const hour = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `Pausado até ${d.toDateString() === new Date().toDateString() ? hour : `${d.toLocaleDateString('pt-BR', { weekday: 'short' })} ${hour}`}`;
}

/** "Onde avisar": regra de aviso de movimento de cada bandeja (computador) que se apresentou. */
export default function AlertDevices({ cameras, open }) {
  const poll = usePoll('/api/alert-devices', 20000);
  const [run, busy] = useAction();
  const [renaming, setRenaming] = useState(null); // {id, name}
  const [removing, setRemoving] = useState(null);
  const data = poll.data;
  const now = data?.now ?? Date.now() / 1000;

  const change = async (path, body, okText) => {
    const result = await run(path, body, okText);
    if (result) poll.reload();
    return result;
  };
  const update = (id, body) => change(`/api/alert-devices/${id}`, body);

  return (
    <details open={open || undefined} style={{ border: '1px solid color-mix(in srgb, var(--borda) 45%, transparent)', borderRadius: 'var(--r-tecla)', padding: '0 14px' }}>
      <summary style={{ minHeight: 48, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <Icon name="bell" size={16} /><strong className="lbl" style={{ color: 'var(--ink)' }}>Onde avisar</strong>
        {data && <span className="small muted">{data.devices.length} {data.devices.length === 1 ? 'computador' : 'computadores'}</span>}
      </summary>
      <div className="stack" style={{ gap: 14, paddingBottom: 14 }}>
        <Stale poll={poll} what="aparelhos" />
        {data && data.devices.length === 0 && (
          <p className="muted small">Nenhuma bandeja se apresentou ainda. Ela aparece aqui sozinha depois de atualizada no computador.</p>
        )}
        {data?.devices.map((device) => {
          const paused = pausedText(device.pausedUntil, now);
          return (
            <div key={device.id} className="stack" style={{ gap: 10, borderTop: '1px solid color-mix(in srgb, var(--borda) 35%, transparent)', paddingTop: 12 }}>
              <div className="row" style={{ padding: 0, border: 0, flexWrap: 'wrap' }}>
                {renaming?.id === device.id ? (
                  <form style={{ display: 'flex', gap: 8, flex: 1 }} onSubmit={(e) => { e.preventDefault(); update(device.id, { name: renaming.name }).then((r) => r && setRenaming(null)); }}>
                    <label className="small muted" style={{ position: 'absolute', left: -9999 }} htmlFor={`nome-${device.id}`}>Nome do computador</label>
                    <input id={`nome-${device.id}`} className="field" autoFocus value={renaming.name} maxLength={30} onChange={(e) => setRenaming({ id: device.id, name: e.target.value })} style={{ flex: 1, minHeight: 44 }} />
                    <Key type="submit" center signal={!busy && !!renaming.name.trim()} disabled={busy || !renaming.name.trim()}>Salvar</Key>
                    <Key center onClick={() => setRenaming(null)}>Cancelar</Key>
                  </form>
                ) : (
                  <>
                    <strong style={{ flex: 1, minWidth: 0 }}>{device.name}</strong>
                    <Status kind={device.busy ? 'warn' : device.online ? 'ok' : 'off'}>{device.busy ? 'em tela cheia' : device.online ? 'conectado' : 'desligado'}</Status>
                    <Key center aria-label={`Renomear ${device.name}`} onClick={() => setRenaming({ id: device.id, name: device.name })}>Renomear</Key>
                    {removing === device.id ? (
                      <Key center signal={!busy} disabled={busy} onClick={() => { setRemoving(null); change(`/api/alert-devices/${device.id}/remove`, {}, 'Computador removido'); }}>Remover?</Key>
                    ) : (
                      <Key center aria-label={`Remover ${device.name}`} onClick={() => setRemoving(device.id)}>Remover</Key>
                    )}
                  </>
                )}
              </div>

              <Segmented label={`Câmeras que avisam em ${device.name}`} value={device.mode} options={MODES} disabled={busy} onChange={(mode) => update(device.id, { mode })} />

              {device.mode === 'some' && (
                <div role="group" aria-label="Câmeras" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {cameras.map((c) => {
                    const on = device.cameras.includes(c.id);
                    return (
                      <Key key={c.id} center on={on} disabled={busy}
                        onClick={() => update(device.id, { cameras: on ? device.cameras.filter((x) => x !== c.id) : [...device.cameras, c.id] })}>{c.name}</Key>
                    );
                  })}
                </div>
              )}

              {device.mode !== 'none' && (
                <>
                  <div className="row" style={{ padding: 0, border: 0 }}>
                    <span className="stack">
                      <span>Segurar com jogo ou vídeo em tela cheia</span>
                      <span className="small muted">Os alertas esperam e chegam num resumo quando você sair da tela cheia.</span>
                    </span>
                    <Switch on={device.game} label={`Segurar alertas em tela cheia em ${device.name}`} disabled={busy} onChange={(game) => update(device.id, { game })} />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    {paused ? (
                      <>
                        <span className="small">{paused}</span>
                        <Key center disabled={busy} onClick={() => update(device.id, { pausedUntil: 0 })}>Reativar</Key>
                      </>
                    ) : (
                      <>
                        <span className="small muted">Pausar</span>
                        <Key center disabled={busy} onClick={() => update(device.id, { pausedUntil: Math.floor(now) + 3600 })}>1 h</Key>
                        <Key center disabled={busy} onClick={() => update(device.id, { pausedUntil: Math.floor(now) + 14400 })}>4 h</Key>
                        <Key center disabled={busy} onClick={() => update(device.id, { pausedUntil: FOREVER })}>Até reativar</Key>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
        <p className="small muted">"Monitoradas" segue o sino de cada câmera. A contagem de movimentos e a ordem das câmeras continuam iguais em todo lugar; isto só escolhe onde o alerta aparece.</p>
      </div>
    </details>
  );
}
