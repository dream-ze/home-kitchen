// 安装到桌面。安卓 Chrome 会发 beforeinstallprompt，留着它，点"安装到桌面"时再弹系统的安装框；
// iPhone 没有这个事件，只能提示用户在 Safari 里手动"添加到主屏幕"。
import { useSyncExternalStore } from 'react';

export type Platform = 'ios' | 'android' | 'other';

export function platform(): Platform {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  // iPad 的 Safari 默认伪装成 Mac，用触点数区分
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return 'other';
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallState {
  canInstall: boolean;
  installed: boolean;
}

let deferred: BeforeInstallPromptEvent | null = null;
let state: InstallState = { canInstall: false, installed: false };
const listeners = new Set<() => void>();

function set(next: Partial<InstallState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

/** 要在页面一加载就开始听，事件可能在 React 渲染前就来了 */
export function listenForInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    set({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    set({ canInstall: false, installed: true });
  });
}

/** 弹出系统安装框。这个事件只能用一次，用完就作废 */
async function install(): Promise<void> {
  if (!deferred) return;
  const e = deferred;
  deferred = null;
  set({ canInstall: false });
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === 'accepted') set({ installed: true });
}

export function useInstallPrompt() {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
  return { ...s, install };
}
