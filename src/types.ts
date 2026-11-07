export type RoomId = 'quarto' | 'banheiro';
export type Device = {
  id: string; name: string; kind: 'light' | 'climate' | 'tv'; roomId: RoomId; brand: string;
  configured: boolean; connection: 'preview' | 'unconfigured' | 'online' | 'offline';
  confidence: 'preview' | 'reported' | 'estimated' | 'unknown'; updatedAt: string | null;
  state: { power: boolean | null; brightness?: number | null; colorHex?: string | null; temperature?: number | null; mode?: string | null; fan?: string | null; turbo?: boolean | null; volume?: number | null; source?: string | null; muted?: boolean | null };
  capabilities?: string[];
  irKeys?: Record<string, 'aprendido' | 'samsung-padrao' | 'geonav-perfil'>;
  irClimate?: {off: string | null; origins: Record<string, number>; coverage: Record<string, Record<string, number[]>>; templess: string[]; extras?: Record<string, string>; turbo?: boolean; calibrated?: boolean};
};
export type CasaState = {
  mode: 'preview' | 'local'; devices: Device[];
  scenes: Mode[];
  recentActions: {id: string; message: string; createdAt: string; name: string; status: string}[];
  hub?: {name?: string; [key: string]: unknown};
};
export type Bootstrap = CasaState & {csrfToken: string};
export type ModeStep = {power: boolean; brightness?: number; colorHex?: string; temperature?: number; mode?: string; fan?: string; keepIfOn?: boolean};
/** Modo da casa (antiga cena): o que fazer em cada aparelho; aparelho ausente = não mexer. */
export type Mode = {id: string; name: string; icon: string; description: string; devices: string[]; steps: Record<string, ModeStep>};
