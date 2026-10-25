import { useState } from 'react';
import { useHome } from '../../App.jsx';
import { Card, Icon, Modal, Segmented, useAction } from '../../ui.jsx';

const ICONS = [['home', 'Casa'], ['film', 'Filme'], ['moon', 'Noite'], ['book', 'Leitura'], ['sun', 'Sol'], ['sofa', 'Sofá'], ['coffee', 'Café'], ['bed', 'Cama'], ['power', 'Desligar']];
const DEVICES = [['quarto-luz', 'Luz do quarto', 'light'], ['banheiro-luz', 'Luz do banheiro', 'light'], ['ar-quarto', 'Ar do quarto', 'ac']];
const AC_MODES = [['cool', 'Resfriar'], ['heat', 'Aquecer'], ['dry', 'Desumidificar'], ['fan', 'Ventilar'], ['auto', 'Automático']];
const AC_FANS = [['auto', 'Automática'], ['low', 'Baixa'], ['medium', 'Média'], ['high', 'Alta']];

/* O ícone do modo cai em "home" quando o desenho não existe no conjunto do painel. */
const iconFor = (name) => (['home', 'film', 'moon', 'book', 'sun', 'sofa', 'coffee', 'bed', 'power'].includes(name) ? name : 'home');

function initialSteps(steps = {}) {
  const out = {};
  for (const [id, , kind] of DEVICES) {
    const s = steps[id];
    out[id] = {
      kind: !s ? 'skip' : s.power ? 'on' : 'off',
      brightness: s?.brightness ?? 50, colorHex: (s?.colorHex ?? '#FFD9A0').toLowerCase(),
      temperature: s?.temperature ?? 24, mode: s?.mode ?? 'cool', fan: s?.fan ?? 'auto', keepIfOn: s?.keepIfOn ?? false,
      light: kind === 'light',
    };
  }
  return out;
}

