// 屏幕常亮（PRD P08）。iPhone 要 iOS 18.4 以上、从主屏幕打开才有效；切回前台时重新申请。
import { useEffect, useState } from 'react';

export type WakeState = 'on' | 'off' | 'unsupported';

export function useWakeLock(): WakeState {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!supported) return;
    let lock: WakeLockSentinel | null = null;
    let alive = true;
    const request = async () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      try {
        const l = await navigator.wakeLock.request('screen');
        if (!alive) {
          void l.release();
          return;
        }
        lock = l;
        setOn(true);
        l.addEventListener('release', () => alive && setOn(false));
      } catch {
        setOn(false);
      }
    };
    void request();
    // 有些浏览器要求在点击时申请，所以点一下也重试
    document.addEventListener('visibilitychange', request);
    document.addEventListener('pointerdown', request);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', request);
      document.removeEventListener('pointerdown', request);
      void lock?.release();
    };
  }, [supported]);
  if (!supported) return 'unsupported';
  return on ? 'on' : 'off';
}
