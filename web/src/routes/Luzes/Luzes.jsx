import { useEffect, useRef, useState } from 'react';
import { useCommand, useHome } from '../../core/hooks.js';
import { fmtAgo } from '../../core/format.js';
import { useAction } from '../../ui/actions.js';
import { confidenceOf } from '../../ui/confidence.js';
import { Draft } from '../../ui/Draft.jsx';
import { Banner, Button, CommandState, Confidence, Empty, IconButton, Segmented, Skeleton, Switch } from '../../ui/kit.jsx';
import { COLORS, LIGHT_IDS, ROOMS, WHITES, colorName, colorValues, isWhite } from './colors.js';

/** Uma lâmpada: estado relatado, brilho em rascunho + Aplicar, ligar/apagar e cor. Dados reais; nada simulado fora da prévia. */
function LightCard({ device, blocked, reason, run, busy }) {
  const command = useCommand(device.id);
  const state = device.state || {};
  const kind = confidenceOf(device, command);
  const [turnOn, setTurnOn] = useState(true);
  const lock = useRef(false);
  const color = state.colorHex?.toUpperCase();
  const lit = state.power === true;
  const send = async (values, ok) => {
    if (blocked || lock.current) return null;
    lock.current = true;
    try { return await run(`/api/devices/${device.id}/commands`, { action: 'set', values }, ok); } finally { lock.current = false; }
  };
  const brightness = Number.isFinite(state.brightness) ? state.brightness : null;
  const style = { '--lamp': color || undefined, '--k': lit ? 0.55 + (brightness ?? 100) / 100 * 0.6 : 0.3, '--o': lit ? 0.3 + (brightness ?? 100) / 100 * 0.7 : 0.06, '--b': lit ? 1 : 0.35 };
  return (
    <section className="obj warm col" aria-label={device.name}>
      <div className="row sp wrap">
        <div className="col tight"><h2 className="h2">{device.name}</h2><span className="sub">{state.power == null ? 'estado desconhecido' : lit ? 'acesa' : 'apagada'}{device.updatedAt ? ` · ${fmtAgo(device.updatedAt)}` : ''}</span></div>
        <span className="row"><Confidence kind={kind} /><CommandState command={command} /></span>
      </div>
      <div className="row" style={{ gap: 20 }}>
        <div className={`lamp ${lit ? '' : 'off'}`} style={style} aria-hidden="true"><span className="glow" /><span className="bulb" /></div>
        <div className="col tight grow"><span className="num xl" aria-live="polite">{brightness == null ? '—' : <>{brightness}<span className="u">%</span></>}</span><span className="sub">brilho relatado pela luz</span></div>
        <IconButton icon="power" label={lit ? `Apagar ${device.name.toLowerCase()}` : `Ligar ${device.name.toLowerCase()}`} className={`big round ${lit ? 'on' : ''}`} size={26} aria-pressed={lit ? 'true' : 'false'} disabled={blocked || busy} onClick={() => send({ power: !lit })} />
      </div>
      {reason && <p className="hint" role="status">{reason}</p>}
      <Draft label="Brilho" reported={brightness} min={10} max={100} presets={[20, 40, 60, 80, 100]} busy={busy} disabled={blocked || state.power == null} reason={reason || (state.power == null ? 'A luz não informou o estado.' : undefined)} confidence={null} onApply={(value) => send({ brightness: value })} />
      <div className="picker">
        <div className="row sp wrap"><h3 className="cap">Cor</h3><Switch on={turnOn} onChange={setTurnOn}>Ligar ao escolher cor</Switch></div>
        <Segmented label="Branco ou cor" value={color ? (isWhite(color) ? 'white' : 'color') : null} disabled={blocked || busy}
          options={[{ value: 'white', label: 'Branco' }, { value: 'color', label: 'Cor' }]}
          onChange={(value) => send(colorValues(value === 'white' ? WHITES[0] : COLORS[0][0], { power: state.power, turnOn }))} />
        <div className="swatches" role="group" aria-label="Cor da luz: 16 opções">
          {COLORS.map(([hex, name]) => <button type="button" key={hex} className="swatch" style={{ background: hex }} aria-label={name} title={name} aria-pressed={color === hex ? 'true' : 'false'} disabled={blocked || busy} onClick={() => send(colorValues(hex, { power: state.power, turnOn }))} />)}
        </div>
        <p className="hint">Atual: {colorName(color) || color || 'desconhecida'}. {turnOn ? 'Escolher uma cor liga a luz se ela estiver apagada.' : 'Escolher uma cor não liga a luz apagada.'} Branco quente e frio usam o modo branco da lâmpada.</p>
      </div>
    </section>
  );
}

export default function Luzes({ param }) {
  const { home, homeAt, stateError } = useHome();
  const [selected, setSelected] = useState(param || 'quarto-luz');
  const [run, busy] = useAction();
  const lock = useRef(false);
  useEffect(() => { if (param) setSelected(param); }, [param]);
  if (!home) return <div className="col" role="status"><Skeleton height={28} width="30%" /><Skeleton height={320} /></div>;

  const lights = (home.devices || []).filter((d) => LIGHT_IDS.includes(d.id));
  const preview = home.mode === 'preview';
  if (!lights.length) return <Empty title="Nenhuma lâmpada disponível">O servidor não devolveu as luzes configuradas.</Empty>;
  const device = lights.find((d) => d.id === selected) || lights[0];
  const reason = stateError ? 'Sem conexão com o painel.'
    : preview ? null
      : !device.configured ? 'Configure a lâmpada no PC de casa para enviar comandos.'
        : device.connection !== 'online' ? 'Sem conexão com a lâmpada.' : null;
  const blocked = busy || !!reason;

  return (
    <div className="col">
      {stateError && <Banner kind="warn" icon="off" title="Sem conexão com o PC de casa">Mostrando o último estado conhecido, {fmtAgo(homeAt)}. Os comandos ficam bloqueados.</Banner>}
      {preview && <Banner kind="info" icon="eye">Prévia: os ajustes são simulados. Nenhuma lâmpada física é tocada.</Banner>}
      <div className="lights-pick">
        <Segmented label="Escolher lâmpada" value={device.id} onChange={setSelected}
          options={lights.map((light) => ({ value: light.id, label: `${ROOMS[light.roomId] || light.name} · ${light.state?.power == null ? '—' : light.state.power ? `${light.state.brightness ?? '—'}%` : 'apagada'}` }))} />
      </div>
      <LightCard key={device.id} device={device} blocked={blocked} reason={reason} run={run} busy={busy} />
      {!!home.scenes?.length && (
        <section className="sand col" aria-label="Modos">
          <h2 className="h2">Modos</h2>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            {home.scenes.map((scene) => (
              <Button key={scene.id} variant="s" busy={busy} disabled={!!stateError || (!preview && (scene.devices || []).some((id) => !home.devices.find((d) => d.id === id)?.configured))}
                reason={stateError ? 'Sem conexão com o painel.' : 'Algum aparelho deste modo não está configurado.'}
                onClick={async () => { if (lock.current) return; lock.current = true; try { await run(`/api/scenes/${scene.id}/run`, {}); } finally { lock.current = false; } }}>
                <span className="col tight"><b>{scene.name}</b>{scene.description && <span className="sub">{scene.description}</span>}</span>
              </Button>
            ))}
          </div>
          <p className="hint">Os modos podem ajustar também outros aparelhos. O resultado de cada aparelho aparece nas últimas ações do Início.</p>
        </section>
      )}
    </div>
  );
}
