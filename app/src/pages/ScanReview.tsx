// P15 拍照识别 · 核对：小票、订单截图、实物照片 → 对上购物清单 → 入库确认（SPEC §5.9）。
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import type { Food, ShoppingItem } from '../db/types';
import { ai, errorText, type AiGroceries } from '../data/ai';
import { useFoodMap, useFoods } from '../data/hooks';
import { discardImages } from '../data/images';
import { createFoodFromAi } from '../data/recipes';
import { takeScanSession, type ScanSession } from '../data/session';
import { uid } from '../logic/id';
import { matchFoodName, matchScan, scanQtyBase, type ScanRow } from '../logic/match';
import { formatAmount } from '../logic/units';
import { FoodPickerSheet } from '../sheets/FoodPickerSheet';
import { StockInSheet, type StockInOptions } from '../sheets/StockInSheet';
import { Thumbs } from '../ui/Thumbs';
import { useToast, useToastOffset } from '../ui/Toast';

const SOURCE_LABEL: Record<AiGroceries['sourceType'], string> = {
  receipt: '超市小票',
  order: '买菜应用订单',
  photo: '实物照片',
};
const SOURCE_HINT: Record<AiGroceries['sourceType'], string> = {
  receipt: '小票的数量通常比较准',
  order: '订单截图的数量通常最准',
  photo: '实物照片只能数件数，到期日按默认天数估算',
};

