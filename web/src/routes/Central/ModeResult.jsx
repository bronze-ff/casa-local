import { Banner, Button, Status } from '../../ui/kit.jsx';
import { FIELD_STATE, overview, stepView } from './result.js';

const COUNTS = [['confirmed', 'confirmados'], ['unconfirmed', 'sem confirmação'], ['diverged', 'divergentes'], ['operationalFailures', 'falhas'], ['notApplicable', 'não se aplica'], ['preview', 'simulados']];

/**
 * Resultado de "Rodar" por aparelho e por campo: o que foi pedido, o que o aparelho leu e a evidência do recibo.
 * A mensagem de falha do servidor aparece inteira. Infravermelho aceito não é estado confirmado.
 */
export function ModeResult({ scene, result, nameOf, onClose }) {
  const head = overview(result);
  const steps = (result?.results || []).map((item) => stepView(item, nameOf));
  const counts = COUNTS.filter(([key]) => result?.evidenceSummary?.[key] > 0);
  return (
    <Banner kind={head.kind} icon={head.icon} title={`${scene.name}: ${head.title}`} action={onClose && <Button variant="s" onClick={onClose}>Fechar resultado</Button>}>
      {counts.length > 0 && <span className="sub">{counts.map(([key, text]) => `${result.evidenceSummary[key]} ${text}`).join(' · ')}</span>}
      {!steps.length && <span className="sub">O servidor não devolveu o resultado de nenhum aparelho.</span>}
      <ul className="list-plain cen-steps-result" aria-label={`Resultado de ${scene.name} por aparelho`}>
        {steps.map((step) => (
          <li key={step.deviceId} className="col tight cen-step">
            <div className="row sp wrap"><b>{step.name}</b><Status kind={step.kind}>{step.label}</Status></div>
            {step.message && <span className="sub cen-msg">{step.message}</span>}
            {step.reason && <span className="sub">{step.reason}</span>}
            {step.fields.length > 0 && (
              <ul className="list-plain" aria-label={`Campos de ${step.name}`}>
                {step.fields.map((field) => (
                  <li key={field.field} className="sub">{field.label}: pedido {field.requested}{field.reported ? ` · aparelho leu ${field.reported}` : ' · sem leitura depois'} · <b>{FIELD_STATE[field.state]}</b></li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {head.title !== 'Simulado' && result?.evidenceSummary?.unconfirmed > 0 && <span className="sub">Infravermelho não devolve confirmação: confira no aparelho.</span>}
    </Banner>
  );
}
