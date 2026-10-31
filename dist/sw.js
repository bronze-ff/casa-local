const CACHE_NAME = "casa-local-9820f1048131";
const PRE_CACHE = ["/","/apple-touch-icon.png","/assets/AlertCard-PITqc5JT.js","/assets/Cameras-u78As5Zy.js","/assets/Central-CqVn2CpJ.js","/assets/Clima-BUTiFkY8.js","/assets/Lab-DAKJRQ7j.js","/assets/Local-BYipZkE4.js","/assets/Luzes-BP9xQuf7.js","/assets/TV-qFwbUuAH.js","/assets/doto-latin-900-normal-D1bF_x6I.woff","/assets/index-Bm-_b3FJ.css","/assets/index-CZsZl1Bq.js","/assets/jetbrains-mono-latin-400-normal-6-qcROiO.woff","/assets/jetbrains-mono-latin-400-normal-V6pRDFza.woff2","/assets/jetbrains-mono-latin-500-normal-BWZEU5yA.woff2","/assets/jetbrains-mono-latin-500-normal-CJOVTJB7.woff","/assets/jetbrains-mono-latin-700-normal-BYuf6tUa.woff2","/assets/jetbrains-mono-latin-700-normal-D3wTyLJW.woff","/favicon.svg","/icon-192.png","/icon-512.png","/icon.svg","/index.html","/manifest.webmanifest"];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRE_CACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('casa-local-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  // A página principal vem sempre da rede (a cópia só serve sem conexão): assim um painel novo
  // publicado no PC de casa nunca fica escondido atrás da cópia offline.
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    // Se o PC de casa demorar mais de 5 s, estiver fora (o Tailscale responde 502) ou sem rede,
    // abre a cópia guardada; o painel reconecta sozinho e recarrega quando o servidor voltar.
    const network = fetch(event.request).then(response => response.ok ? response : Promise.reject(new Error('status')));
    const slow = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
    event.respondWith(Promise.race([network, slow]).catch(async () => (await caches.match('/index.html')) || network));
    return;
  }
  if (PRE_CACHE.includes(url.pathname)) event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
