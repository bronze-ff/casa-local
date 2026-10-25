const CACHE_NAME = "casa-local-051ff01237c3";
const PRE_CACHE = ["/","/apple-touch-icon.png","/assets/Cameras-CPCvitlR.js","/assets/Central-B1FsZ3y7.js","/assets/Clima-BkTa1Wp3.js","/assets/Lab-CBRqc2xn.js","/assets/Local-BHx7Adue.js","/assets/Luzes-5yH2j1Rz.js","/assets/TV-DLmxYAwi.js","/assets/ibm-plex-mono-cyrillic-400-normal-BSMlKf0J.woff2","/assets/ibm-plex-mono-cyrillic-400-normal-CEL4l2ZJ.woff","/assets/ibm-plex-mono-cyrillic-500-normal-Ael50iVv.woff","/assets/ibm-plex-mono-cyrillic-500-normal-Bq9vWWag.woff2","/assets/ibm-plex-mono-cyrillic-ext-400-normal-DMdlQ8Kv.woff","/assets/ibm-plex-mono-cyrillic-ext-400-normal-xuaO2J-f.woff2","/assets/ibm-plex-mono-cyrillic-ext-500-normal-BIfNGwUT.woff","/assets/ibm-plex-mono-cyrillic-ext-500-normal-BqneJy0T.woff2","/assets/ibm-plex-mono-latin-400-normal-CvHOgSBP.woff","/assets/ibm-plex-mono-latin-400-normal-DMJ8VG8y.woff2","/assets/ibm-plex-mono-latin-500-normal-CB9ihrfo.woff","/assets/ibm-plex-mono-latin-500-normal-DSY6xOcd.woff2","/assets/ibm-plex-mono-latin-ext-400-normal-BmRBH3aV.woff2","/assets/ibm-plex-mono-latin-ext-400-normal-D3D2R8hC.woff","/assets/ibm-plex-mono-latin-ext-500-normal-CAhNIIs5.woff2","/assets/ibm-plex-mono-latin-ext-500-normal-CZ70TYgx.woff","/assets/ibm-plex-mono-vietnamese-400-normal-BulugwFq.woff2","/assets/ibm-plex-mono-vietnamese-400-normal-DDuiU_S-.woff","/assets/ibm-plex-mono-vietnamese-500-normal-C8zxqsMH.woff","/assets/ibm-plex-mono-vietnamese-500-normal-DZ4AoWbu.woff2","/assets/index-BoipKbZd.css","/assets/index-HwVHbVLv.js","/assets/schibsted-grotesk-latin-400-normal-BkiRe4WW.woff","/assets/schibsted-grotesk-latin-400-normal-DPhJBilQ.woff2","/assets/schibsted-grotesk-latin-500-normal-Ba39e-CX.woff","/assets/schibsted-grotesk-latin-500-normal-rf9C4Thp.woff2","/assets/schibsted-grotesk-latin-600-normal-BieE9YjJ.woff","/assets/schibsted-grotesk-latin-600-normal-Czv9Obfv.woff2","/assets/schibsted-grotesk-latin-700-normal-BkH0uJ1o.woff2","/assets/schibsted-grotesk-latin-700-normal-Dz-okVa0.woff","/assets/schibsted-grotesk-latin-ext-400-normal-DHVTfbSM.woff2","/assets/schibsted-grotesk-latin-ext-400-normal-DUPvg9bQ.woff","/assets/schibsted-grotesk-latin-ext-500-normal-BjmYCtCC.woff","/assets/schibsted-grotesk-latin-ext-500-normal-Ch1izu81.woff2","/assets/schibsted-grotesk-latin-ext-600-normal-C5pQPdUJ.woff2","/assets/schibsted-grotesk-latin-ext-600-normal-DQsnXf5q.woff","/assets/schibsted-grotesk-latin-ext-700-normal-DDW2aNyx.woff","/assets/schibsted-grotesk-latin-ext-700-normal-o210KhU4.woff2","/icon-192.png","/icon-512.png","/icon.svg","/index.html","/manifest.webmanifest"];
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