function ModeForm({ initial, busy, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? 'home');
  const [steps, setSteps] = useState(() => initialSteps(initial?.steps));
  const patch = (id, change) => setSteps((old) => ({ ...old, [id]: { ...old[id], ...change } }));

  const build = () => {
    const out = {};
    for (const [id, , kind] of DEVICES) {
      const s = steps[id];
      if (s.kind === 'skip') continue;
      if (s.kind === 'off') out[id] = { power: false };
      else if (kind === 'light') out[id] = { power: true, brightness: Number(s.brightness), colorHex: s.colorHex.toUpperCase() };
      else out[id] = { power: true, temperature: Number(s.temperature), mode: s.mode, fan: s.fan, keepIfOn: s.keepIfOn };
    }
    return out;
  };
  const chosen = DEVICES.filter(([id]) => steps[id].kind !== 'skip').length;
  const valid = name.trim().length > 0 && chosen > 0;

  return (
    <form className="stack" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); if (valid) onSave({ ...(initial ? { id: initial.id } : {}), name: name.trim(), icon, steps: build() }); }}>
      <label className="field">Nome
        <input type="text" value={name} maxLength={30} placeholder="Ex.: Leitura" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">Ícone
        <select value={icon} onChange={(e) => setIcon(e.target.value)}>
          {ICONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </label>

      {DEVICES.map(([id, label, kind]) => {
        const s = steps[id];
        return (
          <fieldset key={id} className="stack" style={{ gap: 10, border: '1px solid var(--line)', borderRadius: 12, padding: 12, margin: 0, minWidth: 0 }}>
            <legend className="small muted" style={{ padding: '0 6px' }}>{label}</legend>
            <Segmented label={label} value={s.kind} onChange={(k) => patch(id, { kind: k })}
              options={[['skip', 'Não mexer'], ['off', 'Desligar'], ['on', 'Ligar']]} />
            {s.kind === 'on' && kind === 'light' && (
              <>
                <label className="field">Brilho: <span className="mono num">{s.brightness}%</span>
                  <input type="range" min="10" max="100" step="5" value={s.brightness} onChange={(e) => patch(id, { brightness: e.target.value })} />
                </label>
                <label className="field">Cor
                  <input type="color" value={s.colorHex} aria-label={`Cor de ${label}`} style={{ width: 64, height: 44, padding: 2, background: 'var(--bg)', border: '1px solid var(--line-strong)', borderRadius: 12 }} onChange={(e) => patch(id, { colorHex: e.target.value })} />
                </label>
              </>
            )}
            {s.kind === 'on' && kind === 'ac' && (
              <>
                <label className="field">Temperatura (°C)
                  <input type="number" min="17" max="30" step="1" inputMode="numeric" value={s.temperature} onChange={(e) => patch(id, { temperature: e.target.value })} />
                </label>
                <label className="field">Modo
                  <select value={s.mode} onChange={(e) => patch(id, { mode: e.target.value })}>{AC_MODES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
                </label>
                <label className="field">Ventilação
                  <select value={s.fan} onChange={(e) => patch(id, { fan: e.target.value })}>{AC_FANS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
                </label>
                <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
                  <input type="checkbox" checked={s.keepIfOn} onChange={(e) => patch(id, { keepIfOn: e.target.checked })} style={{ width: 22, height: 22 }} />
                  <span className="small">Manter como está se o ar já estiver ligado</span>
                </label>
              </>
            )}
          </fieldset>
        );
      })}
      {!chosen && <p className="small" style={{ color: 'var(--accent)' }}>Escolha o que o modo faz em pelo menos um aparelho.</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn primary" disabled={!valid || busy}>Salvar modo</button>
      </div>
    </form>
  );
}

export default function Modes() {
  const { home, refresh } = useHome();
  const [run, busy] = useAction();
  const [editing, setEditing] = useState(null); // 'new' | modo
  const [removing, setRemoving] = useState(null);
  const modes = home?.scenes ?? [];

  const save = async (body) => { if (await run('/api/modes', body, 'Modo salvo')) { setEditing(null); refresh(); } };
  const remove = async (m) => { setRemoving(null); if (await run(`/api/modes/${m.id}/remove`, {}, 'Modo removido')) refresh(); };
  const play = (m) => run(`/api/scenes/${m.id}/run`, {}, `Modo ${m.name} aplicado`).then(() => refresh());
  const move = async (index, by) => {
    const ids = modes.map((m) => m.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    if (await run('/api/modes/order', { ids })) refresh();
  };

  return (
    <Card title="Modos da casa" aside={<button type="button" className="btn" onClick={() => setEditing('new')}><Icon name="plus" size={18} />Novo</button>}>
      {!modes.length && <p className="muted">Nenhum modo ainda. Crie um para ligar e desligar várias coisas de uma vez.</p>}
      <div className="stack">
        {modes.map((m, i) => (
          <div key={m.id} className="row" style={{ flexWrap: 'wrap' }}>
            <Icon name={iconFor(m.icon)} size={22} />
            <div className="stack" style={{ flex: '1 1 160px' }}>
              <strong>{m.name}</strong>
              <span className="muted small">{m.description}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" className="btn primary" disabled={busy} onClick={() => play(m)}>Rodar</button>
              <button type="button" className="btn ghost" style={{ minWidth: 44, padding: 0 }} aria-label={`Subir ${m.name}`} disabled={busy || i === 0} onClick={() => move(i, -1)}><Icon name="up" size={18} /></button>
              <button type="button" className="btn ghost" style={{ minWidth: 44, padding: 0 }} aria-label={`Descer ${m.name}`} disabled={busy || i === modes.length - 1} onClick={() => move(i, 1)}><Icon name="down" size={18} /></button>
              <button type="button" className="btn ghost" onClick={() => setEditing(m)} aria-label={`Editar ${m.name}`}>Editar</button>
              {removing === m.id ? (
                <>
                  <button type="button" className="btn" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }} disabled={busy} onClick={() => remove(m)}>Remover mesmo</button>
                  <button type="button" className="btn ghost" onClick={() => setRemoving(null)}>Não</button>
                </>
              ) : (
                <button type="button" className="btn ghost" style={{ minWidth: 44, padding: 0 }} aria-label={`Remover ${m.name}`} onClick={() => setRemoving(m.id)}><Icon name="close" size={18} /></button>
              )}
            </div>
          </div>
        ))}
      </div>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Novo modo' : 'Editar modo'}>
        {editing && <ModeForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} busy={busy} onSave={save} onCancel={() => setEditing(null)} />}
      </Modal>
    </Card>
  );
}
