import { useEffect, useState } from 'react';
import { usePoll } from '../api.js';
import { useHome } from '../App.jsx';
import { Icon, Stale, useAction } from '../ui.jsx';
import { GameCard } from './Lab/GameMode.jsx';
import NetworkCard from './Lab/Network.jsx';
import { ServicesCard } from './Lab/Services.jsx';
import { MachineCard } from './Lab/Stats.jsx';

export default function Lab() {
  const { mode } = useHome();
  // Durante a troca de modo o passo muda a cada poucos segundos: consulta mais rápido.
  const [every, setEvery] = useState(8000);
  const poll = usePoll('/api/homelab', every);
  const [run, busy] = useAction();
  const s = poll.data;
  const fast = !!s?.step;
  useEffect(() => {
    if (fast) { setEvery(2000); return undefined; }
    // Sem passo em andamento, volta ao ritmo normal 20 s depois da última ação.
    const timer = setTimeout(() => setEvery(8000), 20000);
    return () => clearTimeout(timer);
  }, [fast, every]);

  const send = async (body, ok) => {
    const result = await run('/api/homelab', body, ok);
    if (result) { setEvery(2000); poll.reload(); }
    return result;
  };

  if (!s) {
    return (
      <>
        <Stale poll={poll} what="o home lab" />
        {!poll.error && <p className="muted" role="status">Lendo o home lab…</p>}
      </>
    );
  }

  // A prévia da Casa não toca em nada; o backend também recusa.
  const offline = !s.enabled || mode === 'preview';
  const disabled = offline || busy;

  return (
    <>
      <Stale poll={poll} what="o home lab" />
      {offline && (
        <div className="aviso" role="status">
          <Icon name="server" size={20} />
          <span>O home lab roda só no PC de casa (esta é a prévia): os controles ficam desligados.</span>
        </div>
      )}
      {s.wsl === false && !offline && (
        <div className="aviso" role="status">
          <Icon name="alert" size={20} />
          <span>A máquina Linux (WSL) está desligada, por isso os serviços aparecem parados.</span>
        </div>
      )}
      <div className="grid">
        <GameCard s={s} disabled={disabled} send={send} />
      </div>
      <MachineCard s={s} />
      <ServicesCard s={s} disabled={disabled} send={send} />
      <NetworkCard disabled={offline} />
    </>
  );
}
