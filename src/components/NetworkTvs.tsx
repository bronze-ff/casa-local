import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, House, Link2, LoaderCircle, Minus, Pencil, Plus, Power, RefreshCw, Undo2, Volume2, VolumeX, Wifi, X } from 'lucide-react';
import type { useCasa } from '../useCasa';

type Casa = ReturnType<typeof useCasa>;
type NetworkTv = {id: string; label: string; model: string; paired: boolean; pairing: boolean; power: 'on' | 'standby' | 'off'};
const APPS: [string, string][] = [['youtube', 'YouTube'], ['netflix', 'Netflix'], ['prime', 'Prime Video'], ['globoplay', 'Globoplay']];
const POWER = {on: 'Ligada', standby: 'Em espera', off: 'Fora da rede'};

/** TVs Samsung achadas na rede local: estado real e, depois de pareadas, controle pela rede. */
export default function NetworkTvs({casa}: {casa: Casa}) {
  const [tvs, setTvs] = useState<NetworkTv[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{id: string; label: string} | null>(null);
  const load = useCallback(async () => {
    try { const response = await fetch('/api/tvs', {cache: 'no-store'}); if (response.ok) setTvs((await response.json()).tvs); } catch { /* tenta de novo */ }
  }, []);
  useEffect(() => { void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 10000); return () => clearInterval(timer); }, [load]);
  const post = async (path: string, body: Record<string, unknown>, success?: string, timeout?: number) => {
    const value = await casa.post('tvs', path, body, success, timeout);
    if (value?.tvs) setTvs(value.tvs);
    return value;
  };
  const busy = casa.busy === 'tvs';
  if (!tvs) return null;
  return <section className="card network-tvs" aria-labelledby="ntv-title">
    <div className="card-head">
      <div className="title"><Wifi size={17} /><strong id="ntv-title">TVs na rede</strong><span>Samsung · controle local, sem infravermelho</span></div>
      <button className="round ghost" aria-label="Procurar TVs de novo" disabled={busy} onClick={() => void post('/api/tvs/scan', {}, 'Rede verificada', 30000)}>{busy ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}</button>
    </div>
    {tvs.length ? <ul className="ntv-list">{tvs.map(tv => {
      const key = (name: string) => void post(`/api/tvs/${tv.id}/command`, {key: name});
      const expanded = open === tv.id && tv.paired;
      return <li key={tv.id} className={expanded ? 'open' : ''}>
        <div className="ntv-row">
          <span className={`ntv-dot ${tv.power}`} />
          {renaming?.id === tv.id ? <span className="ntv-rename">
            <input autoFocus value={renaming.label} maxLength={24} onChange={event => setRenaming({...renaming, label: event.target.value})} onKeyDown={event => { if (event.key === 'Enter') void post(`/api/tvs/${tv.id}/label`, {label: renaming.label}).then(() => setRenaming(null)); }} />
            <button className="icon-btn" aria-label="Salvar nome" onClick={() => void post(`/api/tvs/${tv.id}/label`, {label: renaming.label}).then(() => setRenaming(null))}><Check size={14} /></button>
            <button className="icon-btn" aria-label="Cancelar" onClick={() => setRenaming(null)}><X size={14} /></button>
          </span> : <button className="ntv-name" onClick={() => setOpen(current => current === tv.id ? null : tv.id)} disabled={!tv.paired}>
            <strong>{tv.label}</strong><small>{tv.model} · {POWER[tv.power]}{tv.paired ? '' : ' · não pareada'}</small>
          </button>}
          {renaming?.id === tv.id ? null : <button className="icon-btn" aria-label={`Renomear ${tv.label}`} onClick={() => setRenaming({id: tv.id, label: tv.label})}><Pencil size={14} /></button>}
          {tv.paired ? <button className={`power-circle small ${tv.power === 'on' ? 'on' : ''}`} aria-label={`Ligar ou desligar ${tv.label}`} disabled={busy} onClick={() => key('power')}><Power size={16} /></button>
            : <button className="pill accent ntv-pair" disabled={busy || tv.power !== 'on' || tv.pairing} title={tv.power !== 'on' ? 'Ligue a TV para parear' : undefined}
              onClick={() => void post(`/api/tvs/${tv.id}/pair`, {}, 'TV pareada', 45000)}>{tv.pairing || busy ? <LoaderCircle className="spin" size={15} /> : <Link2 size={15} />}Parear</button>}
        </div>
        {busy && !tv.paired ? <p className="loc-hint">Na TV, escolha <b>Permitir</b> para "Casa Local" (até 30 s).</p> : null}
        {expanded ? <div className="ntv-remote">
          <div className="dpad compact">
            <button className="up" aria-label="Cima" onClick={() => key('up')}><ArrowUp size={18} /></button>
            <button className="left" aria-label="Esquerda" onClick={() => key('left')}><ArrowLeft size={18} /></button>
            <button className="ok" aria-label="Confirmar" onClick={() => key('ok')}>OK</button>
            <button className="right" aria-label="Direita" onClick={() => key('right')}><ArrowRight size={18} /></button>
            <button className="down" aria-label="Baixo" onClick={() => key('down')}><ArrowDown size={18} /></button>
          </div>
          <div className="remote-row">
            <button className="pill" onClick={() => key('back')}><Undo2 size={16} />Voltar</button>
            <button className="pill" onClick={() => key('home')}><House size={16} />Início</button>
          </div>
          <div className="volume">
            <button aria-label="Diminuir volume" onClick={() => key('volume_down')}><Minus size={18} /></button>
            <span><Volume2 size={16} />Volume</span>
            <button aria-label="Aumentar volume" onClick={() => key('volume_up')}><Plus size={18} /></button>
            <button className="mute" aria-label="Silenciar" onClick={() => key('mute')}><VolumeX size={18} /></button>
          </div>
          <div className="ntv-apps">{APPS.map(([id, label]) => <button key={id} className="pill" onClick={() => void post(`/api/tvs/${tv.id}/command`, {app: id}, `Abrindo ${label}`)}>{label}</button>)}</div>
        </div> : null}
      </li>;
    })}</ul> : <p className="loc-hint">Nenhuma TV Samsung encontrada na rede ainda. Ligue a TV e toque em procurar.</p>}
    <p className="loc-hint">Pareie com a TV ligada: ela pergunta uma vez se permite o "Casa Local". Ligar pela rede pode não funcionar com a TV em Wi-Fi.</p>
  </section>;
}
