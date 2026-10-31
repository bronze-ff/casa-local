import { useEffect, useRef, useState } from 'react';
import { useHome } from '../App.jsx';
import { fmtAgo, usePoll } from '../api.js';
import { Card, Confidence, Dot, Icon, Key, Lcd, Modal, Segmented, Stale, useAction, useConfidence } from '../ui.jsx';

const LABELS = { power: 'Liga/desliga', up: 'Cima', down: 'Baixo', left: 'Esquerda', right: 'Direita', ok: 'OK', back: 'Voltar', home: 'Início', source: 'Entrada', volume_up: 'Volume +', volume_down: 'Volume −', mute: 'Mudo', play: 'Reproduzir', pause: 'Pausar' };
const SYMBOLS = { up: '▲', down: '▼', left: '◀', right: '▶', volume_up: '+', volume_down: '−' };
const ORIGINS = { aprendido: 'Aprendido', 'samsung-padrao': 'Samsung genérico · não confirmado', 'geonav-perfil': 'Perfil Geonav · não confirmado' };
const APPS = [['youtube', 'YouTube'], ['netflix', 'Netflix'], ['prime', 'Prime Video'], ['globoplay', 'Globoplay']];
const row = (cols, extra) => ({ display: 'grid', gridTemplateColumns: cols, gap: 10, ...extra });

function Notice({ children, err }) {
  return <div className={`aviso ${err ? 'err' : ''}`} role="status"><Icon name={err ? 'alert' : 'warn'} size={20} /><span>{children}</span></div>;
}

function Remote({ send, disabled, keys, learning, network }) {
  const key = (name, extra = {}) => (
    <Key center key={name} className={name === 'ok' ? 'ok' : ''} aria-label={`${learning ? 'Aprender: ' : ''}${LABELS[name]}`} disabled={disabled || (!learning && keys && !(name in keys))}
      title={keys ? ORIGINS[keys[name]] || 'Sem código: use Aprender' : undefined} onClick={() => send(name)} {...extra}>
      {name === 'power' ? <Icon name="power" size={24} /> : SYMBOLS[name] || LABELS[name]}
    </Key>
  );
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div style={row('1fr 2fr')}>{key('power')}{key('source')}</div>
      <div className="dpad">
        <span />{key('up')}<span />
        {key('left')}{key('ok')}{key('right')}
        <span />{key('down')}<span />
      </div>
      <div style={row('1fr 1fr')}>{key('back')}{key('home')}</div>
      <span className="lbl">Volume</span>
      <div style={row('1fr 1fr 1fr')}>{key('volume_down', { big: true })}{key('mute')}{key('volume_up', { big: true })}</div>
      {network && <div style={row('1fr 1fr')}>{key('play')}{key('pause')}</div>}
    </div>
  );
}

