import { useEffect, useRef, useState } from 'react';
import { useHome } from '../App.jsx';
import { fmtAgo, usePoll } from '../api.js';
import { Card, Icon, Segmented, Stale, Switch, useAction, useToast } from '../ui.jsx';

const COLORS = [
  ['#FF3B30', 'Vermelho'], ['#FF6A2B', 'Laranja'], ['#FFA51F', 'Âmbar'], ['#FFD84D', 'Amarelo'],
  ['#9BE15D', 'Lima'], ['#34C759', 'Verde'], ['#2ED3B7', 'Turquesa'], ['#FFFFFF', 'Branco frio'],
  ['#34C8FF', 'Ciano'], ['#64A8FF', 'Céu'], ['#2F6BFF', 'Azul'], ['#5E5CE6', 'Índigo'],
  ['#9B5CF6', 'Violeta'], ['#F25FD0', 'Magenta'], ['#FF7EA6', 'Rosa'], ['#FFD6A0', 'Branco quente'],
];
const confidence = { reported: 'Confirmado pela lâmpada', estimated: 'Estado estimado', unknown: 'Estado desconhecido', preview: 'Simulado na prévia' };

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
  const [brightness, setBrightness] = useState(100);
  const color = state.colorHex?.toUpperCase();
  const white = color === '#FFFFFF' || color === '#FFD6A0';
  const preview = mode === 'preview';
  const disabled = busy || !!poll.error || !device || (!preview && (!device.configured || device.connection !== 'online'));
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

  return <>
    <style>{'.lights-touch .switch { height: 44px; align-items: center; } .lights-choice .seg button { min-height: 44px; }'}</style>
    <h1 style={{ fontSize: 28, fontWeight: 600 }}>Luzes</h1>
    {preview && <p className="notice info">Prévia: os ajustes são simulados. Nenhuma lâmpada física é tocada.</p>}
    <Stale poll={poll} what="estados das luzes" />
    {!snapshot ? <p role="status">Carregando lâmpadas…</p> : !device ? <Card><p className="muted">Nenhuma lâmpada disponível.</p></Card> : <>
      <div role="tablist" aria-label="Escolher lâmpada" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {lights.map((light) => <button type="button" className={`btn ${light.id === device.id ? 'primary' : ''}`} role="tab" aria-selected={light.id === device.id} key={light.id} onClick={() => setSelected(light.id)}>
          <Icon name="bulb" />{light.roomId === 'quarto' ? 'Quarto' : 'Banheiro'}
          <span className="small">{light.state?.power == null ? '– –' : light.state.power ? 'Ligada' : 'Apagada'}</span>
        </button>)}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}>
        <Card title={device.name} aside={<span className="lights-touch"><Switch on={state.power === true} label={`Ligar ou apagar ${device.name.toLowerCase()}`} disabled={disabled} onChange={(power) => command({ power })} /></span>}>
          <p className="mono num" style={{ fontSize: 36, color: state.power ? 'var(--accent)' : 'var(--text)' }}>{state.power == null ? '– –' : state.power ? 'Ligada' : 'Apagada'}</p>
          <p className="small muted">{confidence[device.confidence] || 'Estado desconhecido'} · {device.updatedAt ? fmtAgo(device.updatedAt) : 'sem leitura recente'}</p>
          {!preview && device.connection !== 'online' && <p className="notice">{device.configured ? 'Sem conexão com a lâmpada.' : 'Configure a lâmpada no PC de casa para enviar comandos.'}</p>}
          <label className="field" htmlFor="light-brightness">Brilho <span className="mono num">{state.brightness == null ? 'Desconhecido' : `${brightness}%`}</span></label>
          <input id="light-brightness" type="range" min="10" max="100" step="1" value={brightness} disabled={disabled} style={{ minHeight: 44 }} onChange={(event) => setBrightness(Number(event.target.value))} />
          <button type="button" className="btn" disabled={disabled} onClick={() => command({ brightness })}>Aplicar brilho · {brightness}%</button>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} aria-label="Atalhos de brilho">
            {[20, 40, 60, 80, 100].map((value) => <button type="button" className="btn mono" key={value} disabled={disabled} onClick={() => command({ brightness: value })}>{value}%</button>)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" aria-label="Diminuir brilho" disabled={disabled || brightness <= 10} onClick={() => command({ brightness: Math.max(10, brightness - 10) })}><Icon name="minus" /></button>
            <button type="button" className="btn" aria-label="Aumentar brilho" disabled={disabled || brightness >= 100} onClick={() => command({ brightness: Math.min(100, brightness + 10) })}><Icon name="plus" /></button>
          </div>
        </Card>
        <Card title="Cor da luz" className="lights-choice">
          <Segmented label="Branco ou cor" value={color ? white ? 'white' : 'color' : null} options={ [['white', 'Branco'], ['color', 'Cor']] } disabled={disabled} onChange={(value) => chooseColor(value === 'white' ? '#FFD6A0' : '#FF3B30')} />
          <p className="small muted">Branco quente e branco frio usam o modo branco da lâmpada. Escolher uma cor também acende a luz.</p>
          <div role="group" aria-label="Cor da luz: 16 opções" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
            {COLORS.map(([hex, label]) => <button type="button" key={hex} className="btn" aria-label={label} title={label} aria-pressed={color === hex} disabled={disabled} onClick={() => chooseColor(hex)} style={{ minHeight: 52, padding: 8, borderColor: color === hex ? 'var(--text)' : undefined }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: hex, display: 'grid', placeItems: 'center', color: '#0F1114' }}>{color === hex ? '✓' : ''}</span>
            </button>)}
          </div>
          <p className="small muted">Atual: {COLORS.find(([hex]) => hex === color)?.[1] || color || 'desconhecida'}</p>
        </Card>
      </div>
      {!!snapshot.scenes?.length && <Card title="Modos"><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {snapshot.scenes.map((scene) => <button type="button" className="btn" key={scene.id} title={scene.description} disabled={busy || !!poll.error || (!preview && (scene.devices || []).some((id) => !snapshot.devices.find((d) => d.id === id)?.configured))} onClick={async () => {
          if (lock.current) return;
          lock.current = true;
          try {
            const result = await run(`/api/scenes/${scene.id}/run`, {});
            if (result) {
              if (result.status === 'partial') toast('Modo incompleto. Confira as falhas em Últimas ações.', 'error');
              await Promise.all([poll.reload(), refresh()]);
            }
          } finally { lock.current = false; }
        }}>{scene.name}</button>)}
      </div><p className="small muted">Os modos podem ajustar também outros aparelhos da casa. Confira o resultado em Últimas ações.</p></Card>}
    </>}
  </>;
}
