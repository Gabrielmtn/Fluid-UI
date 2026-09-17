// phone/sw.js — the phone brush as an installed app (manifest.webmanifest).
//
// Scope: phone/ only; the full app on / is never touched. It does one thing:
// when the pad is opened with no connection, it shows a small page saying so
// instead of the browser's own error. Nothing is cached besides that page —
// the pad needs the network to reach the room anyway, and pages always come
// from the network, so a deploy is seen at once (the ?v= stamps and the
// HTTP cache keep doing their job for everything else).
'use strict';

var OFFLINE_CACHE = 'swirl-phone-offline-v1';
var OFFLINE_URL = './offline';

var OFFLINE_HTML = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
    '<meta name="theme-color" content="#0a0b0e"><title>Swirl Together</title>' +
    '<style>html,body{margin:0;height:100%;background:#0a0b0e;color:#f2f3f5;' +
    'font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}' +
    'main{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'gap:14px;padding:24px;box-sizing:border-box;text-align:center}' +
    'h1{margin:0;font-size:24px}p{margin:0;max-width:30ch;color:#b9bec7}' +
    'button{font:inherit;font-weight:600;padding:12px 22px;border-radius:10px;color:#f2f3f5;' +
    'background:#1b2a44;border:1px solid #3a5a8c}</style></head><body><main>' +
    '<h1>You’re offline</h1><p>Swirl Together paints on a computer over the internet. ' +
    'Connect, then try again.</p>' +
    '<button type="button" onclick="location.reload()">Try again</button></main></body></html>';

self.addEventListener('install', function (event) {
    event.waitUntil(caches.open(OFFLINE_CACHE).then(function (cache) {
        return cache.put(OFFLINE_URL, new Response(OFFLINE_HTML, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        }));
    }));
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(caches.keys().then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== OFFLINE_CACHE; })
            .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); }));
});

// Page loads only; every other request goes to the network untouched.
self.addEventListener('fetch', function (event) {
    if (event.request.mode !== 'navigate') return;
    event.respondWith(fetch(event.request).catch(function () {
        return caches.match(OFFLINE_URL);
    }));
});
