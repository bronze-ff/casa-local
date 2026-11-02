import { useRef, useState } from 'react';
import { useAction } from '../../ui/actions.js';
import { Banner, Button } from '../../ui/kit.jsx';
import { Overlay } from '../../ui/Overlay.jsx';
import { Remote } from './Remote.jsx';
import { APPS, canPair, networkState } from './keys.js';

/**
 * Uma TV Samsung na rede: parear (permissão na própria TV, até 35 s), renovar, renomear, controle, play/pause e apps.
 * Ligar pela rede pode não funcionar em Wi-Fi: a TV em espera às vezes ignora. Nada aqui faz busca; só o botão do usuário busca.
 */
export function NetworkTV({ tv, preview, reload }) {
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
    try { return await run(`/api/tvs/${tv.id}/${action}`, body, message); } finally { lock.current = false; setPairing(false); reload(); }
  };
  const send = (key) => mutate('command', { key }, key === 'power' && tv.power === 'off' ? 'Sinal para ligar enviado. Aguarde alguns segundos; pode não funcionar por Wi-Fi.' : 'Comando enviado pela rede.');
  const waiting = pairing || tv.pairing;
  const silent = tv.power === 'off';
  const name = tv.label || 'TV Samsung';
  return (
    <section className="card col" aria-label={name}>
      <div className="row sp wrap">
        <div className="col tight"><span className="cap">{tv.model || 'Samsung'} · {tv.paired ? 'pareada' : 'não pareada'}</span><h3 className="h2">{name}</h3></div>
        <span className={`st ${tv.power === 'on' ? 'ok' : tv.power === 'standby' ? 'sent' : 'off'}`}><i className="dot" aria-hidden="true" />{networkState(tv.power)}</span>
      </div>
      {silent && <Banner kind="warn" icon="off">A TV não responde na rede. Pode estar desligada ou sem conexão. Ligar pela rede pode não funcionar em Wi-Fi.</Banner>}
      <div className="grid two">
        <Button variant="s" disabled={preview || busy} reason="Indisponível na prévia." onClick={() => { setLabel(tv.label || ''); setRename(true); }}>Renomear</Button>
        <Button variant="s" disabled={!tv.paired} reason="Pareie primeiro." aria-expanded={expanded ? 'true' : 'false'} onClick={() => setExpanded(!expanded)}>{expanded ? 'Fechar controle' : 'Abrir controle'}</Button>
      </div>
      {tv.paired && <Button variant={tv.power === 'on' ? 's' : 'p'} icon="power" busy={busy} disabled={preview} reason="Indisponível na prévia." aria-label={`Ligar ou desligar ${name}`} onClick={() => send('power')}>Ligar ou desligar</Button>}
      {!tv.paired && <Button variant="p" busy={waiting} disabled={preview || busy || !canPair(tv)} reason={preview ? 'Indisponível na prévia.' : tv.power !== 'on' ? 'Ligue a TV para parear.' : 'Já há um pareamento em andamento.'} onClick={() => mutate('pair', {}, 'TV pareada.')}>{waiting ? 'Aguardando permissão…' : 'Parear'}</Button>}
      {waiting && <Banner kind="info" icon="clock" title="Permissão na TV">Na TV, escolha “Permitir” para “Casa Local”. Aguarde até 35 segundos. Se recusar ou expirar, toque em Parear de novo.</Banner>}
      {!tv.paired && !waiting && <p className="hint">Ligue a TV para parear e aceite o pedido na tela dela.</p>}
      {expanded && tv.paired && (
        <>
          <Remote send={send} disabled={preview || busy || silent} network />
          <span className="cap">Apps · só pela rede</span>
          <div className="grid two">{APPS.map(([app, appName]) => <Button key={app} variant="s" disabled={preview || busy || silent} reason={silent ? 'A TV não responde na rede.' : 'Indisponível na prévia.'} onClick={() => mutate('command', { app }, `Abrindo ${appName}.`)}>{appName}</Button>)}</div>
          <Button variant="s" disabled={preview || busy || tv.power !== 'on'} reason="Ligue a TV para renovar a permissão." onClick={() => mutate('pair', {}, 'Permissão renovada.')}>Parear novamente</Button>
        </>
      )}
      <Overlay open={rename} onClose={() => setRename(false)} title="Nome da TV" kind="sheet"
        footer={<><Button variant="s" onClick={() => setRename(false)}>Cancelar</Button><Button variant="p" type="submit" form={`nome-${tv.id}`} disabled={preview || busy || !label.trim()} reason="Escreva um nome.">Salvar</Button></>}>
        <form id={`nome-${tv.id}`} className="col" onSubmit={async (event) => { event.preventDefault(); if (label.trim() && await mutate('label', { label: label.trim() }, 'Nome salvo.')) setRename(false); }}>
          <label className="fld">Nome<input className="inp" type="text" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={24} required /></label>
        </form>
      </Overlay>
    </section>
  );
}
