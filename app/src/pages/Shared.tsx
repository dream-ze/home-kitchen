// 安卓"分享到食谱"的落地页：收到几张图，问一句这是什么，再交给截图导入或拍照入库。
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clearSharedImages, readSharedImages } from '../data/shared';
import { aiBlocker, MAX_IMAGES, startImageImport, startScan } from '../data/session';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Toast';

type Target = 'recipe' | 'list' | 'fridge';

const TARGETS: { key: Target; icon: string; title: string; sub: string }[] = [
  { key: 'recipe', icon: 'book', title: '菜谱截图', sub: '识别成一道菜谱' },
  { key: 'list', icon: 'cart', title: '小票 / 买菜订单', sub: '对照购物清单，买到的放进冰箱' },
  { key: 'fridge', icon: 'fridge', title: '买回来的东西的照片', sub: '认出是什么，放进冰箱' },
];

export function SharedPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [images, setImages] = useState<Blob[] | null>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [blocker, setBlocker] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    readSharedImages()
      .then((all) => setImages(all.slice(0, MAX_IMAGES)))
      .catch(() => setImages([]));
    aiBlocker().then(setBlocker);
  }, []);

  useEffect(() => {
    if (!images) return;
    const list = images.map((b) => URL.createObjectURL(b));
    setUrls(list);
    return () => list.forEach((u) => URL.revokeObjectURL(u));
  }, [images]);

  async function go(target: Target) {
    if (!images?.length) return;
    const why = await aiBlocker();
    if (why) {
      setBlocker(why);
      return;
    }
    setBusy(true);
    try {
      if (target === 'recipe') await startImageImport(images);
      else await startScan(images, target);
      await clearSharedImages();
      navigate(target === 'recipe' ? '/import' : '/scan', { replace: true });
    } catch (err) {
      toast('图片读不出来，换一张试试：' + String((err as Error).message ?? err));
      setBusy(false);
    }
  }

  if (!images) return null;

  return (
    <main className="page" style={{ gap: 18 }}>
      <Link to="/" className="back-link"><Icon name="back" size={20} />今天</Link>
      <h1 className="title" style={{ marginTop: -10 }}>{images.length ? `收到 ${images.length} 张图片` : '没收到图片'}</h1>

      {!images.length ? (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
          可能是刚装好、应用还没准备好。回到相册再分享一次试试。
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
            {urls.map((u, i) => (
              <img
                key={u}
                src={u}
                alt={`第 ${i + 1} 张图`}
                style={{ width: 72, height: 96, flex: 'none', borderRadius: 12, objectFit: 'cover', border: '1px solid var(--line)', background: '#E9ECE6' }}
              />
            ))}
          </div>

          {blocker && (
            <div className="banner warn">
              <Icon name="alert" />
              <span className="grow">{blocker}</span>
              {blocker.includes('设置') && <Link to="/settings" className="btn small">去设置</Link>}
            </div>
          )}

          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 style={{ margin: 0, padding: '0 4px', fontSize: 14 }}>这是什么？</h2>
            <div className="card list">
              {TARGETS.map((t) => (
                <button key={t.key} className="row button" disabled={busy} onClick={() => go(t.key)}>
                  <span style={{ color: 'var(--accent)' }}><Icon name={t.icon} /></span>
                  <span className="row-main">
                    <span className="row-title strong">{t.title}</span>
                    <span className="row-sub">{t.sub}</span>
                  </span>
                  <Icon name="forward" size={18} />
                </button>
              ))}
            </div>
            {blocker?.includes('设置') && <span className="hint" style={{ padding: '0 4px' }}>填好口令后，回到相册再分享一次。</span>}
          </section>
        </>
      )}
    </main>
  );
}
