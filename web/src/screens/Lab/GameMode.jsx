import { useEffect, useRef, useState } from 'react';
import { fmtAgo } from '../../api.js';
import { Card, Dot, Lcd, Segmented, Status, Switch } from '../../ui.jsx';

function Names({ list, keep }) {
  if (!list.length) return <span className="muted small">nenhum</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {list.map((x) => (
        <span key={x.id} className="lbl">
          {x.name}{!keep && x.state !== 'running' && x.state !== 'unknown' ? ' · já parado' : ''}
        </span>
      ))}
    </div>
  );
}

/* Modo jogo: mostra o que para e o que segue ANTES de trocar, acompanha a troca e conta o resultado. */
export function GameCard({ s, disabled, send }) {
  const inGame = s.mode === 'jogo';
  const switching = !!s.step;
  const stops = s.services.filter((x) => !x.keep);
  const keeps = s.services.filter((x) => x.keep);
  const [result, setResult] = useState(null);
  const lastStep = useRef(s.step);
  useEffect(() => {
    // A troca terminou quando o passo some.
    if (lastStep.current && !s.step) setResult({ mode: s.mode, at: Date.now() });
    lastStep.current = s.step;
  }, [s.step, s.mode]);

  const reason = s.reason?.startsWith('auto:') ? `Entrou sozinho: ${s.reason.slice(5)} aberto` : 'Ligado por você';
  const stoppedNow = s.services.filter((x) => x.state !== 'running').length;
  const runningNow = s.services.length - stoppedNow;

  return (
    <Card title="Modo do PC">
      <Lcd className="stack">
        <div className="row"><span className="lbl">modo do PC</span><span className={`led ${inGame ? 'env' : ''}`}>{runningNow}/{s.services.length} serviços</span></div>
        <Dot size={34}>{switching ? 'TROCANDO' : inGame ? 'MODO JOGO' : 'HOME LAB'}</Dot>
      </Lcd>
      <p className="muted small">
        {switching ? 'Isso leva alguns segundos.'
          : inGame ? `${reason} · ${fmtAgo(s.since)}. Os serviços pesados ficam parados e o PC fica livre para o jogo.`
            : `Home lab ligado: ${runningNow} de ${s.services.length} serviços rodando${s.stats?.wslGb ? ` · WSL usando ${s.stats.wslGb} GB` : ''}.`}
      </p>

      {switching && (
        <div className="stack" role="status" aria-live="polite">
          <strong>{s.step}</strong>
        </div>
      )}
      {!switching && result && (
        <div className="aviso" role="status">
          <span />
          <span>
            {result.mode === 'jogo'
              ? `Modo jogo ligado: ${stoppedNow} serviço${stoppedNow === 1 ? '' : 's'} parado${stoppedNow === 1 ? '' : 's'}, ${runningNow} seguem.`
              : `Home lab de volta: ${runningNow} de ${s.services.length} serviços rodando.`}
          </span>
          <button type="button" className="act" onClick={() => setResult(null)}>Ok</button>
        </div>
      )}

      <div className="stack" style={{ gap: 10 }}>
        <span className="lbl">{inGame ? 'Ao voltar para o home lab' : 'Ao ligar o modo jogo'}</span>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
          <div className="stack" style={{ gap: 6 }}>
            <span className="small">{inGame ? 'Voltam a ligar' : 'Param'}</span>
            <Names list={stops} />
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <span className="small">Continuam ligados</span>
            <Names list={keeps} keep />
          </div>
        </div>
        {!inGame && <p className="muted small">Também esvazia o cache do Linux para devolver a memória ao Windows. Os avisos do celular seguem funcionando.</p>}
      </div>

      <Segmented label="Modo do PC" value={s.mode} disabled={disabled || switching}
        options={[['lab', 'Home lab'], ['jogo', 'Modo jogo']]}
        onChange={(mode) => { if (mode !== s.mode) send({ mode }, mode === 'jogo' ? 'Modo jogo: parando o home lab' : 'Ligando o home lab'); }} />

      <div className="row" style={{ borderTop: '1px solid color-mix(in srgb, var(--borda) 35%, transparent)', paddingTop: 8 }}>
        <div className="stack">
          <strong>Entrar sozinho ao abrir um jogo</strong>
          <span className="muted small">Volta ao home lab 2 min depois que o jogo fecha. Se você ligar à mão, só sai à mão.</span>
        </div>
        <Switch on={s.auto} label="Modo jogo automático" disabled={disabled} onChange={(auto) => send({ auto }, auto ? 'Modo jogo automático ligado' : 'Modo jogo automático desligado')} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <span className="small muted">Jogos da lista:</span>
        {s.games.map((g) => {
          const open = s.gamesOpen?.includes(g);
          return <Status key={g} kind={open ? 'warn' : 'off'}>{g}{open ? ' · aberto' : ''}</Status>;
        })}
      </div>
    </Card>
  );
}
