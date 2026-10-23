// S05 生成清单预览：家里已有的默认不勾选，确认后才写入清单（SPEC §5.1）。
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import type { Food } from '../db/types';
import { useFoodMap } from '../data/hooks';
import { applyPreview, previewForRange } from '../data/shopping';
import { monthDay } from '../logic/dates';
import type { PreviewLine } from '../logic/shopping';
import { formatAmount, toPurchase } from '../logic/units';
import { Sheet } from '../ui/controls';
import { useToast } from '../ui/Toast';

function lineQty(l: PreviewLine, food?: Food): string {
  if (!food) return '';
  if (food.kind === 'staple') return l.state === 'need' ? '补货' : '';
  if (l.unconvertible && l.buy == null) return '量待确认';
  const n = l.state === 'need' ? l.buy : l.need;
  if (n == null) return '';
  const p = toPurchase(n, food);
  return p ? `${p.qty} ${p.unit}` : formatAmount(n, food.baseUnit);
}

export function GeneratePreviewSheet({ start, end, onClose }: { start: string; end: string; onClose: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const foods = useFoodMap();
  const lines = useLiveQuery(() => previewForRange(start, end), [start, end]);
  const recipes = useLiveQuery(() => db.recipes.toArray(), [], []);
  const [selected, setSelected] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (lines && selected === null) setSelected(new Set(lines.filter((l) => l.state === 'need').map((l) => l.foodId)));
  }, [lines, selected]);

  if (!lines || !selected) return null;
  const recipeName = (id?: string) => recipes.find((r) => r.id === id)?.title;
  const need = lines.filter((l) => l.state === 'need');
  const have = lines.filter((l) => l.state === 'have');

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  // 渲染函数而不是内嵌组件，避免每次刷新都重建整行
  function renderRow(l: PreviewLine) {
    const food = foods.get(l.foodId);
    const on = selected!.has(l.foodId);
    const from = [...new Set(l.sources.map((s) => recipeName(s.recipeId)).filter(Boolean))].join('、');
    const sub =
      l.state === 'have'
        ? food?.kind === 'staple'
          ? '常备品 · 家里有'
          : `家里有 ${formatAmount(l.have, food?.baseUnit ?? '')}${from ? ` · ${from}` : ''}`
        : l.have > 0 && l.need != null && food
          ? `共需 ${formatAmount(l.need, food.baseUnit)} · 冰箱有 ${formatAmount(l.have, food.baseUnit)}`
          : from;
    return (
      <button key={l.foodId} className="row button" onClick={() => toggle(l.foodId)}>
        <span className="check" role="checkbox" aria-checked={on}>{on ? '✓' : ''}</span>
        <span className="row-main">
          <span className="row-title">{food?.name}</span>
          <span className="row-sub">{sub}</span>
        </span>
        <span className="row-end num">{lineQty(l, food)}</span>
      </button>
    );
  }

  return (
    <Sheet
      title="生成购物清单"
      sub={`${monthDay(start)} – ${monthDay(end)} 菜单里还没做的菜`}
      onClose={onClose}
      footer={
        <button
          className="btn primary big block"
          disabled={lines.length === 0}
          onClick={async () => {
            const n = await applyPreview(lines, selected);
            onClose();
            navigate('/shopping');
            toast(`已加进清单 ${n} 样`);
          }}
        >
          加进清单（{[...selected].length} 样）
        </button>
      }
    >
      {lines.length === 0 ? (
        <div className="card">这段时间的菜单里还没有要做的菜</div>
      ) : (
        <>
          {need.length > 0 && (
            <section className="section">
              <h3 className="group-title" style={{ padding: 0 }}>要买的 {need.length} 样</h3>
              <div className="card list">{need.map(renderRow)}</div>
            </section>
          )}
          {have.length > 0 && (
            <section className="section">
              <h3 className="group-title" style={{ padding: 0 }}>家里已有 {have.length} 样 · 默认不买，勾上就会加进清单</h3>
              <div className="card list">{have.map(renderRow)}</div>
            </section>
          )}
        </>
      )}
    </Sheet>
  );
}
