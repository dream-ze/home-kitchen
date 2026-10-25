import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../db/db';
import { DEFAULT_SETTINGS, type Food, type Settings } from '../db/types';
import { todayISO } from '../logic/dates';
import { seedFoods } from '../db/seedFoods';
import { getSettings } from './settings';

export function useSettings(): Settings {
  return useLiveQuery(getSettings, [], DEFAULT_SETTINGS);
}

export function useFoods(): Food[] {
  return useLiveQuery(() => db.foods.toArray(), [], []);
}

export function useFoodMap(): Map<string, Food> {
  const foods = useFoods();
  return useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
}

/** 今天的日期；从后台回到前台时刷新，过了零点也能对上 */
export function useToday(): string {
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    const refresh = () => setToday(todayISO());
    document.addEventListener('visibilitychange', refresh);
    const t = setInterval(refresh, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      clearInterval(t);
    };
  }, []);
  return today;
}

/** 启动时：第一次打开写入样本食材；申请持久存储 */
export async function bootstrap(): Promise<void> {
  if ((await db.foods.count()) === 0) await db.foods.bulkPut(seedFoods());
  try {
    await navigator.storage?.persist?.();
  } catch {
    // 不支持就算了，设置页会提示添加到主屏幕
  }
}

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
}

export function useBlobUrl(id?: string): string | undefined {
  const blob = useLiveQuery(() => (id ? db.blobs.get(id) : undefined), [id]);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const u = URL.createObjectURL(blob.data);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

/** 当前时间（毫秒），每隔 ms 刷新一次；从后台回来时立即刷新 */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [ms]);
  return now;
}
