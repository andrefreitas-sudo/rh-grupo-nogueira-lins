// Service worker — guarda só a interface (nunca dados de vagas/usuários).
const VERSAO = 'rh-gnl-v3';
const ARQUIVOS = [
  './', './index.html', './styles.css', './app.js', './config.js', './vendor/supabase.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/favicon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // API sempre direto na rede
  // Rede primeiro (sempre a versão mais nova), cache como reserva offline
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copia = res.clone(); caches.open(VERSAO).then((c) => c.put(req, copia)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
  );
});
