import { usePoll } from '../../api.js';
import { Card, Stale, Switch, useAction } from '../../ui.jsx';
import CopyText from './CopyText.jsx';

const TOPICS = [
  ['pessoas', 'Pessoas e rostos', 'O Frigate viu alguém ou um carro, com o nome se reconheceu o rosto.'],
  ['cameras', 'Movimento nas câmeras', 'Qualquer movimento do DVR, com foto e link para a gravação.'],
  ['sistema', 'Sistema e home lab', 'Algo caiu ou voltou, disco quase cheio, GPU quente, aparelho novo na rede.'],
  ['casa', 'Casa', 'Chegadas e saídas e as rotinas que rodaram.'],
];

export default function Notifications() {
  const poll = usePoll('/api/notifications', 20000);
  const [run, busy] = useAction();
  const n = poll.data;
  const set = async (body) => { if (await run('/api/notifications', body)) poll.reload(); };
  const test = async () => { if (await run('/api/notifications/test', {}, 'Teste enviado para os 4 tópicos')) poll.reload(); };

  if (!n) return <Card title="Avisos no celular">{poll.error ? <Stale poll={poll} what="os avisos" /> : <p className="muted">Lendo…</p>}</Card>;

  const presence = n.home === true ? 'Você está em casa: câmeras chegam sem som.'
    : n.home === false ? 'Você está fora: câmeras chegam com som.' : 'Sem localização recente: câmeras chegam com som.';
  const topics = [...Object.values(n.topics || {}), ...(n.external || []).map((t) => t.topic)];

  return (
    <Card title="Avisos no celular" aside={<button type="button" className="btn" disabled={busy} onClick={test}>Testar</button>}>
      <Stale poll={poll} what="os avisos" />
      <div className="stack">
        {TOPICS.map(([key, title, detail]) => (
          <div key={key} className="row">
            <div className="stack">
              <strong>{title}</strong>
              <span className="muted small">{detail} <span className="mono">{n.topics?.[key]}</span></span>
            </div>
            <Switch on={n.enabled[key]} label={title} disabled={busy} onChange={(on) => set({ enabled: { [key]: on } })} />
          </div>
        ))}
        {(n.external || []).map((t) => (
          <div key={t.topic} className="row">
            <div className="stack">
              <strong>{t.label}</strong>
              <span className="muted small">{t.detail} Assine <span className="mono">{t.topic}</span> no app ntfy para receber.</span>
            </div>
            <span className="chip">avulso</span>
          </div>
        ))}
        <div className="row">
          <div className="stack">
            <strong>Avisar de todas as câmeras</strong>
            <span className="muted small">Desligado: só as câmeras com sino em Câmeras › Movimento (vale para movimento e pessoas).</span>
          </div>
          <Switch on={n.cameraScope === 'all'} label="Avisar de todas as câmeras" disabled={busy} onChange={(on) => set({ cameraScope: on ? 'all' : 'watched' })} />
        </div>
        <div className="row">
          <div className="stack">
            <strong>Pessoas: avisar também carros e animais</strong>
            <span className="muted small">
              Desligado: o Frigate só avisa quando é pessoa. Nas câmeras que ele vigia{n.frigateCameras?.length ? ` (${n.frigateCameras.length})` : ''}, o movimento do DVR não avisa enquanto ele estiver ligado.
            </span>
          </div>
          <Switch on={n.frigateKinds === 'tudo'} label="Avisar também carros e animais" disabled={busy} onChange={(on) => set({ frigateKinds: on ? 'tudo' : 'pessoas' })} />
        </div>
      </div>

      <p className="small muted">{presence} {n.frigate === false ? 'O Frigate está parado (modo jogo ou subindo): pessoas voltam quando ele voltar; o movimento do DVR continua.' : ''}</p>

      <details>
        <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>Como receber no iPhone</summary>
        <ol className="stack small" style={{ gap: 12, paddingLeft: 20 }}>
          <li className="stack" style={{ gap: 6 }}>
            Instale o app ntfy e ponha o servidor padrão (com o Tailscale ligado no celular):
            {n.subscribe ? <CopyText text={n.subscribe} label="o servidor" /> : <span className="muted">indisponível: o PC ainda não informou o nome no Tailscale.</span>}
          </li>
          <li className="stack" style={{ gap: 6 }}>
            Toque em + e assine cada tópico:
            {topics.map((t) => <CopyText key={t} text={t} label={`o tópico ${t}`} />)}
          </li>
          <li>Toque em Testar aqui em cima: chega um aviso em cada tópico.</li>
        </ol>
      </details>

      <p className="muted small">
        <span className="mono num">{n.sent}</span> enviados{n.failed ? ` · ${n.failed} falharam${n.lastError ? ` (${n.lastError})` : ''}` : ''}.
      </p>
    </Card>
  );
}
