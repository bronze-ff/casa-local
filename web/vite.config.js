import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O build vai direto para ../dist, que o backend serve. `npm run dev` repassa /api ao servidor local;
// CASA_API aponta o proxy para outro backend (ex.: a prévia em http://127.0.0.1:8788, sem aparelhos reais).
export default defineConfig({
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 800 },
  server: { proxy: { '/api': { target: process.env.CASA_API || 'http://127.0.0.1:8787', ws: true } } },
});
