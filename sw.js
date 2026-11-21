const CACHE="nepse-research-desk-v03-test-phase2d";
const CACHE_PREFIX="nepse-research-desk-v03-test-";
const ASSETS=["./","./index.html","./styles.css","./app.js","./manifest.webmanifest","./sample-template.csv","./icons/icon.svg"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
// Only retire caches belonging to this v0.3 test app. Never delete v0.2 or other apps' caches on the shared GitHub Pages origin.
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(caches.match(e.request,{cacheName:CACHE}).then(cached=>cached||fetch(e.request).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return resp;}).catch(()=>caches.match("./index.html"))));});
