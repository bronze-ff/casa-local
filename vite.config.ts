import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8787' } },
  build: { target: 'es2022', chunkSizeWarningLimit: 650, rolldownOptions: { output: { manualChunks: (id: string) => id.includes('/three/') ? 'three' : undefined } } },
});
