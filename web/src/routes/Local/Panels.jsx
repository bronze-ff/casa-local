import { fmtAgo, fmtTime } from '../../core/format.js';
import { Banner, Button, Confidence, Empty } from '../../ui/kit.jsx';
import { LIMITS, batteryText, distanceText, isHomePlace, personState, whereText } from './geo.js';

const metric = (label, value) => <div key={label}><dt className="sub">{label}</dt><dd className="num s">{value}</dd></div>;

/** Pessoas (até 4): posição com idade, métricas reais (zero continua zero), configurar celular, renomear, renovar credencial, remover. */
export function PeoplePanel({ people, places, events, selected, onSelect, locked, onPhone, onRename, onRenew, onRemove, onAdd }) {
  const placeName = (id) => places.find((p) => p.id === id)?.name || 'lugar removido';
  return (
    <section className="card col" aria-label="Pessoas">
      <div className="row sp wrap"><h2 className="h2">Pessoas · {people.length} de {LIMITS.people}</h2><span className="sub">OwnTracks · tailnet</span></div>
      {!people.length && <p className="sub">Cada pessoa compartilha a posição do próprio celular com este PC pelo OwnTracks. Prepare o primeiro celular para começar.</p>}
      <div className="grid people">
        {people.map((entry) => {
          const last = entry.last;
          const state = personState(entry);
          const arrived = events.find((e) => e.person === entry.id && e.kind === 'chegou' && e.place === entry.place);
          return (
            <article key={entry.id} className={`person ${entry.id === selected ? 'sel' : ''}`}>
              <button type="button" className="person-head" aria-pressed={entry.id === selected ? 'true' : 'false'} onClick={() => onSelect(entry.id)}>
                <strong>{entry.name}</strong><span className={`st ${state.kind === 'ok' ? 'ok' : state.kind === 'warn' ? 'part' : 'off'}`}><i className="dot" aria-hidden="true" />{state.label}</span>
              </button>
              <p>{whereText(entry, placeName)}</p>
              {entry.place && arrived && <p className="sub">Desde {fmtTime(arrived.tst)}</p>}
              {!entry.place && entry.leftAt && <p className="sub">Saiu de {placeName(entry.leftAt.place)} às {fmtTime(entry.leftAt.tst)} · {fmtAgo(entry.leftAt.tst)}</p>}
              {last ? (
                <>
                  <p className="sub mono" title={new Date(last.tst * 1000).toLocaleString('pt-BR')}>{entry.stale ? 'Posição desatualizada · ' : ''}{fmtAgo(last.tst)}</p>
                  <dl className="metrics">{[['Bateria', last.batt == null ? '—' : `${last.batt}%`], ['Precisão', last.acc == null ? '—' : `±${last.acc} m`], ['Velocidade', last.vel == null ? '—' : `${last.vel} km/h`]].map(([l, v]) => metric(l, v))}</dl>
                  <p className="sub">{batteryText(last)}</p>
                  <p className="sub mono">{last.lat}, {last.lon}</p>
                </>
              ) : <p className="sub">Abra o OwnTracks e toque na seta para enviar a posição.</p>}
              {entry.stale && <p className="sub">Último envio há mais de 30 min. Este lugar pode não refletir a posição atual.</p>}
              {entry.regionsPending && <p className="sub">Lugares pendentes: serão enviados ao celular na próxima posição.</p>}
              <div className="grid two">
                <Button variant="s" disabled={locked} reason="Indisponível agora." onClick={() => onPhone(entry)}>Configurar celular</Button>
                <Button variant="s" disabled={locked} reason="Indisponível agora." onClick={() => onRename(entry)}>Renomear</Button>
                <Button variant="s" disabled={locked} reason="Indisponível agora." onClick={() => onRenew(entry)}>Renovar credencial</Button>
                <Button variant="d" disabled={locked} reason="Indisponível agora." onClick={() => onRemove(entry)}>Remover pessoa</Button>
              </div>
            </article>
          );
        })}
      </div>
      <Button variant="s" icon="plus" disabled={locked || people.length >= LIMITS.people} reason={people.length >= LIMITS.people ? 'O limite é de 4 pessoas.' : 'Indisponível agora.'} onClick={onAdd}>{people.length >= LIMITS.people ? 'Limite de 4 pessoas' : 'Adicionar pessoa'}</Button>
      <p className="hint">As posições ficam neste PC por 48 h. Um lugar chamado “Casa” permite identificar quando a casa está vazia.</p>
    </section>
  );
}

