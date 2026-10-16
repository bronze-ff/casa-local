import { Droplets, Flame, Snowflake, Sparkles, Wind } from 'lucide-react';

// Cores, modos e ventilação do painel (aba Luzes/Clima e editor de modos).
export const PALETTE: [string, string][] = [
  ['#FF3B30', 'Vermelho'], ['#FF6A2B', 'Laranja'], ['#FFA51F', 'Âmbar'], ['#FFD84D', 'Amarelo'], ['#9BE15D', 'Lima'], ['#34C759', 'Verde'], ['#2ED3B7', 'Turquesa'], ['#FFFFFF', 'Branco frio'],
  ['#34C8FF', 'Ciano'], ['#64A8FF', 'Céu'], ['#2F6BFF', 'Azul'], ['#5E5CE6', 'Índigo'], ['#9B5CF6', 'Violeta'], ['#F25FD0', 'Magenta'], ['#FF7EA6', 'Rosa'], ['#FFD6A0', 'Branco quente'],
];
export const MODES: [string, string, typeof Snowflake][] = [['cool', 'Resfriar', Snowflake], ['heat', 'Aquecer', Flame], ['dry', 'Desumidificar', Droplets], ['fan', 'Ventilar', Wind], ['auto', 'Automático', Sparkles]];
export const FANS: [string, string][] = [['auto', 'Auto'], ['low', 'Baixa'], ['medium', 'Média'], ['high', 'Alta']];
