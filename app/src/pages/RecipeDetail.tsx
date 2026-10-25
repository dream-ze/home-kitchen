// P05 菜谱详情。
import { useLiveQuery } from 'dexie-react-hooks';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { db } from '../db/db';
import { SLOTS, type Recipe, type Slot } from '../db/types';
import { startCook, useCookSession } from '../data/cook';
import { useBlobUrl, useFoodMap, useToday } from '../data/hooks';
import { addToPlan } from '../data/plan';
import { addMissingToShopping, lineStock } from '../data/recipes';
import { amountText, lineName } from '../logic/cook';
import { addDays, monthDay, toISODate, weekdayLabel } from '../logic/dates';
import { recipeNutrition } from '../logic/nutrition';
import { splitTimeSegments } from '../logic/text';
import { Segmented, Sheet, Stepper, toneFor } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { useToast, useToastOffset } from '../ui/Toast';
import { Thumbs } from '../ui/Thumbs';

/** 步骤里出现的用料名高亮并带上用量；时长用橙色高亮 */
function StepText({ text, terms }: { text: string; terms: { term: string; amount: string }[] }) {
  const sorted = [...terms].sort((a, b) => b.term.length - a.term.length);
  const out: ReactNode[] = [];
  const used = new Set<string>();
  let rest = text;
  let key = 0;
  const pushPlain = (s: string) =>
    splitTimeSegments(s).forEach((seg) =>
      out.push(seg.time ? <span key={key++} className="hl time">{seg.text}</span> : <Fragment key={key++}>{seg.text}</Fragment>),
    );
  while (rest) {
    let best: { idx: number; t: (typeof sorted)[number] } | null = null;
    for (const t of sorted) {
      const idx = rest.indexOf(t.term);
      if (idx >= 0 && (!best || idx < best.idx)) best = { idx, t };
    }
    if (!best) {
      pushPlain(rest);
      break;
    }
    pushPlain(rest.slice(0, best.idx));
    const after = rest.slice(best.idx + best.t.term.length);
    // 同一种用料只在第一次出现时带用量；原文后面已经写了数字就不再重复
    const showAmount = !used.has(best.t.term) && !/^\s*[\d一二两三四五六七八九十半]/.test(after) && best.t.amount !== '适量';
    used.add(best.t.term);
    out.push(
      <span key={key++} className="hl">
        {best.t.term}
        {showAmount ? ` ${best.t.amount}` : ''}
      </span>,
    );
    rest = after;
  }
  return <>{out}</>;
}

