import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import qrcode from 'qrcode-generator';
import { BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, Check, Crosshair, ExternalLink, Gauge, LoaderCircle, LocateFixed, MapPin, Navigation, Pencil, Plus, RefreshCw, Smartphone, Target, Trash2, UserPlus, X } from 'lucide-react';
import type { useCasa } from '../useCasa';

type Casa = ReturnType<typeof useCasa>;
type Place = {id: string; name: string; lat: number; lon: number; radius: number};
type Point = {lat: number; lon: number; tst: number; acc?: number; batt?: number; bs?: number; vel?: number; conn?: string};
type Event = {tst: number; kind: 'saiu' | 'chegou'; place: string; exact?: boolean; person: string; name: string};
type Person = {id: string; name: string; last: Point | null; trail: [number, number, number][]; regionsPending: boolean;
  place?: string | null; stale?: boolean; leftAt?: {tst: number; place: string} | null; distances?: Record<string, number>};
type Status = {configured: false} | {configured: true; now: number; places: Place[]; people: Person[]; events: Event[]};
type Phone = {person: string; otrc: Record<string, unknown>; url: string; username: string; password: string};

const POLL_MS = 10000;
const RADII = [50, 100, 200];
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const COLORS = ['#ff7ea6', '#6cc4ff', '#ffb547', '#3ad37a'];
const HOME_NAMES = ['casa', 'home', 'minha casa', 'casa local'];

const clock = (tst: number) => new Date(tst * 1000).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
function ago(tst: number, now: number) {
  const s = Math.max(0, now - tst);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h${Math.round((s % 3600) / 60) ? ` ${Math.round((s % 3600) / 60)} min` : ''}`;
  return `há ${Math.round(s / 86400)} d`;
}
const meters = (m: number) => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(part => part[0] ?? '').join('').toUpperCase() || '?';
const safe = (text: string) => text.replace(/[<>&"]/g, '');

/** Link que configura o app OwnTracks de uma vez (owntracks:///config?inline=<base64 do .otrc>). */
function configLink(otrc: Record<string, unknown>) {
  const bytes = new TextEncoder().encode(JSON.stringify(otrc));
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return `owntracks:///config?inline=${encodeURIComponent(btoa(binary))}`;
}

function PhoneSetup({phone, name, onRenew, busy}: {phone: Phone; name: string; onRenew: () => void; busy: boolean}) {
  const link = useMemo(() => configLink(phone.otrc), [phone]);
  const svg = useMemo(() => { const qr = qrcode(0, 'M'); qr.addData(link); qr.make(); return qr.createSvgTag({cellSize: 4, margin: 3, scalable: true}); }, [link]);
  const [shown, setShown] = useState(false);
  return <div className="loc-phone">
    <div className="loc-qr" role="img" aria-label={`QR code de configuração do OwnTracks de ${name}`} dangerouslySetInnerHTML={{__html: svg}} />
    <ol className="loc-steps">
      <li>No iPhone de <b>{name}</b>: o <b>Tailscale</b> precisa estar ligado. Se for o celular de outra pessoa, ela entra na conta dela e aceita o compartilhamento deste PC.</li>
      <li>Instale o <b>OwnTracks</b> (ícone azul, de Christoph Krey).</li>
      <li>Leia este QR com a câmera do iPhone de {name} (abra esta tela no PC); ou, se você está no próprio iPhone de {name}, toque em <b>Abrir no OwnTracks</b>. Permita localização <b>Sempre</b>.</li>
    </ol>
    <a className="pill accent loc-open" href={link}><ExternalLink size={15} />Abrir no OwnTracks (neste iPhone)</a>
    <details className="loc-manual">
      <summary>Preencher à mão</summary>
      <dl>
        <dt>Mode</dt><dd>HTTP</dd>
        <dt>URL</dt><dd><code>{phone.url}</code></dd>
        <dt>UserID</dt><dd><code>{phone.username}</code></dd>
        <dt>Password</dt><dd>{shown ? <code>{phone.password}</code> : <button className="link" onClick={() => setShown(true)}>Mostrar senha</button>}</dd>
      </dl>
    </details>
    <button className="pill loc-renew" disabled={busy} onClick={onRenew}><RefreshCw size={15} />Gerar senha nova (o celular precisa ler o QR de novo)</button>
  </div>;
}

