import { useEffect, useRef, useState } from 'react';
import { useHome, usePoll } from '../../core/hooks.js';
import { fmtAgo } from '../../core/format.js';
import { useAction } from '../../ui/actions.js';
import { Banner, Button, Segmented, Skeleton } from '../../ui/kit.jsx';
import { useShell } from '../../shell/context.js';
import { Infrared } from './Infrared.jsx';
import { NetworkTV } from './NetworkTV.jsx';

function Network({ poll, tvs, preview, busy, scan }) {
  return (
    <section className="col" aria-label="TVs na rede e apps">
      <h2 className="h2">TVs na rede · apps</h2>
      <Button variant="s" icon="search" busy={busy} disabled={preview} reason="A busca fica desativada na prévia." onClick={scan}>{busy ? 'Procurando TVs…' : 'Procurar TVs'}</Button>
      <p className="hint">Samsung · controle local pela rede. A busca só roda quando você toca no botão; nada é procurado ao abrir a tela.</p>
      {poll.stale && <Banner kind="warn" icon="off">Sem conexão com a lista de TVs. Mostrando o último dado conhecido.</Banner>}
      {!poll.data && !poll.error && <p role="status" className="sub">Carregando TVs…</p>}
      {poll.data && !tvs.length && <p className="sub">Nenhuma TV encontrada. Ligue a TV e toque em Procurar TVs.</p>}
      {poll.data?.scannedAt && <p className="sub">Última busca {fmtAgo(poll.data.scannedAt)}.</p>}
      {tvs.map((tv) => <NetworkTV key={tv.id} tv={tv} preview={preview} reload={poll.reload} />)}
    </section>
  );
}

/** TV: controle por infravermelho e TVs Samsung na rede. #/tv e #/tv/rede (abre direto na aba da rede). */
export default function TV({ param }) {
  const shell = useShell();
  const { home } = useHome();
  const poll = usePoll('/api/tvs', 10000);
  const [run, busy] = useAction();
  const [tab, setTab] = useState(param === 'rede' ? 'rede' : 'ir');
  const scanning = useRef(false);
  useEffect(() => { if (param === 'rede') setTab('rede'); }, [param]);
  if (!home) return <div className="col" role="status"><Skeleton height={28} width="30%" /><Skeleton height={320} /></div>;
  const preview = home.mode === 'preview';
  const layout = shell?.layout || 'desktop';
  const both = layout === 'desktop' || layout === 'wide';
  const tvs = poll.data?.tvs || [];
  const scan = async () => {
    if (preview || scanning.current) return;
    scanning.current = true;
    try { await run('/api/tvs/scan', {}, 'Busca concluída.'); await poll.reload(); } finally { scanning.current = false; }
  };
  const ir = <Infrared device={home.devices?.find((d) => d.id === 'tv-quarto')} preview={preview} />;
  const network = <Network poll={poll} tvs={tvs} preview={preview} busy={busy} scan={scan} />;
  return (
    <div className="col">
      {preview && <Banner kind="info" icon="eye">Prévia: controles, aprendizado e busca na rede estão desativados. Nenhum sinal é enviado.</Banner>}
      {both ? <div className="stage two">{ir}{network}</div> : (
        <>
          <Segmented label="Tipo de controle" value={tab} onChange={setTab} options={[{ value: 'ir', label: 'Controle IR' }, { value: 'rede', label: 'Samsung · rede' }]} />
          {tab === 'ir' ? ir : network}
        </>
      )}
    </div>
  );
}
