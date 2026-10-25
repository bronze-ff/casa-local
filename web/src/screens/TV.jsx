import { useRef, useState } from 'react';
import { useHome } from '../App.jsx';
import { fmtAgo, usePoll } from '../api.js';
import { Card, Icon, Modal, Stale, useAction } from '../ui.jsx';

const LABELS = { power: 'Liga/desliga', up: 'Cima', down: 'Baixo', left: 'Esquerda', right: 'Direita', ok: 'OK', back: 'Voltar', home: 'Início', source: 'Entrada', volume_up: 'Volume +', volume_down: 'Volume −', mute: 'Mudo', play: 'Reproduzir', pause: 'Pausar' };
const ORIGINS = { aprendido: 'Aprendido', 'samsung-padrao': 'Samsung genérico · não confirmado', 'geonav-perfil': 'Perfil Geonav · não confirmado' };
const APPS = [['youtube', 'YouTube'], ['netflix', 'Netflix'], ['prime', 'Prime Video'], ['globoplay', 'Globoplay']];

function Remote({ send, disabled, keys, learning, network }) {
  const button = (key, icon, style) => <button type="button" key={key} className={`btn ${key === 'ok' ? 'big' : ''}`} style={{ minHeight: 48, ...style }}
    aria-label={`${learning ? 'Aprender: ' : ''}${LABELS[key]}`} disabled={disabled || (!learning && keys && !(key in keys))}
    title={keys ? ORIGINS[keys[key]] || 'Sem código: use Aprender' : undefined} onClick={() => send(key)}>
    {icon ? <Icon name={icon} /> : LABELS[key]}</button>;
  return <div className="stack">
    <div className="row" style={{ justifyContent: 'center' }}>{button('power', 'power')}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(48px, 72px))', gap: 8, justifyContent: 'center' }}>
      {button('up', 'up', { gridColumn: 2 })}
      {button('left', 'left', { gridRow: 2 })}{button('ok', null, { gridRow: 2 })}{button('right', 'right', { gridRow: 2 })}
      {button('down', 'down', { gridColumn: 2 })}
    </div>
    <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>{['back', 'home', 'source'].map(key => button(key))}</div>
    <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>{button('volume_down')}{button('mute')}{button('volume_up')}</div>
    {network && <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>{button('play')}{button('pause')}</div>}
  </div>;
}

function Infrared({ device, preview, refresh }) {
  const [learning, setLearning] = useState(false);
  const [capturing, setCapturing] = useState(null);
  const [run, busy] = useAction();
  const lock = useRef(false);
  const unavailable = preview || !device?.configured || device?.connection === 'offline';
  const send = async key => {
    if (lock.current || unavailable) return;
    lock.current = true;
    if (learning) setCapturing(key);
    try {
      const result = await run(`/api/devices/tv-quarto/${learning ? 'learn' : 'commands'}`, learning ? { key } : { action: 'key', key },
        learning ? `${LABELS[key]} aprendido. Teste olhando a TV.` : 'Sinal IR enviado. Confira na TV.');
      if (result) await refresh();
    } finally { lock.current = false; setCapturing(null); }
  };
  const origins = device?.irKeys || {};
  return <Card title={device?.name || 'TV do quarto'} aside={<span className="pill">IR · Geonav</span>}>
    {!device ? <p className="muted">TV do quarto não está no cadastro.</p> : <>
      <p className="small muted">{device.configured ? 'Controle por infravermelho. O estado real da TV não é confirmado.' : 'Central IR não configurada. Configure-a no PC de casa.'}</p>
      {device.connection === 'offline' && <p className="notice">Central IR sem conexão.</p>}
      <button className={`btn ${learning ? 'primary' : ''}`} type="button" disabled={busy || unavailable} aria-pressed={learning} onClick={() => setLearning(!learning)}>{learning ? 'Sair de Aprender' : 'Aprender botões'}</button>
      {learning && <p className="notice info" role="status">{capturing ? `Gravando ${LABELS[capturing]}: aperte esse botão no controle original em até 25 s, apontando para a central. Aguarde a conclusão.` : 'Toque em um botão abaixo. Depois aperte o mesmo botão no controle original, apontando para a central, em até 25 s.'}</p>}
      <Remote send={send} disabled={busy || unavailable} keys={device.irKeys} learning={learning} />
      <details><summary style={{ minHeight: 44, cursor: 'pointer' }}>Códigos do controle · {Object.values(origins).filter(origin => origin === 'aprendido').length} aprendidos</summary>
        <div className="stack">{Object.keys(LABELS).filter(key => !['play', 'pause'].includes(key)).map(key => <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }} key={key}><span>{LABELS[key]}</span><span className="small muted">{ORIGINS[origins[key]] || (origins[key] ? 'Código cadastrado' : 'Não cadastrado')}</span></div>)}</div>
      </details>
      <p className="small muted">Códigos genéricos e perfis precisam ser testados na TV. Aprender substitui o código daquele botão.</p>
    </>}
  </Card>;
}

