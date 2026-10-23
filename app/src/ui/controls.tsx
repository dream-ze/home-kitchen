import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Sheet({
  title, sub, onClose, children, footer,
}: {
  title: ReactNode;
  sub?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <section className="sheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="grabber" aria-hidden="true"><span /></div>
        <div className="sheet-head">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <h2>{title}</h2>
            {sub && <span className="eyebrow">{sub}</span>}
          </div>
          <button className="icon-btn plain" aria-label="关闭" onClick={onClose} style={{ color: 'var(--muted)' }}>
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </section>
    </>
  );
}

export function Stepper({
  value, onChange, min = 1, max = 8, step = 1, format, label, small,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
  label: string;
  small?: boolean;
}) {
  return (
    <div className={'stepper' + (small ? ' small' : '')} role="group" aria-label={label}>
      <button aria-label={`减少${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}>
        −
      </button>
      <span className="val num">{format ? format(value) : value}</span>
      <button aria-label={`增加${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, +(value + step).toFixed(2)))}>
        +
      </button>
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

export function Segmented<T extends string>({
  value, options, onChange, label,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} role="tab" aria-selected={o.key === value} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const TONES = ['t-green', 't-orange', 't-red', 't-blue', 't-yellow', 't-gray'];

/** 没有成品图时的食物色块：浅色底 + 首字 */
export function toneFor(name: string, tags: string[] = []): string {
  const all = name + tags.join('');
  if (/汤/.test(all)) return 't-blue';
  if (/番茄|辣|麻婆|川菜/.test(all)) return 't-red';
  if (/鸡|肉|翅|排骨|牛|猪|鱼|虾/.test(name)) return 't-orange';
  if (/菠菜|青菜|西兰花|黄瓜|白菜|素/.test(all)) return 't-green';
  if (/面|粥|饼|饭$/.test(name)) return 't-yellow';
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

export function FoodTile({ name, tags, url, size = 48 }: { name: string; tags?: string[]; url?: string; size?: number }) {
  return (
    <div className={'tile ' + toneFor(name, tags)} style={{ width: size, height: size }} aria-hidden="true">
      {url ? <img src={url} alt="" /> : name.slice(0, 1)}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', padding: '28px 20px' }}>
      <strong style={{ fontSize: 16 }}>{title}</strong>
      {children}
    </div>
  );
}
