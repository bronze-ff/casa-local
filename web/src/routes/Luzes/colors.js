// As 16 cores da lâmpada e os dois brancos. O valor enviado é sempre #RRGGBB.
export const COLORS = [
  ['#FF3B30', 'Vermelho'], ['#FF6A2B', 'Laranja'], ['#FFA51F', 'Âmbar'], ['#FFD84D', 'Amarelo'],
  ['#9BE15D', 'Lima'], ['#34C759', 'Verde'], ['#2ED3B7', 'Turquesa'], ['#FFFFFF', 'Branco frio'],
  ['#34C8FF', 'Ciano'], ['#64A8FF', 'Céu'], ['#2F6BFF', 'Azul'], ['#5E5CE6', 'Índigo'],
  ['#9B5CF6', 'Violeta'], ['#F25FD0', 'Magenta'], ['#FF7EA6', 'Rosa'], ['#FFD6A0', 'Branco quente'],
];
export const WHITES = ['#FFD6A0', '#FFFFFF'];
export const ROOMS = { quarto: 'Quarto', banheiro: 'Banheiro' };
export const LIGHT_IDS = ['quarto-luz', 'banheiro-luz'];

export const isWhite = (hex) => WHITES.includes(String(hex || '').toUpperCase());
export const colorName = (hex) => COLORS.find(([value]) => value === String(hex || '').toUpperCase())?.[1];

/**
 * Valores de um comando de cor. "Ligar ao escolher cor" é uma escolha EXPLÍCITA do usuário:
 * ligado, a luz apagada acende junto; desligado, só a cor muda e a luz continua como está.
 */
export const colorValues = (hex, { power, turnOn }) => ({ colorHex: hex, ...(turnOn && power !== true ? { power: true } : {}) });
