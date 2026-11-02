import { useRef, useState } from 'react';
import { useAction } from '../../ui/actions.js';
import { Banner, Button, Empty, IconButton, Segmented, Slider } from '../../ui/kit.jsx';
import { Icon } from '../../ui/Icon.jsx';
import { Overlay } from '../../ui/Overlay.jsx';
import { AC_FANS, AC_MODES, ICONS, buildSteps, iconFor, initialSteps, modeProblems, modeTargets, moveIds, routinesUsing } from './central.js';

const FORM = 'form-modo';

/** Formulário de modo: nome, ícone e, por aparelho real da casa, não mexer / desligar / ligar com os valores. Salvar só por botão. */
function ModeForm({ initial, targets, busy, onSave }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? 'home');
  const [steps, setSteps] = useState(() => initialSteps(targets, initial?.steps));
  const [tried, setTried] = useState(false);
  const patch = (id, change) => setSteps((old) => ({ ...old, [id]: { ...old[id], ...change } }));
  const built = buildSteps(targets, steps);
  const problems = modeProblems(name, built);
  return (
    <form id={FORM} className="col" onSubmit={(event) => { event.preventDefault(); setTried(true); if (!problems.length && !busy) onSave({ ...(initial ? { id: initial.id } : {}), name: name.trim(), icon, steps: built }); }}>
      <label className="fld">Nome<input className="inp" type="text" value={name} maxLength={30} placeholder="Ex.: Leitura" aria-invalid={tried && !name.trim() ? 'true' : undefined} onChange={(event) => setName(event.target.value)} /></label>
      <label className="fld">Ícone<select className="inp" value={icon} onChange={(event) => setIcon(event.target.value)}>{ICONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
      {!targets.length && <p className="sub">O servidor não listou luzes nem ar para o modo mexer.</p>}
      {targets.map(({ id, name: label, kind }) => {
        const s = steps[id];
        return (
          <fieldset key={id} className="cen-fs">
            <legend className="cap">{label}</legend>
            <Segmented label={label} value={s.kind} onChange={(value) => patch(id, { kind: value })} options={[{ value: 'skip', label: 'Não mexer' }, { value: 'off', label: 'Desligar' }, { value: 'on', label: 'Ligar' }]} />
            {s.kind === 'on' && kind === 'light' && (
              <>
                <div className="fld">Brilho: <span className="mono num">{s.brightness}%</span><Slider min={10} max={100} step={5} value={Number(s.brightness)} label={`Brilho de ${label}`} onChange={(value) => patch(id, { brightness: value })} /></div>
                <label className="fld">Cor<input className="cen-color" type="color" value={s.colorHex} aria-label={`Cor de ${label}`} onChange={(event) => patch(id, { colorHex: event.target.value })} /></label>
              </>
            )}
            {s.kind === 'on' && kind === 'ac' && (
              <>
                <label className="fld">Temperatura (°C)<input className="inp" type="number" min="17" max="30" step="1" inputMode="numeric" value={s.temperature} onChange={(event) => patch(id, { temperature: event.target.value })} /></label>
                <label className="fld">Modo<select className="inp" value={s.mode} onChange={(event) => patch(id, { mode: event.target.value })}>{AC_MODES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
                <label className="fld">Ventilação<select className="inp" value={s.fan} onChange={(event) => patch(id, { fan: event.target.value })}>{AC_FANS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
                <label className="cen-check"><input type="checkbox" checked={s.keepIfOn} onChange={(event) => patch(id, { keepIfOn: event.target.checked })} />Manter como está se o ar já estiver ligado</label>
              </>
            )}
          </fieldset>
        );
      })}
      {tried && problems.length > 0 && <p className="fld"><span className="err" role="alert">{problems.join(' ')}</span></p>}
    </form>
  );
}

/** Modos da casa: criar, editar, ordenar, rodar e remover (com proteção quando uma rotina usa o modo). */
export function Modes({ modes, devices, routines, blocked, reason, refresh }) {
  const [run, busy] = useAction();
  const [editing, setEditing] = useState(null); // 'new' | modo
  const [removing, setRemoving] = useState(null);
  const lock = useRef(false);
  const targets = modeTargets(devices);
  const off = busy || blocked;
  const act = async (path, body, ok) => {
    if (blocked || lock.current) return null;
    lock.current = true;
    try { const result = await run(path, body, ok); if (result) refresh?.(); return result; } finally { lock.current = false; }
  };
  return (
    <section className="card col" aria-label="Modos da casa">
      <div className="row sp wrap">
        <h2 className="h2">Modos da casa · {modes.length}</h2>
        <Button variant="s" icon="plus" disabled={blocked} reason={reason} onClick={() => setEditing('new')}>Novo modo</Button>
      </div>
      {!modes.length && <Empty title="Nenhum modo ainda">Crie um para ligar e desligar várias coisas de uma vez.</Empty>}
      <ul className="list-plain">
        {modes.map((m, i) => {
          const used = routinesUsing(m.id, routines);
          return (
            <li key={m.id} className="col cen-li">
              <div className="row sp wrap">
                <span className="cen-ico" aria-hidden="true"><Icon name={iconFor(m.icon)} /></span>
                <div className="col tight grow"><b>{m.name}</b><span className="sub">{m.description}{used.length ? ` · usado pela rotina ${used[0].name}${used.length > 1 ? ` e mais ${used.length - 1}` : ''}` : ''}</span></div>
                <span className="row wrap">
                  <Button variant="p" disabled={off} reason={reason || 'Aguarde a ação em andamento.'} onClick={() => act(`/api/scenes/${m.id}/run`, {}, `Modo ${m.name} aplicado.`)}>Rodar</Button>
                  <IconButton icon="up" label={`Subir ${m.name}`} disabled={off || i === 0} onClick={() => act('/api/modes/order', { ids: moveIds(modes.map((x) => x.id), i, -1) })} />
                  <IconButton icon="down" label={`Descer ${m.name}`} disabled={off || i === modes.length - 1} onClick={() => act('/api/modes/order', { ids: moveIds(modes.map((x) => x.id), i, 1) })} />
                  <Button variant="s" icon="edit" aria-label={`Editar ${m.name}`} disabled={blocked} reason={reason} onClick={() => setEditing(m)}>Editar</Button>
                  {removing !== m.id && <IconButton icon="trash" label={`Remover ${m.name}`} disabled={blocked} onClick={() => setRemoving(m.id)} />}
                </span>
              </div>
              {removing === m.id && (used.length
                ? <Banner kind="warn" icon="alert" action={<Button variant="s" onClick={() => setRemoving(null)}>Entendi</Button>}>Este modo é usado pela rotina {used[0].name}. Troque a ação da rotina antes de remover.</Banner>
                : <Banner kind="err" icon="alert" title="Remover este modo?" action={<span className="row"><Button variant="p" busy={busy} disabled={blocked} reason={reason} onClick={async () => { setRemoving(null); await act(`/api/modes/${m.id}/remove`, {}, 'Modo removido.'); }}>Remover mesmo</Button><Button variant="s" onClick={() => setRemoving(null)}>Não</Button></span>}>As rotinas e atalhos que usam {m.name} deixam de funcionar.</Banner>)}
            </li>
          );
        })}
      </ul>
      <Overlay open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Novo modo' : 'Editar modo'} kind="panel"
        footer={<><Button variant="s" onClick={() => setEditing(null)}>Cancelar</Button><Button variant="p" type="submit" form={FORM} busy={busy} disabled={blocked} reason={reason}>Salvar modo</Button></>}>
        {editing && <ModeForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} targets={targets} busy={busy} onSave={async (body) => { if (await act('/api/modes', body, 'Modo salvo.')) setEditing(null); }} />}
      </Overlay>
    </section>
  );
}
