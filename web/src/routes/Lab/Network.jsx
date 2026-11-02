import { useRef, useState } from 'react';
import { usePoll } from '../../core/hooks.js';
import { fmtAgo } from '../../core/format.js';
import { useAction } from '../../ui/actions.js';
import { Banner, Button, Skeleton, Status, Switch } from '../../ui/kit.jsx';
import { Overlay } from '../../ui/Overlay.jsx';
import { Topology } from './Topology.jsx';
import { deviceMeta, deviceName, groupDevices, missingWatched } from './lab.js';

/** Detalhe de UM aparelho: nome, "é meu", vigia e remoção em dois passos. */
export function DeviceDetail({ d, act, busy, blocked, onDone }) {
  const [name, setName] = useState(d.name ?? '');
  const [confirm, setConfirm] = useState(false);
  const label = deviceName(d);
  const save = async (event) => {
    event.preventDefault();
    const value = name.trim();
    if (value && value !== d.name) await act(d.id, { name: value }, `Agora é "${value}"`);
  };
  return (
    <div className="col">
      <p className="sub mono">{deviceMeta(d, Date.now(), fmtAgo)}</p>
      {!d.known && <Button variant="s" icon="check" disabled={blocked || busy} reason="Sem conexão com o painel." onClick={() => act(d.id, { known: true }, `${label}: marcado como seu`)}>É meu</Button>}
      <form className="col" onSubmit={save}>
        <label className="fld">Nome do aparelho<input className="inp" type="text" value={name} maxLength={40} placeholder="Ex.: Celular da Lorena" onChange={(event) => setName(event.target.value)} /></label>
        <Button variant="p" type="submit" disabled={blocked || busy || !name.trim() || name.trim() === d.name} reason="Escreva um nome novo.">Salvar nome</Button>
      </form>
      <Switch on={!!d.watched} disabled={blocked || busy} label={`Avisar se ${label} sumir da rede`} onChange={(watch) => act(d.id, { watch }, watch ? `${label}: avisa se sumir da rede` : `${label}: sem vigia`)}>Avisar se sumir da rede</Switch>
      {confirm ? (
        <Banner kind="err" icon="alert" title="Remover da lista?" action={<span className="row"><Button variant="p" busy={busy} disabled={blocked} reason="Sem conexão com o painel." onClick={async () => { if (await act(d.id, null, `${label} removido da lista`)) { setConfirm(false); onDone(); } }}>Remover mesmo</Button><Button variant="s" onClick={() => setConfirm(false)}>Não</Button></span>}>
          O aparelho some desta lista. Se ele voltar à rede, aparece de novo como novo.
        </Banner>
      ) : <Button variant="s" icon="trash" disabled={blocked || busy} reason="Sem conexão com o painel." aria-label={`Remover ${label} da lista`} onClick={() => setConfirm(true)}>Remover da lista</Button>}
    </div>
  );
}

function Row({ d, onOpen, act, busy, blocked }) {
  const label = deviceName(d);
  return (
    <li className="row sp wrap lab-dev">
      <Status kind={d.online ? 'ok' : 'off'}>{d.online ? 'conectado' : 'sem resposta'}</Status>
      <div className="col tight grow"><b>{label}{!d.known && <span className="badge">novo</span>}</b><span className="sub mono">{deviceMeta(d, Date.now(), fmtAgo)}</span></div>
      {!d.known && <Button variant="s" disabled={blocked || busy} reason="Sem conexão com o painel." onClick={() => act(d.id, { known: true }, `${label}: marcado como seu`)}>É meu</Button>}
      <Button variant="s" aria-label={`Detalhes de ${label}`} onClick={() => onOpen(d.id)}>Detalhes</Button>
    </li>
  );
}

