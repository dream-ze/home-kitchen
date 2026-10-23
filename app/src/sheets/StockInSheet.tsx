// P10 入库确认：存放位置和到期日自动预填，切换位置后重新计算（SPEC §5.3）。
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LOCATIONS, type Food, type Location, type ShoppingItem } from '../db/types';
import { useToday } from '../data/hooks';
import { stockIn } from '../data/shopping';
import { monthDay } from '../logic/dates';
import { daysLeft, defaultExpiry, parseShorthand } from '../logic/expiry';
import { Sheet } from '../ui/controls';
import { useToast } from '../ui/Toast';

interface Row {
  item: ShoppingItem;
  food?: Food;
  qty: string;
  location: Location;
  expiresAt?: string;
  custom: boolean;
  editing: boolean;
}

function defaultQty(item: ShoppingItem, food: Food): number {
  if (item.qty != null && item.qty > 0) {
    // 按购买单位买的，入库数量按整包算
    if (food.purchaseUnit) return Math.ceil(item.qty / food.purchaseUnit.toBase - 1e-9) * food.purchaseUnit.toBase;
    return Math.round(item.qty * 10) / 10;
  }
  return food.purchaseUnit?.toBase ?? (food.baseUnit === '个' ? 1 : 100);
}

export interface StockInOptions {
  /** 哪些条目真实存在于购物清单里；拍照入库时清单外的东西是临时条目 */
  listIds?: Set<string>;
  /** 拍照识别出的实际数量（基础单位），优先于清单上的数量 */
  qtyOverride?: Map<string, number>;
  source?: 'list' | 'scan';
  /** 确认入库前要做的额外改动（比如清单里只买到一部分），返回它的撤销 */
  prepare?: () => Promise<(() => Promise<void>) | void>;
}

/** foods 由父页面传入：弹层刚打开时自己的查询还没返回，初始值会算错 */
export function StockInSheet({
  items, foods, onClose, options = {},
}: {
  items: ShoppingItem[];
  foods: Map<string, Food>;
  onClose: () => void;
  options?: StockInOptions;
}) {
  const today = useToday();
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>(() =>
    items.map((item) => {
      const food = item.foodId ? foods.get(item.foodId) : undefined;
      const location = food?.defaultLocation ?? 'fridge';
      return {
        item, food, location, custom: false, editing: false,
        qty: food && food.kind === 'tracked' ? String(Math.round((options.qtyOverride?.get(item.id) ?? defaultQty(item, food)) * 10) / 10) : '',
        expiresAt: food ? defaultExpiry(food, location, today) : undefined,
      };
    }),
  );
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setLoc = (i: number, loc: Location) => {
    const r = rows[i];
    set(i, { location: loc, expiresAt: r.custom || !r.food ? r.expiresAt : defaultExpiry(r.food, loc, today) });
  };
  const tracked = rows.filter((r) => r.food?.kind === 'tracked');
  const count = rows.filter((r) => r.food).length;

  return (
    <Sheet
      title="放进冰箱"
      sub="位置和到期日已按食材填好，核对一下就行"
      onClose={onClose}
      footer={
        <>
          <span className="hint">改过的位置会记住，下次买同一种食材自动套用</span>
          <button
            className="btn primary big block"
            onClick={async () => {
              const extraUndo = await options.prepare?.();
              const undo = await stockIn(
                rows.map((r) => ({ item: r.item, qty: r.food?.kind === 'tracked' ? Math.max(0, Number(r.qty) || 0) : undefined, location: r.location, expiresAt: r.expiresAt })),
                { source: options.source, listIds: options.listIds },
              );
              onClose();
              navigate('/fridge', { replace: options.source === 'scan' });
              toast(`已放进冰箱 ${count} 样`, async () => {
                await undo();
                await extraUndo?.();
              });
            }}
          >
            放进冰箱（{count} 样）
          </button>
        </>
      }
    >
      {tracked.length > 3 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="eyebrow">全部改为</span>
          {LOCATIONS.slice(0, 2).map((l) => (
            <button key={l.key} className="chip" onClick={() => rows.forEach((r, i) => r.food?.kind === 'tracked' && setLoc(i, l.key))}>{l.label}</button>
          ))}
        </div>
      )}
      {rows.map((r, i) => {
        if (!r.food) {
          return (
            <div key={r.item.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14 }}>
              <span className="row-main"><span className="row-title">{r.item.text}</span><span className="row-sub">不是食材，买到后直接从清单移除</span></span>
            </div>
          );
        }
        if (r.food.kind === 'staple') {
          return (
            <div key={r.item.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14 }}>
              <span className="row-main"><span className="row-title strong">{r.food.name}</span><span className="row-sub">常备品，不记数量和到期日</span></span>
              <span className="badge green">标记为 有</span>
            </div>
          );
        }
        const d = r.expiresAt ? daysLeft(r.expiresAt, today) : undefined;
        return (
          <div key={r.item.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 14px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 17, fontWeight: 500 }}>{r.food.name}</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--muted)' }}>
                数量
                <input className="input center" style={{ width: 72, minHeight: 38 }} inputMode="decimal" value={r.qty} onChange={(e) => set(i, { qty: e.target.value })} />
                {r.food.baseUnit}
              </label>
            </div>
            <div className="seg" role="radiogroup" aria-label="存放位置">
              {LOCATIONS.map((l) => (
                <button key={l.key} role="radio" aria-checked={r.location === l.key} onClick={() => setLoc(i, l.key)}>{l.label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontSize: 14, color: d != null && d <= 3 ? 'var(--warn-ink)' : 'var(--ink-2)' }}>
                {r.expiresAt ? `还能放 ${d} 天 · ${monthDay(r.expiresAt)} 到期` : '不设到期日'}
              </span>
              <button className="btn small" onClick={() => set(i, { editing: !r.editing })}>{r.editing ? '完成' : '改日期'}</button>
            </div>
            {r.editing && <DateEditor today={today} value={r.expiresAt} onChange={(v) => set(i, { expiresAt: v, custom: true })} />}
          </div>
        );
      })}
    </Sheet>
  );
}

/** S03 改日期：预设按钮、简写、日期选择器 */
export function DateEditor({ today, value, onChange }: { today: string; value?: string; onChange: (v?: string) => void }) {
  const [text, setText] = useState('');
  const presets: [string, string][] = [['+3d', '+3 天'], ['+1w', '+1 周'], ['+2w', '+2 周'], ['+1m', '+1 月']];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="chips" style={{ gap: 6 }}>
        {presets.map(([k, label]) => (
          <button key={k} className="chip" style={{ minHeight: 32, fontSize: 13 }} onClick={() => onChange(parseShorthand(k, today) ?? undefined)}>{label}</button>
        ))}
        <button className="chip" style={{ minHeight: 32, fontSize: 13 }} onClick={() => onChange(undefined)}>不设</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input
          className="input"
          placeholder="或输入 +5d / 10天"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const v = parseShorthand(e.target.value, today);
            if (v) onChange(v);
          }}
        />
        <input className="input" type="date" aria-label="到期日" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} />
      </div>
    </div>
  );
}
