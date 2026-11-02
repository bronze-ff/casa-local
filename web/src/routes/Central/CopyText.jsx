import { Button, useToast } from '../../ui/kit.jsx';

/** Texto selecionável com botão de copiar; se o navegador recusar, o texto já está à mão para selecionar. */
export function CopyText({ text, label }) {
  const toast = useToast();
  const copy = () => {
    if (!navigator.clipboard?.writeText) { toast('Selecione o texto e copie.', 'error'); return; }
    navigator.clipboard.writeText(text).then(() => toast('Copiado.'), () => toast('Selecione o texto e copie.', 'error'));
  };
  return (
    <div className="cen-copy">
      <code className="mono small">{text}</code>
      <Button variant="s" icon="copy" aria-label={`Copiar ${label}`} onClick={copy}>Copiar</Button>
    </div>
  );
}
