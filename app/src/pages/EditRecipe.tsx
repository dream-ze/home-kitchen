// P07 编辑菜谱（也是新建菜谱）。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../db/db';
import type { Food, Recipe } from '../db/types';
import { useBlobUrl, useFoodMap, useFoods } from '../data/hooks';
import { deleteRecipe, newRecipe, saveImage, saveRecipe } from '../data/recipes';
import { findFoodByName, scoreFood, searchFoods } from '../logic/search';
import { detectTimerSec, formatDuration, parseIngredientBlock } from '../logic/text';
import { FoodPickerSheet } from '../sheets/FoodPickerSheet';
import { Sheet, Stepper } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Toast';

interface DraftLine {
  key: number;
  isHeader: boolean;
  text: string; // 分组名，或者没匹配到食材时的名称
  foodId?: string;
  qty: string;
  unit: string;
}

let seq = 0;
const nextKey = () => ++seq;

function toDraft(r: Recipe, foods: Map<string, Food>): DraftLine[] {
  return r.lines.map((l) => ({
    key: nextKey(),
    isHeader: l.isHeader,
    text: l.isHeader ? l.originalText : l.foodId ? foods.get(l.foodId)?.name ?? '' : l.originalText,
    foodId: l.foodId,
    qty: l.qty != null ? String(l.qty) : '',
    unit: l.unit ?? '',
  }));
}

