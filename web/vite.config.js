import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O build vai direto para ../dist, que o backend serve. `npm run dev` repassa /api ao servidor local.
export default defineConfig({
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 800 },
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true } } },
});
