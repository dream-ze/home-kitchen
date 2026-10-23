// P01 今天。
import { useLiveQuery } from 'dexie-react-hooks';
import { Fragment, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import { SLOTS, type MealLog, type MealPlanEntry, type Recipe, type Slot } from '../db/types';
import { useFoodMap, useSettings, useToday } from '../data/hooks';
import { addToPlan, copyLogs, markEaten, setEatenServings, undoEaten } from '../data/plan';
import { addDays, fullDayLabel, weekdayLabel } from '../logic/dates';
import { daysLeft, expiryShort, expiryStatus } from '../logic/expiry';
import { formatKcal, recipeNutrition } from '../logic/nutrition';
import { expiringUse, sortRecipes } from '../logic/recommend';
import { PickRecipeSheet } from '../sheets/PickRecipeSheet';
import { FoodTile, Sheet, Stepper } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { TabBar } from '../ui/TabBar';
import { useToast } from '../ui/Toast';
import { Onboarding } from './Onboarding';

const DAY = 86400000;

export function TodayPage() {
  const today = useToday();
  const settings = useSettings();
  const foods = useFoodMap();
  const navigate = useNavigate();
  const toast = useToast();
  const recipes = useLiveQuery(() => db.recipes.toArray(), [], null as Recipe[] | null);
  const entries = useLiveQuery(() => db.plan.where('date').equals(today).toArray(), [today], [] as MealPlanEntry[]);
  const logs = useLiveQuery(() => db.mealLogs.where('date').between(addDays(today, -6), today, true, true).toArray(), [today], [] as MealLog[]);
  const pantry = useLiveQuery(() => db.pantry.toArray(), [], []);
  const [pick, setPick] = useState<Slot | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);

  const recipeMap = useMemo(() => new Map((recipes ?? []).map((r) => [r.id, r])), [recipes]);
  const todayLogs = logs.filter((l) => l.date === today);
  const total = todayLogs.reduce((s, l) => s + l.kcal, 0);
  const macro = (k: 'protein' | 'fat' | 'carb') => Math.round(todayLogs.reduce((s, l) => s + l.items.reduce((a, i) => a + (i[k] ?? 0), 0), 0));
  const estimated = todayLogs.filter((l) => l.estimated).length;

  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((d) => ({
    date: d,
    kcal: logs.filter((l) => l.date === d).reduce((s, l) => s + l.kcal, 0),
  }));
  // 今天还没吃完，不算进平均
  const loggedDays = week.filter((d) => d.kcal > 0 && d.date !== today);
  const avg = loggedDays.length ? loggedDays.reduce((s, d) => s + d.kcal, 0) / loggedDays.length : 0;
  const maxK = Math.max(2200, ...week.map((d) => d.kcal));

  const expiring = pantry
    .filter((p) => p.qty != null && p.expiresAt)
    .map((p) => ({ p, status: expiryStatus(p, today, settings.expiryWarnDays), days: daysLeft(p.expiresAt!, today) }))
    .filter((x) => x.status === 'expired' || x.status === 'soon')
    .sort((a, b) => a.days - b.days);
  const expiringIds = new Set(expiring.filter((x) => x.status === 'soon').map((x) => x.p.foodId));
  const useUp = sortRecipes(recipes ?? [], 'expiring', expiringIds).filter((r) => expiringUse(r, expiringIds).length > 0).slice(0, 3);

  const needBackup =
    (recipes?.length ?? 0) > 0 &&
    (!settings.lastBackupAt || Date.now() - settings.lastBackupAt > settings.backupRemindDays * DAY);

  if (recipes === null) return null;
  if (recipes.length === 0 && !settings.onboardingDone) return <Onboarding />;

  return (
    <>
      <main className="page with-tabs">
        <header className="page-header">
          <div className="heads">
            <span className="eyebrow">{fullDayLabel(today)}</span>
            <h1 className="title">今天</h1>
          </div>
          <div className="header-actions">
            <Link to="/week" className="icon-btn" aria-label="打开本周菜单"><Icon name="calendar" /></Link>
            <Link to="/settings" className="icon-btn" aria-label="设置"><Icon name="gear" /></Link>
          </div>
        </header>

        {needBackup && (
          <div className="banner warn">
            <span className="grow">
              {settings.lastBackupAt ? `上次备份是 ${Math.floor((Date.now() - settings.lastBackupAt) / DAY)} 天前` : '还没有备份过'}
              ，数据只存在这台手机上
            </span>
            <button className="btn small warn-outline" onClick={() => navigate('/settings')}>现在备份</button>
          </div>
        )}

        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>今日已记录</span>
            {estimated > 0 && <span className="hint">含 {estimated} 条拍照估算</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 16, color: 'var(--muted)' }}>约</span>
            <span className="kcal-big num">{formatKcal(total)}</span>
            <span style={{ fontSize: 15, color: 'var(--muted)' }}>kcal</span>
          </div>
          {settings.showMacros && (
            <div className="macro-grid">
              <div className="macro"><span>蛋白质</span><span className="num">{macro('protein')} g</span></div>
              <div className="macro"><span>脂肪</span><span className="num">{macro('fat')} g</span></div>
              <div className="macro"><span>碳水</span><span className="num">{macro('carb')} g</span></div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--divider)', paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>近 7 天</span>
              {avg > 0 && <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>平均每天约 {formatKcal(avg)} kcal</span>}
            </div>
            <div className="bars" role="img" aria-label={'近 7 天每天记录的热量：' + week.map((d) => `周${weekdayLabel(d.date)} ${Math.round(d.kcal)}`).join('，')}>
              {week.map((d) => {
                const isToday = d.date === today;
                return (
                  <div className="bar-col" key={d.date}>
                    <div className={'bar' + (isToday ? ' today' : '')} style={{ height: Math.max(4, Math.round((d.kcal / maxK) * 44)) }} />
                    <span className={'lbl' + (isToday ? ' today' : '')}>{isToday ? '今' : weekdayLabel(d.date)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <button className="btn block" onClick={() => setCopyOpen(true)}>复制昨天的记录</button>
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">今日菜单</h2>
            <Link to="/week" style={{ fontSize: 14, minHeight: 44, display: 'flex', alignItems: 'center' }}>本周菜单 ›</Link>
          </div>
          <div className="card list">
            {SLOTS.map((s) => {
              const list = entries.filter((e) => e.slot === s.key).sort((a, b) => a.order - b.order);
              const extra = todayLogs.filter((l) => l.slot === s.key && !l.planEntryId);
              return (
                <div key={s.key} className="row" style={{ alignItems: 'flex-start', padding: '14px 0' }}>
                  <span className="slot-label" style={{ paddingTop: 2 }}>{s.label}</span>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {list.map((e) => (
                      <Fragment key={e.id}>{renderPlanRow(e, recipeMap.get(e.recipeId), todayLogs.find((l) => l.id === e.mealLogId))}</Fragment>
                    ))}
                    {extra.map((l) => (
                      <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="row-main">
                          <span className="row-title strong">{l.items.map((i) => i.name).join(' · ')}</span>
                          <span className="row-sub">约 {formatKcal(l.kcal)} kcal</span>
                        </div>
                        <span className="badge green">已记录</span>
                      </div>
                    ))}
                    {list.length === 0 && extra.length === 0 ? (
                      <button className="btn dashed block" onClick={() => setPick(s.key)}>+ 从菜谱添加</button>
                    ) : (
                      <button className="btn text" style={{ alignSelf: 'flex-start', minHeight: 32, padding: 0, fontSize: 13 }} onClick={() => setPick(s.key)}>
                        + 再加一道
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {expiring.length > 0 && (
          <section className="section">
            <div className="section-head">
              <h2 className="section-title">快过期</h2>
              <Link to="/fridge" style={{ fontSize: 14, minHeight: 44, display: 'flex', alignItems: 'center' }}>冰箱 ›</Link>
            </div>
            <div className="chips">
              {expiring.map(({ p, status, days }) => (
                <Link key={p.id} to="/fridge" className={'chip ' + (status === 'expired' ? 'danger' : 'warn')}>
                  {foods.get(p.foodId)?.name} · {expiryShort(days)}
                </Link>
              ))}
            </div>
            {useUp.length > 0 && (
              <div className="card list">
                <span style={{ fontSize: 13, color: 'var(--muted)', paddingTop: 12 }}>能用掉它们的菜</span>
                {useUp.map((r) => (
                  <div key={r.id} className="row">
                    <Link to={`/recipes/${r.id}`} style={{ display: 'contents', color: 'inherit' }}>
                      <FoodTile name={r.title} tags={r.tags} />
                      <div className="row-main">
                        <span className="row-title strong">{r.title}</span>
                        <span className="row-sub">
                          用掉 {expiringUse(r, expiringIds).map((id) => foods.get(id)?.name).join('、')}
                          {r.timeMin ? ` · ${r.timeMin} 分钟` : ''}
                        </span>
                      </div>
                    </Link>
                    <button
                      className="btn pill"
                      style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                      onClick={async () => {
                        const undo = await addToPlan(today, 'dinner', [r.id]);
                        toast(`已加入今天晚餐`, undo);
                      }}
                    >
                      加入晚餐
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
      <TabBar />
      {pick && <PickRecipeSheet date={today} slot={pick} onClose={() => setPick(null)} />}
      {copyOpen && <CopyYesterdaySheet today={today} onClose={() => setCopyOpen(false)} />}
    </>
  );

  // 渲染函数而不是内嵌组件，避免每次刷新都重建整行
  function renderPlanRow(entry: MealPlanEntry, recipe?: Recipe, log?: MealLog) {
    if (!recipe) return null;
    const per = recipeNutrition(recipe, foods).perServing.kcal;
    if (entry.status === 'planned') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Link to={`/recipes/${recipe.id}`} className="row-main" style={{ color: 'inherit' }}>
            <span className="row-title strong">{recipe.title}</span>
            <span className="row-sub">计划 {entry.servings} 份{per ? ` · 约 ${per} kcal / 份` : ''}</span>
          </Link>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 8 }}>
            <Link to={`/recipes/${recipe.id}`} className="btn">开始做</Link>
            <button
              className="btn primary"
              onClick={async () => {
                await markEaten(entry.id);
                toast(`已记录 ${recipe.title}，库存已扣减`, () => undoEaten(entry.id));
              }}
            >
              ✓ 按计划吃了
            </button>
          </div>
        </div>
      );
    }
    const sv = log?.servingsEaten ?? 1;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link to={`/recipes/${recipe.id}`} className="row-main" style={{ color: 'inherit' }}>
            <span className="row-title strong">{recipe.title}</span>
            <span className="row-sub">计划 {entry.servings} 份</span>
          </Link>
          <span className="badge green">已记录</span>
        </div>
        {log && (
          <div className="eaten-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--ink-2)', flex: 'none' }}>我吃了</span>
              <Stepper small label="份数" value={sv} min={0.5} max={4} step={0.5} format={(v) => `${v} 份`} onChange={(v) => setEatenServings(entry.id, v)} />
              <span className="num" style={{ flex: 1, textAlign: 'right', fontSize: 14, fontWeight: 500, paddingRight: 4 }}>
                约 {formatKcal(log.kcal)} kcal
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="hint">库存已按计划 {entry.servings} 份扣减</span>
              <button className="btn text" style={{ minHeight: 32, fontSize: 13 }} onClick={() => undoEaten(entry.id)}>撤销</button>
            </div>
          </div>
        )}
      </div>
    );
  }
}

function CopyYesterdaySheet({ today, onClose }: { today: string; onClose: () => void }) {
  const toast = useToast();
  const yesterday = addDays(today, -1);
  const logs = useLiveQuery(() => db.mealLogs.where('date').equals(yesterday).toArray(), [yesterday], [] as MealLog[]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const chosen = logs.filter((l) => !off.has(l.id));
  return (
    <Sheet
      title="复制昨天的记录"
      sub="选中的会复制到今天"
      onClose={onClose}
      footer={
        <button
          className="btn primary big block"
          disabled={chosen.length === 0}
          onClick={async () => {
            const undo = await copyLogs(chosen.map((l) => l.id), today);
            onClose();
            toast(`已复制 ${chosen.length} 条到今天`, undo);
          }}
        >
          复制 {chosen.length} 条
        </button>
      }
    >
      {logs.length === 0 ? (
        <div className="card">昨天没有记录</div>
      ) : (
        <div className="card list">
          {logs.map((l) => {
            const on = !off.has(l.id);
            return (
              <button
                key={l.id}
                className="row button"
                onClick={() =>
                  setOff((s) => {
                    const n = new Set(s);
                    if (n.has(l.id)) n.delete(l.id);
                    else n.add(l.id);
                    return n;
                  })
                }
              >
                <span className="check" role="checkbox" aria-checked={on}>{on ? '✓' : ''}</span>
                <span className="row-main">
                  <span className="row-title">{l.items.map((i) => i.name).join(' · ')}</span>
                  <span className="row-sub">{SLOTS.find((s) => s.key === l.slot)?.label} · 约 {formatKcal(l.kcal)} kcal</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
