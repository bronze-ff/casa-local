import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Button } from '../../ui/kit.jsx';
import { audioAvailability, createSoundControl, enterFullscreen, exitFullscreen, fullscreenElement, fullscreenKind } from './media.js';

/**
 * Som e tela cheia do vídeo, só quando o navegador oferece. O vídeo SEMPRE nasce mudo (exigência de autoplay); o som liga por toque e o botão acompanha o elemento (`volumechange`).
 * Sem prova de áudio o botão fica e diz a verdade: se a câmera não tiver áudio, nada toca. Use `key` = stream para recomeçar mudo.
 */
export function MediaControls({ video, stage, sound: withSound = true }) {
  const doc = typeof document === 'undefined' ? undefined : document;
  const [kind, setKind] = useState(() => fullscreenKind(doc, null));
  const [full, setFull] = useState(false);
  const control = useMemo(() => createSoundControl(video), [video]);
  const sound = useSyncExternalStore(control.subscribe, control.isOn, control.isOn); // vem do vídeo, não de um estado paralelo
  const [audio, setAudio] = useState(null);
  useEffect(() => {
    setKind(fullscreenKind(document, video.current));
    const onChange = () => setFull(!!fullscreenElement(document));
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => { document.removeEventListener('fullscreenchange', onChange); document.removeEventListener('webkitfullscreenchange', onChange); };
  }, [video]);
  const toggleSound = () => { control.toggle(); setAudio(audioAvailability(video.current)); };
  const toggleFull = () => { if (full) exitFullscreen(document); else enterFullscreen(kind, stage.current, video.current); };
  return (
    <div className="row wrap" role="group" aria-label="Som e tela">
      {withSound && <Button variant="s" icon={sound ? 'volume' : 'mute'} aria-label={sound ? 'Desligar o som' : 'Ligar o som'} aria-pressed={sound ? 'true' : 'false'} onClick={toggleSound}>{sound ? 'Som ligado' : 'Som desligado'}</Button>}
      {withSound && audio === false && <span className="hint" role="status">Esta câmera não envia áudio.</span>}
      {withSound && audio === null && sound && <span className="hint" role="status">Se a câmera não tiver áudio, nada vai tocar.</span>}
      {kind && <Button variant="s" icon="expand" aria-label={full ? 'Sair da tela cheia' : 'Tela cheia'} aria-pressed={full ? 'true' : 'false'} onClick={toggleFull}>{full ? 'Sair da tela cheia' : 'Tela cheia'}</Button>}
    </div>
  );
}
