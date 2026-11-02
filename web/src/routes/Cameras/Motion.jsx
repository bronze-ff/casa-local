import { useEffect, useState } from 'react';
import { fmtTime } from '../../core/format.js';
import { usePoll } from '../../core/hooks.js';
import { useAction } from '../../ui/actions.js';
import { Icon } from '../../ui/Icon.jsx';
import { Banner, Button, Chip, Empty, Status } from '../../ui/kit.jsx';
import { AlertDevices } from './AlertDevices.jsx';
import { eventSummary, groupByDay, isFresh } from './motion.js';

/**
 * Eventos de movimento do DVR (24 h): filtro por câmera, sino, "visto" e abertura da gravação.
 * Marcar como visto é AÇÃO do usuário (botão): abrir a lista não faz nenhum POST.
 */
export function Motion({ cameras, motion, onOpen, openAlerts, blocked }) {
  const [cam, setCam] = useState('todas');
  const [run, busy] = useAction();
  const one = usePoll(cam === 'todas' ? null : `/api/motion/${cam}`, 15000);
  const [seenAtOpen, setSeenAtOpen] = useState(null); // quais eventos eram novos quando a lista abriu: seguem marcados "Novo" até sair
  const data = motion.data;
  useEffect(() => { if (data?.seenBy && !seenAtOpen) setSeenAtOpen(data.seenBy); }, [data?.seenBy, seenAtOpen]);
  const names = Object.fromEntries(cameras.map((c) => [c.id, c.name]));
  if (!data) return motion.error ? <Banner kind="err" icon="alert" title="Sem leitura dos movimentos">{motion.error.message}</Banner> : <p className="sub" role="status">Lendo eventos do DVR…</p>;

  const watched = data.notify ?? [];
  const sorted = [...cameras].sort((a, b) => Number(watched.includes(b.id)) - Number(watched.includes(a.id)));
  const events = cam === 'todas' ? data.events : one.data?.events ?? null;
  const unseenNames = Object.keys(data.unseenBy ?? {}).map((id) => names[id]).filter(Boolean).join(', ');
  const unseenHere = cam === 'todas' ? 0 : data.unseenBy?.[cam] ?? 0;
  const off = blocked || busy;
  const act = async (path, body) => { if (blocked) return; await run(path, body); motion.reload(); };

  return (
    <div className="col">
      {motion.stale && <Banner kind="warn" icon="off">Sem conexão para ler os movimentos. Mostrando o último dado conhecido.</Banner>}
      <div className="row wrap"><Status kind={data.connected ? 'ok' : data.error ? 'err' : 'part'}>{data.connected ? 'Recebendo eventos do DVR' : data.error ?? 'Conectando ao DVR…'}</Status><span className="sub">últimas 24 h</span></div>
      <div role="group" aria-label="Filtrar por câmera" className="row wrap">
        <Chip pressed={cam === 'todas'} onClick={() => setCam('todas')}>Todas</Chip>
        {sorted.map((c) => <Chip key={c.id} pressed={cam === c.id} onClick={() => setCam(c.id)}>{watched.includes(c.id) && <Icon name="bell" size={14} />}{c.name}{data.unseenBy?.[c.id] ? <span className="st sent">{data.unseenBy[c.id]}</span> : null}</Chip>)}
      </div>
      {cam === 'todas' && data.unseen > 0 && (
        <div className="row wrap sp"><span>{data.unseen} {data.unseen === 1 ? 'movimento novo' : 'movimentos novos'} em {unseenNames}</span><Button variant="s" disabled={off} reason="Sem conexão com o painel." onClick={() => act('/api/motion/seen', {})}>Marcar tudo como visto</Button></div>
      )}
      {cam === 'todas' ? <AlertDevices cameras={cameras} open={openAlerts} blocked={blocked} /> : (
        <div className="col">
          <Button variant={watched.includes(cam) ? 'p' : 's'} icon="bell" aria-pressed={watched.includes(cam) ? 'true' : 'false'} disabled={off} reason="Sem conexão com o painel." onClick={() => act('/api/motion/notify', { camera: cam, on: !watched.includes(cam) })}>{watched.includes(cam) ? `Avisando quando houver movimento em ${names[cam]}` : `Avisar quando houver movimento em ${names[cam]}`}</Button>
          {unseenHere > 0 && <Button variant="s" disabled={off} reason="Sem conexão com o painel." onClick={() => act('/api/motion/seen', { camera: cam })}>Marcar {unseenHere === 1 ? 'o movimento' : `os ${unseenHere} movimentos`} desta câmera como visto</Button>}
        </div>
      )}
      {events === null ? <p className="sub" role="status">Carregando…</p> : events.length === 0 ? <Empty title="Nenhum movimento">Nenhum movimento {cam === 'todas' ? 'nas câmeras' : 'nesta câmera'} nas últimas 24 h.</Empty> : (
        <div className="col">
          {groupByDay(events).map((group) => (
            <section key={group.label} className="col tight" aria-label={group.label}>
              <h3 className="cap">{group.label}</h3>
              <ol className="list-plain rows">
                {group.events.map((event) => (
                  <li key={event.id}>
                    <button type="button" className="ev" onClick={() => onOpen(event)} aria-label={`Ver a gravação de ${names[event.camera] ?? event.camera} às ${fmtTime(event.start)}`}>
                      <span className="thumb">{event.photo && <img src={`/api/motion/${event.id}.jpg`} alt="" loading="lazy" />}</span>
                      <span className="grow col tight"><strong>{names[event.camera] ?? event.camera}</strong><span className="sub">{eventSummary(event, fmtTime)}</span></span>
                      {isFresh(event, watched, seenAtOpen) ? <span className="st sent">Novo</span> : watched.includes(event.camera) ? <Icon name="bell" size={14} /> : <span className="sub">visto</span>}
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
