// 提示条：4 秒后自动消失，可以撤销；新的替换旧的（PRD §3.5）。
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ToastData {
  id: number;
  text: string;
  undo?: () => Promise<void> | void;
}

const Ctx = createContext<(text: string, undo?: ToastData['undo']) => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

/** 页面底部有操作栏时，把提示条往上挪，别挡住按钮 */
export function useToastOffset(px: number) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--toast-bottom', `${px}px`);
    return () => {
      root.style.removeProperty('--toast-bottom');
    };
  }, [px]);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback((text: string, undo?: ToastData['undo']) => {
    setToast({ id: Date.now(), text, undo });
  }, []);

  useEffect(() => {
    if (!toast) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer.current);
  }, [toast]);

  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              onClick={async () => {
                const u = toast.undo;
                setToast(null);
                await u?.();
              }}
            >
              撤销
            </button>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}
