/* SPDX-License-Identifier: GPL-3.0-only */

/* 留频 · offline app shell. API and audio are always network-only. */
const CACHE = 'stay-tuned-shell-v2';
const SCOPE = self.registration.scope;
const SHELL_URL = new URL('./', SCOPE).toString();
const BASE_PATH = new URL('./', SCOPE).pathname;
const API_PREFIX = `${BASE_PATH}api/`;
const AUDIO_PREFIX = `${BASE_PATH}audio/`;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  // Live data and media must never come from the shell cache.
  if (url.pathname.startsWith(API_PREFIX) || url.pathname.startsWith(AUDIO_PREFIX)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(SHELL_URL, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(SHELL_URL);
          return cached || new Response('留频需要网络连接才能调谐新的声音。', {
            status: 503,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          });
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