export function RecipeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const foods = useFoodMap();
  const recipe = useLiveQuery(() => db.recipes.get(id ?? ''), [id], null as Recipe | null | undefined);
  const pantry = useLiveQuery(() => db.pantry.toArray(), [], []);
  const cover = useBlobUrl(recipe?.coverBlobId);
  const [servings, setServings] = useState<number | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  // 从今天页的菜单进来时带着菜单条目，份数默认用菜单上的
  const entryId = useSearchParams()[0].get('entry') ?? undefined;
  const entry = useLiveQuery(() => (entryId ? db.plan.get(entryId) : undefined), [entryId], null);
  const cooking = useCookSession();
  useToastOffset(92);
  useEffect(() => {
    if (recipe && servings == null && entry !== null) setServings(entry?.recipeId === recipe.id ? entry.servings : recipe.servings);
  }, [recipe, servings, entry]);

  if (recipe === null) return null;
  if (!recipe) {
    return (
      <main className="page">
        <button className="back-link btn text" onClick={() => navigate('/recipes')}><Icon name="back" size={20} />菜谱</button>
        <div className="card">这道菜谱已经被删除了</div>
      </main>
    );
  }

  const sv = servings ?? recipe.servings;
  const k = recipe.servings > 0 ? sv / recipe.servings : 1;
  const n = recipeNutrition(recipe, foods);
  const missing: string[] = [];
  const terms: { term: string; amount: string }[] = [];
  for (const l of recipe.lines) {
    if (l.isHeader) continue;
    const f = l.foodId ? foods.get(l.foodId) : undefined;
    if (lineStock(l, k, f, pantry).state === 'miss' && f) missing.push(f.name);
    if (f) for (const t of [f.name, ...f.aliases]) terms.push({ term: t, amount: amountText(l, k) });
  }
  const lastCooked = recipe.lastCookedAt ? monthDay(toISODate(new Date(recipe.lastCookedAt))) : '';
  const meta = [
    recipe.timeMin ? `${recipe.timeMin} 分钟` : '',
    recipe.difficulty ?? '',
    recipe.cookedCount ? `做过 ${recipe.cookedCount} 次${lastCooked ? ` · 上次 ${lastCooked}` : ''}` : '还没做过',
  ].filter(Boolean);

  return (
    <>
      <div className={'hero ' + toneFor(recipe.title, recipe.tags)}>
        {cover ? <img src={cover} alt={recipe.title} /> : recipe.title.slice(0, 1)}
        <button className="icon-btn" style={{ left: 16 }} aria-label="返回" onClick={() => (history.length > 1 ? navigate(-1) : navigate('/recipes'))}>
          <Icon name="back" size={20} />
        </button>
        <button className="icon-btn" style={{ right: 16 }} aria-label="编辑菜谱" onClick={() => navigate(`/recipes/${recipe.id}/edit`)}>
          <Icon name="pen" size={20} />
        </button>
      </div>

      <main className="page detail-body with-bar" style={{ paddingTop: 18, paddingBottom: 'calc(110px + var(--safe-bottom))' }}>
        <header style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1 className="title" style={{ fontSize: 28 }}>{recipe.title}</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', fontSize: 13, color: 'var(--muted)' }}>
            {meta.map((m) => <span key={m}>{m}</span>)}
          </div>
          {recipe.tags.length > 0 && (
            <div className="chips" style={{ gap: 6 }}>
              {recipe.tags.map((t) => <span key={t} className="badge gray">{t}</span>)}
            </div>
          )}
        </header>

        {n.perServing.kcal > 0 && (
          <section className="card" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1fr', gap: 8, padding: '14px 16px' }}>
            <Cell label="每份约" value={`${n.perServing.kcal} kcal`} big />
            <Cell label="蛋白质" value={`${n.perServing.protein} g`} />
            <Cell label="脂肪" value={`${n.perServing.fat} g`} />
            <Cell label="碳水" value={`${n.perServing.carb} g`} />
            {n.missing && <span className="hint" style={{ gridColumn: '1 / -1' }}>部分食材没有营养数据，未计入</span>}
          </section>
        )}

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">用料</h2>
            <Stepper label="份数" value={sv} onChange={setServings} min={1} max={8} format={(v) => `${v} 人份`} />
          </div>
          <div className="card list">
            {recipe.lines.length === 0 && <div className="row"><span className="row-sub">还没有填用料</span></div>}
            {recipe.lines.map((l, i) => {
              if (l.isHeader) return <h3 key={i} className="group-title">{l.originalText}</h3>;
              const f = l.foodId ? foods.get(l.foodId) : undefined;
              const st = lineStock(l, k, f, pantry).state;
              return (
                <div key={i} className="row" style={{ minHeight: 48 }}>
                  <span className="row-main row-title">{lineName(l, f)}</span>
                  <span className="num" style={{ fontSize: 15, color: 'var(--ink-2)' }}>{amountText(l, k)}</span>
                  {st === 'have' && <span className="badge green" style={{ width: 56, textAlign: 'center' }}>冰箱有</span>}
                  {st === 'staple' && <span className="badge gray" style={{ width: 56, textAlign: 'center' }}>常备</span>}
                  {st === 'miss' && <span className="badge warn" style={{ width: 56, textAlign: 'center' }}>缺</span>}
                  {st === 'none' && <span style={{ width: 56 }} />}
                </div>
              );
            })}
          </div>
          {missing.length > 0 && (
            <div className="banner warn" style={{ padding: '10px 10px 10px 16px' }}>
              <span className="grow">还缺 {[...new Set(missing)].join('、')}</span>
              <button
                className="btn warn-outline"
                onClick={async () => {
                  const { count, undo } = await addMissingToShopping(recipe, sv);
                  toast(count ? `已加 ${count} 样到购物清单` : '这些已经在购物清单里了', count ? undo : undefined);
                }}
              >
                加进购物清单
              </button>
            </div>
          )}
        </section>

        {recipe.steps.length > 0 && (
          <section className="section">
            <h2 className="section-title">步骤</h2>
            <ol className="card list" style={{ margin: 0, listStyle: 'none' }}>
              {recipe.steps.map((s, i) => (
                <li key={i} className="step-row">
                  <span className="step-no">{i + 1}</span>
                  <span style={{ flex: 1 }}><StepText text={s.text} terms={terms} /></span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {recipe.note && (
          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--muted)' }}>我的笔记</h2>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{recipe.note}</p>
          </section>
        )}
        {recipe.source && <span className="hint" style={{ padding: '0 2px' }}>来源：{recipe.source}{recipe.sourceBlobIds.length ? ' · 点图片查看原图' : ''}</span>}
        {recipe.sourceBlobIds.length > 0 && <Thumbs ids={recipe.sourceBlobIds} />}
      </main>

      <div className="bottom-bar at-bottom">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
          <button className="btn big" style={{ fontWeight: 400 }} onClick={() => setPlanOpen(true)}>加入菜单</button>
          <button
            className="btn primary big"
            onClick={async () => {
              if (cooking?.recipeId === recipe.id) return navigate('/cook');
              if (cooking) return setConflictOpen(true);
              await startCook(recipe.id, sv, entry?.recipeId === recipe.id ? entry.id : undefined);
              navigate('/cook');
            }}
          >
            <Icon name="play" size={20} />{cooking?.recipeId === recipe.id ? '继续做' : '开始做'}
          </button>
        </div>
      </div>

      {planOpen && <AddToPlanSheet recipe={recipe} servings={sv} onClose={() => setPlanOpen(false)} />}
      {conflictOpen && cooking && (
        <CookConflictSheet
          cookingId={cooking.recipeId}
          step={cooking.stepIndex + 1}
          onContinue={() => navigate('/cook')}
          onReplace={async () => {
            await startCook(recipe.id, sv, entry?.recipeId === recipe.id ? entry.id : undefined);
            navigate('/cook');
          }}
          onClose={() => setConflictOpen(false)}
        />
      )}
    </>
  );
}

/** 正在做别的菜时又点了"开始做" */
function CookConflictSheet({
  cookingId, step, onContinue, onReplace, onClose,
}: {
  cookingId: string;
  step: number;
  onContinue: () => void;
  onReplace: () => void;
  onClose: () => void;
}) {
  const title = useLiveQuery(async () => (await db.recipes.get(cookingId))?.title, [cookingId]) ?? '';
  return (
    <Sheet title="还有一道菜没做完" sub={`${title} · 做到第 ${step} 步`} onClose={onClose}>
      <button className="btn primary big block" onClick={onContinue}>继续做{title}</button>
      <button className="btn big block" onClick={onReplace}>不做它了，开始做这道</button>
    </Sheet>
  );
}

function Cell({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</span>
      <span className="num" style={{ fontSize: big ? 18 : 16, fontWeight: big ? 700 : 500 }}>{value}</span>
    </div>
  );
}

function AddToPlanSheet({ recipe, servings, onClose }: { recipe: Recipe; servings: number; onClose: () => void }) {
  const today = useToday();
  const toast = useToast();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState<Slot>('dinner');
  return (
    <Sheet
      title="加入菜单"
      sub={`${recipe.title} · ${servings} 份`}
      onClose={onClose}
      footer={
        <button
          className="btn primary big block"
          onClick={async () => {
            const undo = await addToPlan(date, slot, [recipe.id], servings);
            onClose();
            toast(`已加入${date === today ? '今天' : `周${weekdayLabel(date)}`}${SLOTS.find((s) => s.key === slot)?.label}`, undo);
          }}
        >
          加入
        </button>
      }
    >
      <div className="chips">
        {days.map((d) => (
          <button key={d} className={'chip' + (d === date ? ' on' : '')} aria-pressed={d === date} onClick={() => setDate(d)}>
            {d === today ? '今天' : d === addDays(today, 1) ? '明天' : `周${weekdayLabel(d)}`} {monthDay(d).replace(/^\d+月/, '')}
          </button>
        ))}
      </div>
      <Segmented label="餐次" value={slot} options={SLOTS} onChange={setSlot} />
    </Sheet>
  );
}
