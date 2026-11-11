import { useEffect, useRef, useState } from 'react';
import { useHome, usePoll } from '../../core/hooks.js';
import { fmtAgo } from '../../core/format.js';
import { useAction } from '../../ui/actions.js';
import { Banner, Skeleton } from '../../ui/kit.jsx';
import { guarded } from '../guard.js';
import { GameMode } from './GameMode.jsx';
import { Machine } from './Machine.jsx';
import { Services } from './Services.jsx';
import { FAST, SETTLE_MS, SLOW, pollEvery } from './lab.js';

/** Lab: modo do PC (manual/automático), máquina e serviços. Abrir a tela só LÊ; escritas só por toque, com a casa conectada. */
export default function Lab() {
  const { home, stateError } = useHome();
  const [every, setEvery] = useState(SLOW);
  const poll = usePoll('/api/homelab', every);
  const [run, busy] = useAction();
  const lock = useRef(false);
  const s = poll.data;
  const fast = !!s?.step;
  useEffect(() => {
    if (fast) { setEvery(pollEvery(true)); return undefined; }
    const timer = setTimeout(() => setEvery(pollEvery(false)), SETTLE_MS); // sem passo: volta ao ritmo normal 20 s depois da última ação
    return () => clearTimeout(timer);
  }, [fast, every]);

  const preview = home?.mode === 'preview';
  const offline = !!s && (!s.enabled || preview);
  const connection = stateError ? 'Sem conexão com o painel.' : null;
  const reason = connection || (offline ? 'O home lab roda só no PC de casa.' : null);
  const blocked = busy || !!reason;
  const send = guarded(blocked, async (body, ok) => {
    if (lock.current) return null;
    lock.current = true;
    try {
      const result = await run('/api/homelab', body, ok);
      if (result) { setEvery(FAST); poll.reload(); }
      return result;
    } finally { lock.current = false; }
  });

  if (!s) {
    return (
      <div className="col">
        {poll.error ? <Banner kind="warn" icon="off" title="Sem conexão com o home lab">{poll.error.message}</Banner> : <div className="col" role="status" aria-label="Lendo o home lab"><Skeleton height={28} width="30%" /><Skeleton height={260} /></div>}
      </div>
    );
  }
  const here = typeof window === 'undefined' ? 'localhost' : window.location.hostname;
  return (
    <div className="col">
      {poll.stale && <Banner kind="warn" icon="off" title="Sem conexão com o home lab">Mostrando o último dado, {fmtAgo(poll.at)}. Os controles ficam bloqueados.</Banner>}
      {connection && <Banner kind="warn" icon="off" title="Sem conexão com o PC de casa">Os controles ficam bloqueados até a conexão voltar.</Banner>}
      {offline && <Banner kind="info" icon="eye">{preview ? 'Prévia: o home lab roda só no PC de casa; os controles ficam desligados.' : 'O home lab não está ativo neste servidor: os controles ficam desligados.'}</Banner>}
      {s.wsl === false && !offline && <Banner kind="warn" icon="alert">A máquina Linux (WSL) está desligada, por isso os serviços aparecem parados.</Banner>}
      <div className="stage two">
        <Machine s={s} />
        <GameMode s={s} blocked={blocked || poll.stale} reason={reason} send={send} />
      </div>
      <Services s={s} blocked={blocked || poll.stale} reason={reason} send={send} here={here} />
    </div>
  );
}