export default function Location({casa}: {casa: Casa}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);
  const [phone, setPhone] = useState<Phone | null>(null);
  const [showPhone, setShowPhone] = useState(false);
  const [selected, setSelected] = useState<string | null>(() => { try { return localStorage.getItem('casa-local-pessoa'); } catch { return null; } });
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmPerson, setConfirmPerson] = useState(false);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<{lat: number; lon: number; name: string; radius: number} | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const mapNode = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null);
  const draftLayer = useRef<L.LayerGroup | null>(null);
  const pickingRef = useRef(false);
  pickingRef.current = picking;

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/location', {cache: 'no-store'});
      if (!response.ok) throw new Error();
      setStatus(await response.json()); setFailed(false);
    } catch { setFailed(true); }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const configured = status?.configured === true && status.people.length ? status : null;
  const people = configured?.people ?? [];
  const person = people.find(p => p.id === selected) ?? people[0] ?? null;
  const color = (id: string) => COLORS[Math.max(0, people.findIndex(p => p.id === id)) % COLORS.length];
  const choose = (id: string) => {
    setSelected(id); setShowPhone(false); setPhone(null); setRenaming(null); setConfirmPerson(false); setFollow(true);
    try { localStorage.setItem('casa-local-pessoa', id); } catch { /* sem armazenamento */ }
  };

  // Mapa: criado uma vez quando há alguém; camadas redesenhadas a cada atualização.
  useEffect(() => {
    if (!configured || !mapNode.current || map.current) return;
    const created = L.map(mapNode.current, {zoomControl: false, attributionControl: true, center: [-23.55, -46.63], zoom: 13});
    created.attributionControl.setPrefix(false);
    // Mapa oficial do OpenStreetMap (sem chave), escurecido por CSS. O painel manda no-referrer em
    // tudo; a política de uso do OSM pede a origem nos pedidos de mapa.
    L.tileLayer(TILES, {maxZoom: 19, referrerPolicy: 'origin', className: 'loc-tiles', attribution: '© OpenStreetMap'}).addTo(created);
    layers.current = L.layerGroup().addTo(created);
    draftLayer.current = L.layerGroup().addTo(created);
    created.on('dragstart', () => setFollow(false));
    created.on('click', event => {
      if (!pickingRef.current) return;
      setDraft(current => ({lat: event.latlng.lat, lon: event.latlng.lng, name: current?.name ?? '', radius: current?.radius ?? 100}));
    });
    map.current = created;
    // O popup da bandeja muda de tamanho ao abrir: o mapa recalcula a área visível.
    const resize = new ResizeObserver(() => created.invalidateSize());
    resize.observe(mapNode.current);
    return () => { resize.disconnect(); created.remove(); map.current = null; };
  }, [configured !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current, group = layers.current;
    if (!m || !group || !configured) return;
    group.clearLayers();
    for (const place of configured.places) {
      const inside = people.some(p => p.place === place.id);
      L.circle([place.lat, place.lon], {radius: place.radius, color: inside ? '#3ad37a' : '#6cc4ff', weight: 1.5, dashArray: '4 5', fillOpacity: inside ? .14 : .06}).addTo(group);
      L.marker([place.lat, place.lon], {interactive: false, icon: L.divIcon({className: 'loc-place-label', html: `<span>${safe(place.name)}</span>`, iconSize: [0, 0]})}).addTo(group);
    }
    if (person) {
      const trail = person.trail.map(([lat, lon]) => [lat, lon] as [number, number]);
      if (trail.length > 1) L.polyline(trail, {color: color(person.id), weight: 3, opacity: .75, lineJoin: 'round'}).addTo(group);
    }
    for (const someone of people) {
      const last = someone.last;
      if (!last) continue;
      if (someone.id === person?.id && last.acc && last.acc > 15) L.circle([last.lat, last.lon], {radius: last.acc, color: color(someone.id), weight: 0, fillOpacity: .12, interactive: false}).addTo(group);
      L.marker([last.lat, last.lon], {zIndexOffset: someone.id === person?.id ? 500 : 0, icon: L.divIcon({className: `loc-me ${someone.stale ? 'stale' : ''}`,
        html: `<i style="--who:${color(someone.id)}"></i><b>${safe(initials(someone.name))}</b>`, iconSize: [22, 22]})}).addTo(group);
    }
    const last = person?.last;
    if (last && follow) m.setView([last.lat, last.lon], Math.max(m.getZoom(), 15), {animate: true});
    else if (!last && configured.places[0] && follow) m.setView([configured.places[0].lat, configured.places[0].lon], 15);
  }, [configured, person?.id, follow]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const group = draftLayer.current;
    if (!group) return;
    group.clearLayers();
    if (draft) L.circle([draft.lat, draft.lon], {radius: draft.radius, color: '#ffb547', weight: 2, fillOpacity: .12}).addTo(group);
  }, [draft]);

  useEffect(() => { mapNode.current?.classList.toggle('picking', picking); }, [picking]);

  const post = async (path: string, body: Record<string, unknown>, success?: string) => {
    const value = await casa.post('location', path, body, success);
    if (value && 'configured' in value) setStatus(value as Status);
    if (value?.location) setStatus(value.location as Status);
    if (value?.phone) { setPhone(value.phone as Phone); setShowPhone(true); }
    return value;
  };
  const addPerson = async () => {
    const value = await post('/api/location/setup', {name: newName.trim()}, `${newName.trim()} cadastrado: leia o QR no celular`);
    if (value?.phone) { choose((value.phone as Phone).person); setPhone(value.phone as Phone); setShowPhone(true); setAdding(false); setNewName(''); }
  };
  const openPhone = async () => {
    if (!person) return;
    if (showPhone) { setShowPhone(false); return; }
    if (phone?.person !== person.id) await post('/api/location/phone', {person: person.id});
    else setShowPhone(true);
  };
  const savePlace = async () => {
    if (!draft || !draft.name.trim()) return;
    const value = await post('/api/location/places', {name: draft.name.trim(), lat: draft.lat, lon: draft.lon, radius: draft.radius}, `Lugar salvo: ${draft.name.trim()}`);
    if (value) { setDraft(null); setPicking(false); }
  };
  const busy = casa.busy === 'location';

  if (!status) return <div className="empty"><LoaderCircle className={failed ? '' : 'spin'} size={24} /><p>{failed ? 'Localização indisponível' : 'Abrindo a localização'}</p></div>;

  const addForm = <div className="loc-intro">
    <label className="loc-field"><span>Nome da pessoa</span><input autoFocus value={newName} maxLength={30} placeholder="Ex.: Filippe, Lorena" onChange={event => setNewName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && newName.trim()) void addPerson(); }} /></label>
    <button className="primary" disabled={busy || !newName.trim()} onClick={() => void addPerson()}>{busy ? <LoaderCircle className="spin" size={16} /> : <Smartphone size={16} />}Preparar o celular</button>
  </div>;

  if (!configured || !person) return <section className="card location" aria-label="Localização">
    <div className="card-head"><div className="title"><MapPin size={17} /><strong>Localização</strong><span>OwnTracks · pela tailnet</span></div></div>
    <p className="loc-hint">Cada pessoa da casa compartilha a posição do próprio celular, direto para este PC, pela tailnet. Nada passa por nuvem de terceiros e o histórico fica só 48 h. Com um lugar chamado <b>Casa</b>, o painel sabe quando a casa está vazia (avisos com som e Frigate ligado).</p>
    {addForm}
  </section>;

  const {now} = configured;
  const last = person.last;
  const here = configured.places.find(place => place.id === person.place);
  const placeName = (id: string) => configured.places.find(place => place.id === id)?.name ?? 'lugar removido';
  const headline = !last ? 'Aguardando o primeiro envio' : here ? `Em ${here.name}` : (last.vel ?? 0) >= 3 ? 'A caminho' : 'Fora dos lugares';
  const detail = !last ? `Abra o OwnTracks no celular de ${person.name} e toque na seta para enviar.`
    : here ? `desde ${clock([...configured.events].reverse().find(e => e.person === person.id && e.kind === 'chegou' && e.place === here.id)?.tst ?? last.tst)}`
    : person.leftAt ? `saiu de ${placeName(person.leftAt.place)} às ${clock(person.leftAt.tst)} · ${ago(person.leftAt.tst, now)}` : '';
  const Battery = last?.bs === 2 ? BatteryCharging : (last?.batt ?? 100) < 20 ? BatteryLow : (last?.batt ?? 100) < 60 ? BatteryMedium : BatteryFull;
  const tone = !last ? 'idle' : person.stale ? 'stale' : 'live';
  const hasHome = configured.places.some(place => HOME_NAMES.includes(place.name.trim().toLowerCase()));

  return <section className="card location" aria-label="Localização">
    <div className="loc-people" role="tablist" aria-label="Pessoas">
      {people.map(someone => <button key={someone.id} role="tab" aria-selected={someone.id === person.id} className={someone.id === person.id ? 'on' : ''}
        style={{'--who': color(someone.id)} as CSSProperties} onClick={() => choose(someone.id)}>
        <i className={!someone.last ? 'idle' : someone.stale ? 'stale' : ''} />{someone.name}
        <small>{someone.place ? placeName(someone.place) : someone.last ? 'fora' : '—'}</small>
      </button>)}
      {people.length < 4 ? <button className={`add ${adding ? 'on' : ''}`} aria-label="Adicionar pessoa" onClick={() => setAdding(value => !value)}><UserPlus size={15} /></button> : null}
    </div>
    {adding ? addForm : null}

    <div className="card-head">
      <div className="title"><MapPin size={17} />
        {renaming !== null ? <form className="loc-rename" onSubmit={event => { event.preventDefault(); void post(`/api/location/people/${person.id}`, {name: renaming.trim()}, 'Nome trocado').then(value => value && setRenaming(null)); }}>
          <input autoFocus value={renaming} maxLength={30} onChange={event => setRenaming(event.target.value)} aria-label="Nome da pessoa" />
          <button className="icon-btn" aria-label="Salvar nome" disabled={!renaming.trim()}><Check size={14} /></button>
          <button type="button" className="icon-btn" aria-label="Cancelar" onClick={() => setRenaming(null)}><X size={14} /></button>
        </form> : <><strong>{person.name}</strong><button className="icon-btn" aria-label={`Renomear ${person.name}`} onClick={() => setRenaming(person.name)}><Pencil size={13} /></button></>}
      </div>
      <button className={`learn-toggle ${showPhone ? 'on' : ''}`} aria-pressed={showPhone} onClick={() => void openPhone()}><Smartphone size={15} />Celular</button>
    </div>
    {showPhone ? phone?.person === person.id ? <PhoneSetup phone={phone} name={person.name} busy={busy} onRenew={() => void post('/api/location/setup', {name: person.name, person: person.id}, 'Senha nova gerada')} /> : <div className="empty"><LoaderCircle className="spin" size={20} /></div> : null}
    <div className={`loc-hero tone-${tone}`}>
      <div><strong>{headline}</strong>{detail ? <span>{detail}</span> : null}</div>
      {last ? <em title={new Date(last.tst * 1000).toLocaleString('pt-BR')}><i />{ago(last.tst, now)}</em> : null}
    </div>
    <div className="loc-map-wrap">
      <div ref={mapNode} className="loc-map" />
      {picking ? <div className="loc-pick-hint"><Target size={14} />{draft ? 'Ajuste o raio e dê um nome' : 'Toque no mapa onde fica o lugar'}</div> : null}
      {last && !follow ? <button className="round loc-recenter" aria-label={`Centralizar em ${person.name}`} onClick={() => setFollow(true)}><LocateFixed size={17} /></button> : null}
    </div>
    {last ? <div className="loc-metrics">
      <div><Battery size={16} /><span>Bateria</span><strong>{last.batt != null ? `${last.batt}%` : '—'}</strong></div>
      <div><Gauge size={16} /><span>Velocidade</span><strong>{last.vel != null ? `${last.vel} km/h` : '—'}</strong></div>
      <div><Crosshair size={16} /><span>Precisão</span><strong>{last.acc != null ? `±${meters(last.acc)}` : '—'}</strong></div>
    </div> : null}
    <div className="loc-section">
      <div className="loc-section-head"><h3>Lugares</h3>
        {picking ? <button className="link" onClick={() => { setPicking(false); setDraft(null); }}><X size={14} />Cancelar</button>
          : <button className="link" disabled={configured.places.length >= 8} onClick={() => { setPicking(true); setFollow(false); }}><Plus size={14} />Adicionar</button>}
      </div>
      {draft ? <div className="loc-draft">
        <input autoFocus value={draft.name} maxLength={24} placeholder="Nome (ex.: Casa, Academia)" onChange={event => setDraft({...draft, name: event.target.value})} onKeyDown={event => { if (event.key === 'Enter') void savePlace(); }} />
        <div className="segmented" role="radiogroup" aria-label="Raio">{RADII.map(r => <button key={r} role="radio" aria-checked={draft.radius === r} className={draft.radius === r ? 'selected' : ''} onClick={() => setDraft({...draft, radius: r})}>{r} m</button>)}</div>
        <button className="pill accent" disabled={busy || !draft.name.trim()} onClick={() => void savePlace()}><Check size={15} />Salvar</button>
      </div> : null}
      {configured.places.length ? <ul className="loc-places">{configured.places.map(place => {
        const inside = people.filter(p => p.place === place.id).map(p => p.name);
        const away = person.distances?.[place.id];
        return <li key={place.id} className={inside.length ? 'inside' : ''}>
          <MapPin size={15} /><strong>{place.name}</strong>
          <span>{inside.length ? `${inside.join(' e ')} ${inside.length > 1 ? 'estão' : 'está'} aqui` : away != null ? `${person.name} a ${meters(away)}` : `raio ${place.radius} m`}</span>
          {confirmRemove === place.id ? <button className="link danger" onClick={() => { setConfirmRemove(null); void post(`/api/location/places/${place.id}/remove`, {}, 'Lugar removido'); }}>Remover?</button>
            : <button className="icon-btn" aria-label={`Remover ${place.name}`} onClick={() => setConfirmRemove(place.id)}><Trash2 size={14} /></button>}
        </li>;
      })}</ul> : !draft ? <p className="loc-hint">Toque em <b>Adicionar</b> e marque no mapa. Comece por um lugar chamado <b>Casa</b>; depois Academia, Serviço…</p> : null}
      {configured.places.length && !hasHome ? <p className="loc-hint">Dica: dê o nome <b>Casa</b> ao lugar da sua casa. É por ele que o painel sabe quando a casa está vazia.</p> : null}
      {people.some(p => p.regionsPending) ? <p className="loc-hint">Os lugares vão para cada celular no próximo envio de posição dele.</p> : null}
    </div>
    <div className="loc-section">
      <div className="loc-section-head"><h3>Últimas 24 h</h3></div>
      {configured.events.length ? <ol className="loc-timeline">{[...configured.events].reverse().slice(0, 10).map(event => <li key={`${event.person}-${event.tst}-${event.kind}-${event.place}`} className={event.kind}>
        <time>{clock(event.tst)}</time><span>{event.kind === 'saiu' ? <Navigation size={13} /> : <MapPin size={13} />}{event.name} {event.kind === 'saiu' ? 'saiu de' : 'chegou em'} <b>{placeName(event.place)}</b></span>
      </li>)}</ol> : <p className="loc-hint">Nenhuma entrada ou saída dos lugares ainda.</p>}
    </div>
    <div className="loc-section">
      {confirmPerson ? <div className="routine-actions">
        <span className="loc-hint">Tirar {person.name} da localização? O celular para de ser aceito e o histórico some.</span>
        <button className="pill" onClick={() => setConfirmPerson(false)}>Cancelar</button>
        <button className="pill danger" onClick={() => { setConfirmPerson(false); void post(`/api/location/people/${person.id}/remove`, {}, `${person.name} removido`); }}><Trash2 size={14} />Remover</button>
      </div> : <button className="link danger" onClick={() => setConfirmPerson(true)}><Trash2 size={13} />Remover {person.name}</button>}
    </div>
  </section>;
}
