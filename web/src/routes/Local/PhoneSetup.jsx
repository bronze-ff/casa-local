import { useMemo } from 'react';
import { Banner, Button, useToast } from '../../ui/kit.jsx';
import { ownTracksURL, qrMatrix } from './qr.js';

/**
 * Configuração do celular de uma pessoa. O QR, o link e o arquivo CONTÊM a credencial: por isso este painel só existe
 * enquanto o diálogo está aberto (o pai o apaga ao fechar), nada vai para log, armazenamento ou título, e a senha nunca aparece em texto.
 * Cada cópia ou download só acontece quando o usuário toca.
 */
export function PhoneSetup({ phone, name }) {
  const toast = useToast();
  const config = useMemo(() => {
    const url = ownTracksURL(phone.otrc);
    try { return { url, matrix: qrMatrix(url) }; } catch (error) { return { url, error: error.message }; }
  }, [phone]);
  const copy = async (json) => {
    try {
      await navigator.clipboard.writeText(json ? JSON.stringify(phone.otrc, null, 2) : config.url);
      toast('Configuração copiada. Use apenas no celular dessa pessoa.');
    } catch { toast('Não foi possível copiar. Use Abrir no OwnTracks ou Baixar configuração.', 'error'); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(phone.otrc)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'owntracks.otrc'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const { matrix } = config;
  return (
    <div className="col">
      {matrix ? (
        <svg className="qr" role="img" aria-label={`QR de configuração do OwnTracks de ${name}`} viewBox={`0 0 ${matrix.length + 8} ${matrix.length + 8}`} shapeRendering="crispEdges">
          <rect width="100%" height="100%" fill="white" />
          <path fill="black" d={matrix.flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x + 4} ${y + 4}h1v1h-1z`] : []))).join('')} />
        </svg>
      ) : <Banner kind="warn" icon="alert">{config.error} O link e o arquivo abaixo importam a mesma configuração.</Banner>}
      <ol className="steps-ol">
        <li>No celular de {name}, mantenha o Tailscale conectado. Outra pessoa precisa aceitar o compartilhamento deste PC na própria conta.</li>
        <li>Instale o OwnTracks, de Christoph Krey.</li>
        <li>Leia o QR com a câmera do iPhone (abra este painel no PC), ou toque em Abrir no OwnTracks no próprio celular. Permita localização “Sempre”.</li>
        <li>Abra o OwnTracks e toque na seta para enviar a primeira posição.</li>
      </ol>
      <a className="btn p" href={config.url}>Abrir no OwnTracks</a>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        <Button variant="s" onClick={() => copy(false)}>Copiar link</Button>
        <Button variant="s" onClick={() => copy(true)}>Copiar JSON</Button>
        <Button variant="s" onClick={download}>Baixar configuração</Button>
      </div>
      <p className="hint">O QR, o link e o arquivo contêm a credencial do celular. Importe apenas no aparelho de {name}. A senha não é exibida em texto.</p>
    </div>
  );
}
