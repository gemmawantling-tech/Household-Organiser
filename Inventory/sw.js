/* Home Reserves service worker: network-first, offline fallback. */
const CACHE_NAME='home-reserves-v6';
const LOCAL_FILES=['./','./index.html','./app.css','./app.js','./planner.js','./pantry-view.html','./three-week-review.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(LOCAL_FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('home-reserves-')&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_NAME);
    try{
      const response=await fetch(event.request,{cache:'no-store'});
      if(response.ok)await cache.put(event.request,response.clone());
      return response;
    }catch{
      return (await cache.match(event.request))||(event.request.mode==='navigate'?await cache.match('./index.html'):Response.error());
    }
  })());
});
