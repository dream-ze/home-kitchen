// 原图缩略图，点开全屏看（可以双指放大）。
import { useState } from 'react';
import { useBlobUrl } from '../data/hooks';

function Thumb({ id, label, onOpen, active }: { id: string; label: string; onOpen: (url: string) => void; active?: boolean }) {
  const url = useBlobUrl(id);
  return (
    <button
      aria-label={`放大查看${label}`}
      onClick={() => url && onOpen(url)}
      style={{
        width: 72, height: 96, flex: 'none', borderRadius: 12, overflow: 'hidden', padding: 0,
        border: active ? '2px solid var(--accent)' : '1px solid var(--line)', background: '#E9ECE6',
      }}
    >
      {url && <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
    </button>
  );
}

export function Thumbs({ ids }: { ids: string[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
        {ids.map((id, i) => <Thumb key={id} id={id} label={`第 ${i + 1} 张图`} onOpen={setOpen} active={i === 0} />)}
      </div>
      {open && (
        <div
          role="dialog"
          aria-label="原图"
          onClick={() => setOpen(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'pinch-zoom' }}
        >
          <img src={open} alt="原图" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          <span style={{ position: 'absolute', top: 'calc(16px + var(--safe-top))', right: 20, color: '#fff', fontSize: 14 }}>点一下关闭</span>
        </div>
      )}
    </>
  );
}
