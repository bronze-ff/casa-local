import { useRef, useState } from 'react';
import { get } from '../../core/api.js';
import { useAction } from '../../ui/actions.js';
import { Banner, Button, useToast } from '../../ui/kit.jsx';
import { CopyText } from './CopyText.jsx';
import { sceneUrl, shortcutBase } from './central.js';

/**
 * Atalhos da Siri. A chave é um SEGREDO: só é lida do servidor quando o usuário toca em "Configurar", só aparece depois de
 * "Mostrar chave", nunca vai para log ou armazenamento e some ao fechar. Trocar a chave pede confirmação.
 */
export function Shortcuts({ modes, subscribe, blocked, reason }) {
  const toast = useToast();
  const [run, busy] = useAction();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(null);
  const [shown, setShown] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  const base = shortcutBase(subscribe, typeof window === 'undefined' ? '' : window.location.origin);
  const toggle = async () => {
    generation.current += 1; // fechar ou reabrir invalida uma leitura da chave ainda em voo
    if (open) { setOpen(false); setKey(null); setShown(false); setConfirm(false); return; }
    const mine = generation.current;
    setOpen(true);
    try {
      const result = await get('/api/shortcuts');
      if (mine === generation.current) setKey(result.key);
    } catch (error) { if (mine === generation.current) { toast(error.message, 'error'); setOpen(false); } }
  };
  const rotate = async () => {
    if (blocked || lock.current) return;
    lock.current = true;
    setConfirm(false);
    try {
      const result = await run('/api/shortcuts/rotate', {}, 'Chave trocada: atualize seus atalhos.');
      if (result?.key) { setKey(result.key); setShown(true); }
    } finally { lock.current = false; }
  };
  return (
    <section className="card col" aria-label="Atalhos da Siri">
      <div className="row sp wrap">
        <h2 className="h2">Atalhos da Siri</h2>
        <Button variant="s" icon={open ? 'up' : 'down'} aria-expanded={open ? 'true' : 'false'} onClick={toggle}>{open ? 'Fechar' : 'Configurar'}</Button>
      </div>
      <p className="sub">&quot;E aí Siri, cheguei&quot; roda o modo sem abrir o painel. Funciona com o Tailscale ligado no iPhone. A chave só é lida do servidor quando você toca em Configurar.</p>
      {open && !key && <p role="status" className="sub">Lendo a chave…</p>}
      {open && key && (
        <>
          <ol className="col cen-steps">
            <li>No app Atalhos, crie um atalho com a ação <b>Obter conteúdo de URL</b>, método <b>POST</b>.</li>
            <li className="col tight">URL, conforme o modo:{modes.map((m) => <CopyText key={m.id} text={sceneUrl(base, m.id)} label={`a URL do modo ${m.name}`} />)}{!modes.length && <span className="sub">Nenhum modo cadastrado.</span>}</li>
            <li className="col tight">Cabeçalhos: <code className="mono">Content-Type: application/json</code> e <code className="mono">Authorization: Bearer</code> + a chave:
              {shown ? <CopyText text={key} label="a chave" /> : <Button variant="s" icon="eye" onClick={() => setShown(true)}>Mostrar chave</Button>}
              {shown && <Button variant="s" onClick={() => setShown(false)}>Esconder chave</Button>}
            </li>
            <li>Corpo da solicitação: JSON vazio. Dê ao atalho o nome que vai falar para a Siri (&quot;Cheguei&quot;, &quot;Filme&quot;...).</li>
          </ol>
          {confirm
            ? <Banner kind="err" icon="alert" title="Trocar a chave?" action={<span className="row"><Button variant="p" busy={busy} disabled={blocked} reason={reason} onClick={rotate}>Trocar</Button><Button variant="s" onClick={() => setConfirm(false)}>Cancelar</Button></span>}>Os atalhos atuais param de funcionar até você colar a nova.</Banner>
            : <Button variant="s" icon="refresh" disabled={blocked || busy} reason={reason} onClick={() => setConfirm(true)}>Trocar a chave</Button>}
        </>
      )}
    </section>
  );
}