function Infrared({ device, preview, refresh }) {
  const [learning, setLearning] = useState(false);
  const [capturing, setCapturing] = useState(null);
  const [run, busy] = useAction();
  const lock = useRef(false);
  const kind = useConfidence(device);
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
  if (!device) return <Card title="TV do quarto"><p className="mut">TV do quarto não está no cadastro.</p></Card>;
  const power = device.state?.power;
  return (
    <section className="stack" style={{ gap: 12 }} aria-label="Controle IR">
      <Lcd className="row">
        <div><span className="lbl">{(device.name || 'TV do quarto').toLowerCase()}</span><div><Dot size={34}>{power == null ? '– –' : power ? 'ON' : 'OFF'}</Dot></div></div>
        <Confidence kind={kind} />
      </Lcd>
      <p className="mut" style={{ fontSize: 12 }}>{device.configured ? 'Controle por infravermelho · Geonav. O estado real da TV não é confirmado.' : 'Central IR não configurada. Configure-a no PC de casa.'}</p>
      {device.connection === 'offline' && <Notice err>Central IR sem conexão.</Notice>}
      {learning && <Notice>{capturing ? `Gravando ${LABELS[capturing]}: aperte esse botão no controle original em até 25 s, apontando para a central. Aguarde a conclusão.` : 'Toque em um botão abaixo. Depois aperte o mesmo botão no controle original, apontando para a central, em até 25 s.'}</Notice>}
      <Remote send={send} disabled={busy || unavailable} keys={device.irKeys} learning={learning} />
      <Key on={learning} disabled={busy || unavailable} onClick={() => setLearning(!learning)}>
        <span className="row" style={{ justifyContent: 'flex-start', gap: 10 }}><Icon name="plus" size={20} />{learning ? 'Sair de Aprender' : 'Aprender botões'}</span>
      </Key>
      <details><summary style={{ minHeight: 44, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>Códigos do controle · {Object.values(origins).filter(origin => origin === 'aprendido').length} aprendidos</summary>
        <div className="list">{Object.keys(LABELS).filter(key => !['play', 'pause'].includes(key)).map(key => <div key={key}><span>{LABELS[key]}</span><span style={{ fontSize: 11, color: 'var(--ink2)' }}>{ORIGINS[origins[key]] || (origins[key] ? 'Código cadastrado' : 'Não cadastrado')}</span></div>)}</div>
      </details>
      <p className="mut" style={{ fontSize: 11 }}>Códigos genéricos e perfis precisam ser testados na TV. Aprender substitui o código daquele botão. Tecla tracejada: sem código, use Aprender.</p>
    </section>
  );
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
  const state = ({ on: 'Ligada', standby: 'Em espera', off: 'Fora de alcance' })[tv.power] || 'Estado desconhecido';
  return (
    <section className="stack" style={{ gap: 12 }} aria-label={tv.label || 'TV Samsung'}>
      <Lcd className="row">
        <div><span className="lbl">{tv.model || 'Samsung'} · {tv.paired ? 'pareada' : 'não pareada'}</span><div style={{ fontWeight: 700 }}>{tv.label || 'TV Samsung'}</div></div>
        <span className={`led ${tv.power === 'on' ? '' : tv.power === 'off' ? 'off' : 'env'}`}>{state}</span>
      </Lcd>
      {tv.power === 'off' && <Notice>A TV não responde na rede. Pode estar desligada ou sem conexão. Ligar pela rede pode não funcionar em Wi-Fi.</Notice>}
      <div style={row('1fr 1fr')}>
        <Key center disabled={preview || busy} onClick={() => { setLabel(tv.label || ''); setRename(true); }}>Renomear</Key>
        <Key center disabled={!tv.paired} reason={!tv.paired ? 'pareie primeiro' : undefined} onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? 'Fechar controle' : 'Abrir controle'}</Key>
      </div>
      {tv.paired && <Key on={tv.power === 'on' ? true : undefined} disabled={preview || busy} onClick={() => send('power')} aria-label={`Ligar ou desligar ${tv.label}`}><span className="row" style={{ justifyContent: 'flex-start', gap: 10 }}><Icon name="power" size={20} />Ligar ou desligar</span></Key>}
      {!tv.paired && <Key signal disabled={preview || busy || tv.power !== 'on' || tv.pairing} onClick={() => mutate('pair', {}, 'TV pareada.')}>{pairing || tv.pairing ? 'Aguardando permissão…' : 'Parear'}</Key>}
      {(pairing || tv.pairing) && <Notice>Na TV, escolha “Permitir” para “Casa Local”. Aguarde até 35 segundos. Se recusar ou expirar, tente Parear de novo.</Notice>}
      {!tv.paired && !pairing && <p className="mut" style={{ fontSize: 11 }}>Ligue a TV para parear e aceite o pedido na tela dela.</p>}
      {expanded && tv.paired && <>
        <Remote send={send} disabled={preview || busy || tv.power === 'off'} network />
        <span className="lbl">Apps · só pela rede</span>
        <div style={row('1fr 1fr')}>{APPS.map(([app, name]) => <Key center key={app} disabled={preview || busy || tv.power === 'off'} onClick={() => mutate('command', { app }, `Abrindo ${name}.`)}>{name}</Key>)}</div>
        <Key disabled={preview || busy || tv.power !== 'on'} onClick={() => mutate('pair', {}, 'Permissão renovada.')}>Parear novamente</Key>
      </>}
      <Modal open={rename} onClose={() => setRename(false)} title="Nome da TV">
        <form className="stack" onSubmit={async event => { event.preventDefault(); if (label.trim() && await mutate('label', { label: label.trim() }, 'Nome salvo.')) setRename(false); }}>
          <label className="field">Nome<input type="text" autoFocus value={label} onChange={event => setLabel(event.target.value)} maxLength={24} required /></label>
          <Key signal type="submit" disabled={preview || busy || !label.trim()}>Salvar</Key>
        </form>
      </Modal>
    </section>
  );
}

function Network({ poll, tvs, preview, busy, scan, reload }) {
  return (
    <div className="stack" style={{ gap: 12 }}>
      <Key disabled={preview || busy} loading={busy} sub="Samsung · controle local pela rede" onClick={scan}>{busy ? 'Procurando TVs…' : 'Procurar TVs'}</Key>
      <Stale poll={poll} what="TVs" />
      {!poll.data && !poll.error && <p role="status" className="mut">Carregando TVs…</p>}
      {poll.data && !tvs.length && <p className="mut">Nenhuma TV encontrada. Ligue a TV e toque em Procurar TVs.</p>}
      {poll.data?.scannedAt && <p className="mut" style={{ fontSize: 11 }}>Última busca {fmtAgo(poll.data.scannedAt)}.</p>}
      {tvs.map(tv => <NetworkTV key={tv.id} tv={tv} preview={preview} reload={reload} />)}
    </div>
  );
}

export default function TV({ param }) {
  const { home, mode, refresh, layout } = useHome();
  const poll = usePoll('/api/tvs', 10000);
  const [run, busy] = useAction();
  const [tab, setTab] = useState(param === 'rede' ? 'rede' : 'ir');
  const scanLock = useRef(false);
  useEffect(() => { if (param === 'rede') setTab('rede'); }, [param]);
  const preview = mode === 'preview';
  const tvs = poll.data?.tvs || [];
  const scan = async () => {
    if (preview || scanLock.current) return;
    scanLock.current = true;
    try { await run('/api/tvs/scan', {}, 'Busca concluída.'); await poll.reload(); }
    finally { scanLock.current = false; }
  };
  const both = layout === 'desktop' || layout === 'wide';
  const ir = <Infrared device={home?.devices?.find(device => device.id === 'tv-quarto')} preview={preview} refresh={refresh} />;
  const network = <Network poll={poll} tvs={tvs} preview={preview} busy={busy} scan={scan} reload={poll.reload} />;
  return (
    <>
      {preview && <Notice>Prévia: controles, aprendizado e busca na rede estão desativados. Nenhum sinal é enviado.</Notice>}
      {both ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16, alignItems: 'start' }}>{ir}{network}</div>
      ) : (
        <>
          <Segmented label="Tipo de controle" value={tab} onChange={setTab} options={[['ir', 'Controle IR'], ['rede', 'Samsung · rede']]} />
          {tab === 'ir' ? ir : network}
        </>
      )}
    </>
  );
}
