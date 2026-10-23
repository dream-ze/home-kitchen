// P03 选菜面板。
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import { SLOTS, type Recipe, type Slot } from '../db/types';
import { addToPlan } from '../data/plan';
import { useBlobUrl, useFoodMap, useSettings, useToday } from '../data/hooks';
import { monthDay, weekdayLabel } from '../logic/dates';
import { expiryStatus } from '../logic/expiry';
import { recipeNutrition } from '../logic/nutrition';
import { expiringUse, sortRecipes, type PickSort } from '../logic/recommend';
import { initialsOf, scoreText } from '../logic/search';
import { FoodTile, Segmented, Sheet } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Toast';

const SORTS: { key: PickSort; label: string }[] = [
  { key: 'expiring', label: '用到临期食材' },
  { key: 'recent', label: '最近做过' },
  { key: 'quick', label: '快手' },
  { key: 'all', label: '全部' },
];

function daysAgoText(t?: number): string {
  if (!t) return '';
  const d = Math.floor((Date.now() - t) / 86400000);
  if (d <= 0) return '今天做过';
  if (d === 1) return '昨天做过';
  if (d < 7) return `${d} 天前做过`;
  if (d < 30) return `${Math.floor(d / 7)} 周前做过`;
  return '一个多月前做过';
}

export function PickRecipeSheet({
  date, slot: initialSlot, onClose, initialSort = 'expiring',
}: {
  date: string;
  slot: Slot;
  onClose: () => void;
  initialSort?: PickSort;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const today = useToday();
  const settings = useSettings();
  const foods = useFoodMap();
  const recipes = useLiveQuery(() => db.recipes.toArray(), [], [] as Recipe[]);
  const pantry = useLiveQuery(() => db.pantry.toArray(), [], []);
  const [slot, setSlot] = useState<Slot>(initialSlot);
  const [sort, setSort] = useState<PickSort>(initialSort);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const expiring = useMemo(
    () => new Set(pantry.filter((p) => p.qty != null && ['expired', 'soon'].includes(expiryStatus(p, today, settings.expiryWarnDays))).map((p) => p.foodId)),
    [pantry, today, settings.expiryWarnDays],
  );

  const list = useMemo(() => {
    let rs = recipes;
    if (q.trim()) {
      rs = rs.filter((r) => {
        const names = [r.title, ...r.lines.map((l) => (l.foodId ? foods.get(l.foodId)?.name ?? '' : '')).filter(Boolean)];
        return scoreText(q, names, [initialsOf(r.title)]) > 0;
      });
      return sortRecipes(rs, 'all', expiring);
    }
    return sortRecipes(rs, sort, expiring);
  }, [recipes, q, sort, expiring, foods]);

  const slotLabel = SLOTS.find((s) => s.key === slot)!.label;

  async function confirm() {
    const ids = [...picked];
    const undo = await addToPlan(date, slot, ids);
    onClose();
    toast(`已加入 ${ids.length} 道到${date === today ? '今天' : `周${weekdayLabel(date)}`}${slotLabel}`, undo);
  }

  return (
    <Sheet
      title={`添加到 ${monthDay(date)} 周${weekdayLabel(date)}`}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>已选 {picked.size} 道</span>
            <span className="hint">份数按菜谱默认，加入后可单独改</span>
          </div>
          <button className="btn primary big" style={{ padding: '0 22px' }} disabled={picked.size === 0} onClick={confirm}>
            加入{slotLabel}
          </button>
        </div>
      }
    >
      <Segmented label="餐次" value={slot} options={SLOTS} onChange={setSlot} />
      <label className="searchbox">
        <Icon name="search" size={18} />
        <span className="sr-only">搜索菜谱</span>
        <input type="search" placeholder="搜菜名或食材，拼音首字母也行" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {!q && (
        <div className="chips scroll">
          {SORTS.map((s) => (
            <button key={s.key} className={'chip' + (s.key === sort ? ' on' : '')} aria-pressed={s.key === sort} onClick={() => setSort(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      )}
      {list.length === 0 ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 15 }}>{recipes.length === 0 ? '还没有菜谱' : q ? '没有找到这道菜' : '这个分类下还没有菜'}</span>
          <button className="btn small" onClick={() => navigate('/recipes/new')}>手动新建菜谱</button>
        </div>
      ) : (
        <div className="card list" style={{ padding: '0 14px' }}>
          {list.map((r) => (
            <PickRow
              key={r.id}
              recipe={r}
              on={picked.has(r.id)}
              sub={subText(r)}
              warn={sort === 'expiring' && !q && expiringUse(r, expiring).length > 0}
              toggle={() =>
                setPicked((s) => {
                  const n = new Set(s);
                  if (n.has(r.id)) n.delete(r.id);
                  else n.add(r.id);
                  return n;
                })
              }
            />
          ))}
        </div>
      )}
    </Sheet>
  );

  function subText(r: Recipe): string {
    const use = expiringUse(r, expiring).map((id) => foods.get(id)?.name).filter(Boolean);
    const lead = sort === 'recent' ? daysAgoText(r.lastCookedAt) : use.length ? `用掉 ${use.join('、')}` : daysAgoText(r.lastCookedAt);
    const kcal = recipeNutrition(r, foods).perServing.kcal;
    return [lead, r.timeMin ? `${r.timeMin} 分钟` : '', kcal ? `约 ${kcal} kcal` : ''].filter(Boolean).join(' · ');
  }
}

function PickRow({ recipe, on, sub, warn, toggle }: { recipe: Recipe; on: boolean; sub: string; warn: boolean; toggle: () => void }) {
  const url = useBlobUrl(recipe.coverBlobId);
  return (
    <div className="row" style={{ cursor: 'pointer' }} onClick={toggle}>
      <FoodTile name={recipe.title} tags={recipe.tags} url={url} size={46} />
      <div className="row-main">
        <span className="row-title strong">{recipe.title}</span>
        <span className={'row-sub' + (warn ? ' warn' : '')}>{sub}</span>
      </div>
      <button
        className="radio-check"
        aria-pressed={on}
        aria-label={(on ? '取消选择 ' : '选择 ') + recipe.title}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
      >
        {on ? '✓' : '+'}
      </button>
    </div>
  );
}
