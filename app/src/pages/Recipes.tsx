// P04 菜谱。
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import type { Food, PantryItem, Recipe } from '../db/types';
import { useBlobUrl, useFoodMap } from '../data/hooks';
import { lineStock } from '../data/recipes';
import { recipeNutrition } from '../logic/nutrition';
import { initialsOf, scoreText } from '../logic/search';
import { toneFor } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { TabBar } from '../ui/TabBar';
import { startImageImport } from '../data/session';
import { PasteTextSheet } from '../sheets/PasteTextSheet';
import { useImagePicker } from '../ui/useImagePicker';

type Filter = 'all' | 'cooked' | 'new' | 'quick' | 'canmake' | `tag:${string}`;

/** "冰箱现有能做"：计量用料缺的不超过 1 样（SPEC §5.8） */
function canMake(r: Recipe, foods: Map<string, Food>, pantry: PantryItem[]): boolean {
  let miss = 0;
  for (const l of r.lines) {
    if (l.isHeader || !l.foodId) continue;
    const f = foods.get(l.foodId);
    if (!f || f.kind === 'staple') continue;
    if (lineStock(l, 1, f, pantry).state === 'miss') miss++;
  }
  return miss <= 1;
}

export function RecipesPage() {
  const navigate = useNavigate();
  const foods = useFoodMap();
  const recipes = useLiveQuery(() => db.recipes.toArray(), [], [] as Recipe[]);
  const pantry = useLiveQuery(() => db.pantry.toArray(), [], []);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [paste, setPaste] = useState(false);
  const picker = useImagePicker(async (files) => {
    await startImageImport(files);
    navigate('/import');
  });

  const tags = useMemo(() => [...new Set(recipes.flatMap((r) => r.tags))].filter((t) => t !== '快手').slice(0, 8), [recipes]);
  const list = useMemo(() => {
    let rs = [...recipes].sort((a, b) => b.updatedAt - a.updatedAt);
    if (filter === 'cooked') rs = rs.filter((r) => r.cookedCount > 0);
    else if (filter === 'new') rs = rs.filter((r) => r.cookedCount === 0);
    else if (filter === 'quick') rs = rs.filter((r) => (r.timeMin ?? 999) <= 15 || r.tags.includes('快手'));
    else if (filter === 'canmake') rs = rs.filter((r) => canMake(r, foods, pantry));
    else if (filter.startsWith('tag:')) rs = rs.filter((r) => r.tags.includes(filter.slice(4)));
    if (q.trim()) {
      rs = rs.filter((r) => {
        const names = [r.title, ...r.lines.map((l) => (l.foodId ? foods.get(l.foodId)?.name ?? '' : l.originalText)), ...r.tags];
        return scoreText(q, names.filter(Boolean), [initialsOf(r.title)]) > 0;
      });
    }
    return rs;
  }, [recipes, filter, q, foods, pantry]);

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'cooked', label: '做过' },
    { key: 'new', label: '没做过' },
    { key: 'quick', label: '快手' },
    { key: 'canmake', label: '冰箱现有能做' },
    ...tags.map((t) => ({ key: `tag:${t}` as Filter, label: t })),
  ];

  return (
    <>
      <main className="page with-tabs">
        <header className="page-header">
          <div className="heads">
            <span className="eyebrow">已收藏 {recipes.length} 道</span>
            <h1 className="title">菜谱</h1>
          </div>
        </header>

        <label className="searchbox">
          <Icon name="search" size={20} />
          <span className="sr-only">搜索菜谱</span>
          <input type="search" placeholder="搜菜名或食材，比如“鸡蛋”" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          {picker.input}
          <button className="btn primary" style={{ height: 84, flexDirection: 'column', borderRadius: 16, fontSize: 14 }} disabled={picker.busy} onClick={picker.open}>
            <Icon name="image" size={24} />{picker.busy ? '正在处理…' : '截图导入'}
          </button>
          <button className="btn" style={{ height: 84, flexDirection: 'column', borderRadius: 16, fontSize: 14 }} onClick={() => setPaste(true)}>
            <Icon name="clipboard" size={24} />粘贴文字
          </button>
          <Link to="/recipes/new" className="btn" style={{ height: 84, flexDirection: 'column', borderRadius: 16, fontSize: 14 }}>
            <Icon name="pen" size={24} />手动新建
          </Link>
        </div>

        {recipes.length > 0 && (
          <div className="chips scroll">
            {filters.map((f) => (
              <button key={f.key} className={'chip' + (f.key === filter ? ' on' : '')} aria-pressed={f.key === filter} onClick={() => setFilter(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
        )}

        {recipes.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: 'var(--muted)' }}>先收藏第一道菜</div>
        ) : list.length === 0 ? (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <span>没有符合条件的菜</span>
            <button className="btn small" onClick={() => { setFilter('all'); setQ(''); }}>清除筛选</button>
          </div>
        ) : (
          <div className="recipe-grid">
            {list.map((r) => (
              <RecipeCard key={r.id} recipe={r} kcal={recipeNutrition(r, foods).perServing.kcal} onOpen={() => navigate(`/recipes/${r.id}`)} />
            ))}
          </div>
        )}
      </main>
      <TabBar />
      {paste && <PasteTextSheet onClose={() => setPaste(false)} />}
    </>
  );
}

function RecipeCard({ recipe, kcal, onOpen }: { recipe: Recipe; kcal: number; onOpen: () => void }) {
  const url = useBlobUrl(recipe.coverBlobId);
  return (
    <button className="recipe-card" onClick={onOpen}>
      <div className={'cover ' + toneFor(recipe.title, recipe.tags)}>
        {url ? <img src={url} alt="" /> : recipe.title.slice(0, 1)}
        {recipe.timeMin ? <span className="time">{recipe.timeMin} 分钟</span> : null}
      </div>
      <div className="body">
        <span style={{ fontSize: 16, fontWeight: 500 }}>{recipe.title}</span>
        <span className="row-sub">{recipe.servings} 人份{kcal ? ` · 约 ${kcal} kcal/份` : ''}</span>
        <span className="row-sub" style={{ color: recipe.cookedCount ? 'var(--accent-ink)' : 'var(--muted)' }}>
          {recipe.cookedCount ? `做过 ${recipe.cookedCount} 次` : '还没做过'}
        </span>
      </div>
    </button>
  );
}
