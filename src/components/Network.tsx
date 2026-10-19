import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellOff, Check, LoaderCircle, Pencil, Radar, X } from 'lucide-react';
import type { useCasa } from '../useCasa';

type Casa = ReturnType<typeof useCasa>;
type Device = {id: string; mac: string; ip: string; name: string | null; hint: string | null; host: string | null; label: string;
  online: boolean; known: boolean; watched: boolean; private: boolean; firstSeen: number | null; lastSeen: number | null};
type Net = {devices: Device[]; scanned: number | null; error: string | null; scanning: boolean; online: number; unknown: number; learningUntil: number | null};

const ago = (ts: number | null) => {
  if (!ts) return 'nunca';
  const minutes = Math.max(0, Math.round((Date.now() / 1000 - ts) / 60));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `há ${hours} h` : `há ${Math.floor(hours / 24)} dias`;
};

/** Uma linha de aparelho: estado, nome (editável no lugar), endereço e ações. */
function Row({device, casa, apply}: {device: Device; casa: Casa; apply: (value: Net) => void}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);
  const save = async (body: Record<string, unknown>, success: string) => {
    const value = await casa.post('network', `/api/network/${device.id}`, body, success);
    if (value) apply(value as unknown as Net);
    return value;
  };
  const rename = async () => {
    const name = draft.trim();
    if (!name || name === device.label) { setEditing(false); return; }
    if (await save({name}, `Agora é "${name}"`)) setEditing(false);
  };
  const state = !device.known ? 'new' : device.online ? 'on' : 'off';
  const meta = [device.ip, device.name || device.hint ? device.host : null, device.private ? 'MAC privado' : device.mac].filter(Boolean).join(' · ');
  const busy = casa.busy === 'network';
  return <li className={`net-row ${state}`}>
    <i aria-hidden="true" />
    {editing
      ? <form className="net-rename" onSubmit={event => { event.preventDefault(); void rename(); }}>
          <input ref={input} value={draft} maxLength={40} aria-label={`Nome para ${device.label}`} placeholder="Ex.: Celular da Lorena"
            onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setEditing(false); }} />
          <button className="icon-btn" type="submit" aria-label="Salvar nome" disabled={busy}><Check size={15} /></button>
          <button className="icon-btn" type="button" aria-label="Cancelar" onClick={() => setEditing(false)}><X size={15} /></button>
        </form>
      : <div>
          <strong>{device.label}</strong>
          <span>{meta}{device.online ? '' : ` · visto ${ago(device.lastSeen)}`}{!device.known ? ` · apareceu ${ago(device.firstSeen)}` : ''}</span>
        </div>}
    {editing ? null : <span className="lab-actions">
      {!device.known ? <button className="net-mine" disabled={busy} onClick={() => void save({known: true}, `${device.label}: marcado como seu`)}>É meu</button> : null}
      <button className="icon-btn" aria-label={`Dar nome a ${device.label}`} title="Dar nome" onClick={() => { setDraft(device.name ?? ''); setEditing(true); }}><Pencil size={14} /></button>
      <button className={`icon-btn ${device.watched ? 'net-watching' : ''}`} aria-pressed={device.watched} disabled={busy}
        aria-label={device.watched ? `Parar de vigiar ${device.label}` : `Avisar se ${device.label} sumir`} title={device.watched ? 'Vigiado: avisa se sumir' : 'Avisar se sumir da rede'}
        onClick={() => void save({watch: !device.watched}, device.watched ? `${device.label}: sem vigia` : `${device.label}: avisa se sumir da rede`)}>
        {device.watched ? <Bell size={14} /> : <BellOff size={14} />}</button>
    </span>}
  </li>;
}

/** Rede de casa: quem está conectado, aparelhos novos e os vigiados (avisam se somem). */
export default function HomeNetwork({casa}: {casa: Casa}) {
  const [net, setNet] = useState<Net | null>(null);
  const load = useCallback(async () => {
    try { const response = await fetch('/api/network', {cache: 'no-store'}); if (response.ok) setNet(await response.json()); } catch { /* tenta de novo */ }
  }, []);
  useEffect(() => { void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 30000); return () => clearInterval(timer); }, [load]);
  if (!net) return null;
  const scanning = net.scanning || casa.busy === 'network-scan';
  const scan = async () => { const value = await casa.post('network-scan', '/api/network/scan', {}, 'Rede varrida', 90000); if (value) setNet(value as unknown as Net); };
  const fresh = net.devices.filter(d => !d.known);
  const watched = net.devices.filter(d => d.known && d.watched);
  const rest = net.devices.filter(d => d.known && !d.watched);
  const down = watched.filter(d => !d.online).length;
  const summary = net.scanned
    ? `${net.online} conectados · varrida ${ago(net.scanned)}${down ? ` · ${down} vigiado${down > 1 ? 's' : ''} sem resposta` : ''}`
    : 'A primeira varredura sai alguns minutos depois de o painel ligar.';
  return <section className="net" aria-labelledby="net-title">
    <div className="net-head">
      <div><h3 id="net-title" className="lab-title">Rede de casa</h3><span>{summary}</span></div>
      <button className="pill" disabled={scanning} onClick={() => void scan()}>
        {scanning ? <LoaderCircle className="spin" size={15} /> : <Radar size={15} />}{scanning ? 'Varrendo' : 'Varrer agora'}</button>
    </div>
    {net.learningUntil ? <p className="loc-hint">Aprendendo a rede até {new Date(net.learningUntil * 1000).toLocaleString('pt-BR', {weekday: 'short', hour: '2-digit', minute: '2-digit'})}: o que aparecer até lá entra como conhecido, sem aviso. Depois, todo aparelho novo avisa no celular.</p> : null}
    {net.error ? <p className="loc-hint net-error">{net.error} Tento de novo em 15 min.</p> : null}
    {fresh.length ? <div className="net-group new">
      <p className="net-label">{fresh.length === 1 ? 'Aparelho novo na rede' : `${fresh.length} aparelhos novos na rede`}<small>Se reconhecer, toque em É meu. Se não, troque a senha do Wi-Fi.</small></p>
      <ul className="net-list">{fresh.map(d => <Row key={d.id} device={d} casa={casa} apply={setNet} />)}</ul>
    </div> : null}
    {watched.length ? <div className="net-group">
      <p className="net-label">Vigiados<small>Aviso no celular se sumirem por ~30 min.</small></p>
      <ul className="net-list">{watched.map(d => <Row key={d.id} device={d} casa={casa} apply={setNet} />)}</ul>
    </div> : null}
    {rest.length ? <details className="net-more">
      <summary>Outros aparelhos <span>{rest.filter(d => d.online).length} de {rest.length} conectados</span></summary>
      <ul className="net-list">{rest.map(d => <Row key={d.id} device={d} casa={casa} apply={setNet} />)}</ul>
    </details> : null}
  </section>;
}
