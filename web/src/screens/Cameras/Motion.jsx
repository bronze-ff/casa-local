import { useEffect, useState } from 'react';
import { fmtTime, usePoll } from '../../api.js';
import { Badge, Icon, Key, Stale, Status, clickHook, useAction } from '../../ui.jsx';
import AlertDevices from './AlertDevices.jsx';

const dayLabel = (t) => {
  const d = new Date(t * 1000);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  if (new Date(today.getTime() - 864e5).toDateString() === d.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR');
};

/** Eventos de movimento do DVR (24 h): filtro por câmera, sino, "visto" e abertura da gravação. */
export default function Motion({ cameras, motion, onOpen, openAlerts }) {
  const [cam, setCam] = useState('todas');
  const [run, busy] = useAction();
  const one = usePoll(cam === 'todas' ? null : `/api/motion/${cam}`, 15000);
  // Quais eventos eram novos quando a lista abriu: continuam marcados "Novo" mesmo depois de vistos.
  const [seenAtOpen, setSeenAtOpen] = useState(null);
  const data = motion.data;
  useEffect(() => { if (data?.seenBy && !seenAtOpen) setSeenAtOpen(data.seenBy); }, [data?.seenBy, seenAtOpen]);

  const unseen = cam === 'todas' ? 0 : data?.unseenBy?.[cam] ?? 0;
  useEffect(() => {
    // Abrir uma câmera zera só os avisos dela.
    if (unseen) run('/api/motion/seen', { camera: cam }).then(motion.reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cam, unseen]);

  const names = Object.fromEntries(cameras.map((c) => [c.id, c.name]));
  if (!data) return motion.error ? <Stale poll={motion} what="movimentos" /> : <p className="muted" role="status">Lendo eventos do DVR…</p>;

  const watched = data.notify ?? [];
  const sorted = [...cameras].sort((a, b) => Number(watched.includes(b.id)) - Number(watched.includes(a.id)));
  const events = cam === 'todas' ? data.events : one.data?.events ?? null;
  const unseenNames = Object.keys(data.unseenBy ?? {}).map((id) => names[id]).filter(Boolean).join(', ');

  const toggleBell = async () => {
    await run('/api/motion/notify', { camera: cam, on: !watched.includes(cam) });
    motion.reload();
  };
  const markAll = async () => { await run('/api/motion/seen', {}); motion.reload(); };

  let lastDay = '';
  return (
    <div className="stack" style={{ gap: 14 }}>
      <Stale poll={motion} what="movimentos" />
      <div className="row" style={{ padding: 0, border: 0 }}>
        <Status kind={data.connected ? 'ok' : data.error ? 'fail' : 'warn'}>{data.connected ? 'Recebendo eventos do DVR' : data.error ?? 'Conectando ao DVR…'}</Status>
        <span className="small muted">últimas 24 h</span>
      </div>

      <div role="group" aria-label="Filtrar por câmera" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Key center on={cam === 'todas'} onClick={() => setCam('todas')}>Todas</Key>
        {sorted.map((c) => (
          <Key key={c.id} center on={cam === c.id} onClick={() => setCam(c.id)}>
            {watched.includes(c.id) && <Icon name="bell" size={14} />}{c.name}
            {data.unseenBy?.[c.id] ? <Badge>{data.unseenBy[c.id]}</Badge> : null}
          </Key>
        ))}
      </div>

      {cam === 'todas' && data.unseen > 0 && (
        <div className="row">
          <span className="lbl">{data.unseen} {data.unseen === 1 ? 'movimento novo' : 'movimentos novos'} em {unseenNames}</span>
          <Key center disabled={busy} onClick={markAll}>Marcar tudo visto</Key>
        </div>
      )}

      {cam === 'todas' ? <AlertDevices cameras={cameras} open={openAlerts} /> : (
        <Key on={watched.includes(cam)} disabled={busy} onClick={toggleBell}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icon name="bell" size={16} />{watched.includes(cam) ? `Avisando quando houver movimento em ${names[cam]}` : `Avisar quando houver movimento em ${names[cam]}`}</span>
        </Key>
      )}

      {events === null ? <p className="muted" role="status">Carregando…</p> : events.length === 0 ? (
        <p className="muted small">Nenhum movimento {cam === 'todas' ? 'nas câmeras' : 'nesta câmera'} nas últimas 24 h.</p>
      ) : (
        <ol className="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {events.map((event) => {
            const day = dayLabel(event.start);
            const header = day === lastDay ? null : (lastDay = day);
            const minutes = event.end ? Math.max(1, Math.round((event.end - event.start) / 60)) : null;
            const fresh = watched.includes(event.camera) && event.start > (seenAtOpen?.[event.camera] ?? Infinity);
            return (
              <li key={event.id}>
                {header && <h3 className="lbl" style={{ margin: '14px 0 4px' }}>{header}</h3>}
                <button type="button" className="row" onClick={() => { clickHook.fn?.(); onOpen(event); }} aria-label={`Ver a gravação de ${names[event.camera] ?? event.camera} às ${fmtTime(event.start)}`}
                  style={{ width: '100%', textAlign: 'left', background: 'transparent', color: 'inherit', border: 0, borderBottom: '1px solid color-mix(in srgb, var(--borda) 35%, transparent)', minHeight: 56, justifyContent: 'flex-start', font: 'inherit', cursor: 'pointer' }}>
                  <span className="thumb" style={{ width: 64, height: 40, flex: 'none' }}>
                    {event.photo && <img src={`/api/motion/${event.id}.jpg`} alt="" loading="lazy" />}
                  </span>
                  <span className="stack" style={{ flex: 1, gap: 2 }}>
                    <strong>{names[event.camera] ?? event.camera}</strong>
                    <small>{fmtTime(event.start)}{event.end ? ` · ${minutes} min` : ' · agora'}{event.count > 1 ? ` · ${event.count} disparos` : ''}</small>
                  </span>
                  {fresh ? <Badge>Novo</Badge> : watched.includes(event.camera) ? <Icon name="bell" size={14} /> : <span className="lbl">visto</span>}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
