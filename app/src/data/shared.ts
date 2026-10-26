// 安卓"分享到食谱"收到的图片：服务工作线程（public/share-target.js）先放进缓存，#/shared 页再取出来。
const SHARED_CACHE = 'shared-images';

export async function readSharedImages(): Promise<Blob[]> {
  if (!('caches' in window)) return [];
  const cache = await caches.open(SHARED_CACHE);
  const keys = [...(await cache.keys())];
  const index = (r: Request) => Number(new URL(r.url).pathname.split('/').pop());
  keys.sort((a, b) => index(a) - index(b));
  const out: Blob[] = [];
  for (const k of keys) {
    const res = await cache.match(k);
    if (res) out.push(await res.blob());
  }
  return out;
}

export async function clearSharedImages(): Promise<void> {
  if ('caches' in window) await caches.delete(SHARED_CACHE);
}
