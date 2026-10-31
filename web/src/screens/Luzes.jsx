import { useEffect, useRef, useState } from 'react';
import { useHome } from '../App.jsx';
import { fmtAgo, usePoll } from '../api.js';
import { Card, Confidence, Dot, Icon, Key, Lcd, Segmented, Stale, Switch, VSlider, useAction, useConfidence, useToast } from '../ui.jsx';

const COLORS = [
  ['#FF3B30', 'Vermelho'], ['#FF6A2B', 'Laranja'], ['#FFA51F', 'Âmbar'], ['#FFD84D', 'Amarelo'],
  ['#9BE15D', 'Lima'], ['#34C759', 'Verde'], ['#2ED3B7', 'Turquesa'], ['#FFFFFF', 'Branco frio'],
  ['#34C8FF', 'Ciano'], ['#64A8FF', 'Céu'], ['#2F6BFF', 'Azul'], ['#5E5CE6', 'Índigo'],
  ['#9B5CF6', 'Violeta'], ['#F25FD0', 'Magenta'], ['#FF7EA6', 'Rosa'], ['#FFD6A0', 'Branco quente'],
];
const ROOMS = { quarto: 'Quarto', banheiro: 'Banheiro' };

export default function Luzes({ param }) {
  const { home, refresh, mode } = useHome();
  const poll = usePoll('/api/state', 5000);
  const [selected, setSelected] = useState(param || 'quarto-luz');
  const [run, busy] = useAction();
  const toast = useToast();
  const lock = useRef(false);
  const snapshot = poll.data || home;
  const lights = (snapshot?.devices || []).filter((d) => ['quarto-luz', 'banheiro-luz'].includes(d.id));
  const device = lights.find((d) => d.id === selected) || lights[0];
  const state = device?.state || {};
  const kind = useConfidence(device);
  const [brightness, setBrightness] = useState(100);
  const color = state.colorHex?.toUpperCase();
  const white = color === '#FFFFFF' || color === '#FFD6A0';
  const preview = mode === 'preview';
  // Motivo do bloqueio, mostrado em texto (não só a tecla tracejada).
  const reason = poll.error ? 'Sem conexão com o painel.'
    : !device ? null
      : preview ? null
        : !device.configured ? 'Configure a lâmpada no PC de casa para enviar comandos.'
          : device.connection !== 'online' ? 'Sem conexão com a lâmpada.' : null;
  const disabled = busy || !device || !!reason;
  useEffect(() => { if (param) setSelected(param); }, [param]);
  useEffect(() => { setBrightness(state.brightness ?? 100); }, [device?.id, state.brightness]);

  async function command(values) {
    if (disabled || lock.current) return;
    lock.current = true;
    try {
      const result = await run(`/api/devices/${device.id}/commands`, { action: 'set', values });
      if (result) await Promise.all([poll.reload(), refresh()]);
      else setBrightness(state.brightness ?? 100);
    } finally { lock.current = false; }
  }
  const chooseColor = (hex) => command({ colorHex: hex, ...(state.power === true ? {} : { power: true }) });
  const shortcut = (value) => <Key key={value} center disabled={disabled} onClick={() => command({ brightness: value })}>{value}</Key>;

  if (!snapshot) return <Lcd role="status">Carregando lâmpadas…</Lcd>;
  const notice = preview && <div className="aviso" role="status"><Icon name="warn" size={20} /><span>Prévia: os ajustes são simulados. Nenhuma lâmpada física é tocada.</span></div>;
  if (!device) return <>{notice}<Stale poll={poll} what="estados das luzes" /><Card><p className="mut">Nenhuma lâmpada disponível.</p></Card></>;
  return (
    <>
      {notice}
      <Stale poll={poll} what="estados das luzes" />
      <Segmented label="Escolher lâmpada" value={device.id} onChange={setSelected}
        options={lights.map((light) => [light.id, `${ROOMS[light.roomId] || light.name} · ${light.state?.power == null ? '– –' : light.state.power ? `${light.state.brightness ?? '—'}%` : 'off'}`])} />
      <div className="stage two">
        <div className={`halo-scene ${state.power === true ? '' : 'off'}`} style={{ '--k': state.power === true ? 0.55 + brightness / 100 * 0.6 : 0.3, '--o': state.power === true ? 0.3 + brightness / 100 * 0.7 : 0.05, '--halo': color || '#FFD08A' }}>
          <div className="halo" aria-hidden="true" />
          <span className="lamp-fig" aria-hidden="true" />
          <div className="stack" style={{ position: 'absolute', left: 14, bottom: 14, right: 96, background: 'color-mix(in srgb, var(--modulo) 92%, transparent)', borderRadius: 20, padding: '12px 14px', gap: 4 }} aria-live="polite">
            <div className="row"><span className="lbl">{device.name.toLowerCase()} · brilho</span><Confidence kind={kind}>{device.updatedAt ? fmtAgo(device.updatedAt) : ''}</Confidence></div>
            <Dot size={64}>{state.brightness == null ? '–' : `${brightness}%`}</Dot>
            <span className="mut small">{state.brightness != null && brightness !== state.brightness ? `rascunho · agora ${state.brightness}%` : state.power == null ? 'estado desconhecido' : state.power ? 'acesa' : 'apagada'}</span>
          </div>
          <div style={{ position: 'absolute', right: 20, top: 20, bottom: 20, display: 'grid' }}>
            <VSlider label="Brilho" value={brightness} min={10} max={100} step={10} disabled={disabled} onChange={setBrightness} />
          </div>
        </div>
        <div className="stack" style={{ gap: 12 }}>
          {reason && <p className="mut" role="status" style={{ fontSize: 13 }}>{reason}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'center' }}>
            <Key signal center disabled={disabled || brightness === state.brightness} reason={brightness === state.brightness ? 'brilho já aplicado' : undefined} onClick={() => command({ brightness })}>Aplicar {brightness}%</Key>
            <div className="list" style={{ border: 0 }}>
              <div style={{ border: 0, minHeight: 48 }}><span>{state.power ? 'Acesa' : 'Apagada'}</span><Switch on={state.power === true} label={`Ligar ou apagar ${device.name.toLowerCase()}`} disabled={disabled} onChange={(power) => command({ power })} /></div>
            </div>
          </div>
          <span className="lbl">Atalhos · aplicam ao tocar</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>{[20, 40, 60, 80, 100].map(shortcut)}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Key center aria-label="Diminuir brilho" disabled={disabled || brightness <= 10} onClick={() => command({ brightness: Math.max(10, brightness - 10) })}>− 10</Key>
            <Key center aria-label="Aumentar brilho" disabled={disabled || brightness >= 100} onClick={() => command({ brightness: Math.min(100, brightness + 10) })}>+ 10</Key>
          </div>
          <span className="lbl">Cor · liga se estiver apagada</span>
          <Segmented label="Branco ou cor" value={color ? white ? 'white' : 'color' : null} disabled={disabled} options={[['white', 'Branco'], ['color', 'Cor']]}
            onChange={(value) => chooseColor(value === 'white' ? '#FFD6A0' : '#FF3B30')} />
          <div className="hue" role="group" aria-label="Cor da luz: 16 opções">
            {COLORS.map(([hex, label]) => <button type="button" key={hex} aria-label={label} title={label} aria-pressed={color === hex} disabled={disabled} style={{ background: hex }} onClick={() => chooseColor(hex)} />)}
          </div>
          <p className="mut" style={{ fontSize: 12 }}>Atual: {COLORS.find(([hex]) => hex === color)?.[1] || color || 'desconhecida'}. Branco quente e frio usam o modo branco da lâmpada.</p>
        </div>
      </div>
      {!!snapshot.scenes?.length && (
        <Card title="Modos">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            {snapshot.scenes.map((scene) => (
              <Key key={scene.id} sub={scene.description} disabled={busy || !!poll.error || (!preview && (scene.devices || []).some((id) => !snapshot.devices.find((d) => d.id === id)?.configured))} onClick={async () => {
                if (lock.current) return;
                lock.current = true;
                try {
                  const result = await run(`/api/scenes/${scene.id}/run`, {});
                  if (result) {
                    if (result.status === 'partial') toast('Modo incompleto. Confira as falhas em Últimas ações.', 'error');
                    await Promise.all([poll.reload(), refresh()]);
                  }
                } finally { lock.current = false; }
              }}>{scene.name}</Key>
            ))}
          </div>
          <p className="mut" style={{ fontSize: 11 }}>Os modos podem ajustar também outros aparelhos da casa. Confira o resultado em Últimas ações.</p>
        </Card>
      )}
    </>
  );
}