export function EditRecipePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const foods = useFoods();
  const foodMap = useFoodMap();
  const [base, setBase] = useState<Recipe | null>(null);
  const [title, setTitle] = useState('');
  const [servings, setServings] = useState(2);
  const [timeMin, setTimeMin] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [steps, setSteps] = useState<string[]>(['']);
  const [note, setNote] = useState('');
  const [source, setSource] = useState('');
  const [cover, setCover] = useState<string | undefined>();
  const [dirty, setDirty] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const coverUrl = useBlobUrl(cover);

  useEffect(() => {
    if (base || foodMap.size === 0) return;
    (async () => {
      const r = id ? await db.recipes.get(id) : undefined;
      const rec = r ?? newRecipe();
      setBase(rec);
      setTitle(rec.title);
      setServings(rec.servings);
      setTimeMin(rec.timeMin ? String(rec.timeMin) : '');
      setTags(rec.tags);
      setLines(r ? toDraft(rec, foodMap) : [{ key: nextKey(), isHeader: false, text: '', qty: '', unit: '' }]);
      setSteps(rec.steps.length ? rec.steps.map((s) => s.text) : ['']);
      setNote(rec.note ?? '');
      setSource(rec.source ?? '');
      setCover(rec.coverBlobId);
    })();
  }, [id, base, foodMap]);

  const touch = <T,>(fn: (v: T) => void) => (v: T) => {
    setDirty(true);
    fn(v);
  };
  const updateLine = (key: number, patch: Partial<DraftLine>) => {
    setDirty(true);
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };
  const removeLine = (key: number) => {
    setDirty(true);
    setLines((ls) => ls.filter((l) => l.key !== key));
  };

  const pickingLine = useMemo(() => lines.find((l) => l.key === picking), [lines, picking]);

  if (!base) return null;
  const isNew = !id;

  async function save() {
    const recipe: Recipe = {
      ...base!,
      title: title.trim(),
      servings,
      timeMin: Number(timeMin) > 0 ? Number(timeMin) : undefined,
      tags,
      coverBlobId: cover,
      note: note.trim() || undefined,
      source: source.trim() || undefined,
      lines: lines
        .filter((l) => (l.isHeader ? l.text.trim() : l.foodId || l.text.trim()))
        .map((l) => {
          if (l.isHeader) return { originalText: l.text.trim(), isHeader: true, noAmount: false };
          const q = parseFloat(l.qty);
          const noAmount = !(q > 0);
          const name = l.foodId ? foodMap.get(l.foodId)?.name ?? l.text : l.text.trim();
          return {
            foodId: l.foodId,
            qty: noAmount ? undefined : q,
            unit: noAmount ? undefined : l.unit.trim() || undefined,
            originalText: `${name} ${noAmount ? '适量' : `${q}${l.unit.trim()}`}`,
            noAmount,
            isHeader: false,
          };
        }),
      steps: steps.map((s) => s.trim()).filter(Boolean).map((text) => ({ text, timerSec: detectTimerSec(text) })),
    };
    await saveRecipe(recipe);
    toast(isNew ? '已收藏' : '已保存');
    navigate(`/recipes/${recipe.id}`, { replace: true });
  }

  function cancel() {
    if (dirty && !confirm('放弃这次的修改？')) return;
    if (history.length > 1) navigate(-1);
    else navigate(isNew ? '/recipes' : `/recipes/${id}`);
  }

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) touch(setTags)([...tags, t]);
    setTagInput('');
  }

  return (
    <>
      <header className="navbar">
        <button className="nav-btn" onClick={cancel}>取消</button>
        <h1>{isNew ? '新建菜谱' : '编辑菜谱'}</h1>
        <button className="nav-btn end" disabled={!title.trim()} onClick={save}>保存</button>
      </header>

      <main className="page" style={{ paddingTop: 12, gap: 16 }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              touch(setCover)(await saveImage(f));
            } catch {
              toast('这张图片读不出来，换一张试试');
            }
          }}
        />
        {coverUrl ? (
          <div style={{ position: 'relative', height: 160, borderRadius: 18, overflow: 'hidden' }}>
            <img src={coverUrl} alt="成品图" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', right: 10, bottom: 10, display: 'flex', gap: 8 }}>
              <button className="btn small" onClick={() => fileRef.current?.click()}>更换</button>
              <button className="btn small" onClick={() => touch(setCover)(undefined)}>删除</button>
            </div>
          </div>
        ) : (
          <button className="btn" style={{ height: 120, flexDirection: 'column', borderStyle: 'dashed', borderColor: 'var(--dashed)', borderRadius: 18, color: 'var(--muted)', fontSize: 14 }} onClick={() => fileRef.current?.click()}>
            <Icon name="image" size={26} />添加成品图（可选）
          </button>
        )}

        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="field">
            菜名
            <input className="input" style={{ fontSize: 17, fontWeight: 500 }} value={title} placeholder="比如：可乐鸡翅" onChange={(e) => touch(setTitle)(e.target.value)} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10, alignItems: 'end' }}>
            <div className="field">
              份数
              <Stepper label="份数" value={servings} onChange={touch(setServings)} min={1} max={12} format={(v) => `${v} 人份`} />
            </div>
            <label className="field">
              用时（分钟）
              <input className="input" inputMode="numeric" value={timeMin} onChange={(e) => touch(setTimeMin)(e.target.value.replace(/\D/g, ''))} />
            </label>
          </div>
          <div className="field">
            标签
            <div className="chips" style={{ gap: 6 }}>
              {tags.map((t) => (
                <button key={t} className="chip soft" aria-label={`移除标签 ${t}`} onClick={() => touch(setTags)(tags.filter((x) => x !== t))}>
                  {t} ×
                </button>
              ))}
              <input
                className="input"
                style={{ width: 120, minHeight: 32, borderRadius: 999, borderStyle: 'dashed', fontSize: 13 }}
                placeholder="+ 标签"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTag()}
                onBlur={addTag}
              />
            </div>
          </div>
        </section>

        <section className="section" style={{ gap: 8 }}>
          <div className="section-head">
            <h2 className="section-title" style={{ fontSize: 18 }}>用料</h2>
            <button className="btn text" onClick={() => setPasteOpen(true)}>整段粘贴</button>
          </div>
          <span className="hint" style={{ marginTop: -4 }}>数量空着就是“适量”</span>
          <div className="card" style={{ padding: '10px 10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lines.map((l) =>
              l.isHeader ? (
                <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <input
                    className="input"
                    aria-label="分组名"
                    style={{ border: 'none', borderBottom: '1px solid var(--line)', borderRadius: 0, fontWeight: 700, fontSize: 14, color: 'var(--ink-2)' }}
                    value={l.text}
                    placeholder="分组名，比如：调料"
                    onChange={(e) => updateLine(l.key, { text: e.target.value })}
                  />
                  <button className="x-btn" aria-label="删除分组" onClick={() => removeLine(l.key)}>×</button>
                </div>
              ) : (
                <div key={l.key} className="line-grid">
                  <input className="input center" aria-label="数量" inputMode="decimal" placeholder="适量" value={l.qty} onChange={(e) => updateLine(l.key, { qty: e.target.value })} />
                  <input className="input center" aria-label="单位" placeholder="单位" value={l.unit} onChange={(e) => updateLine(l.key, { unit: e.target.value })} />
                  <button className={'food-btn' + (!l.foodId && l.text ? ' empty' : '')} onClick={() => setPicking(l.key)}>
                    {l.foodId ? foodMap.get(l.foodId)?.name : l.text ? `${l.text} · 选择 ›` : <span style={{ color: 'var(--faint)' }}>食材</span>}
                  </button>
                  <button className="x-btn" aria-label="删除这一行" onClick={() => removeLine(l.key)}>×</button>
                </div>
              ),
            )}
            <div className="bar-row" style={{ marginTop: 4 }}>
              <button className="btn dashed center" style={{ color: 'var(--ink)' }} onClick={() => { setDirty(true); setLines((ls) => [...ls, { key: nextKey(), isHeader: false, text: '', qty: '', unit: '' }]); }}>
                + 添加用料
              </button>
              <button className="btn dashed center" onClick={() => { setDirty(true); setLines((ls) => [...ls, { key: nextKey(), isHeader: true, text: '', qty: '', unit: '' }]); }}>
                + 添加分组
              </button>
            </div>
          </div>
        </section>

        <section className="section" style={{ gap: 8 }}>
          <h2 className="section-title" style={{ fontSize: 18 }}>步骤</h2>
          {steps.map((s, i) => {
            const sec = detectTimerSec(s);
            return (
              <div key={i} className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="step-no">{i + 1}</span>
                  <button className="x-btn" style={{ height: 32 }} aria-label={`删除步骤 ${i + 1}`} onClick={() => touch(setSteps)(steps.filter((_, j) => j !== i))}>×</button>
                </div>
                <textarea
                  className="textarea"
                  rows={2}
                  aria-label={`步骤 ${i + 1}`}
                  value={s}
                  onChange={(e) => touch(setSteps)(steps.map((x, j) => (j === i ? e.target.value : x)))}
                />
                {sec && (
                  <span className="badge green" style={{ alignSelf: 'flex-start', display: 'flex', gap: 4, alignItems: 'center' }}>
                    <Icon name="clock" size={14} strokeWidth={2} />识别到 {formatDuration(sec)}，做菜时可一键计时
                  </span>
                )}
              </div>
            );
          })}
          <button className="btn dashed center" style={{ color: 'var(--ink)' }} onClick={() => touch(setSteps)([...steps, ''])}>+ 添加步骤</button>
        </section>

        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="field">
            我的笔记
            <textarea className="textarea" rows={2} placeholder="比如：冰糖少放一点刚好" value={note} onChange={(e) => touch(setNote)(e.target.value)} />
          </label>
          <label className="field">
            来源（可选）
            <input className="input" placeholder="链接、书名或“妈妈的做法”" value={source} onChange={(e) => touch(setSource)(e.target.value)} />
          </label>
        </section>

        {!isNew && (
          <button
            className="btn danger-text"
            onClick={async () => {
              if (!confirm(`删除「${title || base.title}」？菜单里还没做的这道菜也会一起移除。`)) return;
              await deleteRecipe(base.id);
              toast('已删除');
              navigate('/recipes', { replace: true });
            }}
          >
            删除这道菜谱
          </button>
        )}
      </main>

      {pickingLine && (
        <FoodPickerSheet
          initialQuery={pickingLine.foodId ? '' : pickingLine.text}
          onClose={() => setPicking(null)}
          onPick={(f) => {
            updateLine(pickingLine.key, { foodId: f.id, text: f.name, unit: pickingLine.unit || (f.baseUnit === '个' ? '个' : f.baseUnit) });
            setPicking(null);
          }}
        />
      )}
      {pasteOpen && (
        <PasteSheet
          onClose={() => setPasteOpen(false)}
          onDone={(parsed) => {
            setDirty(true);
            setLines((ls) => [...ls.filter((l) => l.isHeader || l.foodId || l.text.trim()), ...parsed]);
            setPasteOpen(false);
          }}
          foods={foods}
        />
      )}
    </>
  );
}

