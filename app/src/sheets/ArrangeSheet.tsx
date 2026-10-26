// "帮我安排"预览（PRD P02）：临期食材优先、避免重复，确认后才写入菜单。
import { useState } from 'react';
import type { Food, Recipe } from '../db/types';
import { addArranged } from '../data/plan';
import { monthDay, weekdayLabel } from '../logic/dates';
import { arrangePlan, nextAlternative, type ArrangeInput, type ArrangeItem } from '../logic/recommend';
import { FoodTile, Sheet } from '../ui/controls';
import { useToast } from '../ui/Toast';

export function ArrangeSheet({
  input, recipes, foods, onClose,
}: {
  input: ArrangeInput;
  recipes: Map<string, Recipe>;
  foods: Map<string, Food>;
  onClose: () => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<ArrangeItem[]>(() => arrangePlan(input));
  // 每一项换过哪些菜，"换一道"不会再换回来
  const [tried, setTried] = useState<string[][]>(() => items.map((x) => [x.recipeId]));
  // 已经没有别的可换的项（提示写在按钮上，底部提示条会被弹层挡住）
  const [exhausted, setExhausted] = useState<Set<number>>(new Set());

  const swap = (i: number) => {
    const alt = nextAlternative(input, items, i, tried[i]);
    if (!alt) {
      setExhausted(new Set(exhausted).add(i));
      return;
    }
    setItems(items.map((x, j) => (j === i ? alt : x)));
    setTried(tried.map((t, j) => (j === i ? [...t, alt.recipeId] : t)));
  };

  return (
    <Sheet
      title="帮我安排"
      sub={items.length ? '优先用掉临期食材，不排本周已有或最近 7 天做过的菜' : undefined}
      onClose={onClose}
      footer={
        items.length > 0 && (
          <div className="bar-row">
            <button className="btn" onClick={onClose}>取消</button>
            <button
              className="btn primary"
              onClick={async () => {
                const undo = await addArranged(items);
                onClose();
                toast(`已排进 ${items.length} 顿晚餐`, undo);
              }}
            >
              确认安排
            </button>
          </div>
        )
      }
    >
      {items.length === 0 ? (
        <p style={{ margin: 0, fontSize: 15, color: 'var(--ink-2)', lineHeight: 1.6 }}>
          菜谱里没有能用掉这些食材、又适合排进来的菜（本周已排过的和最近 7 天做过的会尽量避开），也可能临期日之前的晚餐都排满了。可以去菜谱页加几道用到它们的菜。
        </p>
      ) : (
        <div className="card list">
          {items.map((it, i) => {
            const r = recipes.get(it.recipeId);
            return (
              <div key={it.date} className="row">
                <FoodTile name={r?.title ?? ''} tags={r?.tags} />
                <div className="row-main">
                  <span className="row-sub">{monthDay(it.date)} 周{weekdayLabel(it.date)} · 晚餐</span>
                  <span className="row-title strong">{r?.title}</span>
                  <span className="row-sub" style={{ color: 'var(--warn-ink)' }}>用掉 {it.uses.map((id) => foods.get(id)?.name).join('、')}</span>
                </div>
                <button className="btn small" disabled={exhausted.has(i)} onClick={() => swap(i)}>
                  {exhausted.has(i) ? '没有别的了' : '换一道'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
