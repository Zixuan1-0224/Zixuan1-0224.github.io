/* [P31] 素材快取：伺服器對所有檔案都回 no-store，玩家跳出去再回來（或頁面被系統收掉重載）會把模型、貼圖、草點全部重新下載。
   這支 Service Worker 把「很少變」的素材存在手機裡：有存的直接用（秒開），背景再更新一份給下次用。網頁本身（html／json）不快取，改版會立刻生效。 */
const V = 'tunein-assets-v19';
const ASSET = /\/tunein\/(models\/|fonts\/|vendor\/|[^/]+\.(webp|png|mp3|woff2|bin|glb))$/i;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => { for (const k of await caches.keys()) if (k !== V && k.startsWith('tunein-assets-')) await caches.delete(k); await self.clients.claim(); })()));
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || !ASSET.test(u.pathname)) return;
  e.respondWith((async () => {
    const c = await caches.open(V), hit = await c.match(r, { ignoreSearch: true });
    const net = fetch(r).then(res => { if (res && res.ok) c.put(r, res.clone()).catch(() => {}); return res; }).catch(() => hit);
    return hit || net;
  })());
});
