import { useEffect, useRef, useState } from 'react';
import { fmtAgo } from '../../core/format.js';
import { Banner, Button, Segmented, Status, Switch } from '../../ui/kit.jsx';
import { countServices, reasonText, resultText, switchEnded } from './lab.js';

function Names({ list, keep }) {
  if (!list.length) return <span className="sub">nenhum</span>;
  return <div className="lab-chips">{list.map((x) => <span key={x.id} className="chip-s">{x.name}{!keep && x.state !== 'running' && x.state !== 'unknown' ? ' · já parado' : ''}</span>)}</div>;
}

/** Modo do PC: mostra o que para e o que segue ANTES de trocar, acompanha o passo e só conta o resultado quando o passo some. */
export function GameMode({ s, blocked, reason, send }) {
  const inGame = s.mode === 'jogo';
  const switching = !!s.step;
  const services = s.services || [];
  const stops = services.filter((x) => !x.keep);
  const keeps = services.filter((x) => x.keep);
  const { total, running } = countServices(services);
  const [result, setResult] = useState(null);
  const last = useRef(s.step);
  useEffect(() => {
    if (switchEnded(last.current, s.step)) setResult({ mode: s.mode });
    last.current = s.step;
  }, [s.step, s.mode]);
  return (
    <section className="card col" aria-label="Modo do PC">
      <div className="row sp wrap">
        <h2 className="h2">Modo do PC</h2>
        <Status kind={switching ? 'sent' : inGame ? 'warn' : 'ok'}>{switching ? 'Trocando' : inGame ? 'Modo jogo' : 'Home lab'}</Status>
      </div>
      <p className="sub">{switching ? 'Isso leva alguns segundos.'
        : inGame ? `${reasonText(s.reason)} · ${fmtAgo(s.since)}. Os serviços pesados ficam parados e o PC fica livre para o jogo.`
          : `Home lab ligado: ${running} de ${total} serviços rodando${s.stats?.wslGb ? ` · WSL usando ${s.stats.wslGb} GB` : ''}.`}</p>
      {switching && <div role="status" aria-live="polite"><b>{s.step}</b></div>}
      {!switching && result && (
        <Banner kind="info" icon="check" action={<Button variant="s" onClick={() => setResult(null)}>Ok</Button>}>{resultText(result.mode, services)}</Banner>
      )}
      <div className="col">
        <span className="cap">{inGame ? 'Ao voltar para o home lab' : 'Ao ligar o modo jogo'}</span>
        <div className="grid lab-two">
          <div className="col tight"><span className="small">{inGame ? 'Voltam a ligar' : 'Param'}</span><Names list={stops} /></div>
          <div className="col tight"><span className="small">Continuam ligados</span><Names list={keeps} keep /></div>
        </div>
        {!inGame && <p className="hint">Também esvazia o cache do Linux para devolver a memória ao Windows. Os avisos do celular seguem funcionando. Parar um serviço aqui não prova que ele esteja parado: o estado real aparece na lista de serviços.</p>}
      </div>
      <Segmented label="Modo do PC" value={s.mode} disabled={blocked || switching}
        options={[{ value: 'lab', label: 'Home lab' }, { value: 'jogo', label: 'Modo jogo' }]}
        onChange={(mode) => { if (mode !== s.mode) send({ mode }, mode === 'jogo' ? 'Modo jogo: parando o home lab' : 'Ligando o home lab'); }} />
      {reason && <p className="hint" role="status">{reason}</p>}
      <div className="row sp wrap lab-auto">
        <div className="col tight grow">
          <b>Entrar sozinho ao abrir um jogo</b>
          <span className="sub">Volta ao home lab 2 min depois que o jogo fecha. Se você ligar à mão, só sai à mão.</span>
        </div>
        <Switch on={!!s.auto} label="Modo jogo automático" disabled={blocked} onChange={(auto) => send({ auto }, auto ? 'Modo jogo automático ligado' : 'Modo jogo automático desligado')} />
      </div>
      <div className="lab-chips" aria-label="Jogos da lista">
        <span className="sub">Jogos da lista:</span>
        {(s.games || []).map((g) => { const open = s.gamesOpen?.includes(g); return <Status key={g} kind={open ? 'warn' : 'off'}>{g}{open ? ' · aberto' : ''}</Status>; })}
        {!(s.games || []).length && <span className="sub">nenhum jogo cadastrado</span>}
      </div>
    </section>
  );
}
