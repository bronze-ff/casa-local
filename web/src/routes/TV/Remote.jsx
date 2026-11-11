import { Button } from '../../ui/kit.jsx';
import { Icon } from '../../ui/Icon.jsx';
import { LABELS, keyBlocked, originText } from './keys.js';

const SYMBOL = { up: 'up', down: 'down', left: 'back', right: 'next', back: 'back', power: 'power', volume_up: 'plus', volume_down: 'minus', mute: 'mute', play: 'play', pause: 'pause', home: 'home', source: 'swap' };

/**
 * Controle remoto: ligar e entrada, volume logo abaixo (o mais usado), direcional circular compacto. Botões de 44 px ou mais. Sem `keys` (rede), todas as teclas valem.
 * Em Aprender, toda tecla pode ser gravada; fora dele, tecla sem código fica desabilitada e diz por quê.
 */
export function Remote({ send, disabled, keys, learning, network }) {
  const key = (name, className = '') => {
    const blocked = disabled || keyBlocked(name, keys, learning);
    const why = disabled ? 'Indisponível agora.' : `${LABELS[name]}: sem código. Use Aprender.`;
    return (
      <Button key={name} variant={name === 'ok' ? 'p' : 's'} className={`rk ${className}`} aria-label={`${learning ? 'Aprender: ' : ''}${LABELS[name]}`} disabled={blocked}
        reason={blocked ? why : undefined} title={keys ? originText(keys[name]) : undefined} onClick={() => send(name)}>
        {name === 'ok' ? 'OK' : <Icon name={SYMBOL[name] || 'plus'} size={22} />}
      </Button>
    );
  };
  return (
    <div className="remote">
      <div className="rrow">{key('power', 'pw')}{key('source')}</div>
      <div className="vol" role="group" aria-label="Volume">{key('volume_down')}{key('mute')}{key('volume_up')}</div>
      <div className="pad" role="group" aria-label="Direcional">
        <span />{key('up')}<span />
        {key('left')}{key('ok', 'okk')}{key('right')}
        <span />{key('down')}<span />
      </div>
      <div className="rrow">{key('back')}{key('home')}</div>
      {network && <><span className="cap">Reprodução</span><div className="rrow">{key('play')}{key('pause')}</div></>}
    </div>
  );
}
