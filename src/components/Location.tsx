import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import qrcode from 'qrcode-generator';
import { BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, Check, Crosshair, Gauge, LoaderCircle, LocateFixed, MapPin, Navigation, Plus, RefreshCw, Smartphone, Target, Trash2, X } from 'lucide-react';
import type { useCasa } from '../useCasa';

type Casa = ReturnType<typeof useCasa>;
type Place = {id: string; name: string; lat: number; lon: number; radius: number; distance?: number};
type Point = {lat: number; lon: number; tst: number; acc?: number; batt?: number; bs?: number; vel?: number; conn?: string};
type Event = {tst: number; kind: 'saiu' | 'chegou'; place: string; exact?: boolean};
type Status = {configured: false} | {configured: true; name: string; now: number; places: Place[]; regionsPending: boolean; last: Point | null; trail: [number, number, number][]; events: Event[]; place?: string | null; stale?: boolean; leftAt?: Event | null};
type Phone = {otrc: Record<string, unknown>; url: string; username: string; password: string};

const POLL_MS = 10000;
const RADII = [50, 100, 200];
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const clock = (tst: number) => new Date(tst * 1000).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
function ago(tst: number, now: number) {
  const s = Math.max(0, now - tst);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h${Math.round((s % 3600) / 60) ? ` ${Math.round((s % 3600) / 60)} min` : ''}`;
  return `há ${Math.round(s / 86400)} d`;
}
const meters = (m: number) => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;

/** Link que configura o app OwnTracks de uma vez (owntracks:///config?inline=<base64 do .otrc>). */
function configLink(otrc: Record<string, unknown>) {
  const bytes = new TextEncoder().encode(JSON.stringify(otrc));
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return `owntracks:///config?inline=${encodeURIComponent(btoa(binary))}`;
}

