import { useEffect, useRef, useState } from 'react';
import { useHome, usePoll } from '../../core/hooks.js';
import { useAction } from '../../ui/actions.js';
import { Banner, Button, Skeleton } from '../../ui/kit.jsx';
import { Overlay } from '../../ui/Overlay.jsx';
import { LocalMap } from './LocalMap.jsx';
import { EventsPanel, PeoplePanel, PlacesPanel } from './Panels.jsx';
import { PhoneSetup } from './PhoneSetup.jsx';
import { createPrepare } from './prepare.js';
import { eventsLast24h, isHomePlace, placeBody, placeProblems } from './geo.js';

const TITLES = { add: 'Adicionar pessoa', rename: 'Nome da pessoa', renew: 'Renovar credencial', removePerson: 'Remover pessoa', removePlace: 'Remover lugar' };

/**
 * Local: mapa, pessoas (até 4), lugares (até 8) e eventos de 24 h; configuração privada do celular por OwnTracks.
 * Ao abrir só LÊ (GET). Tudo que muda algo é ação do usuário e fica bloqueado na prévia. A credencial só existe no diálogo aberto.
 */
export default function Local({ param }) {
  const { home } = useHome();
  const poll = usePoll('/api/location', 10000);
  const [run, busy] = useAction();
  const lock = useRef(false);
  const [selected, setSelected] = useState(param || null);
  const [dialog, setDialog] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(null);
  const [draft, setDraft] = useState(null);
  // Preparo do celular: a resposta com a credencial só vale enquanto o diálogo/pessoa/tela são os mesmos que pediram.
  const latest = useRef({});
  const prep = useRef(null);
  if (!prep.current) prep.current = createPrepare({ call: (args) => latest.current.call(args), onReady: (phone, args) => latest.current.ready(phone, args) });
  useEffect(() => () => prep.current.invalidate(), []);
  if (!home) return <div className="col" role="status"><Skeleton height={28} width="30%" /><Skeleton height={320} /></div>;

  const preview = home.mode === 'preview';
  const data = poll.data;
  const people = data?.people || [];
  const places = data?.places || [];
  const person = people.find((p) => p.id === selected) || people[0];
  const placeName = (id) => places.find((p) => p.id === id)?.name || 'lugar removido';
  const events = eventsLast24h(data?.events, data?.now || Date.now() / 1000);
  const locked = preview || busy;

  const mutate = async (path, body, message) => {
    if (preview || lock.current) return null;
    lock.current = true;
    try { return await run(path, body, message); } finally { lock.current = false; poll.reload(); }
  };
  const close = () => { prep.current.invalidate(); setDialog(null); setPhone(null); setName(''); };
  const select = (id) => { prep.current.invalidate(); setSelected(id); };
  latest.current.call = ({ target, renew }) => mutate(renew || !target ? '/api/location/setup' : '/api/location/phone',
    renew ? { name: target.name, person: target.id } : target ? { person: target.id } : { name: name.trim() },
    renew ? 'Credencial renovada. Importe a configuração novamente.' : undefined);
  latest.current.ready = (result, { target }) => {
    setPhone(result);
    setSelected(result.person);
    setDialog({ type: 'phone', name: target?.name || name.trim() });
  };
  const prepare = (target, renew = false) => prep.current.start({ target, renew });
  const openName = (target) => { setName(target?.name || ''); setDialog({ type: target ? 'rename' : 'add', person: target }); };
  const newPlace = () => { const point = person?.last || places[0]; setDraft({ name: '', lat: point?.lat ?? '', lon: point?.lon ?? '', radius: 100 }); };
  const problems = draft ? placeProblems(draft) : [];
  const savePlace = async (event) => {
    event.preventDefault();
    if (!draft || placeProblems(draft).length) return;
    if (await mutate('/api/location/places', placeBody(draft), 'Lugar salvo. Os celulares recebem a região no próximo envio.')) setDraft(null);
  };
  const title = dialog?.type === 'phone' ? `Celular de ${dialog.name}` : TITLES[dialog?.type] || 'Local';
  const submitName = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    if (dialog.type === 'add') await prepare(null);
    else if (await mutate(`/api/location/people/${dialog.person.id}`, { name: name.trim() }, 'Nome salvo.')) close();
  };
  const confirmRemove = async () => {
    const person_ = dialog.type === 'removePerson';
    const id = person_ ? dialog.person.id : dialog.place.id;
    if (await mutate(`/api/location/${person_ ? 'people' : 'places'}/${id}/remove`, {}, 'Removido.')) { if (!person_ && draft?.id === id) setDraft(null); close(); }
  };

  return (
    <div className="col">
      {preview && <Banner kind="info" icon="eye">Prévia: os dados disponíveis podem ser consultados. Cadastro, credenciais e alterações estão desativados.</Banner>}
      {poll.stale && <Banner kind="warn" icon="off" title="Sem conexão com o PC de casa">Mostrando a última localização conhecida.</Banner>}
      {poll.error && !data && <Banner kind="err" icon="alert" title="Não foi possível ler a localização">{poll.error.message}</Banner>}
      {!data && !poll.error && <div className="col" role="status"><Skeleton height={28} width="30%" /><Skeleton height={260} /></div>}
      {data && (
        <div className="stage two">
          <div className="col">
            {data.configured ? (
              <section className="card col" aria-label="Mapa">
                <div className="row sp"><h2 className="h2">Mapa</h2>{person && <span className="sub">{person.name}</span>}</div>
                <LocalMap key={person?.id || 'vazio'} people={people} places={places} selected={person?.id} draft={draft} onPick={draft && !locked ? (point) => setDraft((old) => ({ ...old, ...point })) : null} />
              </section>
            ) : (
              <section className="empty" aria-label="Mapa"><b>Mapa sem posições ainda</b><span className="sub">O mapa aparece quando o primeiro celular enviar a posição pelo OwnTracks. Nada é mostrado antes disso.</span></section>
            )}
            {data.configured && <PlacesPanel places={places} people={people} person={person} draft={draft} setDraft={setDraft} problems={problems} locked={locked} busy={busy}
              onNew={newPlace} onEdit={(p) => setDraft({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, radius: p.radius })} onRemove={(p) => setDialog({ type: 'removePlace', place: p })} onSave={savePlace} onRadius={(radius) => setDraft({ ...draft, radius })} />}
          </div>
          <div className="col">
            <PeoplePanel people={people} places={places} events={events} selected={person?.id} onSelect={select} locked={locked}
              onPhone={(p) => prepare(p)} onRename={openName} onRenew={(p) => setDialog({ type: 'renew', person: p })} onRemove={(p) => setDialog({ type: 'removePerson', person: p })} onAdd={() => openName(null)} />
            <EventsPanel events={events} placeName={placeName} />
          </div>
        </div>
      )}
      <Overlay open={!!dialog} onClose={close} title={title} kind="sheet"
        footer={dialog && ['renew', 'removePerson', 'removePlace'].includes(dialog.type) ? (
          <>
            <Button variant="s" onClick={close}>Cancelar</Button>
            {dialog.type === 'renew'
              ? <Button variant="p" busy={busy} disabled={locked} reason="Indisponível agora." onClick={() => prepare(dialog.person, true)}>Gerar credencial nova</Button>
              : <Button variant="d" busy={busy} disabled={locked} reason="Indisponível agora." onClick={confirmRemove}>Remover</Button>}
          </>
        ) : undefined}>
        {(dialog?.type === 'add' || dialog?.type === 'rename') && (
          <form id="local-nome" className="col" onSubmit={submitName}>
            <label className="fld">Nome da pessoa<input className="inp" type="text" required maxLength={30} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <Button variant="p" type="submit" busy={busy} disabled={locked || !name.trim()} reason={!name.trim() ? 'Escreva o nome.' : 'Indisponível agora.'}>{dialog.type === 'add' ? 'Preparar celular' : 'Salvar'}</Button>
          </form>
        )}
        {dialog?.type === 'phone' && phone && <PhoneSetup phone={phone} name={dialog.name} />}
        {dialog?.type === 'renew' && <p>A credencial atual de {dialog.person.name} deixa de funcionar. Será preciso importar o novo QR ou arquivo no celular.</p>}
        {dialog?.type === 'removePerson' && <p>Remover {dialog.person.name}? O celular deixa de ser aceito e o histórico dessa pessoa é apagado.</p>}
        {dialog?.type === 'removePlace' && <p>Remover {dialog.place.name}? A região será removida dos celulares no próximo envio.{isHomePlace(dialog.place) ? ' A presença da casa pode ficar desconhecida.' : ''}</p>}
      </Overlay>
    </div>
  );
}
