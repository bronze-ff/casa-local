import { Key, useToast } from '../../ui.jsx';

/* Texto selecionável com botão de copiar; se o navegador recusar, o texto já está à mão para selecionar. */
export default function CopyText({ text, label }) {
  const toast = useToast();
  const copy = () => {
    const done = () => toast('Copiado');
    const fail = () => toast('Selecione o texto e copie', 'error');
    if (!navigator.clipboard?.writeText) return fail();
    navigator.clipboard.writeText(text).then(done, fail);
  };
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', minWidth: 0 }}>
      <code className="mono small" style={{ flex: 1, minWidth: 0, padding: '10px 12px', background: 'var(--lcd)', color: 'var(--lcd-fg)', borderRadius: 10, overflowWrap: 'anywhere', userSelect: 'all' }}>{text}</code>
      <Key center aria-label={`Copiar ${label}`} onClick={copy}>Copiar</Key>
    </div>
  );
}
