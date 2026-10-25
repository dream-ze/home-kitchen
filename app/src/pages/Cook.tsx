// P08 烹饪模式：深色、大字，灶台前手湿也能用。进度和计时都存在本地，切出去不会丢。
import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import type { Recipe, RecipeStep } from '../db/types';
import { endCook, updateCook, useCookSession } from '../data/cook';
import { useFoodMap, useNow } from '../data/hooks';
import {
  adjustTimer, amountText, formatClock, isDone, lineName, pauseTimer, remainSec, removeTimer, resumeTimer,
  startTimer, stepLineIndexes, type CookTimer,
} from '../logic/cook';
import { FinishCookSheet } from '../sheets/FinishCookSheet';
import { unlockAudio } from '../ui/alarm';
import { Sheet } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Toast';
import { useWakeLock } from '../ui/wakeLock';

const NO_STEPS: RecipeStep[] = [{ text: '这道菜还没有写步骤，照着用料做就行。' }];

export function CookPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const session = useCookSession();
  const recipe = useLiveQuery(
    () => (session ? db.recipes.get(session.recipeId) : undefined),
    [session?.recipeId],
    null as Recipe | undefined | null,
  );
  const foods = useFoodMap();
  const now = useNow(1000);
  const wake = useWakeLock();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);

  if (session === null || (session && recipe === null)) return null;
  if (!session || !recipe) {
    return (
      <main className="page cook-page">
        <div className="cook-empty">
          <strong>{session ? '这道菜谱已经被删除了' : '现在没有正在做的菜'}</strong>
          <button
            className="btn primary big"
            onClick={async () => {
              if (session) await endCook();
              navigate('/', { replace: true });
            }}
          >
            回到今天
          </button>
        </div>
      </main>
    );
  }

  const steps = recipe.steps.length ? recipe.steps : NO_STEPS;
  const i = Math.min(session.stepIndex, steps.length - 1);
  const step = steps[i];
  const isLast = i === steps.length - 1;
  const k = recipe.servings > 0 ? session.servings / recipe.servings : 1;
  const chipLines = recipe.steps.length
    ? stepLineIndexes(step.text, recipe.lines, foods)
    : recipe.lines.flatMap((l, idx) => (l.isHeader ? [] : [idx]));
  const timer = session.timers.find((t) => t.stepIndex === i);
  const others = session.timers.filter((t) => t.stepIndex !== i).sort((a, b) => remainSec(a, now) - remainSec(b, now));

  const go = (n: number) => {
    if (n < 0 || n >= steps.length) return;
    void updateCook(session.id, { stepIndex: n });
  };
  const setTimers = (fn: (timers: CookTimer[], now: number) => CookTimer[]) =>
    updateCook(session.id, { timers: fn(session.timers, Date.now()) });
  const toggleLine = (idx: number) => {
    const on = session.checkedLines.includes(idx);
    void updateCook(session.id, { checkedLines: on ? session.checkedLines.filter((x) => x !== idx) : [...session.checkedLines, idx] });
  };

  return (
    <div className="cook-page">
      <header className="cook-top">
        <button className="icon-btn plain" aria-label="关闭" onClick={() => setLeaveOpen(true)}>
          <Icon name="close" />
        </button>
        <h1>{recipe.title}</h1>
        <span className={'cook-wake' + (wake === 'on' ? '' : ' off')}>
          {wake === 'on' ? '常亮' : '去设置里调长自动锁定'}
        </span>
      </header>

      <div className="cook-progress" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {steps.map((_, n) => <span key={n} className={n <= i ? 'on' : ''} />)}
      </div>

      {others.length > 0 && (
        <div className="cook-others">
          {others.map((t) => {
            const done = isDone(t, now);
            return (
              <button key={t.stepIndex} className={'cook-other' + (done ? ' done' : '')} onClick={() => go(t.stepIndex)}>
                第 {t.stepIndex + 1} 步 · {done ? '时间到' : formatClock(remainSec(t, now))}
                {t.pausedRemain != null && ' 已暂停'}
              </button>
            );
          })}
        </div>
      )}

      <main
        className="cook-body"
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const s = touch.current;
          touch.current = null;
          if (!s) return;
          const dx = e.changedTouches[0].clientX - s.x;
          const dy = e.changedTouches[0].clientY - s.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? i + 1 : i - 1);
        }}
      >
        <div className="cook-meta">
          <span>第 {i + 1} / {steps.length} 步 · {session.servings} 人份</span>
          <span className="hint-dark">进度已保存，切出去也不会丢</span>
        </div>
        <p className="cook-text">{step.text}</p>

        {chipLines.length > 0 && (
          <div className="cook-chips">
            {chipLines.map((idx) => {
              const l = recipe.lines[idx];
              const f = l.foodId ? foods.get(l.foodId) : undefined;
              const on = session.checkedLines.includes(idx);
              return (
                <button key={idx} className={'cook-chip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => toggleLine(idx)}>
                  {lineName(l, f)} {amountText(l, k)}
                </button>
              );
            })}
          </div>
        )}

        {(step.timerSec || timer) && (
          <TimerCard
            key={i}
            sec={step.timerSec ?? 0}
            timer={timer}
            now={now}
            onStart={() => {
              unlockAudio();
              void setTimers((ts, t) => startTimer(ts, i, step.timerSec ?? 60, t));
            }}
            onPause={() => void setTimers((ts, t) => pauseTimer(ts, i, t))}
            onResume={() => {
              unlockAudio();
              void setTimers((ts, t) => resumeTimer(ts, i, t));
            }}
            onAdjust={(d) => void setTimers((ts, t) => adjustTimer(ts, i, d, t))}
            onClear={() => void setTimers((ts) => removeTimer(ts, i))}
          />
        )}
      </main>

      <footer className="cook-foot">
        <button className="cook-btn" disabled={i === 0} onClick={() => go(i - 1)}>上一步</button>
        {isLast ? (
          <button className="cook-btn primary" onClick={() => setFinishOpen(true)}>做完了</button>
        ) : (
          <button className="cook-btn primary" onClick={() => go(i + 1)}>下一步</button>
        )}
      </footer>

      {leaveOpen && (
        <Sheet title="先离开吗？" sub={`${recipe.title} · 第 ${i + 1} 步`} onClose={() => setLeaveOpen(false)}>
          <button className="btn primary big block" onClick={() => (history.length > 1 ? navigate(-1) : navigate('/'))}>先离开，进度会保存</button>
          <button
            className="btn big block danger-text"
            onClick={async () => {
              const undo = await endCook();
              navigate('/', { replace: true });
              toast('已结束这次烹饪', undo);
            }}
          >
            结束这次烹饪
          </button>
        </Sheet>
      )}
      {finishOpen && <FinishCookSheet session={session} recipe={recipe} onClose={() => setFinishOpen(false)} />}
    </div>
  );
}

