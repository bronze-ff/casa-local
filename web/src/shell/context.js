import { createContext, useContext } from 'react';

/** O que as rotas recebem do shell: casa, ações de atualização, modo, rota e layout. */
export const ShellContext = createContext(null);
export const useShell = () => useContext(ShellContext);
