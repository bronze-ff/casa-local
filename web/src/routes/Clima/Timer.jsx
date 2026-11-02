import { fmtTime } from '../../core/format.js';
import { Banner, Button } from '../../ui/kit.jsx';
import { TIMERS } from './coverage.js';

/** Desligar o ar em N minutos: criar, cancelar, falha do agendador e tentativas. O PC de casa precisa ficar ligado. */
export function TimerPanel({ routines, timer, state, device, preview, busy, onSet }) {
  const loaded = !!routines.data && !routines.error;
  const off = busy || !loaded || state.power !== true || !device?.configured || preview;
  const why = preview ? 'Timers ficam indisponíveis na prévia.' : state.power !== true ? 'Só dá para programar com o ar ligado.' : !device?.configured ? 'Configure o ar no PC de casa.' : 'Carregando o agendador.';
  return (
    <>
      {routines.stale && <Banner kind="warn" icon="off">Sem conexão com o agendador. Mostrando o último dado conhecido.</Banner>}
      {!routines.data && !routines.error && <p role="status" className="sub">Carregando o timer…</p>}
      <div className="grid timers" role="group" aria-label="Desligar o ar em">
        {TIMERS.map((minutes) => (
          <Button key={minutes} variant="s" busy={busy} disabled={off} reason={off ? why : undefined} onClick={() => onSet(minutes)}>{minutes < 60 ? `${minutes} min` : `${minutes / 60} h`}</Button>
        ))}
      </div>
      {timer ? (
        <>
          <p className="sub">Desliga às <b>{fmtTime(timer.at)}</b>. O sinal sai nessa hora; o efeito no aparelho não é confirmado.</p>
          <Button variant="s" busy={busy} disabled={!!routines.error || preview} reason={routines.error ? 'Sem conexão com o agendador.' : 'Indisponível na prévia.'} onClick={() => onSet(0)}>Cancelar timer</Button>
          {!!timer.attempts && <Banner kind="err" icon="alert">Tentando desligar de novo depois de uma falha.</Banner>}
        </>
      ) : routines.data && <p className="sub">Nenhum desligamento programado.</p>}
      {routines.data?.lastError && <Banner kind="err" icon="alert" title="Falha no agendador">{routines.data.lastError}</Banner>}
      <p className="sub">O PC de casa precisa continuar ligado para executar o timer.{preview ? ' Timers indisponíveis na prévia.' : ''}</p>
    </>
  );
}
