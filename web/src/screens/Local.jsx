import { useMemo, useRef, useState } from 'react';
import { useHome } from '../App.jsx';
import { fmtAgo, fmtTime, usePoll } from '../api.js';
import { Badge, Card, Icon, Key, Lcd, Modal, Stale, Status, useAction, useToast } from '../ui.jsx';
import LocationMap from './Local/Map.jsx';
import { ownTracksURL, qrMatrix } from './Local/qr.js';

const isHome = place => ['casa', 'home', 'minha casa', 'casa local'].includes(place.name.trim().toLowerCase());
const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 12, alignItems: 'start' };
const distance = meters => meters == null ? '—' : meters < 1000 ? `${meters} m` : `${(meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
const cols = n => ({ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: 8 });
const small = { fontSize: 11, color: 'var(--ink2)' };

function Notice({ children }) {
  return <div className="aviso" role="status"><Icon name="warn" size={20} /><span>{children}</span></div>;
}

function PhoneSetup({ phone, name }) {
  const toast = useToast();
  const config = useMemo(() => {
    const url = ownTracksURL(phone.otrc);
    try { return { url, matrix: qrMatrix(url) }; }
    catch (error) { return { url, error: error.message }; }
  }, [phone]);
  const copy = async json => {
    try {
      await navigator.clipboard.writeText(json ? JSON.stringify(phone.otrc, null, 2) : config.url);
      toast('Configuração copiada. Use apenas no celular dessa pessoa.');
    } catch { toast('Não foi possível copiar. Use Abrir no OwnTracks ou Baixar configuração.', 'error'); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(phone.otrc)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'owntracks.otrc'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const matrix = config.matrix;
  return <div className="stack" style={{ gap: 14 }}>
    {matrix ? <svg role="img" aria-label={`QR de configuração do OwnTracks de ${name}`} viewBox={`0 0 ${matrix.length + 8} ${matrix.length + 8}`} shapeRendering="crispEdges" style={{ width: '100%', maxWidth: 440, alignSelf: 'center', background: '#fff' }}>
      <rect width="100%" height="100%" fill="white" />
      <path fill="black" d={matrix.flatMap((row, y) => row.flatMap((dark, x) => dark ? [`M${x + 4} ${y + 4}h1v1h-1z`] : [])).join('')} />
    </svg> : <Notice>{config.error} O link e o arquivo abaixo importam a mesma configuração.</Notice>}
    <ol style={{ fontSize: 12, paddingLeft: 22, margin: 0, display: 'grid', gap: 10 }}>
      <li>No celular de {name}, mantenha o Tailscale conectado. Outra pessoa precisa aceitar o compartilhamento deste PC na própria conta.</li>
      <li>Instale o OwnTracks, de Christoph Krey.</li>
      <li>Leia o QR com a câmera do iPhone (abra este painel no PC), ou toque em Abrir no OwnTracks no próprio celular. Permita localização “Sempre”.</li>
      <li>Abra o OwnTracks e toque na seta para enviar a primeira posição.</li>
    </ol>
    <a className="key c" href={config.url} style={{ textDecoration: 'none' }}>Abrir no OwnTracks</a>
    <div style={cols(3)}>
      <Key center onClick={() => copy(false)}>Copiar link</Key>
      <Key center onClick={() => copy(true)}>Copiar JSON</Key>
      <Key center onClick={download}>Baixar configuração</Key>
    </div>
    <p style={small}>O QR, link e arquivo contêm a credencial do celular. Importe apenas no aparelho de {name}. A senha não é exibida em texto.</p>
  </div>;
}

export default function Local({ param }) {
  const { mode } = useHome();
  const preview = mode === 'preview';
  const poll = usePoll('/api/location', 10000);
  const [run, busy] = useAction();
  const lock = useRef(false);
  const [selected, setSelected] = useState(param || null);
  const [dialog, setDialog] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(null);
  const [draft, setDraft] = useState(null);
  const data = poll.data;
  const people = data?.people || [];
  const places = data?.places || [];
  const person = people.find(person => person.id === selected) || people[0];
  const placeName = id => places.find(place => place.id === id)?.name || 'lugar removido';
  const mutate = async (path, body, message) => {
    if (preview || lock.current) return null;
    lock.current = true;
    try { return await run(path, body, message); }
    finally { lock.current = false; poll.reload(); }
  };
  const close = () => { setDialog(null); setPhone(null); };
  const prepare = async (person, renew = false) => {
    const result = await mutate(renew || !person ? '/api/location/setup' : '/api/location/phone',
      renew ? { name: person.name, person: person.id } : person ? { person: person.id } : { name: name.trim() },
      renew ? 'Credencial renovada. Importe a configuração novamente.' : undefined);
    if (!result?.phone) return;
    setPhone(result.phone);
    setSelected(result.phone.person);
    setDialog({ type: 'phone', name: person?.name || name.trim() });
  };
  const openName = person => { setName(person?.name || ''); setDialog({ type: person ? 'rename' : 'add', person }); };
  const newPlace = () => {
    const point = person?.last || places[0];
    setDraft({ name: '', lat: point?.lat ?? '', lon: point?.lon ?? '', radius: 100 });
  };
  const savePlace = async event => {
    event.preventDefault();
    const body = { ...(draft.id ? { id: draft.id } : {}), name: draft.name.trim(), lat: Number(draft.lat), lon: Number(draft.lon), radius: Number(draft.radius) };
    if (draft.lat === '' || draft.lon === '' || !body.name || !Number.isFinite(body.lat) || !Number.isFinite(body.lon) || body.lat < -90 || body.lat > 90 || body.lon < -180 || body.lon > 180 || !Number.isFinite(body.radius) || body.radius < 30 || body.radius > 1000) return;
    if (await mutate('/api/location/places', body, 'Lugar salvo. Os celulares recebem a região no próximo envio.')) setDraft(null);
  };
  const events = [...(data?.events || [])].filter(event => event.tst >= (data?.now || Date.now() / 1000) - 86400).sort((a, b) => b.tst - a.tst);
  return <>
    {preview && <Notice>Prévia: os dados disponíveis podem ser consultados. Cadastro, credenciais e alterações estão desativados.</Notice>}
    <Stale poll={poll} what="localizações" />
    {!data && !poll.error && <Lcd role="status">Carregando localização…</Lcd>}
    {data && <>
      {data.configured && <Card title="Mapa" aside={person && <span style={small}>{person.name}</span>}>
        <LocationMap key={person?.id || 'empty'} people={people} places={places} selected={person?.id} draft={draft} onPick={draft && !preview && !busy ? point => setDraft(previous => ({ ...previous, ...point })) : null} />
      </Card>}
      <div className="row"><h2 className="lbl">Pessoas · {people.length} de 4</h2><span style={small}>OwnTracks · tailnet</span></div>
      {!people.length && <p className="mut" style={{ fontSize: 12 }}>Cada pessoa compartilha a posição do próprio celular com este PC pelo OwnTracks. Prepare o primeiro celular para começar.</p>}
      <div style={gridStyle}>
        {people.map(entry => {
          const last = entry.last;
          const arrived = events.find(event => event.person === entry.id && event.kind === 'chegou' && event.place === entry.place);
          return <article key={entry.id} className="tile" style={{ minHeight: 0, outline: entry.id === person?.id ? '2px solid var(--ink)' : undefined, outlineOffset: -2 }}>
            <button type="button" className="row" aria-pressed={entry.id === person?.id} onClick={() => setSelected(entry.id)} style={{ appearance: 'none', background: 'none', border: 0, padding: 0, minHeight: 44, textAlign: 'left', color: 'inherit', font: 'inherit', cursor: 'pointer', width: '100%' }}>
              <strong style={{ overflowWrap: 'anywhere' }}>{entry.name}</strong>
              <Status kind={entry.stale ? 'warn' : last ? 'ok' : 'off'}>{entry.stale ? 'Posição antiga' : last ? 'Recebida' : 'Sem dado'}</Status>
            </button>
            <p>{entry.place ? `Em ${placeName(entry.place)}` : last ? (last.vel ?? 0) >= 3 ? 'A caminho' : 'Fora dos lugares' : 'Aguardando o primeiro envio'}</p>
            {entry.place && arrived && <p style={small}>Desde {fmtTime(arrived.tst)}</p>}
            {!entry.place && entry.leftAt && <p style={small}>Saiu de {placeName(entry.leftAt.place)} às {fmtTime(entry.leftAt.tst)} · {fmtAgo(entry.leftAt.tst)}</p>}
            {last ? <>
              <p style={{ ...small, fontVariantNumeric: 'tabular-nums' }} title={new Date(last.tst * 1000).toLocaleString('pt-BR')}>{entry.stale ? 'Posição desatualizada · ' : ''}{fmtAgo(last.tst)}</p>
              <dl style={{ ...cols(3), margin: 0 }}>
                {[['Bateria', last.batt == null ? '—' : `${last.batt}%`], ['Precisão', last.acc == null ? '—' : `±${last.acc} m`], ['Velocidade', last.vel == null ? '—' : `${last.vel} km/h`]].map(([label, value]) => <div key={label}><dt style={small}>{label}</dt><dd style={{ margin: 0, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{value}</dd></div>)}
              </dl>
              <p style={small}>{last.bs === 2 ? 'Carregando · ' : last.bs === 3 ? 'Carga completa · ' : ''}{({ w: 'Wi-Fi', m: 'Rede móvel', o: 'Sem rede no envio' })[last.conn] || 'Rede não informada'}</p>
              <p style={{ ...small, fontVariantNumeric: 'tabular-nums' }}>{last.lat}, {last.lon}</p>
            </> : <p style={small}>Abra o OwnTracks e toque na seta para enviar a posição.</p>}
            {entry.stale && <p style={small}>Último envio há mais de 30 min. Este lugar pode não refletir a posição atual.</p>}
            {entry.regionsPending && <p style={small}>Lugares pendentes: serão enviados ao celular na próxima posição.</p>}
            <div style={cols(2)}>
              <Key center disabled={preview || busy} onClick={() => prepare(entry)}>Configurar celular</Key>
              <Key center disabled={preview || busy} onClick={() => openName(entry)}>Renomear</Key>
              <Key center disabled={preview || busy} onClick={() => setDialog({ type: 'renew', person: entry })}>Renovar credencial</Key>
              <Key center disabled={preview || busy} onClick={() => setDialog({ type: 'removePerson', person: entry })}>Remover pessoa</Key>
            </div>
          </article>;
        })}
      </div>
      <Key disabled={preview || busy || people.length >= 4} sub="até 4 · QR do OwnTracks" onClick={() => openName(null)}>
        <span className="row" style={{ justifyContent: 'flex-start', gap: 10 }}><Icon name="plus" size={20} />{people.length >= 4 ? 'Limite de 4 pessoas' : 'Adicionar pessoa'}</span>
      </Key>
      <p style={small}>As posições ficam neste PC por 48 h. Um lugar chamado “Casa” permite identificar quando a casa está vazia.</p>

      {data.configured && <>
        <div className="row"><h2 className="lbl">Lugares · {places.length} de 8</h2></div>
        {!places.length && <p className="mut">Adicione o primeiro lugar. Comece pela Casa.</p>}
        <div className="list">
          {places.map(place => <div key={place.id}>
            <span>
              <span className="row" style={{ justifyContent: 'flex-start', gap: 8, flexWrap: 'wrap' }}><strong>{place.name}</strong>{isHome(place) && <Badge>É a casa</Badge>}</span>
              <small>Raio {place.radius} m · {place.lat}, {place.lon}</small>
              <small>{people.filter(entry => entry.place === place.id).map(entry => `${entry.name}${entry.stale ? ' (posição antiga)' : ''}`).join(', ') || 'Ninguém na última posição recebida'}</small>
              {person?.distances?.[place.id] != null && <small>{person.name} a {distance(person.distances[place.id])}{person.stale ? ' · posição antiga' : ''}</small>}
            </span>
            <span style={{ display: 'flex', gap: 6 }}>
              <Key center style={{ minHeight: 44 }} disabled={preview || busy} onClick={() => setDraft({ id: place.id, name: place.name, lat: place.lat, lon: place.lon, radius: place.radius })}>Editar</Key>
              <Key center style={{ minHeight: 44 }} disabled={preview || busy} onClick={() => setDialog({ type: 'removePlace', place })}>Remover</Key>
            </span>
          </div>)}
        </div>
        {!draft && <Key disabled={preview || busy || places.length >= 8} onClick={newPlace}>{places.length >= 8 ? 'Limite de 8 lugares' : 'Adicionar lugar'}</Key>}
        {draft && <form className="stack" style={{ gap: 12 }} onSubmit={savePlace}>
          <h3 className="lbl">{draft.id ? 'Editar lugar' : 'Novo lugar'}</h3>
          <label className="field">Nome<input type="text" maxLength={24} required value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
          <label className="field">Latitude<input type="number" min={-90} max={90} step="any" required value={draft.lat} onChange={event => setDraft({ ...draft, lat: event.target.value })} /></label>
          <label className="field">Longitude<input type="number" min={-180} max={180} step="any" required value={draft.lon} onChange={event => setDraft({ ...draft, lon: event.target.value })} /></label>
          <label className="field">Raio em metros (30 a 1000)<input type="number" min={30} max={1000} step={1} required value={draft.radius} onChange={event => setDraft({ ...draft, radius: event.target.value })} /></label>
          <div style={cols(3)}>{[50, 100, 200].map(radius => <Key center key={radius} on={Number(draft.radius) === radius} onClick={() => setDraft({ ...draft, radius })}>{radius} m</Key>)}</div>
          <div style={cols(2)}>
            <Key signal center type="submit" disabled={preview || busy || !draft.name.trim()}>Salvar lugar</Key>
            <Key center disabled={busy} onClick={() => setDraft(null)}>Cancelar</Key>
          </div>
        </form>}
        <p style={small}>Para marcar a sua casa, use o nome “Casa”. O backend também reconhece “Home”, “Minha Casa” e “Casa Local”. Esse lugar decide a presença usada nos avisos.</p>
        {people.some(person => person.regionsPending) && <Notice>Os lugares atualizados vão para cada celular no próximo envio de posição.</Notice>}
      </>}

      <div className="row"><h2 className="lbl">Últimas 24 h</h2></div>
      {!events.length ? <p className="mut" style={{ fontSize: 12 }}>Nenhuma entrada ou saída dos lugares nas últimas 24 h.</p> : <ol className="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>{events.map((event, index) => <li key={`${event.person}-${event.tst}-${event.kind}-${event.place}-${index}`} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minHeight: 44, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
        <time style={{ ...small, minWidth: 55, fontVariantNumeric: 'tabular-nums' }} dateTime={new Date(event.tst * 1000).toISOString()} title={new Date(event.tst * 1000).toLocaleString('pt-BR')}>{fmtTime(event.tst)}</time>
        <span>{event.name} {event.kind === 'saiu' ? 'saiu de' : 'chegou em'} <strong>{placeName(event.place)}</strong><small style={{ display: 'block', ...small }}>{fmtAgo(event.tst)} · {event.exact ? 'Informado pelo celular' : 'Estimado pela posição'}</small></span>
      </li>)}</ol>}
    </>}
    <Modal open={!!dialog} onClose={close} title={dialog?.type === 'phone' ? `Celular de ${dialog.name}` : ({ add: 'Adicionar pessoa', rename: 'Nome da pessoa', renew: 'Renovar credencial', removePerson: 'Remover pessoa', removePlace: 'Remover lugar' })[dialog?.type] || 'Local'}>
      {(dialog?.type === 'add' || dialog?.type === 'rename') && <form className="stack" style={{ gap: 14 }} onSubmit={async event => {
        event.preventDefault();
        if (!name.trim()) return;
        if (dialog.type === 'add') await prepare(null);
        else if (await mutate(`/api/location/people/${dialog.person.id}`, { name: name.trim() }, 'Nome salvo.')) close();
      }}>
        <label className="field">Nome da pessoa<input type="text" autoFocus required maxLength={30} value={name} onChange={event => setName(event.target.value)} /></label>
        <Key signal center type="submit" disabled={preview || busy || !name.trim()}>{busy ? 'Preparando…' : dialog.type === 'add' ? 'Preparar celular' : 'Salvar'}</Key>
      </form>}
      {dialog?.type === 'phone' && phone && <PhoneSetup phone={phone} name={dialog.name} />}
      {dialog?.type === 'renew' && <div className="stack" style={{ gap: 14 }}>
        <p>A credencial atual de {dialog.person.name} deixa de funcionar. Será preciso importar o novo QR ou arquivo no celular.</p>
        <Key signal center disabled={preview || busy} onClick={() => prepare(dialog.person, true)}>{busy ? 'Renovando…' : 'Gerar credencial nova'}</Key>
      </div>}
      {(dialog?.type === 'removePerson' || dialog?.type === 'removePlace') && <div className="stack" style={{ gap: 14 }}>
        <p>{dialog.type === 'removePerson' ? `Remover ${dialog.person.name}? O celular deixa de ser aceito e o histórico dessa pessoa é apagado.` : `Remover ${dialog.place.name}? A região será removida dos celulares no próximo envio.${isHome(dialog.place) ? ' A presença da casa pode ficar desconhecida.' : ''}`}</p>
        <div style={cols(2)}><Key signal center disabled={preview || busy} onClick={async () => {
          const removingPerson = dialog.type === 'removePerson';
          const id = removingPerson ? dialog.person.id : dialog.place.id;
          if (await mutate(`/api/location/${removingPerson ? 'people' : 'places'}/${id}/remove`, {}, 'Removido.')) { if (!removingPerson && draft?.id === id) setDraft(null); close(); }
        }}>Remover</Key><Key center onClick={close}>Cancelar</Key></div>
      </div>}
    </Modal>
  </>;
}
