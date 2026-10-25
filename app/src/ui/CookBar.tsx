// "正在做"计时条（PRD P01、P08）：有烹饪进度时出现在除烹饪页以外的所有页面顶部，点一下回到烹饪模式。
// 计时到点时响铃也在这里处理，所以不管在哪个页面都会响。
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import { updateCook, useCookSession } from '../data/cook';
import { useNow } from '../data/hooks';
import { formatClock, isDone, remainSec } from '../logic/cook';
import { ring, unlockAudio } from './alarm';
import { Icon } from './Icon';

export function CookBar() {
  const session = useCookSession();
  const title = useLiveQuery(async () => (session ? (await db.recipes.get(session.recipeId))?.title : undefined), [session?.recipeId]);
  const now = useNow(1000);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const visible = !!session && !!title && pathname !== '/cook';

  // 到点且还没响过的计时：响一次，并记下来，重新打开应用不再响
  const due = session?.timers.filter((t) => isDone(t, now) && !t.rang) ?? [];
  useEffect(() => {
    if (!session || due.length === 0) return;
    ring();
    void updateCook(session.id, { timers: session.timers.map((t) => (isDone(t, Date.now()) ? { ...t, rang: true } : t)) });
  }, [session, due.length]);

  // iPhone 上声音要先在一次点击里解锁
  useEffect(() => {
    if (!session) return;
    document.addEventListener('pointerdown', unlockAudio);
    return () => document.removeEventListener('pointerdown', unlockAudio);
  }, [!!session]);

  // 计时条占用顶部安全区，页面本身就不用再留
  useEffect(() => {
    if (!visible) return;
    const root = document.documentElement.style;
    root.setProperty('--safe-top', '0px');
    root.setProperty('--cookbar-h', 'calc(48px + env(safe-area-inset-top, 0px))');
    return () => {
      root.removeProperty('--safe-top');
      root.removeProperty('--cookbar-h');
    };
  }, [visible]);

  if (!visible || !session) return null;
  const doneAny = session.timers.some((t) => isDone(t, now));
  const running = session.timers.filter((t) => !isDone(t, now)).sort((a, b) => remainSec(a, now) - remainSec(b, now))[0];
  const right = doneAny ? '时间到' : running ? formatClock(remainSec(running, now)) + (running.pausedRemain != null ? ' 暂停' : '') : '';
  return (
    <button className={'cook-bar' + (doneAny ? ' done' : '')} onClick={() => navigate('/cook')}>
      <Icon name={doneAny ? 'alert' : 'clock'} size={18} />
      <span className="grow">正在做 {title} · 第 {session.stepIndex + 1} 步</span>
      {right && <span className="num" style={{ fontWeight: 700 }}>{right}</span>}
      <Icon name="forward" size={16} />
    </button>
  );
}
