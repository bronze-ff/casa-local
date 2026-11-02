// A casa é UMA só no navegador: store singleton que sobrevive a #oculto e à troca de rota.
import { ApiError, bootstrap, get, post } from './api.js';
import { createStore } from './store.js';

export const home = createStore({ bootstrap, get, post, ApiError });
export { resultNotice } from './store.js';
