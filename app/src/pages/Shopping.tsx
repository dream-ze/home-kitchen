// P09 购物清单。
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../db/db';
import type { Food, Recipe, ShoppingItem } from '../db/types';
import { useFoodMap, useFoods, useSettings, useToday } from '../data/hooks';
import { getSettings, updateSettings } from '../data/settings';
import { addManualItem, buyAnyway, moveToSection, removeShoppingItem, toggleBought } from '../data/shopping';
import { addDays, weekStart } from '../logic/dates';
import { searchFoods } from '../logic/search';
import { groupByRecipe } from '../logic/shopping';
import { formatAmount } from '../logic/units';
import { GeneratePreviewSheet } from '../sheets/GeneratePreviewSheet';
import { StockInSheet } from '../sheets/StockInSheet';
import { Segmented } from '../ui/controls';
import { buyText, itemName } from '../ui/format';
import { Icon } from '../ui/Icon';
import { TabBar } from '../ui/TabBar';
import { useToast, useToastOffset } from '../ui/Toast';
import { useNavigate } from 'react-router-dom';
import { startScan } from '../data/session';
import { useImagePicker } from '../ui/useImagePicker';
import { useDragDrop, type DragProps } from '../ui/useDragDrop';

export function ShoppingPage() {
  const today = useToday();
  const toast = useToast();
  const settings = useSettings();
  const foods = useFoodMap();
  const foodList = useFoods();
  const items = useLiveQuery(() => db.shopping.toArray(), [], [] as ShoppingItem[]);
  const recipes = useLiveQuery(() => db.recipes.toArray(), [], [] as Recipe[]);
  const stats = useLiveQuery(() => db.purchaseStats.orderBy('foodId').toArray(), [], []);
  const [view, setView] = useState<'section' | 'recipe'>('section');
  const [q, setQ] = useState('');
  const [gen, setGen] = useState(false);
  const [stock, setStock] = useState(false);
  const [haveOpen, setHaveOpen] = useState(false);
  useToastOffset(166);
  const navigate = useNavigate();
  const picker = useImagePicker(async (files) => {
    await startScan(files, 'list');
    navigate('/scan');
  });

  const need = items.filter((i) => !i.bought && i.state === 'need').sort((a, b) => a.createdAt - b.createdAt);
  const bought = items.filter((i) => i.bought).sort((a, b) => (b.boughtAt ?? 0) - (a.boughtAt ?? 0));
  const have = items.filter((i) => !i.bought && i.state === 'have');
  const recipeTitle = (id?: string) => recipes.find((r) => r.id === id)?.title;

  // 长按拖到别的分区（PRD P09）：拖动时把空着的分区也列出来，方便放下
  const dd = useDragDrop<ShoppingItem>({
    canDrop: (item, sec) => sec !== item.section,
    onDrop: async (item, sec) => {
      const undo = await moveToSection(item.id, sec);
      toast(`已把 ${itemName(item, item.foodId ? foods.get(item.foodId) : undefined)} 移到「${sec}」${item.foodId ? '，下次会记住' : ''}`, undo);
    },
  });

  const sections = useMemo(() => {
    const order = settings.sectionOrder;
    const map = new Map<string, ShoppingItem[]>();
    if (dd.dragging) for (const sec of order) map.set(sec, []);
    for (const i of need) map.set(i.section, [...(map.get(i.section) ?? []), i]);
    return [...map.entries()].sort(([a], [b]) => {
      const ra = order.indexOf(a), rb = order.indexOf(b);
      return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
    });
  }, [need, settings.sectionOrder, dd.dragging]);

  // "分错区了？"提示：有待买条目时显示，前 3 次打开后不再显示
  const [sectionHint, setSectionHint] = useState(false);
  const hintCounted = useRef(false);
  const hasNeed = need.length > 0;
  useEffect(() => {
    if (!hasNeed || hintCounted.current) return;
    hintCounted.current = true;
    getSettings().then((s) => {
      const n = s.sectionHintShown ?? 0;
      if (n >= 3) return;
      setSectionHint(true);
      return updateSettings({ sectionHintShown: n + 1 });
    });
  }, [hasNeed]);

  const inList = new Set(need.map((i) => i.foodId).filter(Boolean));
  const frequent = stats
    .filter((s) => !inList.has(s.foodId) && foods.has(s.foodId))
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
    .slice(0, 4);
  const suggestions = q.trim() ? searchFoods(foodList, q, 5) : [];

  async function add(p: { foodId?: string; text?: string }) {
    const undo = await addManualItem(p);
    setQ('');
    const name = p.foodId ? foods.get(p.foodId)?.name : p.text;
    if (!undo) toast(`${name} 已经在清单里了`);
    else toast(`已添加 ${name}`, undo);
  }

  async function toggle(item: ShoppingItem) {
    const undo = await toggleBought(item.id);
    if (!item.bought) toast(`已买 ${itemName(item, item.foodId ? foods.get(item.foodId) : undefined)}`, undo);
  }

  function subText(i: ShoppingItem, food?: Food): { text: string; warn?: boolean } {
    if (i.origin === 'staple') return { text: '常备品 · 你标了“快没了”', warn: true };
    if (i.origin === 'tossed') return { text: '扔掉后再买' };
    if (i.origin === 'recipe') return { text: `做「${recipeTitle(i.sources[0]?.recipeId) ?? '菜谱'}」缺的` };
    if (i.unconvertible) return { text: '单位换算不了，量请自己看着买', warn: true };
    if (i.origin === 'plan' && food && i.have && i.need) {
      return { text: `共需 ${formatAmount(i.need, food.baseUnit)} · 冰箱有 ${formatAmount(i.have, food.baseUnit)}` };
    }
    const names = [...new Set(i.sources.map((s) => recipeTitle(s.recipeId)).filter(Boolean))];
    if (names.length > 2) return { text: `${names.length} 道菜用到` };
    return { text: names.join('、') };
  }

  async function remove(item: ShoppingItem) {
    const undo = await removeShoppingItem(item.id);
    toast(`已删除 ${itemName(item, item.foodId ? foods.get(item.foodId) : undefined)}`, undo);
  }

  const renderRow = (item: ShoppingItem, last: boolean, key: string, draggable = false) => {
    const food = item.foodId ? foods.get(item.foodId) : undefined;
    const drag = draggable ? dd.bind(item, itemName(item, food)) : undefined;
    return <ShopRow key={key} item={item} food={food} sub={subText(item, food)} last={last} onToggle={toggle} onRemove={remove} drag={drag} />;
  };

  const weekEnd = addDays(weekStart(today), 6);

  return (
    <>
      <main className="page with-bar">
        <header className="page-header">
          <div className="heads">
            <span className="eyebrow">已买 {bought.length} / {need.length + bought.length}</span>
            <h1 className="title">购物清单</h1>
          </div>
          <button className="btn pill" onClick={() => setGen(true)}>从菜单生成</button>
        </header>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
          <label className="searchbox">
            <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>+</span>
            <span className="sr-only">添加到购物清单</span>
            <input
              type="text"
              placeholder="添加…  拼音首字母也行，如 xhs"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || !q.trim()) return;
                const exact = foodList.find((f) => f.name === q.trim() || f.aliases.includes(q.trim()));
                add(exact ? { foodId: exact.id } : suggestions[0] && /^[a-z]+$/i.test(q.trim()) ? { foodId: suggestions[0].id } : { text: q.trim() });
              }}
            />
          </label>
          {q.trim() && (
            <div className="card list" style={{ padding: '0 14px' }}>
              {suggestions.map((f) => (
                <button key={f.id} className="row button" style={{ minHeight: 48 }} onClick={() => add({ foodId: f.id })}>
                  <span className="row-main row-title">{f.name}</span>
                  <span className="row-sub">{f.section}</span>
                </button>
              ))}
              {!foodList.some((f) => f.name === q.trim()) && !(/^[a-z]+$/i.test(q.trim()) && suggestions.length > 0) && (
                <button className="row button" style={{ minHeight: 48 }} onClick={() => add({ text: q.trim() })}>
                  <span className="row-main row-title">添加「{q.trim()}」</span>
                  <span className="row-sub">不在食材库里，只记个名字</span>
                </button>
              )}
            </div>
          )}
          {!q && frequent.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span className="hint">常买</span>
              {frequent.map((s) => (
                <button key={s.foodId} className="chip" style={{ minHeight: 32, fontSize: 13 }} onClick={() => add({ foodId: s.foodId })}>
                  + {foods.get(s.foodId)?.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {need.length > 0 && (
          <Segmented label="清单视图" value={view} onChange={setView} options={[{ key: 'section', label: '按分区' }, { key: 'recipe', label: '按菜谱' }]} />
        )}

        {need.length === 0 && bought.length === 0 ? (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', padding: '28px 20px', textAlign: 'center' }}>
            <strong>清单是空的</strong>
            <span className="hint">从本周菜单生成，或者在上面直接添加</span>
            <button className="btn primary" onClick={() => setGen(true)}>从本周菜单生成</button>
          </div>
        ) : need.length === 0 ? (
          <div className="banner ok">都买齐了，点下面的“放进冰箱”记一下吧</div>
        ) : view === 'section' ? (
          <>
            {sections.map(([sec, list]) =>
              list.length === 0 ? (
                <div key={sec} className={'drop-empty' + (dd.over === sec ? ' drop-over' : '')} data-drop={sec}>
                  <span>{sec}</span>
                  <span>放到这里</span>
                </div>
              ) : (
                <section key={sec} className={'card list' + (dd.over === sec ? ' drop-over' : '')} data-drop={sec} style={{ padding: '6px 16px 4px' }}>
                  <h2 className="group-title">{sec}</h2>
                  {list.map((i, idx) => renderRow(i, idx === list.length - 1, i.id, true))}
                </section>
              ),
            )}
            {sectionHint && <span className="hint">分错区了？长按条目拖到别的分区，下次会记住</span>}
          </>
        ) : (
          [...groupByRecipe(need).entries()].map(([rid, list]) => (
            <section key={rid || 'other'} className="card list" style={{ padding: '6px 16px 4px' }}>
              <h2 className="group-title">{recipeTitle(rid) ?? '其他'}</h2>
              {list.map((i, idx) => renderRow(i, idx === list.length - 1, rid + i.id))}
            </section>
          ))
        )}

        {bought.length > 0 && (
          <section className="card list sunken" style={{ padding: '6px 16px 4px' }}>
            <h2 className="group-title" style={{ color: 'var(--ink-2)' }}>已买 {bought.length} 样 · 点一下可以取消</h2>
            {bought.map((i) => {
              const food = i.foodId ? foods.get(i.foodId) : undefined;
              return (
                <button key={i.id} className="row button" style={{ minHeight: 48 }} onClick={() => toggleBought(i.id)}>
                  <span className="check" role="checkbox" aria-checked={true}>✓</span>
                  <span className="row-main struck" style={{ fontSize: 15 }}>{itemName(i, food)}</span>
                  <span className="row-sub">{buyText(i, food).replace(/^买 /, '')}</span>
                </button>
              );
            })}
          </section>
        )}

        {have.length > 0 && (
          <section className="card outlined" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--ink-2)' }}>家里已有 {have.length} 样，没加进清单</h2>
              <button className="btn text" style={{ minHeight: 32, fontSize: 13 }} onClick={() => setHaveOpen((v) => !v)}>{haveOpen ? '收起' : '展开'}</button>
            </div>
            {haveOpen ? (
              <div className="card list" style={{ padding: 0 }}>
                {have.map((i) => (
                  <div key={i.id} className="row" style={{ minHeight: 48 }}>
                    <span className="row-main row-title">{itemName(i, i.foodId ? foods.get(i.foodId) : undefined)}</span>
                    <button className="btn small" onClick={() => buyAnyway(i.id)}>仍然要买</button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="chips" style={{ gap: 6 }}>
                {have.map((i) => <span key={i.id} className="chip soft" style={{ minHeight: 28 }}>{itemName(i, i.foodId ? foods.get(i.foodId) : undefined)}</span>)}
              </div>
            )}
          </section>
        )}
      </main>

      <div className="bottom-bar above-tabs">
        <span className="hint">已买 {bought.length} 样 · 网上买的菜，拍订单截图就能入库</span>
        <div className="bar-row">
          {picker.input}
          <button className="btn" disabled={picker.busy} onClick={picker.open}>
            <Icon name="camera" size={18} />{picker.busy ? '正在处理…' : '拍照入库'}
          </button>
          <button className="btn primary" disabled={bought.length === 0} onClick={() => setStock(true)}>放进冰箱</button>
        </div>
      </div>
      <TabBar />
      {dd.overlay}

      {gen && <GeneratePreviewSheet start={today} end={weekEnd} onClose={() => setGen(false)} />}
      {stock && <StockInSheet items={bought} foods={foods} onClose={() => setStock(false)} />}
    </>
  );
}

function ShopRow({
  item, food, sub, last, onToggle, onRemove, drag,
}: {
  item: ShoppingItem;
  food?: Food;
  sub: { text: string; warn?: boolean };
  last?: boolean;
  onToggle: (i: ShoppingItem) => void;
  onRemove: (i: ShoppingItem) => void;
  /** 长按拖动（只在"按分区"视图） */
  drag?: DragProps;
}) {
  const name = itemName(item, food);
  return (
    <div {...drag} className="row" style={{ minHeight: 58, borderBottom: last ? 'none' : undefined, cursor: 'pointer', ...drag?.style }} onClick={() => onToggle(item)}>
      <button className="check" role="checkbox" aria-checked={false} aria-label={`标记已买 ${name}`} onClick={(e) => { e.stopPropagation(); onToggle(item); }} />
      <span className="row-main">
        <span className="row-title">{name}</span>
        {sub.text && <span className={'row-sub' + (sub.warn ? ' warn' : '')}>{sub.text}</span>}
      </span>
      <span className="row-end num">{buyText(item, food)}</span>
      <button className="x-btn" aria-label={`从清单删除 ${name}`} onClick={(e) => { e.stopPropagation(); onRemove(item); }}>×</button>
    </div>
  );
}