export function ScanReviewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const foods = useFoods();
  const foodMap = useFoodMap();
  const shopping = useLiveQuery(() => db.shopping.toArray(), [], null as ShoppingItem[] | null);
  const [session] = useState<ScanSession | null>(takeScanSession);
  const [phase, setPhase] = useState<'loading' | 'error' | 'done'>('loading');
  const [error, setError] = useState('');
  const [result, setResult] = useState<AiGroceries | null>(null);
  const [rows, setRows] = useState<ScanRow[] | null>(null);
  const [missing, setMissing] = useState<ShoppingItem[]>([]);
  const [picking, setPicking] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [stock, setStock] = useState<{ items: ShoppingItem[]; foods: Map<string, Food>; options: StockInOptions } | null>(null);
  const abort = useRef<AbortController | null>(null);
  useToastOffset(110);

  async function run() {
    if (!session) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setPhase('loading');
    setRows(null);
    try {
      const r = await ai.recognizeGroceries(session.images.map((i) => i.base64), ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (r.items.length === 0) throw new Error('这张图里没找到商品');
      setResult(r);
      setPhase('done');
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(errorText(e));
      setPhase('error');
    }
  }

  useEffect(() => {
    if (!session) {
      navigate(-1);
      return;
    }
    run();
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!result || rows || !shopping || foods.length === 0) return;
    const m = matchScan(result.items, foods, shopping, session!.mode);
    setRows(m.rows);
    setMissing(m.missing);
  }, [result, rows, shopping, foods, session]);

  const imageIds = useMemo(() => session?.images.map((i) => i.blobId) ?? [], [session]);
  if (!session) return null;

  const list = rows?.filter((r) => r.group === 'list') ?? [];
  const extra = rows?.filter((r) => r.group === 'extra') ?? [];
  const unsure = rows?.filter((r) => r.group === 'uncertain') ?? [];
  const count = rows?.filter((r) => r.include).length ?? 0;
  const update = (key: number, patch: Partial<ScanRow>) => setRows((rs) => rs!.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const listItem = (r: ScanRow) => (r.shoppingItemId ? shopping?.find((i) => i.id === r.shoppingItemId) : undefined);

  async function cancel() {
    if (phase === 'done' && !confirm('放弃这次识别？')) return;
    abort.current?.abort();
    await discardImages(imageIds);
    navigate(-1);
  }

  /** 准备入库：没见过的食材让 AI 新建；清单里只买到一部分的，剩下的留在清单里 */
  async function next() {
    if (!rows) return;
    setBusy(true);
    try {
      const all = await db.foods.toArray();
      const map = new Map(all.map((f) => [f.id, f]));
      const current = await db.shopping.toArray();
      const items: ShoppingItem[] = [];
      const listIds = new Set<string>();
      const qtyOverride = new Map<string, number>();
      const partials: { item: ShoppingItem; left: number }[] = [];
      for (const r of rows.filter((x) => x.include)) {
        let food = r.foodId ? map.get(r.foodId) : undefined;
        if (!food) {
          food = matchFoodName(all, r.name) ?? (await createFoodFromAi(r.name.trim() || r.rawName));
          all.push(food);
          map.set(food.id, food);
        }
        const base = scanQtyBase(r, food);
        const li = r.shoppingItemId ? current.find((i) => i.id === r.shoppingItemId) : undefined;
        if (li && li.qty != null && base != null && base < li.qty - 1e-9) {
          const v: ShoppingItem = { ...li, id: uid('v_'), qty: base, sources: [] };
          items.push(v);
          qtyOverride.set(v.id, base);
          partials.push({ item: li, left: li.qty - base });
        } else if (li) {
          items.push(li);
          listIds.add(li.id);
          if (base != null) qtyOverride.set(li.id, base);
        } else {
          const v: ShoppingItem = {
            id: uid('v_'), foodId: food.id, qty: base ?? undefined, unit: food.baseUnit, section: food.section, sources: [],
            state: 'need', bought: true, origin: 'scan', createdAt: Date.now(),
          };
          items.push(v);
          if (base != null) qtyOverride.set(v.id, base);
        }
      }
      if (items.length === 0) {
        toast('没有要放进冰箱的东西');
        return;
      }
      setStock({
        items,
        foods: map,
        options: {
          listIds,
          qtyOverride,
          source: 'scan',
          prepare: async () => {
            await db.shopping.bulkPut(partials.map((p) => ({ ...p.item, qty: p.left })));
            await discardImages(imageIds); // 图片只用来识别，入库后不保存
            return async () => {
              await db.shopping.bulkPut(partials.map((p) => p.item));
            };
          },
        },
      });
    } finally {
      setBusy(false);
    }
  }

  function qtyText(r: ScanRow) {
    return [r.qty, r.unit].filter(Boolean).join(' ') || '数量未知';
  }

  // 渲染函数而不是内嵌组件：内嵌组件每次刷新都会重建，输入框会丢焦点
  function renderRow(r: ScanRow, kind: 'list' | 'extra' | 'uncertain') {
    const li = listItem(r);
    const food = r.foodId ? foodMap.get(r.foodId) : undefined;
    const base = food ? scanQtyBase(r, food) : null;
    const short = li?.qty != null && base != null && base < li.qty - 1e-9 && food;
    if (kind === 'uncertain') {
      return (
        <div key={r.key} style={{ background: 'var(--warn-soft)', borderRadius: 14, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--warn-ink-2)' }}>原文“{r.rawName}”，认成了下面这样，对吗？</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 60px 56px', gap: 6 }}>
            <button className={'food-btn' + (r.foodId ? '' : ' empty')} onClick={() => setPicking(r.key)}>{r.name} ›</button>
            <input className="input center warn" aria-label="数量" inputMode="decimal" value={r.qty} onChange={(e) => update(r.key, { qty: e.target.value })} />
            <input className="input center warn" aria-label="单位" value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value })} />
          </div>
          {renderToggle(r)}
        </div>
      );
    }
    return (
      <div key={r.key} className="row" style={{ minHeight: 58, alignItems: 'center' }}>
        {kind === 'list' && <span className="check" role="img" aria-label="已对上清单" aria-checked={true}>✓</span>}
        <button className="row-main" style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: 'inherit' }} onClick={() => setPicking(r.key)}>
          <span className="row-title" style={{ color: r.include ? 'var(--ink)' : 'var(--muted)' }}>{r.name} · {qtyText(r)}</span>
          <span className={'row-sub' + (short ? ' warn' : '')}>
            {kind === 'list' && li && food
              ? li.qty != null
                ? short
                  ? `清单要 ${formatAmount(li.qty, food.baseUnit)}，还差 ${formatAmount(li.qty - (base ?? 0), food.baseUnit)} 会留在清单里`
                  : `清单要 ${formatAmount(li.qty, food.baseUnit)}`
                : '清单里的'
              : !r.isFood
                ? '非食品 · 默认不放进冰箱'
                : r.foodId
                  ? `原文“${r.rawName}”`
                  : '食材库里还没有，放进冰箱时会自动新建'}
          </span>
        </button>
        {kind === 'extra' && renderToggle(r)}
      </div>
    );
  }

  function renderToggle(r: ScanRow) {
    return (
      <button
        role="checkbox"
        aria-checked={r.include}
        aria-label={(r.include ? '不放进冰箱 ' : '放进冰箱 ') + r.name}
        className="btn small"
        style={r.include ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff', alignSelf: 'flex-start' } : { alignSelf: 'flex-start' }}
        onClick={() => update(r.key, { include: !r.include })}
      >
        {r.include ? '✓ 放进冰箱' : '放进冰箱'}
      </button>
    );
  }

  const pickingRow = rows?.find((r) => r.key === picking);

  return (
    <>
      <header className="navbar">
        <button className="nav-btn" onClick={cancel}>取消</button>
        <h1>核对识别结果</h1>
        <span />
      </header>

      <main className="page" style={{ paddingTop: 10, gap: 14, paddingBottom: 'calc(130px + var(--safe-bottom))' }}>
        <section className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12 }}>
          <Thumbs ids={imageIds} />
          {phase === 'done' && result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <span className="badge green" style={{ alignSelf: 'flex-start' }}>识别为：{SOURCE_LABEL[result.sourceType]}</span>
              <span className="hint">共 {result.items.length} 样 · {SOURCE_HINT[result.sourceType]}</span>
            </div>
          )}
        </section>

        {phase === 'loading' && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ fontSize: 15 }}>正在识别买了什么…</span>
            {[75, 55, 65].map((w, i) => <div key={i} style={{ height: 14, width: `${w}%`, borderRadius: 7, background: 'var(--track)' }} />)}
            <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={cancel}>取消</button>
          </div>
        )}

        {phase === 'error' && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <strong style={{ fontSize: 16 }}>这张图没认出来</strong>
            <span style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6 }}>{error}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn primary" onClick={run}>再试一次</button>
              <button className="btn" onClick={async () => { await discardImages(imageIds); navigate('/fridge', { replace: true }); }}>改用手动添加</button>
            </div>
          </div>
        )}

        {phase === 'done' && rows && (
          <>
            <div role="status" className="chips" style={{ gap: 6 }}>
              {session.mode === 'list' && <span className="badge green">对上清单 {list.length} 样</span>}
              <span className="badge gray">{session.mode === 'list' ? '清单外' : '识别出'} {extra.length} 样</span>
              {unsure.length > 0 && <span className="badge warn">需要确认 {unsure.length} 样</span>}
            </div>
            {result!.warnings.map((w) => <span key={w} className="hint">· {w}</span>)}

            {list.length > 0 && (
              <section className="section" style={{ gap: 8 }}>
                <h2 style={{ margin: 0, padding: '0 4px', fontSize: 14 }}>清单里的 · 会自动记为已买</h2>
                <div className="card list">{list.map((r) => renderRow(r, 'list'))}</div>
              </section>
            )}
            {extra.length > 0 && (
              <section className="section" style={{ gap: 8 }}>
                <h2 style={{ margin: 0, padding: '0 4px', fontSize: 14 }}>{session.mode === 'list' ? '清单外的 · 要不要放进冰箱' : '要放进冰箱的'}</h2>
                <div className="card list">{extra.map((r) => renderRow(r, 'extra'))}</div>
              </section>
            )}
            {unsure.length > 0 && (
              <section className="section" style={{ gap: 8 }}>
                <h2 style={{ margin: 0, padding: '0 4px', fontSize: 14 }}>需要确认</h2>
                {unsure.map((r) => renderRow(r, 'uncertain'))}
              </section>
            )}
            {missing.length > 0 && (
              <section className="card sunken" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 14px' }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-2)' }}>清单里还没买到</span>
                <span className="hint" style={{ fontSize: 13 }}>
                  {missing.map((m) => foodMap.get(m.foodId ?? '')?.name ?? m.text).join('、')} · 这些还留在购物清单里
                </span>
              </section>
            )}
          </>
        )}
      </main>

      {phase === 'done' && rows && (
        <div className="bottom-bar at-bottom">
          <span className="hint" style={{ textAlign: 'center' }}>图片只用来识别，入库后不保存</span>
          <button className="btn primary big block" disabled={busy || count === 0} onClick={next}>
            {busy ? '正在补充食材资料…' : `下一步：确认放哪儿（${count} 样）`}
          </button>
        </div>
      )}

      {pickingRow && (
        <FoodPickerSheet
          initialQuery={pickingRow.foodId ? '' : pickingRow.name}
          onClose={() => setPicking(null)}
          onPick={(f) => {
            const li = session.mode === 'list' && !pickingRow.shoppingItemId
              ? shopping?.find((i) => !i.bought && i.state === 'need' && i.foodId === f.id && !rows!.some((r) => r.shoppingItemId === i.id))
              : undefined;
            update(pickingRow.key, {
              foodId: f.id, name: f.name, isFood: true, include: true,
              ...(pickingRow.group === 'uncertain' ? {} : li ? { group: 'list', shoppingItemId: li.id } : {}),
            });
            if (li) setMissing((m) => m.filter((x) => x.id !== li.id));
            setPicking(null);
          }}
        />
      )}
      {stock && <StockInSheet items={stock.items} foods={stock.foods} options={stock.options} onClose={() => setStock(null)} />}
    </>
  );
}
