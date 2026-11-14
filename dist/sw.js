const CACHE_NAME = "casa-local-6d351149c981";
const PRE_CACHE = ["/","/apple-touch-icon.png","/assets/Alert-CvgaG1qO.js","/assets/Cameras-lwZmDzO7.js","/assets/Central-Dz59TbKP.js","/assets/Clima-qYZxPD2K.js","/assets/Inicio-CQAEIkoX.js","/assets/Lab-B-ZoASSm.js","/assets/Local-QV2REts7.js","/assets/Luzes-DlZ5baRi.js","/assets/TV-D9DV6l-n.js","/assets/actions-BBXfJpsh.js","/assets/format-rhg1OgV7.js","/assets/frames-CN_qyHk0.js","/assets/history-DkcGKIzU.js","/assets/index-CvZM1IFO.js","/assets/index-vbj6tXUb.css","/assets/urbanist-latin-400-normal-BHTGe-Vj.woff","/assets/urbanist-latin-400-normal-ClbGNxcV.woff2","/assets/urbanist-latin-500-normal-CTXUkCRo.woff2","/assets/urbanist-latin-500-normal-DpQ4Tjrd.woff","/assets/urbanist-latin-600-normal-BuXRW95m.woff2","/assets/urbanist-latin-600-normal-cDQtY_pk.woff","/assets/urbanist-latin-700-normal-BtsT2zLv.woff2","/assets/urbanist-latin-700-normal-Zdugn5sa.woff","/assets/urbanist-latin-ext-400-normal-AR80KGOc.woff","/assets/urbanist-latin-ext-400-normal-DZynuzUy.woff2","/assets/urbanist-latin-ext-500-normal-DU_MVRy-.woff","/assets/urbanist-latin-ext-500-normal-DjtxgPdH.woff2","/assets/urbanist-latin-ext-600-normal-D22gvnSM.woff","/assets/urbanist-latin-ext-600-normal-Edu9tcYw.woff2","/assets/urbanist-latin-ext-700-normal-B8Y3NOrp.woff2","/assets/urbanist-latin-ext-700-normal-LzPfOSk1.woff","/favicon.svg","/icon-192.png","/icon-512.png","/icon.svg","/index.html","/manifest.webmanifest"];
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
