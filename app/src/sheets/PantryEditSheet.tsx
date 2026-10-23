// S06 冰箱手动添加 / 编辑一样食材。
import { useState } from 'react';
import { LOCATIONS, type Food, type Location, type PantryItem } from '../db/types';
import { useToday } from '../data/hooks';
import { addPantryItem, removePantryItem, rollbackTxn, updatePantryItem } from '../data/pantry';
import { monthDay } from '../logic/dates';
import { daysLeft, defaultExpiry } from '../logic/expiry';
import { Sheet } from '../ui/controls';
import { useToast } from '../ui/Toast';
import { DateEditor } from './StockInSheet';

export function PantryEditSheet({ food, item, onClose }: { food: Food; item?: PantryItem; onClose: () => void }) {
  const today = useToday();
  const toast = useToast();
  const [qty, setQty] = useState(item?.qty != null ? String(Math.round(item.qty * 10) / 10) : String(food.purchaseUnit?.toBase ?? (food.baseUnit === '个' ? 1 : 100)));
  const [location, setLocation] = useState<Location>(item?.location ?? food.defaultLocation);
  const [expiresAt, setExpiresAt] = useState<string | undefined>(item ? item.expiresAt : defaultExpiry(food, food.defaultLocation, today));
  const [custom, setCustom] = useState(!!item);
  const d = expiresAt ? daysLeft(expiresAt, today) : undefined;

  async function save() {
    const q = Math.max(0, Number(qty) || 0);
    if (item) {
      const txn = await updatePantryItem(item, { ...item, qty: q, location, expiresAt });
      toast(`已更新 ${food.name}`, () => rollbackTxn(txn));
    } else {
      const txn = await addPantryItem({ foodId: food.id, qty: q, location, expiresAt });
      toast(`已放进冰箱 ${food.name}`, () => rollbackTxn(txn));
    }
    onClose();
  }

  return (
    <Sheet
      title={item ? food.name : `添加 ${food.name}`}
      onClose={onClose}
      footer={
        <div className="bar-row">
          {item ? (
            <button
              className="btn danger-text"
              onClick={async () => {
                const txn = await removePantryItem(item, 'manual');
                onClose();
                toast(`已删除 ${food.name}`, () => rollbackTxn(txn));
              }}
            >
              删除
            </button>
          ) : (
            <button className="btn" onClick={onClose}>取消</button>
          )}
          <button className="btn primary" onClick={save}>保存</button>
        </div>
      }
    >
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label className="field">
          数量（{food.baseUnit}）
          <input className="input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <div className="field">
          放在
          <div className="seg" role="radiogroup" aria-label="存放位置">
            {LOCATIONS.map((l) => (
              <button
                key={l.key}
                role="radio"
                aria-checked={location === l.key}
                onClick={() => {
                  setLocation(l.key);
                  if (!custom) setExpiresAt(defaultExpiry(food, l.key, today));
                }}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          到期日
          <span style={{ fontSize: 15, color: d != null && d <= 3 ? 'var(--warn-ink)' : 'var(--ink)' }}>
            {expiresAt ? `${monthDay(expiresAt)}（${d != null && d < 0 ? `已过期 ${-d} 天` : `还能放 ${d} 天`}）` : '不设到期日'}
          </span>
          <DateEditor today={today} value={expiresAt} onChange={(v) => { setExpiresAt(v); setCustom(true); }} />
        </div>
      </div>
    </Sheet>
  );
}
