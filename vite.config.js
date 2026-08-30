import { createHash } from 'node:crypto';
import { defineConfig } from 'vite';

// Files copied verbatim from public/ - they are not in the bundle graph, so the
// service worker cannot discover them and they are listed here explicitly.
const PUBLIC_ASSETS = [
  'manifest.webmanifest',
  'favicon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png',
  'icons/apple-touch-icon.png'
];

function serviceWorker() {
  return {
    name: 'inline-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const urls = [
        './',
        ...Object.keys(bundle).filter((name) => name !== 'sw.js'),
        ...PUBLIC_ASSETS
      ].map((url) => (url === './' ? url : `./${url}`));

      // The version changes whenever the asset list does, which is what makes
      // the browser treat sw.js as new and fetch the updated shell.
      const version = createHash('sha256').update(urls.join('\n')).digest('hex').slice(0, 12);

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `const CACHE = 'chest-arms-${version}';
const PRECACHE = ${JSON.stringify(urls, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never touch cross-origin traffic: the YouTube links must pass straight
  // through, and caching them is neither possible nor wanted.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Any in-app navigation resolves to the cached shell, so a cold start on a
  // deep hash route works with no network.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./', { ignoreSearch: true }).then((cached) => cached || fetch(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request))
  );
});
`
      });
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [serviceWorker()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0
  }
});