function PasteSheet({ onClose, onDone, foods }: { onClose: () => void; onDone: (l: DraftLine[]) => void; foods: Food[] }) {
  const [text, setText] = useState('');
  const parsed = parseIngredientBlock(text);
  function match(name: string): Food | undefined {
    const exact = findFoodByName(foods, name);
    if (exact) return exact;
    const best = searchFoods(foods, name, 1)[0];
    return best && scoreFood(best, name) >= 60 ? best : undefined;
  }
  return (
    <Sheet
      title="整段粘贴用料"
      sub="每行一样，或用逗号、顿号隔开"
      onClose={onClose}
      footer={
        <button
          className="btn primary big block"
          disabled={parsed.length === 0}
          onClick={() =>
            onDone(
              parsed.map((p) => {
                const f = match(p.name);
                return { key: nextKey(), isHeader: false, text: f?.name ?? p.name, foodId: f?.id, qty: p.qty != null ? String(p.qty) : '', unit: p.unit ?? '' };
              }),
            )
          }
        >
          加入 {parsed.length} 样用料
        </button>
      }
    >
      <textarea className="textarea" rows={7} placeholder={'鸡翅中 8个\n可乐 330ml\n生抽 2勺\n葱 适量'} value={text} onChange={(e) => setText(e.target.value)} />
      {parsed.length > 0 && (
        <div className="card list">
          {parsed.map((p, i) => {
            const f = match(p.name);
            return (
              <div key={i} className="row" style={{ minHeight: 44 }}>
                <span className="row-main row-title">{p.name}</span>
                <span className="num">{p.noAmount ? '适量' : `${p.qty} ${p.unit ?? ''}`}</span>
                {f ? <span className="badge green">已匹配</span> : <span className="badge warn">待选择</span>}
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