function TimerCard({
  sec, timer, now, onStart, onPause, onResume, onAdjust, onClear,
}: {
  sec: number;
  timer?: CookTimer;
  now: number;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onAdjust: (deltaSec: number) => void;
  onClear: () => void;
}) {
  const done = timer ? isDone(timer, now) : false;
  const paused = timer?.pausedRemain != null;
  return (
    <section className={'cook-timer' + (done ? ' done' : '')} aria-live="polite">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="hint-dark">{done ? '时间到' : paused ? '已暂停' : timer ? '计时中' : '计时'}</span>
        <span className="cook-clock num">{formatClock(timer ? remainSec(timer, now) : sec)}</span>
      </div>
      <div className="cook-timer-actions">
        {!timer && <button className="cook-pill light" onClick={onStart}>开始计时</button>}
        {timer && done && (
          <>
            <button className="cook-pill" onClick={() => onAdjust(60)}>+1 分</button>
            <button className="cook-pill light" onClick={onClear}>知道了</button>
          </>
        )}
        {timer && !done && (
          <>
            <div className="cook-adjust">
              <button aria-label="减 1 分钟" onClick={() => onAdjust(-60)}>−1 分</button>
              <button aria-label="加 1 分钟" onClick={() => onAdjust(60)}>+1 分</button>
            </div>
            <button className="cook-pill light" onClick={paused ? onResume : onPause}>{paused ? '继续' : '暂停'}</button>
          </>
        )}
      </div>
    </section>
  );
}
