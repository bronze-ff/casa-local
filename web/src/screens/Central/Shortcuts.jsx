import { useState } from 'react';
import { useHome } from '../../App.jsx';
import { get, usePoll } from '../../api.js';
import { Card, Icon, useAction, useToast } from '../../ui.jsx';
import CopyText from './CopyText.jsx';

/* A chave só é lida do servidor quando você abre o painel e só aparece depois de "Mostrar chave". */
export default function Shortcuts() {
  const { home } = useHome();
  const toast = useToast();
  const [run, busy] = useAction();
  const notif = usePoll('/api/notifications', 0);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(null);
  const [shown, setShown] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const modes = home?.scenes ?? [];
  // Pelo Tailscale (sem a porta do ntfy); sem ele, o endereço atual.
  const base = notif.data?.subscribe ? notif.data.subscribe.replace(/:10000$/, '') : window.location.origin;

  const toggle = async () => {
    if (open) { setOpen(false); setKey(null); setShown(false); setConfirm(false); return; }
    setOpen(true);
    try { setKey((await get('/api/shortcuts')).key); } catch (error) { toast(error.message, 'error'); setOpen(false); }
  };
  const rotate = async () => {
    setConfirm(false);
    const r = await run('/api/shortcuts/rotate', {}, 'Chave trocada: atualize seus atalhos');
    if (r) { setKey(r.key); setShown(true); }
  };

  return (
    <Card title="Atalhos da Siri" aside={<button type="button" className="btn" onClick={toggle} aria-expanded={open}><Icon name={open ? 'up' : 'down'} size={18} />{open ? 'Fechar' : 'Configurar'}</button>}>
      <p className="muted small">&quot;E aí Siri, cheguei&quot; roda o modo sem abrir o painel. Funciona com o Tailscale ligado no iPhone.</p>
      {open && !key && <p className="muted" role="status">Lendo a chave…</p>}
      {open && key && (
        <ol className="stack small" style={{ gap: 14, paddingLeft: 20 }}>
          <li>No app Atalhos, crie um atalho com a ação <b>Obter conteúdo de URL</b>, método <b>POST</b>.</li>
          <li className="stack" style={{ gap: 6 }}>
            URL, conforme o modo:
            {modes.map((m) => <CopyText key={m.id} text={`${base}/api/scenes/${m.id}/run`} label={`a URL do modo ${m.name}`} />)}
            {!modes.length && <span className="muted">Nenhum modo cadastrado.</span>}
          </li>
          <li className="stack" style={{ gap: 6 }}>
            Cabeçalhos: <code className="mono">Content-Type: application/json</code> e <code className="mono">Authorization: Bearer</code> + a chave:
            {shown ? <CopyText text={key} label="a chave" /> : (
              <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setShown(true)}>Mostrar chave</button>
            )}
          </li>
          <li>Corpo da solicitação: JSON vazio. Dê ao atalho o nome que vai falar para a Siri (&quot;Cheguei&quot;, &quot;Filme&quot;...).</li>
        </ol>
      )}
      {open && key && (
        <div className="stack" style={{ gap: 8 }}>
          {confirm ? (
            <div className="notice" role="alert">
              <span style={{ flex: 1 }}>Trocar a chave? Os atalhos atuais param de funcionar até você colar a nova.</span>
              <button type="button" className="btn primary" disabled={busy} onClick={rotate}>Trocar</button>
              <button type="button" className="btn ghost" onClick={() => setConfirm(false)}>Cancelar</button>
            </div>
          ) : (
            <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => setConfirm(true)}><Icon name="refresh" size={18} />Trocar a chave</button>
          )}
        </div>
      )}
    </Card>
  );
}
