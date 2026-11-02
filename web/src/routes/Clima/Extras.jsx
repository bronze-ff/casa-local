import { Button } from '../../ui/kit.jsx';
import { EXTRAS } from './coverage.js';

/**
 * Funções do controle original (Turbo, Eco, Brisa, Display). Todas ficam ALCANÇÁVEIS: o que não foi aprendido aparece
 * desabilitado com o motivo, e em modo Aprender cada uma pode ser gravada. Eco, Brisa e Display alternam no aparelho
 * sem confirmação; só o Turbo calibrado acompanha o estado completo.
 */
export function ExtrasPanel({ ir, state, learning, canLearn, disabled, busy, onTurbo, onKey, onLearn }) {
  return (
    <>
      <div className="grid extras" role="group" aria-label="Funções do controle original">
        {EXTRAS.map(({ key, label }) => {
          const calibrated = key === 'turbo' && !!ir?.turbo && !learning;
          const supported = calibrated || !!ir?.extras?.[key];
          const sub = learning ? (ir?.extras?.[key] ? 'Regravar' : 'Gravar') : !supported ? 'Não aprendido' : calibrated ? 'Estimado' : 'Alterna no aparelho';
          const off = learning ? !canLearn : disabled || !supported || (calibrated && state.power !== true);
          const why = learning ? 'Não é possível gravar agora.' : !supported ? `${label} ainda não foi aprendido. Use Aprender.` : calibrated && state.power !== true ? 'Ligue o ar primeiro.' : 'Indisponível agora.';
          return (
            <Button key={key} variant="s" className="extra" busy={busy} disabled={off} reason={off ? why : undefined}
              onClick={() => (learning ? onLearn({ key }, label) : calibrated ? onTurbo(!state.turbo) : onKey(key))}>
              <span className="col tight"><b>{label}{calibrated && state.turbo ? ' ligado' : ''}</b><span className="sub">{sub}</span></span>
            </Button>
          );
        })}
      </div>
      <p className="sub">Eco, Brisa e Display alternam no aparelho, sem confirmação de estado. O Turbo calibrado acompanha o estado completo; sem calibração, usa o botão aprendido.</p>
    </>
  );
}
