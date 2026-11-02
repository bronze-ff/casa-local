import { useEffect, useState } from 'react';
import { Button, IconButton, Chip, Slider } from './kit.jsx';
import { afterReport, isDirty, stepDraft } from './draft.js';
import { fmtNum } from '../core/format.js';

/**
 * Brilho: o que a luz RELATOU ao lado do rascunho que ainda NÃO foi enviado. Ajustar só muda a tela; "Aplicar" envia.
 * Só o brilho usa este controle. Quem decide o comando é `onApply(valor)`.
 */
export function Draft({ label = 'Brilho', reported, min = 1, max = 100, unit = '%', presets = [10, 25, 50, 75, 100], onApply, busy = false, disabled = false, reason, confidence }) {
  const [state, setState] = useState({ draft: Number.isFinite(reported) ? reported : min, touched: false });
  useEffect(() => { setState((old) => afterReport(old, reported)); }, [reported]);
  const dirty = isDirty(reported, state.draft);
  const edit = (draft) => setState({ draft, touched: true });
  const locked = disabled || busy;
  return (
    <div className="draft">
      <div className="pair">
        <div className="box">
          <span className="cap">Relatado pela luz</span>
          <div className="num l">{Number.isFinite(reported) ? fmtNum(reported) : '—'}<span className="u">{Number.isFinite(reported) ? unit : ''}</span></div>
          <div className="sub">{Number.isFinite(reported) ? 'o aparelho informou' : 'sem leitura do aparelho'} {confidence}</div>
        </div>
        <div className={`box ${dirty ? 'dirty' : ''}`}>
          <span className="cap">Rascunho</span>
          <div className="num l v">{fmtNum(state.draft)}<span className="u">{unit}</span></div>
          <div className="sub">{dirty ? 'não enviado · difere do relatado' : 'igual ao relatado'}</div>
        </div>
      </div>
      <div className="row">
        <IconButton icon="minus" label={`Diminuir ${label.toLowerCase()}`} disabled={locked} onClick={() => edit(stepDraft(state.draft, -5, { min, max }))} />
        <div className="grow"><Slider label={`${label} do rascunho`} value={state.draft} min={min} max={max} disabled={locked} onChange={edit} /></div>
        <IconButton icon="plus" label={`Aumentar ${label.toLowerCase()}`} disabled={locked} onClick={() => edit(stepDraft(state.draft, 5, { min, max }))} />
      </div>
      <div className="row wrap">{presets.map((value) => <Chip key={value} pressed={state.draft === value} disabled={locked} onClick={() => edit(value)}>{value}{unit}</Chip>)}</div>
      <div className="row wrap">
        <Button variant="p" busy={busy} disabled={disabled || !dirty} reason={reason || (!dirty ? 'O rascunho é igual ao que a luz relatou.' : undefined)} onClick={() => onApply?.(state.draft)}>Aplicar {fmtNum(state.draft)}{unit}</Button>
        <Button variant="s" disabled={locked || !state.touched} onClick={() => setState({ draft: Number.isFinite(reported) ? reported : min, touched: false })}>Descartar rascunho</Button>
      </div>
    </div>
  );
}