function NetworkTV({ tv, preview, reload }) {
  const [expanded, setExpanded] = useState(false);
  const [rename, setRename] = useState(false);
  const [label, setLabel] = useState('');
  const [pairing, setPairing] = useState(false);
  const [run, busy] = useAction();
  const lock = useRef(false);
  const mutate = async (action, body, message) => {
    if (preview || lock.current) return null;
    lock.current = true;
    if (action === 'pair') setPairing(true);
    try { return await run(`/api/tvs/${tv.id}/${action}`, body, message); }
    finally { lock.current = false; setPairing(false); reload(); }
  };
  const send = key => mutate('command', { key }, key === 'power' && tv.power === 'off' ? 'Sinal para ligar enviado. Aguarde alguns segundos; pode não funcionar por Wi-Fi.' : 'Comando enviado pela rede.');
  return <Card title={tv.label || 'TV Samsung'} aside={<span className="pill"><span className={`dot ${tv.power === 'on' ? 'warn' : tv.power === 'off' ? 'off' : ''}`} />{({ on: 'Ligada', standby: 'Em espera', off: 'Fora de alcance' })[tv.power] || 'Estado desconhecido'}</span>}>
    <p className="small muted">{tv.model || 'Samsung'} · {tv.paired ? 'Pareada' : 'Não pareada'}</p>
    {tv.power === 'off' && <p className="notice info">A TV não responde na rede. Pode estar desligada ou sem conexão. Ligar pela rede pode não funcionar em Wi-Fi.</p>}
    <div className="row" style={{ flexWrap: 'wrap' }}>
      <button type="button" className="btn" disabled={preview || busy} onClick={() => { setLabel(tv.label || ''); setRename(true); }}>Renomear</button>
      <button type="button" className="btn" aria-expanded={expanded} disabled={!tv.paired} onClick={() => setExpanded(!expanded)}>{expanded ? 'Fechar controle' : 'Abrir controle'}</button>
      {tv.paired && <button type="button" className={`btn ${tv.power === 'on' ? 'primary' : ''}`} disabled={preview || busy} onClick={() => send('power')} aria-label={`Ligar ou desligar ${tv.label}`}><Icon name="power" /></button>}
      {!tv.paired && <button type="button" className="btn primary" disabled={preview || busy || tv.power !== 'on' || tv.pairing} onClick={() => mutate('pair', {}, 'TV pareada.')} >{pairing || tv.pairing ? 'Aguardando permissão…' : 'Parear'}</button>}
    </div>
    {(pairing || tv.pairing) && <p className="notice info" role="status">Na TV, escolha “Permitir” para “Casa Local”. Aguarde até 35 segundos. Se recusar ou expirar, tente Parear de novo.</p>}
    {!tv.paired && !pairing && <p className="small muted">Ligue a TV para parear e aceite o pedido na tela dela.</p>}
    {expanded && tv.paired && <>
      <Remote send={send} disabled={preview || busy || tv.power === 'off'} network />
      <div className="row" style={{ flexWrap: 'wrap' }}>{APPS.map(([app, name]) => <button key={app} type="button" className="btn" disabled={preview || busy || tv.power === 'off'} onClick={() => mutate('command', { app }, `Abrindo ${name}.`)}>{name}</button>)}</div>
      <button type="button" className="btn ghost" disabled={preview || busy || tv.power !== 'on'} onClick={() => mutate('pair', {}, 'Permissão renovada.')}>Parear novamente</button>
    </>}
    <Modal open={rename} onClose={() => setRename(false)} title="Nome da TV">
      <form className="stack" onSubmit={async event => { event.preventDefault(); if (label.trim() && await mutate('label', { label: label.trim() }, 'Nome salvo.')) setRename(false); }}>
        <label className="field">Nome<input type="text" autoFocus value={label} onChange={event => setLabel(event.target.value)} maxLength={24} required /></label>
        <button className="btn primary" disabled={preview || busy || !label.trim()}>Salvar</button>
      </form>
    </Modal>
  </Card>;
}

export default function TV({ param }) {
  const { home, mode, refresh } = useHome();
  const poll = usePoll('/api/tvs', 10000);
  const [run, busy] = useAction();
  const scanLock = useRef(false);
  const preview = mode === 'preview';
  const tvs = poll.data?.tvs || [];
  const scan = async () => {
    if (preview || scanLock.current) return;
    scanLock.current = true;
    try { await run('/api/tvs/scan', {}, 'Busca concluída.'); await poll.reload(); }
    finally { scanLock.current = false; }
  };
  return <>
    <h1>TV</h1>
    {preview && <p className="notice info">Prévia: controles, aprendizado e busca na rede estão desativados. Nenhum sinal é enviado.</p>}
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', alignItems: 'start' }}>
      <Infrared device={home?.devices?.find(device => device.id === 'tv-quarto')} preview={preview} refresh={refresh} />
      <div className="stack">
        <Card title="TVs na rede" aside={<Icon name="radio" style={{ color: 'var(--info)' }} />}>
          <p className="small muted">Samsung · controle local pela rede</p>
          <button type="button" className="btn" disabled={preview || busy} onClick={scan}>{busy ? 'Procurando TVs…' : 'Procurar TVs'}</button>
          <Stale poll={poll} what="TVs" />
          {!poll.data && !poll.error && <p role="status" className="muted">Carregando TVs…</p>}
          {poll.data && !tvs.length && <p className="muted">Nenhuma TV encontrada. Ligue a TV e toque em Procurar TVs.</p>}
          {poll.data?.scannedAt && <p className="small muted">Última busca {fmtAgo(poll.data.scannedAt)}.</p>}
        </Card>
        {tvs.map(tv => <NetworkTV key={tv.id} tv={tv} preview={preview} reload={poll.reload} />)}
      </div>
    </div>
  </>;
}
