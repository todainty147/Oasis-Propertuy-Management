/**
 * Tenaqo — Service Worker v1
 *
 * Strategy:
 *  - Cache-first for app shell static assets (JS/CSS bundles, fonts, icons, offline page)
 *  - Network-only for ALL Supabase API calls, auth, storage, and realtime
 *  - Network-first with offline fallback for navigation requests
 *
 * Security guardrails:
 *  - Supabase API responses are NEVER cached (auth tokens, RLS data, finance, documents)
 *  - Storage signed URLs are NEVER cached
 *  - Authenticated user data is NOT stored in cache
 *  - Cache is version-keyed — old entries are purged on activation
 */

const CACHE_VERSION = "tenaqo-shell-v1";

// App shell assets to pre-cache on install.
// These are static, non-sensitive assets that make up the application shell.
const SHELL_ASSETS = [
  "/",
  "/offline.html",
  "/manifest.json",
  "/brand/tenaqo/app-icon-512.png",
  "/brand/tenaqo/app-icon-maskable-512.png",
  "/brand/tenaqo/favicon-32.png",
];

// URL patterns that must NEVER be served from cache.
// Supabase endpoints, auth flows, storage, and realtime are always network-only.
const NETWORK_ONLY_PATTERNS = [
  /supabase\.co/,
  /supabase\.io/,
  /auth\/v1/,
  /rest\/v1/,
  /storage\/v1/,
  /realtime\/v1/,
  /functions\/v1/,
  /stripe\.com/,
  /api\./,
];

function isNetworkOnly(url) {
  return NETWORK_ONLY_PATTERNS.some((pattern) => pattern.test(url));
}

function isStaticAsset(url) {
  return (
    url.match(/\.(js|css|woff2?|ttf|otf|eot)(\?.*)?$/) ||
    url.match(/\/icons\//) ||
    url.match(/\/manifest\.json$/)
  );
}

// ── Install: pre-cache the app shell ─────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

// ── Activate: purge old caches ────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ── Fetch: routing strategy ───────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = request.url;

  // 1. Non-GET — always network (POST/PUT/DELETE must reach the server)
  if (request.method !== "GET") return;

  // 2. Network-only: Supabase API, auth, storage, realtime, Stripe
  if (isNetworkOnly(url)) return;

  // 3. Static assets (JS/CSS bundles, fonts, icons, manifest) — cache-first
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // 4. Navigation requests (HTML) — network-first, offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/offline.html").then(
          (fallback) => fallback || new Response("Tenaqo is offline.", { status: 503 }),
        ),
      ),
    );
    return;
  }

  // 5. Everything else — network only (do not cache API responses)
});

// ── Push notifications ────────────────────────────────────────────────────────
// Placeholder: full push notification handling requires device token setup (Phase 6)

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Tenaqo", body: event.data.text() };
  }

  const options = {
    body: payload.body || "",
    icon: "/brand/tenaqo/app-icon-512.png",
    badge: "/brand/tenaqo/app-icon-512.png",
    tag: payload.tag || "tenaqo-notification",
    data: { url: payload.url || "/dashboard" },
    requireInteraction: payload.requireInteraction === true,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || "Tenaqo", options),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    }),
  );
});