function PhoneSetup({phone, onRenew, busy}: {phone: Phone; onRenew: () => void; busy: boolean}) {
  const link = useMemo(() => configLink(phone.otrc), [phone]);
  const svg = useMemo(() => { const qr = qrcode(0, 'M'); qr.addData(link); qr.make(); return qr.createSvgTag({cellSize: 4, margin: 3, scalable: true}); }, [link]);
  const [shown, setShown] = useState(false);
  return <div className="loc-phone">
    <div className="loc-qr" role="img" aria-label="QR code de configuração do OwnTracks" dangerouslySetInnerHTML={{__html: svg}} />
    <ol className="loc-steps">
      <li>No iPhone dela: instale <b>Tailscale</b> e entre na conta dela; aceite o compartilhamento deste PC.</li>
      <li>Instale <b>OwnTracks</b>. Em Settings, ative <b>Allow external config</b> (se aparecer).</li>
      <li>Aponte a câmera do iPhone para o QR e abra no OwnTracks. Permita localização <b>Sempre</b>.</li>
    </ol>
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
  const [name, setName] = useState('');
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

  const configured = status?.configured === true ? status : null;

  // Mapa: criado uma vez quando há configuração; camadas redesenhadas a cada atualização.
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
      const inside = configured.place === place.id;
      L.circle([place.lat, place.lon], {radius: place.radius, color: inside ? '#3ad37a' : '#6cc4ff', weight: 1.5, dashArray: '4 5', fillOpacity: inside ? .14 : .06}).addTo(group);
      L.marker([place.lat, place.lon], {interactive: false, icon: L.divIcon({className: 'loc-place-label', html: `<span>${place.name.replace(/[<>&"]/g, '')}</span>`, iconSize: [0, 0]})}).addTo(group);
    }
    const trail = configured.trail.map(([lat, lon]) => [lat, lon] as [number, number]);
    if (trail.length > 1) L.polyline(trail, {color: '#8f7bff', weight: 3, opacity: .75, lineJoin: 'round'}).addTo(group);
    const last = configured.last;
    if (last) {
      if (last.acc && last.acc > 15) L.circle([last.lat, last.lon], {radius: last.acc, color: '#ff7ea6', weight: 0, fillOpacity: .12, interactive: false}).addTo(group);
      L.marker([last.lat, last.lon], {icon: L.divIcon({className: `loc-me ${configured.stale ? 'stale' : ''}`, html: '<i></i>', iconSize: [22, 22]})}).addTo(group);
      if (follow) m.setView([last.lat, last.lon], Math.max(m.getZoom(), 15), {animate: true});
    } else if (configured.places[0] && follow) m.setView([configured.places[0].lat, configured.places[0].lon], 15);
  }, [configured, follow]);

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
  const openPhone = async () => {
    setShowPhone(value => !value);
    if (!phone) await post('/api/location/phone', {});
  };
  const savePlace = async () => {
    if (!draft || !draft.name.trim()) return;
    const value = await post('/api/location/places', {name: draft.name.trim(), lat: draft.lat, lon: draft.lon, radius: draft.radius}, `Lugar salvo: ${draft.name.trim()}`);
    if (value) { setDraft(null); setPicking(false); }
  };
  const busy = casa.busy === 'location';

  if (!status) return <div className="empty"><LoaderCircle className={failed ? '' : 'spin'} size={24} /><p>{failed ? 'Localização indisponível' : 'Abrindo a localização'}</p></div>;

  if (!configured) return <section className="card location" aria-label="Localização">
    <div className="card-head"><div className="title"><MapPin size={17} /><strong>Localização</strong><span>OwnTracks · pela tailnet</span></div></div>
    {phone ? <PhoneSetup phone={phone} busy={busy} onRenew={() => void post('/api/location/setup', {name: name.trim() || 'Ela'})} /> : <div className="loc-intro">
      <p>O celular dela envia a posição direto para este PC, pela tailnet. Nada passa por nuvem de terceiros e o histórico fica só 48 h.</p>
      <label className="loc-field"><span>Nome no painel</span><input value={name} maxLength={30} placeholder="Ex.: Maria" onChange={event => setName(event.target.value)} /></label>
      <button className="primary" disabled={busy || !name.trim()} onClick={() => void post('/api/location/setup', {name: name.trim()}, 'Celular pronto para configurar')}>{busy ? <LoaderCircle className="spin" size={16} /> : <Smartphone size={16} />}Preparar o celular dela</button>
    </div>}
  </section>;

  const {last, now} = configured;
  const here = configured.places.find(place => place.id === configured.place);
  const placeName = (id: string) => configured.places.find(place => place.id === id)?.name ?? 'lugar removido';
  const headline = !last ? 'Aguardando o primeiro envio' : here ? `Em ${here.name}` : (last.vel ?? 0) >= 3 ? 'A caminho' : 'Fora dos lugares';
  const detail = !last ? 'Abra o OwnTracks no celular dela e toque na seta para enviar.'
    : here ? `desde ${clock([...configured.events].reverse().find(e => e.kind === 'chegou' && e.place === here.id)?.tst ?? last.tst)}`
    : configured.leftAt ? `saiu de ${placeName(configured.leftAt.place)} às ${clock(configured.leftAt.tst)} · ${ago(configured.leftAt.tst, now)}` : '';
  const Battery = last?.bs === 2 ? BatteryCharging : (last?.batt ?? 100) < 20 ? BatteryLow : (last?.batt ?? 100) < 60 ? BatteryMedium : BatteryFull;
  const tone = !last ? 'idle' : configured.stale ? 'stale' : 'live';

  return <section className="card location" aria-label={`Localização de ${configured.name}`}>
    <div className="card-head">
      <div className="title"><MapPin size={17} /><strong>{configured.name}</strong><span>OwnTracks · pela tailnet</span></div>
      <button className={`learn-toggle ${showPhone ? 'on' : ''}`} aria-pressed={showPhone} onClick={() => void openPhone()}><Smartphone size={15} />Celular</button>
    </div>
    {showPhone ? phone ? <PhoneSetup phone={phone} busy={busy} onRenew={() => void post('/api/location/setup', {name: configured.name}, 'Senha nova gerada')} /> : <div className="empty"><LoaderCircle className="spin" size={20} /></div> : null}
    <div className={`loc-hero tone-${tone}`}>
      <div><strong>{headline}</strong>{detail ? <span>{detail}</span> : null}</div>
      {last ? <em title={new Date(last.tst * 1000).toLocaleString('pt-BR')}><i />{ago(last.tst, now)}</em> : null}
    </div>
    <div className="loc-map-wrap">
      <div ref={mapNode} className="loc-map" />
      {picking ? <div className="loc-pick-hint"><Target size={14} />{draft ? 'Ajuste o raio e dê um nome' : 'Toque no mapa onde fica o lugar'}</div> : null}
      {last && !follow ? <button className="round loc-recenter" aria-label="Centralizar nela" onClick={() => setFollow(true)}><LocateFixed size={17} /></button> : null}
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
        <input autoFocus value={draft.name} maxLength={24} placeholder="Nome (ex.: Ponto)" onChange={event => setDraft({...draft, name: event.target.value})} onKeyDown={event => { if (event.key === 'Enter') void savePlace(); }} />
        <div className="segmented" role="radiogroup" aria-label="Raio">{RADII.map(r => <button key={r} role="radio" aria-checked={draft.radius === r} className={draft.radius === r ? 'selected' : ''} onClick={() => setDraft({...draft, radius: r})}>{r} m</button>)}</div>
        <button className="pill accent" disabled={busy || !draft.name.trim()} onClick={() => void savePlace()}><Check size={15} />Salvar</button>
      </div> : null}
      {configured.places.length ? <ul className="loc-places">{configured.places.map(place => <li key={place.id} className={configured.place === place.id ? 'inside' : ''}>
        <MapPin size={15} /><strong>{place.name}</strong>
        <span>{configured.place === place.id ? 'ela está aqui' : place.distance != null ? `a ${meters(place.distance)}` : `raio ${place.radius} m`}</span>
        {confirmRemove === place.id ? <button className="link danger" onClick={() => { setConfirmRemove(null); void post(`/api/location/places/${place.id}/remove`, {}, 'Lugar removido'); }}>Remover?</button>
          : <button className="icon-btn" aria-label={`Remover ${place.name}`} onClick={() => setConfirmRemove(place.id)}><Trash2 size={14} /></button>}
      </li>)}</ul> : !draft ? <p className="loc-hint">Adicione a casa dela e o ponto: o app passa a avisar a hora exata em que ela sai e chega.</p> : null}
      {configured.regionsPending ? <p className="loc-hint">As regiões vão para o celular dela no próximo envio de posição.</p> : null}
    </div>
    <div className="loc-section">
      <div className="loc-section-head"><h3>Últimas 24 h</h3></div>
      {configured.events.length ? <ol className="loc-timeline">{[...configured.events].reverse().slice(0, 8).map(event => <li key={`${event.tst}-${event.kind}-${event.place}`} className={event.kind}>
        <time>{clock(event.tst)}</time><span>{event.kind === 'saiu' ? <Navigation size={13} /> : <MapPin size={13} />}{event.kind === 'saiu' ? 'Saiu de' : 'Chegou em'} <b>{placeName(event.place)}</b></span>
      </li>)}</ol> : <p className="loc-hint">Nenhuma entrada ou saída dos lugares ainda.</p>}
    </div>
  </section>;
}
