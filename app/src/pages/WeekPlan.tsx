// P02 一周菜单。
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../db/db';
import { SLOTS, type MealPlanEntry, type Recipe, type Slot } from '../db/types';
import { useFoodMap, useToday } from '../data/hooks';
import { removePlanEntry, setPlanServings } from '../data/plan';
import { previewForRange } from '../data/shopping';
import { addDays, dayNumber, monthDay, weekDates, weekStart, weekdayLabel } from '../logic/dates';
import { recipeNutrition } from '../logic/nutrition';
import { GeneratePreviewSheet } from '../sheets/GeneratePreviewSheet';
import { PickRecipeSheet } from '../sheets/PickRecipeSheet';
import { Sheet, Stepper } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { TabBar } from '../ui/TabBar';
import { useToast, useToastOffset } from '../ui/Toast';

function kShort(n: number): string {
  if (!n) return '空';
  return n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(Math.round(n));
}

export function WeekPlanPage() {
  const today = useToday();
  const foods = useFoodMap();
  const toast = useToast();
  const [offset, setOffset] = useState(0);
  const start = addDays(weekStart(today), offset * 7);
  const days = weekDates(start);
  const end = days[6];
  const [sel, setSel] = useState(today);
  const selected = days.includes(sel) ? sel : offset === 0 ? today : start;
  const entries = useLiveQuery(() => db.plan.where('date').between(start, end, true, true).toArray(), [start, end], [] as MealPlanEntry[]);
  const recipes = useLiveQuery(() => db.recipes.toArray(), [], [] as Recipe[]);
  const preview = useLiveQuery(() => previewForRange(start < today ? today : start, end), [start, end, today], []);
  const [pick, setPick] = useState<Slot | null>(null);
  const [edit, setEdit] = useState<MealPlanEntry | null>(null);
  const [gen, setGen] = useState(false);
  useToastOffset(140);

  const recipeMap = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const perKcal = (id: string) => {
    const r = recipeMap.get(id);
    return r ? recipeNutrition(r, foods).perServing.kcal : 0;
  };
  const dayKcal = (d: string) => entries.filter((e) => e.date === d).reduce((s, e) => s + perKcal(e.recipeId), 0);
  const dayEntries = entries.filter((e) => e.date === selected);
  const missing = preview.filter((l) => l.state === 'need').length;
  const isPast = selected < today;

  return (
    <>
      <main className="page with-bar">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/" className="back-link"><Icon name="back" size={20} />今天</Link>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="icon-btn" aria-label="上一周" onClick={() => setOffset((o) => o - 1)}><Icon name="back" size={18} /></button>
            <button className="icon-btn" aria-label="下一周" onClick={() => setOffset((o) => o + 1)}><Icon name="forward" size={18} /></button>
          </div>
        </div>
        <header className="page-header" style={{ marginTop: -8 }}>
          <div className="heads">
            <span className="eyebrow">{monthDay(start)} – {monthDay(end)} · 已排 {entries.length} 道菜</span>
            <h1 className="title">{offset === 0 ? '本周菜单' : offset === 1 ? '下周菜单' : offset === -1 ? '上周菜单' : '菜单'}</h1>
          </div>
          {offset !== 0 && <button className="btn small" onClick={() => { setOffset(0); setSel(today); }}>回到本周</button>}
        </header>

        <div className="day-strip" role="tablist" aria-label="选择日期">
          {days.map((d) => (
            <button key={d} role="tab" aria-selected={d === selected} className={d === today ? 'today' : ''} onClick={() => setSel(d)}>
              <span className="wd">{weekdayLabel(d)}</span>
              <span className="dn num">{dayNumber(d)}</span>
              <span className="dk num">{kShort(dayKcal(d))}</span>
            </button>
          ))}
        </div>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">{monthDay(selected)} 周{weekdayLabel(selected)}{selected === today ? ' · 今天' : ''}</h2>
            <span className="eyebrow">{dayKcal(selected) ? `每人约 ${Math.round(dayKcal(selected))} kcal` : '还没安排'}</span>
          </div>
          <div className="card list">
            {SLOTS.map((s) => {
              const list = dayEntries.filter((e) => e.slot === s.key).sort((a, b) => a.order - b.order);
              return (
                <div key={s.key} className="row" style={{ alignItems: 'flex-start', padding: '12px 0' }}>
                  <span className="slot-label" style={{ paddingTop: 12 }}>{s.label}</span>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {list.map((e) => {
                      const r = recipeMap.get(e.recipeId);
                      const k = perKcal(e.recipeId);
                      return (
                        <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}>
                          <Link to={`/recipes/${e.recipeId}`} className="row-main" style={{ color: 'inherit' }}>
                            <span className="row-title strong">{r?.title ?? '已删除的菜谱'}</span>
                            {k > 0 && <span className="row-sub">约 {k} kcal / 份</span>}
                          </Link>
                          {e.status === 'cooked' && <span className="badge green">已做</span>}
                          {e.status === 'eaten' && <span className="badge green">已记录</span>}
                          <button className="btn small" style={{ minWidth: 56 }} aria-label={`调整 ${r?.title} 的份数`} onClick={() => setEdit(e)}>
                            {e.servings} 份
                          </button>
                        </div>
                      );
                    })}
                    {!isPast && (
                      <button className="btn dashed" style={{ minHeight: 40, fontSize: 14 }} onClick={() => setPick(s.key)}>
                        {list.length ? '+ 再加一道' : '+ 从菜谱添加'}
                      </button>
                    )}
                    {isPast && list.length === 0 && <span className="hint" style={{ paddingTop: 12 }}>—</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <div className="bottom-bar above-tabs">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>{missing ? `还缺 ${missing} 样食材` : '食材都齐了'}</span>
          <button className="btn primary" onClick={() => setGen(true)}>生成购物清单</button>
        </div>
      </div>
      <TabBar active="/" />

      {pick && <PickRecipeSheet date={selected} slot={pick} onClose={() => setPick(null)} />}
      {gen && <GeneratePreviewSheet start={start < today ? today : start} end={end} onClose={() => setGen(false)} />}
      {edit && (
        <ServingsSheet
          entry={edit}
          title={recipeMap.get(edit.recipeId)?.title ?? ''}
          readOnly={edit.status !== 'planned' || isPast}
          onClose={() => setEdit(null)}
          onRemove={async () => {
            const undo = await removePlanEntry(edit.id);
            setEdit(null);
            toast('已从菜单移除，清单已同步', undo);
          }}
        />
      )}
    </>
  );
}

function ServingsSheet({
  entry, title, readOnly, onClose, onRemove,
}: {
  entry: MealPlanEntry;
  title: string;
  readOnly: boolean;
  onClose: () => void;
  onRemove: () => void;
}) {
  const [v, setV] = useState(entry.servings);
  return (
    <Sheet
      title={title}
      sub={readOnly ? '已经做过或已过去的菜，份数不能再改' : '改份数后，购物清单里对应的量会同步变化'}
      onClose={onClose}
      footer={
        <div className="bar-row">
          <button className="btn danger-text" onClick={onRemove}>从菜单移除</button>
          <button
            className="btn primary"
            disabled={readOnly}
            onClick={async () => {
              await setPlanServings(entry.id, v);
              onClose();
            }}
          >
            保存
          </button>
        </div>
      }
    >
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 16 }}>份数</span>
        {readOnly ? <span>{entry.servings} 份</span> : <Stepper label="份数" value={v} onChange={setV} min={1} max={8} format={(x) => `${x} 份`} />}
      </div>
    </Sheet>
  );
}
