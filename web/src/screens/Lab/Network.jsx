import { useState } from 'react';
import { fmtAgo, usePoll } from '../../api.js';
import { Badge, Card, Icon, Key, Stale, Status, Switch, useAction } from '../../ui.jsx';

function Device({ d, act, busy }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState(false);
  const meta = [d.ip, d.name || d.hint ? d.host : null, d.private ? 'MAC privado' : d.mac].filter(Boolean).join(' · ');
  const when = d.online ? '' : ` · visto ${fmtAgo(d.lastSeen)}`;
  const first = d.known ? '' : ` · apareceu ${fmtAgo(d.firstSeen)}`;

  const save = async (event) => {
    event.preventDefault();
    const value = name.trim();
    if (!value || value === d.label || await act(d.id, { name: value }, `Agora é "${value}"`)) setRenaming(false);
  };

  return (
    <li className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <span style={{ marginTop: 4 }}><Status kind={d.online ? 'ok' : 'off'}>{d.online ? 'on' : 'off'}</Status></span>
      <div className="stack" style={{ flex: '1 1 200px', gap: 2 }}>
        {renaming ? (
          <form onSubmit={save} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="text" autoFocus value={name} maxLength={40} aria-label={`Nome para ${d.label}`} placeholder="Ex.: Celular da Lorena"
              style={{ flex: '1 1 160px' }} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(false); }} />
            <Key type="submit" center signal={!busy} disabled={busy}>Salvar</Key>
            <Key center onClick={() => setRenaming(false)}>Cancelar</Key>
          </form>
        ) : (
          <>
            <strong>{d.label} {!d.known && <Badge>novo</Badge>}</strong>
            <span className="muted small mono" style={{ overflowWrap: 'anywhere' }}>{meta}{when}{first}</span>
          </>
        )}
      </div>
      {!renaming && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, flex: '1 1 100%', justifyContent: 'flex-end' }}>
          {!d.known && <Key center disabled={busy} onClick={() => act(d.id, { known: true }, `${d.label}: marcado como seu`)}>É meu</Key>}
          <Key center onClick={() => { setName(d.name ?? ''); setRenaming(true); }} aria-label={`Dar nome a ${d.label}`}>{d.name ? 'Renomear' : 'Dar nome'}</Key>
          <label className="small muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44 }}>
            Avisar se sumir
            <Switch on={d.watched} disabled={busy} label={`Avisar se ${d.label} sumir da rede`}
              onChange={(watch) => act(d.id, { watch }, watch ? `${d.label}: avisa se sumir da rede` : `${d.label}: sem vigia`)} />
          </label>
          {confirm ? (
            <>
              <Key center signal={!busy} disabled={busy}
                onClick={async () => { if (await act(d.id, null, `${d.label} removido da lista`)) setConfirm(false); }}>Remover mesmo</Key>
              <Key center onClick={() => setConfirm(false)}>Não</Key>
            </>
          ) : (
            <Key center style={{ minWidth: 44, padding: 0 }} aria-label={`Remover ${d.label} da lista`} title="Remover da lista" onClick={() => setConfirm(true)}><Icon name="close" size={18} /></Key>
          )}
        </div>
      )}
    </li>
  );
}

export default function NetworkCard({ disabled }) {
  const poll = usePoll('/api/network', 30000);
  const [run, busy] = useAction();
  const n = poll.data;

  // body === null remove o aparelho; senão atualiza (nome, known, watch).
  const act = async (id, body, ok) => {
    const result = body === null ? await run(`/api/network/${id}/remove`, {}, ok) : await run(`/api/network/${id}`, body, ok);
    if (result) poll.reload();
    return result;
  };
  const scan = async () => { if (await run('/api/network/scan', {}, 'Rede varrida')) poll.reload(); };

  if (!n) return <Card title="Rede de casa">{poll.error ? <Stale poll={poll} what="a rede" /> : <p className="muted">Lendo a rede…</p>}</Card>;

  const scanning = n.scanning || (busy && !disabled);
  const fresh = n.devices.filter((d) => !d.known);
  const watched = n.devices.filter((d) => d.known && d.watched);
  const others = n.devices.filter((d) => d.known && !d.watched);
  const missing = watched.filter((d) => !d.online).length;
  const list = (items) => <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{items.map((d) => <Device key={d.id} d={d} act={act} busy={busy} />)}</ul>;

  return (
    <Card title="Rede de casa" aside={
      <Key center disabled={disabled || scanning} onClick={scan}>
        <Icon name="radio" size={18} />{scanning ? 'Varrendo…' : 'Varrer agora'}
      </Key>
    }>
      <Stale poll={poll} what="a rede" />
      <p className="muted small">
        {n.scanned ? `${n.online} conectados · varrida ${fmtAgo(n.scanned)}${missing ? ` · ${missing} vigiado${missing > 1 ? 's' : ''} sem resposta` : ''}` : 'A primeira varredura sai alguns minutos depois de o painel ligar.'}
      </p>
      {n.learningUntil && (
        <div className="aviso" role="status">
          <Icon name="alert" size={20} /><span>Aprendendo a rede até {new Date(n.learningUntil * 1000).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}: o que aparecer até lá entra como conhecido, sem aviso. Depois, todo aparelho novo avisa no celular.</span>
        </div>
      )}
      {n.error && <div className="aviso err" role="status"><Icon name="alert" size={20} /><span>{n.error} Tento de novo em 15 min.</span></div>}

      {fresh.length > 0 && (
        <section className="stack" aria-label="Aparelhos novos">
          <h3 className="lbl">{fresh.length === 1 ? 'Aparelho novo na rede' : `${fresh.length} aparelhos novos na rede`}</h3>
          <p className="muted small">Se reconhecer, toque em &quot;É meu&quot;. Se não, troque a senha do Wi-Fi.</p>
          {list(fresh)}
        </section>
      )}
      {watched.length > 0 && (
        <section className="stack" aria-label="Aparelhos vigiados">
          <h3 className="lbl">Vigiados</h3>
          <p className="muted small">Aviso no celular se sumirem por ~30 min.</p>
          {list(watched)}
        </section>
      )}
      {others.length > 0 && (
        <details>
          <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            Outros aparelhos <span className="muted small mono">{others.filter((d) => d.online).length} de {others.length} conectados</span>
          </summary>
          {list(others)}
        </details>
      )}
      {!n.devices.length && <p className="muted">Nenhum aparelho visto ainda.</p>}
    </Card>
  );
}
