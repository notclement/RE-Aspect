/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/**
 * Offline-first app shell. Built JS/CSS (immutable), static files and prerendered pages are cached on install;
 * pages are network-first with cache fallback, so the app opens instantly and still works offline (view-only).
 * Supabase / API requests are NEVER cached here (they go cross-origin and are skipped).
 */
import { self } from '$app/service-worker';
import { immutable, assets, prerendered } from '$app/manifest';
import { version } from '$app/env';

const CACHE = `rea-${version}`;
const PRECACHE = [...immutable, ...assets, ...prerendered].map((f) => f.path);

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((c) => c.addAll(PRECACHE))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return; // Supabase, maps, AI — handled by the app

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			// Hashed build files never change: cache-first.
			if (PRECACHE.includes(url.pathname) && !req.mode.startsWith('navigate')) {
				const hit = await cache.match(url.pathname);
				if (hit) return hit;
			}
			try {
				const res = await fetch(req);
				if (res.ok && res.type === 'basic') cache.put(req, res.clone());
				return res;
			} catch {
				const hit = (await cache.match(req)) ?? (await cache.match('/'));
				return hit ?? new Response('Offline', { status: 503 });
			}
		})()
	);
});