/** Inventário da rede. A varredura é SEMPRE manual: abrir a tela só lê o que o servidor já tem. */
export function Network({ offline, blockedReason }) {
  const poll = usePoll('/api/network', 30000);
  const [run, busy] = useAction();
  const [open, setOpen] = useState(null);
  const lock = useRef(false);
  const n = poll.data;
  const blocked = offline || !!blockedReason;
  const act = async (id, body, ok) => {
    if (blocked || lock.current) return null;
    lock.current = true;
    try {
      const result = body === null ? await run(`/api/network/${id}/remove`, {}, ok) : await run(`/api/network/${id}`, body, ok);
      if (result) poll.reload();
      return result;
    } finally { lock.current = false; }
  };
  const scan = async () => {
    if (blocked || lock.current) return;
    lock.current = true;
    try { if (await run('/api/network/scan', {}, 'Rede varrida')) poll.reload(); } finally { lock.current = false; }
  };
  if (!n) return <section className="card col" aria-label="Rede de casa"><h2 className="h2">Rede de casa</h2>{poll.error ? <Banner kind="warn" icon="off">Sem conexão com a rede: {poll.error.message}</Banner> : <Skeleton height={120} />}</section>;
  const scanning = n.scanning || busy;
  const { fresh, watched, others } = groupDevices(n.devices);
  const missing = missingWatched(n.devices);
  const current = n.devices.find((d) => d.id === open);
  const list = (items) => <ul className="list-plain">{items.map((d) => <Row key={d.id} d={d} onOpen={setOpen} act={act} busy={busy} blocked={blocked} />)}</ul>;
  return (
    <section className="card col" aria-label="Rede de casa">
      <div className="row sp wrap">
        <h2 className="h2">Rede de casa</h2>
        <Button variant="s" icon="radio" busy={scanning} disabled={blocked} reason={offline ? 'A varredura só roda no PC de casa.' : blockedReason} onClick={scan}>{scanning ? 'Varrendo…' : 'Varrer agora'}</Button>
      </div>
      {poll.stale && <Banner kind="warn" icon="off">Sem conexão com a rede. Mostrando o último dado, {fmtAgo(poll.at)}.</Banner>}
      <p className="sub">{n.scanned ? `${n.online} conectados · varrida ${fmtAgo(n.scanned)}${missing ? ` · ${missing} vigiado${missing > 1 ? 's' : ''} sem resposta` : ''}` : 'A primeira varredura sai alguns minutos depois de o painel ligar. A varredura só roda quando você toca no botão ou no horário do servidor.'}</p>
      {n.learningUntil && <Banner kind="info" icon="clock">Aprendendo a rede até {new Date(n.learningUntil * 1000).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}: o que aparecer até lá entra como conhecido, sem aviso. Depois, todo aparelho novo avisa no celular.</Banner>}
      {n.error && <Banner kind="err" icon="alert">{n.error} Tento de novo em 15 min.</Banner>}
      {n.devices.length > 0 && <Topology devices={n.devices} onSelect={setOpen} />}
      {fresh.length > 0 && <section className="col" aria-label="Aparelhos novos"><h3 className="cap">{fresh.length === 1 ? 'Aparelho novo na rede' : `${fresh.length} aparelhos novos na rede`}</h3><p className="hint">Se reconhecer, toque em &quot;É meu&quot;. Se não, troque a senha do Wi-Fi.</p>{list(fresh)}</section>}
      {watched.length > 0 && <section className="col" aria-label="Aparelhos vigiados"><h3 className="cap">Vigiados</h3><p className="hint">Aviso no celular se sumirem por cerca de 30 min.</p>{list(watched)}</section>}
      {others.length > 0 && <details><summary className="lab-sum">Outros aparelhos <span className="sub">{others.filter((d) => d.online).length} de {others.length} conectados</span></summary>{list(others)}</details>}
      {!n.devices.length && <p className="sub">Nenhum aparelho visto ainda.</p>}
      <Overlay open={!!current} onClose={() => setOpen(null)} title={current ? deviceName(current) : 'Aparelho'} kind="sheet">
        {current && <DeviceDetail key={current.id} d={current} act={act} busy={busy} blocked={blocked} onDone={() => setOpen(null)} />}
      </Overlay>
    </section>
  );
}
