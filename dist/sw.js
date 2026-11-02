const CACHE_NAME = "casa-local-80d5995fcce8";
const PRE_CACHE = ["/","/apple-touch-icon.png","/assets/Alert-KlvWCv1a.js","/assets/Cameras-CHhpckrS.js","/assets/Central-C4P4SP9l.js","/assets/Clima-BTkqbCw3.js","/assets/Inicio-Dt2Ns5KL.js","/assets/Lab-BHSjObci.js","/assets/Local-fBKcqATG.js","/assets/Luzes-CnQqSQDO.js","/assets/TV-B7FRMHRc.js","/assets/actions-DV891zCn.js","/assets/format-rhg1OgV7.js","/assets/frames-CN_qyHk0.js","/assets/history-DkcGKIzU.js","/assets/index-BHqBrtOB.js","/assets/index-D0oyongp.css","/favicon.svg","/icon-192.png","/icon-512.png","/icon.svg","/index.html","/manifest.webmanifest"];
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
