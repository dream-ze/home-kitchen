// S04 做完了：确认扣多少库存、吃了几份（PRD P08，SPEC §5.4）。
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import { SLOTS, type CookSession, type PantryItem, type Recipe, type Slot } from '../db/types';
import { finishCook } from '../data/cook';
import { useFoodMap, useToday } from '../data/hooks';
import { slotByTime } from '../logic/dates';
import { formatKcal, recipeNutrition } from '../logic/nutrition';
import { pantryQty } from '../logic/shopping';
import { recipeConsumption } from '../logic/stock';
import { formatBase, roundQty } from '../logic/units';
import { Segmented, Sheet, Stepper } from '../ui/controls';
import { useToast } from '../ui/Toast';

export function FinishCookSheet({ session, recipe, onClose }: { session: CookSession; recipe: Recipe; onClose: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const today = useToday();
  const foods = useFoodMap();
  const pantry = useLiveQuery(() => db.pantry.toArray(), [], null as PantryItem[] | null);
  const entry = useLiveQuery(() => (session.planEntryId ? db.plan.get(session.planEntryId) : undefined), [session.planEntryId]);
  const consumption = useMemo(() => recipeConsumption(recipe, session.servings, foods), [recipe, session.servings, foods]);
  const [amounts, setAmounts] = useState<Map<string, string> | null>(null);
  const [eaten, setEaten] = useState(1);
  const [slot, setSlot] = useState<Slot>(() => slotByTime());
  const [busy, setBusy] = useState(false);

  // 食材读出来以后，按做菜时的份数填好默认扣减量
  useEffect(() => {
    if (amounts || foods.size === 0) return;
    setAmounts(new Map([...consumption].map(([id, n]) => [id, String(roundQty(n, foods.get(id)?.baseUnit ?? 'g'))])));
  }, [amounts, consumption, foods]);

  if (!pantry || !amounts) return null;

  const rows = [...consumption.keys()].map((id) => ({ id, food: foods.get(id), have: pantryQty(pantry, id) }));
  const inStock = rows.filter((r) => r.have > 0);
  const notInStock = rows.filter((r) => r.have <= 0);
  const skipped = recipe.lines.some((l) => !l.isHeader && (l.noAmount || (l.foodId && foods.get(l.foodId)?.kind === 'staple')));
  const linked = entry?.status === 'planned' ? entry : undefined;
  const kcal = recipeNutrition(recipe, foods).perServing.kcal * eaten;
  const num = (id: string) => {
    const n = Number(amounts.get(id));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const undo = await finishCook({
        session, servingsEaten: eaten, date: today, slot,
        amounts: new Map(inStock.map((r) => [r.id, num(r.id)])),
      });
      navigate('/', { replace: true });
      toast(`已记录 ${recipe.title}${kcal ? ` · 约 ${formatKcal(kcal)} kcal` : ''}`, undo);
    } catch (e) {
      setBusy(false);
      toast(e instanceof Error ? e.message : '没记上，再试一次');
    }
  };

  return (
    <Sheet
      title="做完了"
      sub={`${recipe.title} · 做了 ${session.servings} 份`}
      onClose={onClose}
      footer={<button className="btn primary big block" disabled={busy} onClick={confirm}>确认</button>}
    >
      <section className="section" style={{ gap: 8 }}>
        <h3 className="group-title" style={{ margin: 0 }}>从冰箱扣掉</h3>
        {inStock.length === 0 ? (
          <div className="card"><span className="row-sub">冰箱里没有这道菜要扣的食材</span></div>
        ) : (
          <div className="card list">
            {inStock.map(({ id, food, have }) => {
              const unit = food?.baseUnit ?? 'g';
              const over = num(id) > have + 1e-9;
              return (
                <div key={id} className="row" style={{ minHeight: 56 }}>
                  <div className="row-main">
                    <span className="row-title">{food?.name ?? '未知食材'}</span>
                    <span className={'row-sub' + (over ? ' warn' : '')}>
                      {over ? `冰箱只有 ${formatBase(have, unit)}，扣完为止` : `冰箱有 ${formatBase(have, unit)}`}
                    </span>
                  </div>
                  <input
                    className="input center num"
                    style={{ width: 76 }}
                    inputMode="decimal"
                    aria-label={`${food?.name ?? ''}扣多少`}
                    value={amounts.get(id) ?? ''}
                    onChange={(e) => setAmounts(new Map(amounts).set(id, e.target.value))}
                  />
                  <span style={{ width: 24, fontSize: 14, color: 'var(--muted)' }}>{unit}</span>
                  <button className="x-btn" aria-label={`不扣${food?.name ?? ''}`} onClick={() => setAmounts(new Map(amounts).set(id, '0'))}>×</button>
                </div>
              );
            })}
          </div>
        )}
        {notInStock.length > 0 && (
          <span className="hint">冰箱里没有记录的：{notInStock.map((r) => r.food?.name).filter(Boolean).join('、')}，不扣</span>
        )}
        {skipped && <span className="hint">常备品和"适量"的用料不扣</span>}
      </section>

      <section className="section" style={{ gap: 8 }}>
        <div className="section-head">
          <h3 className="group-title" style={{ margin: 0 }}>你吃了几份</h3>
          <Stepper label="吃了几份" value={eaten} min={0.5} max={4} step={0.5} format={(v) => `${v} 份`} onChange={setEaten} />
        </div>
        {kcal > 0 && <span className="hint">约 {formatKcal(kcal)} kcal，只影响热量记录，不影响扣多少库存</span>}
        {linked ? (
          <span className="hint">
            记到{linked.date === today ? '今天' : linked.date}{SLOTS.find((s) => s.key === linked.slot)?.label}，菜单里这道菜会标成"已做"
          </span>
        ) : (
          <Segmented label="记到哪一餐" value={slot} options={SLOTS} onChange={setSlot} />
        )}
      </section>
    </Sheet>
  );
}
