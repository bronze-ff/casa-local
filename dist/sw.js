const CACHE_NAME = "casa-local-1a4a7e7f1ae6";
const PRE_CACHE = ["/","/apple-touch-icon.png","/assets/AlertCard-DlPIXyAu.js","/assets/Cameras-BekArGW-.js","/assets/Central-C-idEeeS.js","/assets/Clima-DRJhjieE.js","/assets/Lab-CixCZnx9.js","/assets/Local-CgApidJP.js","/assets/Luzes-CD0aeHVU.js","/assets/TV-H5tcaHht.js","/assets/index-BGMK1WQK.css","/assets/index-C97ctc30.js","/assets/jetbrains-mono-latin-400-normal-6-qcROiO.woff","/assets/jetbrains-mono-latin-400-normal-V6pRDFza.woff2","/assets/jetbrains-mono-latin-500-normal-BWZEU5yA.woff2","/assets/jetbrains-mono-latin-500-normal-CJOVTJB7.woff","/assets/jetbrains-mono-latin-600-normal-BfsvjouI.woff","/assets/jetbrains-mono-latin-600-normal-C8RAYTDA.woff2","/assets/jetbrains-mono-latin-700-normal-BYuf6tUa.woff2","/assets/jetbrains-mono-latin-700-normal-D3wTyLJW.woff","/favicon.svg","/icon-192.png","/icon-512.png","/icon.svg","/index.html","/manifest.webmanifest"];
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
