// P11 冰箱。
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/db';
import { LOCATIONS, type Food, type PantryItem } from '../db/types';
import { useFoodMap, useSettings, useToday } from '../data/hooks';
import { extendPantryItem, removePantryItem, rollbackTxn, setStapleStock } from '../data/pantry';
import { addOriginItem, toggleStaple } from '../data/shopping';
import { daysLeft, expiryLabel, expiryProgress, expiryStatus } from '../logic/expiry';
import { formatAmount } from '../logic/units';
import { FoodPickerSheet } from '../sheets/FoodPickerSheet';
import { PantryEditSheet } from '../sheets/PantryEditSheet';
import { PickRecipeSheet } from '../sheets/PickRecipeSheet';
import { Icon } from '../ui/Icon';
import { TabBar } from '../ui/TabBar';
import { useToast } from '../ui/Toast';
import { useNavigate } from 'react-router-dom';
import { startScan } from '../data/session';
import { useImagePicker } from '../ui/useImagePicker';

export function FridgePage() {
  const today = useToday();
  const toast = useToast();
  const settings = useSettings();
  const foods = useFoodMap();
  const pantry = useLiveQuery(() => db.pantry.toArray(), [], [] as PantryItem[]);
  const [asking, setAsking] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ food: Food; item?: PantryItem } | null>(null);
  const [picker, setPicker] = useState<'any' | 'staple' | null>(null);
  const [findFor, setFindFor] = useState(false);
  const navigate = useNavigate();
  const camera = useImagePicker(async (files) => {
    await startScan(files, 'fridge');
    navigate('/scan');
  });

  const tracked = pantry.filter((p) => p.stock == null && foods.get(p.foodId));
  const staples = [...new Map(pantry.filter((p) => p.stock != null && foods.get(p.foodId)).map((p) => [p.foodId, p])).values()]
    .sort((a, b) => (foods.get(a.foodId)!.name).localeCompare(foods.get(b.foodId)!.name, 'zh'));
  const warn = settings.expiryWarnDays;
  const urgent = tracked.filter((p) => ['expired', 'soon'].includes(expiryStatus(p, today, warn))).length;

  async function used(item: PantryItem, food: Food) {
    const txn = await removePantryItem(item, 'used');
    toast(`${food.name} 记为“用掉了”`, () => rollbackTxn(txn));
  }
  async function tossed(item: PantryItem, food: Food, buy: boolean) {
    setAsking(null);
    const txn = await removePantryItem(item, 'tossed');
    const sid = buy ? await addOriginItem(food.id, 'tossed') : null;
    toast(buy ? `${food.name} 已扔掉，已加进购物清单` : `${food.name} 已扔掉`, async () => {
      await rollbackTxn(txn);
      if (sid) await db.shopping.delete(sid);
    });
  }
  async function extend(item: PantryItem, food: Food) {
    const txn = await extendPantryItem(item, 3);
    toast(`${food.name} 再放 3 天`, () => rollbackTxn(txn));
  }

  return (
    <>
      <main className="page with-tabs">
        <header className="page-header">
          <div className="heads">
            <span className="eyebrow">{tracked.length} 样{urgent ? ` · ${urgent} 样要先用掉` : ''}</span>
            <h1 className="title">冰箱</h1>
          </div>
          <div className="header-actions">
            {camera.input}
            <button className="btn primary pill" disabled={camera.busy} onClick={camera.open}>
              <Icon name="camera" size={18} />{camera.busy ? '处理中…' : '拍照添加'}
            </button>
            <button className="icon-btn" aria-label="手动添加" onClick={() => setPicker('any')}><Icon name="plus" /></button>
          </div>
        </header>

        {tracked.length === 0 && staples.length === 0 && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', textAlign: 'center', padding: '28px 20px' }}>
            <strong>冰箱里还没有东西</strong>
            <span className="hint">买完菜在购物清单里点“放进冰箱”，就会自动记进来</span>
            <button className="btn primary" onClick={() => setPicker('any')}>+ 手动添加</button>
          </div>
        )}

        {LOCATIONS.map((loc) => {
          const list = tracked
            .filter((p) => p.location === loc.key)
            .sort((a, b) => (a.expiresAt ?? '9999') < (b.expiresAt ?? '9999') ? -1 : 1);
          if (list.length === 0) return null;
          return (
            <section key={loc.key} className="card list" style={{ padding: '6px 16px 4px' }}>
              <h2 className="group-title">{loc.label}</h2>
              {list.map((p) => {
                const food = foods.get(p.foodId)!;
                const status = expiryStatus(p, today, warn);
                const days = p.expiresAt ? daysLeft(p.expiresAt, today) : undefined;
                return (
                  <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0', borderBottom: '1px solid var(--divider)' }}>
                    <button
                      className="row button"
                      style={{ minHeight: 28, padding: 0, border: 'none' }}
                      onClick={() => setEdit({ food, item: p })}
                    >
                      <span className="row-main" style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                        <span className="row-title">{food.name}</span>
                        {p.qty != null && <span style={{ color: 'var(--muted)', fontSize: 14 }}>{formatAmount(p.qty, food.baseUnit)}</span>}
                      </span>
                      {status === 'expired' && <span className="badge danger">{expiryLabel(days!)}</span>}
                      {status === 'soon' && <span style={{ fontSize: 14, color: 'var(--warn-ink)', fontWeight: 500 }}>{expiryLabel(days!)}</span>}
                      {status === 'ok' && <span style={{ fontSize: 14, color: 'var(--muted)' }}>{expiryLabel(days!)}</span>}
                      {status === 'none' && <span style={{ fontSize: 14, color: 'var(--faint)' }}>没设到期日</span>}
                    </button>
                    {status !== 'expired' && status !== 'none' && (
                      <div className={'progress' + (status === 'soon' ? ' warn' : '')} aria-hidden="true">
                        <div style={{ width: `${Math.round(expiryProgress(p, today) * 100)}%` }} />
                      </div>
                    )}
                    {status === 'soon' && (
                      <button className="btn text" style={{ alignSelf: 'flex-start', minHeight: 28, padding: 0, fontSize: 13 }} onClick={() => setFindFor(true)}>
                        找能用掉它的菜 ›
                      </button>
                    )}
                    {status === 'expired' && asking !== p.id && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
                        <button className="btn" style={{ minHeight: 40, fontSize: 14, borderRadius: 10 }} onClick={() => used(p, food)}>用掉了</button>
                        <button className="btn" style={{ minHeight: 40, fontSize: 14, borderRadius: 10 }} onClick={() => setAsking(p.id)}>扔掉了</button>
                        <button className="btn" style={{ minHeight: 40, fontSize: 14, borderRadius: 10 }} onClick={() => extend(p, food)}>再放 3 天</button>
                      </div>
                    )}
                    {asking === p.id && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg)', borderRadius: 10, padding: '10px 12px' }}>
                        <span style={{ fontSize: 14 }}>{food.name}扔掉了。要再买吗？</span>
                        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 8 }}>
                          <button className="btn primary" style={{ minHeight: 40, fontSize: 14, borderRadius: 10 }} onClick={() => tossed(p, food, true)}>加进购物清单</button>
                          <button className="btn" style={{ minHeight: 40, fontSize: 14, borderRadius: 10 }} onClick={() => tossed(p, food, false)}>不用了</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}

        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>常备品</h2>
            <span className="hint">标“快没了”会自动加进购物清单</span>
          </div>
          <div className="staple-grid">
            {staples.map((p) => {
              const food = foods.get(p.foodId)!;
              const low = p.stock === 'low';
              return (
                <button
                  key={p.id}
                  aria-pressed={low}
                  aria-label={`${food.name}：${low ? '快没了' : '有'}，点一下切换`}
                  onClick={async () => {
                    const undo = await toggleStaple(food.id, low ? 'have' : 'low');
                    toast(low ? `${food.name} 改为“有”` : `${food.name} 已加进购物清单`, undo);
                  }}
                >
                  <span style={{ fontSize: 14 }}>{food.name}</span>
                  <span className="s">{low ? '快没了' : '有'}</span>
                </button>
              );
            })}
            <button aria-label="添加常备品" style={{ borderStyle: 'dashed', borderColor: 'var(--dashed)', fontSize: 20, color: 'var(--muted)' }} onClick={() => setPicker('staple')}>+</button>
          </div>
        </section>
      </main>
      <TabBar />

      {picker && (
        <FoodPickerSheet
          title={picker === 'staple' ? '添加常备品' : '添加到冰箱'}
          stapleOnly={picker === 'staple'}
          onClose={() => setPicker(null)}
          onPick={async (f) => {
            setPicker(null);
            if (f.kind === 'staple') {
              const txn = await setStapleStock(f.id, 'have');
              toast(`已添加常备品 ${f.name}`, () => rollbackTxn(txn));
            } else {
              setEdit({ food: f });
            }
          }}
        />
      )}
      {edit && <PantryEditSheet food={edit.food} item={edit.item} onClose={() => setEdit(null)} />}
      {findFor && <PickRecipeSheet date={today} slot="dinner" initialSort="expiring" onClose={() => setFindFor(false)} />}
    </>
  );
}
