// Teclas do controle da TV (infravermelho e rede). Funções puras.
export const LABELS = { power: 'Liga/desliga', up: 'Cima', down: 'Baixo', left: 'Esquerda', right: 'Direita', ok: 'OK', back: 'Voltar', home: 'Início', source: 'Entrada', volume_up: 'Volume +', volume_down: 'Volume −', mute: 'Mudo', play: 'Reproduzir', pause: 'Pausar' };
export const ORIGINS = { aprendido: 'Aprendido', 'samsung-padrao': 'Samsung genérico · não confirmado', 'geonav-perfil': 'Perfil Geonav · não confirmado' };
export const APPS = [['youtube', 'YouTube'], ['netflix', 'Netflix'], ['prime', 'Prime Video'], ['globoplay', 'Globoplay']];
/** Códigos que aparecem na lista do controle IR (reprodução e pausa só existem pela rede). */
export const IR_KEYS = Object.keys(LABELS).filter((key) => !['play', 'pause'].includes(key));

export const originText = (origin) => ORIGINS[origin] || (origin ? 'Código cadastrado' : 'Não cadastrado');
export const learnedCount = (origins = {}) => Object.values(origins).filter((origin) => origin === 'aprendido').length;

/** Tecla IR sem código cadastrado fica desabilitada (fora do modo Aprender) e explica por quê. */
export const keyBlocked = (name, keys, learning) => !learning && !!keys && !(name in keys);

/** Estado da TV na rede em palavras. `off` quer dizer sem resposta na rede, não "desligada" com certeza. */
export const NETWORK_STATE = { on: 'Ligada', standby: 'Em espera', off: 'Sem resposta na rede' };
export const networkState = (power) => NETWORK_STATE[power] || 'Estado desconhecido';

/** Avisos de limite: ligar pela rede pode falhar em Wi-Fi; só ligar a TV quando ela está ligada permite parear. */
export const canPair = (tv) => !tv.paired && tv.power === 'on' && !tv.pairing;
