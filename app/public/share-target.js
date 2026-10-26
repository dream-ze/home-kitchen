// 安卓"分享到食谱"：系统把图片 POST 到 /share-target，这里在服务工作线程里接住，
// 先存进缓存，再跳到 #/shared 让用户选是菜谱还是买菜小票。由 vite.config.ts 的 workbox.importScripts 引入。
const SHARED_CACHE = 'shared-images';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.pathname !== '/share-target') return;
  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const files = form.getAll('images').filter((f) => f instanceof File && f.type.startsWith('image/'));
        await caches.delete(SHARED_CACHE);
        const cache = await caches.open(SHARED_CACHE);
        await Promise.all(
          files.map((f, i) => cache.put(`/shared-images/${i}`, new Response(f, { headers: { 'content-type': f.type } }))),
        );
      } catch {
        // 读不出来就当没收到，#/shared 页会提示再分享一次
      }
      return Response.redirect(new URL('/#/shared', self.location.origin).href, 303);
    })(),
  );
});
