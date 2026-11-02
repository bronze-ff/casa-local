import { useRef } from 'react';
import { useAction } from '../../ui/actions.js';
import { Banner, Button, Skeleton, Switch } from '../../ui/kit.jsx';
import { CopyText } from './CopyText.jsx';
import { TOPICS, allTopics, presenceText } from './central.js';

/** Avisos no celular (ntfy): tópicos, escopo das câmeras, como assinar e teste manual. Nada é enviado ao abrir. */
export function Notifications({ poll, blocked, reason }) {
  const [run, busy] = useAction();
  const lock = useRef(false);
  const n = poll.data;
  const off = busy || blocked;
  const send = async (path, body, ok) => {
    if (blocked || lock.current) return;
    lock.current = true;
    try { if (await run(path, body, ok)) poll.reload(); } finally { lock.current = false; }
  };
  const set = (body) => send('/api/notifications', body);
  if (!n) return <section className="card col" aria-label="Avisos no celular"><h2 className="h2">Avisos no celular</h2>{poll.error ? <Banner kind="warn" icon="off">Não consegui ler os avisos: {poll.error.message}</Banner> : <Skeleton height={100} />}</section>;
  return (
    <section className="card col" aria-label="Avisos no celular">
      <div className="row sp wrap">
        <h2 className="h2">Avisos no celular</h2>
        <Button variant="s" icon="send" busy={busy} disabled={blocked} reason={reason} onClick={() => send('/api/notifications/test', {}, 'Teste enviado para os tópicos.')}>Testar</Button>
      </div>
      {poll.stale && <Banner kind="warn" icon="off">Mostrando o último dado conhecido.</Banner>}
      <p className="hint">O teste só roda quando você toca em Testar: manda um aviso de prova para cada tópico.</p>
      <div className="col">
        {TOPICS.map(([key, title, detail]) => (
          <div key={key} className="row sp wrap">
            <div className="col tight grow"><b>{title}</b><span className="sub">{detail} <span className="mono">{n.topics?.[key]}</span></span></div>
            <Switch on={!!n.enabled?.[key]} label={title} disabled={off} onChange={(on) => set({ enabled: { [key]: on } })} />
          </div>
        ))}
        {(n.external || []).map((t) => (
          <div key={t.topic} className="row sp wrap">
            <div className="col tight grow"><b>{t.label}</b><span className="sub">{t.detail} Assine <span className="mono">{t.topic}</span> no app ntfy para receber.</span></div>
            <span className="cap">avulso</span>
          </div>
        ))}
        <div className="row sp wrap">
          <div className="col tight grow"><b>Avisar de todas as câmeras</b><span className="sub">Desligado: só as câmeras com sino em Câmeras › Movimento.</span></div>
          <Switch on={n.cameraScope === 'all'} label="Avisar de todas as câmeras" disabled={off} onChange={(on) => set({ cameraScope: on ? 'all' : 'watched' })} />
        </div>
      </div>
      <p className="sub">{presenceText(n.home)}</p>
      <details>
        <summary className="cen-sum">Como receber no iPhone</summary>
        <ol className="col cen-steps">
          <li className="col tight">Instale o app ntfy e ponha o servidor padrão (com o Tailscale ligado no celular):
            {n.subscribe ? <CopyText text={n.subscribe} label="o servidor" /> : <span className="sub">indisponível: o PC ainda não informou o nome no Tailscale.</span>}
          </li>
          <li className="col tight">Toque em + e assine cada tópico:{allTopics(n).map((t) => <CopyText key={t} text={t} label={`o tópico ${t}`} />)}</li>
          <li>Toque em Testar aqui em cima: chega um aviso em cada tópico.</li>
        </ol>
      </details>
      <p className="hint"><span className="mono num">{n.sent}</span> enviados{n.failed ? ` · ${n.failed} falharam${n.lastError ? ` (${n.lastError})` : ''}` : ''}.</p>
    </section>
  );
}
