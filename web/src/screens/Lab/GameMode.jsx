import { useEffect, useRef, useState } from 'react';
import { href } from '../../App.jsx';
import { fmtAgo } from '../../api.js';
import { Card, Icon, Segmented, Switch } from '../../ui.jsx';

const chipKeep = { color: 'var(--info)', borderColor: '#24465A' };

function Names({ list, keep }) {
  if (!list.length) return <span className="muted small">nenhum</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {list.map((x) => (
        <span key={x.id} className="chip" style={keep ? chipKeep : undefined}>
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
    <Card title="Modo jogo" aside={<span className={`chip ${inGame ? 'hot' : ''}`}>{inGame ? 'ligado' : 'desligado'}</span>}>
      <p className="muted small">
        {switching ? 'Isso leva alguns segundos.'
          : inGame ? `${reason} · ${fmtAgo(s.since)}. Os serviços pesados ficam parados e o PC fica livre para o jogo.`
            : `Home lab ligado: ${runningNow} de ${s.services.length} serviços rodando${s.stats?.wslGb ? ` · WSL usando ${s.stats.wslGb} GB` : ''}.`}
      </p>

      {switching && (
        <div className="notice info" role="status" aria-live="polite">
          <div className="stack" style={{ flex: 1, gap: 8 }}>
            <strong>{s.step}</strong>
            <div className="bar"><span className="vivo" style={{ width: '60%' }} /></div>
          </div>
        </div>
      )}
      {!switching && result && (
        <div className="notice info" role="status">
          <span style={{ flex: 1 }}>
            {result.mode === 'jogo'
              ? `Modo jogo ligado: ${stoppedNow} serviço${stoppedNow === 1 ? '' : 's'} parado${stoppedNow === 1 ? '' : 's'}, ${runningNow} seguem.`
              : `Home lab de volta: ${runningNow} de ${s.services.length} serviços rodando.`}
          </span>
          <button type="button" className="btn ghost" style={{ minHeight: 32 }} onClick={() => setResult(null)}>Ok</button>
        </div>
      )}

      <div className="stack" style={{ gap: 10 }}>
        <span className="label">{inGame ? 'Ao voltar para o home lab' : 'Ao ligar o modo jogo'}</span>
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
        {inGame && <p className="muted small">O Frigate só volta se a regra de câmeras inteligentes permitir.</p>}
      </div>

      <Segmented label="Modo do PC" value={s.mode} disabled={disabled || switching}
        options={[['lab', 'Home lab'], ['jogo', 'Modo jogo']]}
        onChange={(mode) => { if (mode !== s.mode) send({ mode }, mode === 'jogo' ? 'Modo jogo: parando o home lab' : 'Ligando o home lab'); }} />

      <div className="row" style={{ borderTop: '1px solid var(--line)' }}>
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
          return <span key={g} className={`chip mono ${open ? 'hot' : ''}`}>{g}{open ? ' · aberto' : ''}</span>;
        })}
      </div>
    </Card>
  );
}

export function FrigateCard({ s, disabled, send }) {
  const away = s.frigate === 'fora';
  let why = '';
  if (s.frigate === 'sempre') why = 'Fica ligado o tempo todo (fora do modo jogo).';
  else if (s.frigate === 'nunca') why = 'Fica desligado; os avisos de movimento vêm só do DVR.';
  else if (s.presence === true) why = 'Você está em casa: ele fica desligado e o DVR avisa o movimento.';
  else if (s.presence === false) why = 'Você está fora de casa: ele fica ligado.';
  return (
    <Card title="Câmeras inteligentes (Frigate)" aside={<span className={`chip ${s.frigateOn ? 'hot' : ''}`}>{s.frigateOn ? 'ligado agora' : 'desligado agora'}</span>}>
      <p className="muted small">Reconhece pessoas, carros e rostos. Usa ~2 GB de memória e parte da GPU.</p>
      <Segmented label="Quando ligar o Frigate" value={s.frigate} disabled={disabled}
        options={[['fora', 'Fora de casa'], ['sempre', 'Sempre'], ['nunca', 'Nunca']]}
        onChange={(frigate) => send({ frigate }, frigate === 'fora' ? 'Frigate só com você fora de casa' : frigate === 'sempre' ? 'Frigate sempre ligado' : 'Frigate desligado')} />
      <p className="small">{why}</p>
      {away && s.presence == null && (
        <div className="notice" role="status">
          <Icon name="warn" size={18} style={{ color: 'var(--accent)', flex: 'none', marginTop: 2 }} />
          <span>Sem localização do celular. Cadastre na aba <a href={href('local')}>Local</a> um lugar chamado &quot;Casa&quot;; até lá o Frigate fica desligado.</span>
        </div>
      )}
    </Card>
  );
}