/** Lugares (até 8): nome, raio, coordenadas, quem está lá, distância da pessoa escolhida; formulário com validação explicada. */
export function PlacesPanel({ places, people, person, draft, setDraft, problems, locked, busy, onNew, onEdit, onRemove, onSave, onRadius }) {
  return (
    <section className="card col" aria-label="Lugares">
      <h2 className="h2">Lugares · {places.length} de {LIMITS.places}</h2>
      {!places.length && <p className="sub">Adicione o primeiro lugar. Comece pela Casa.</p>}
      <ul className="list-plain rows">
        {places.map((place) => (
          <li key={place.id} className="place">
            <span className="grow col tight">
              <span className="row wrap"><strong>{place.name}</strong>{isHomePlace(place) && <span className="st ok">É a casa</span>}</span>
              <span className="sub">Raio {place.radius} m · {place.lat}, {place.lon}</span>
              <span className="sub">{people.filter((e) => e.place === place.id).map((e) => `${e.name}${e.stale ? ' (posição antiga)' : ''}`).join(', ') || 'Ninguém na última posição recebida'}</span>
              {person?.distances?.[place.id] != null && <span className="sub">{person.name} a {distanceText(person.distances[place.id])}{person.stale ? ' · posição antiga' : ''}</span>}
            </span>
            <span className="row">
              <Button variant="s" disabled={locked} reason="Indisponível agora." onClick={() => onEdit(place)}>Editar</Button>
              <Button variant="d" disabled={locked} reason="Indisponível agora." onClick={() => onRemove(place)}>Remover</Button>
            </span>
          </li>
        ))}
      </ul>
      {!draft && <Button variant="s" icon="plus" disabled={locked || places.length >= LIMITS.places} reason={places.length >= LIMITS.places ? 'O limite é de 8 lugares.' : 'Indisponível agora.'} onClick={onNew}>{places.length >= LIMITS.places ? 'Limite de 8 lugares' : 'Adicionar lugar'}</Button>}
      {draft && (
        <form className="col" onSubmit={onSave} noValidate>
          <h3 className="cap">{draft.id ? 'Editar lugar' : 'Novo lugar'}</h3>
          <label className="fld">Nome<input className="inp" type="text" maxLength={LIMITS.name} required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="fld">Latitude<input className="inp" type="number" min={-90} max={90} step="any" required value={draft.lat} onChange={(e) => setDraft({ ...draft, lat: e.target.value })} /></label>
          <label className="fld">Longitude<input className="inp" type="number" min={-180} max={180} step="any" required value={draft.lon} onChange={(e) => setDraft({ ...draft, lon: e.target.value })} /></label>
          <label className="fld">Raio em metros (30 a 1000)<input className="inp" type="number" min={30} max={1000} step={1} required value={draft.radius} onChange={(e) => setDraft({ ...draft, radius: e.target.value })} /></label>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>{[50, 100, 200].map((r) => <button key={r} type="button" className="chip" aria-pressed={Number(draft.radius) === r ? 'true' : 'false'} onClick={() => onRadius(r)}>{r} m</button>)}</div>
          {problems.length > 0 && <Banner kind="warn" icon="alert" title="Falta ajustar">{problems.join(' ')}</Banner>}
          <div className="grid two">
            <Button variant="p" type="submit" busy={busy} disabled={locked || problems.length > 0} reason={problems[0] || 'Indisponível agora.'}>Salvar lugar</Button>
            <Button variant="s" disabled={busy} onClick={() => setDraft(null)}>Cancelar</Button>
          </div>
        </form>
      )}
      <p className="hint">Para marcar a sua casa, use o nome “Casa”. O backend também reconhece “Home”, “Minha Casa” e “Casa Local”. Esse lugar decide a presença usada nos avisos.</p>
      {people.some((p) => p.regionsPending) && <Banner kind="info" icon="clock">Os lugares atualizados vão para cada celular no próximo envio de posição.</Banner>}
    </section>
  );
}

/** Últimas 24 h: entradas e saídas, com a origem da informação (celular ou estimada). */
export function EventsPanel({ events, placeName }) {
  return (
    <section className="card col" aria-label="Últimas 24 horas">
      <h2 className="h2">Últimas 24 h</h2>
      {!events.length ? <Empty title="Nenhuma entrada ou saída">Nenhuma entrada ou saída dos lugares nas últimas 24 h.</Empty> : (
        <ol className="list-plain tl-list">
          {events.map((event, index) => (
            <li key={`${event.person}-${event.tst}-${event.kind}-${event.place}-${index}`}>
              <time className="mono mut" dateTime={new Date(event.tst * 1000).toISOString()} title={new Date(event.tst * 1000).toLocaleString('pt-BR')}>{fmtTime(event.tst)}</time>
              <span className="grow col tight"><span>{event.name} {event.kind === 'saiu' ? 'saiu de' : 'chegou em'} <strong>{placeName(event.place)}</strong></span><span className="sub">{fmtAgo(event.tst)} · {event.exact ? 'Informado pelo celular' : 'Estimado pela posição'}</span></span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
