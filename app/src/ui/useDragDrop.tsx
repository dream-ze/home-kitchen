// 长按拖动（PRD：菜单换日期 / 换餐次，购物清单换分区）。
// 手机上网页原生的拖放不支持触摸，这里自己做：按住不动约半秒进入拖动，手指一动就当成滚动，不进入拖动；
// 拖动时禁止页面滚动，靠近屏幕上下边缘时自动滚动；松手时落在哪个 data-drop 区域就交给 onDrop。
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';

const HOLD_MS = 450;
const SLOP = 10; // 按住期间允许的手抖（px）
const EDGE = 72; // 离上下边缘多近开始自动滚动

interface Options<T> {
  onDrop: (item: T, target: string) => void;
  /** 不能放的位置（比如过去的日子、原来的位置）不高亮，松手也不算 */
  canDrop?: (item: T, target: string) => boolean;
}

/** 可以拖的元素上要加的属性 */
export interface DragProps {
  onPointerDown: (e: PointerEvent) => void;
  onClickCapture: (e: MouseEvent) => void;
  onContextMenu: (e: MouseEvent) => void;
  'data-drag-src'?: string;
  style: CSSProperties;
}

interface Pending<T> {
  item: T;
  label: string;
  x0: number;
  y0: number;
  timer: number;
  active: boolean;
}

export function useDragDrop<T>({ onDrop, canDrop }: Options<T>) {
  const [drag, setDrag] = useState<{ item: T; label: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const pending = useRef<Pending<T> | null>(null);
  const overRef = useRef<string | null>(null);
  const droppedAt = useRef(0);
  const cleanup = useRef<() => void>(() => {});
  const opts = useRef({ onDrop, canDrop });
  opts.current = { onDrop, canDrop };

  useEffect(() => () => cleanup.current(), []);

  function targetAt(x: number, y: number, item: T): string | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]');
    const key = el?.dataset.drop ?? null;
    if (!key) return null;
    return opts.current.canDrop && !opts.current.canDrop(item, key) ? null : key;
  }

  function move(x: number, y: number) {
    const p = pending.current;
    if (!p) return;
    if (!p.active) {
      if (Math.hypot(x - p.x0, y - p.y0) > SLOP) end(false);
      return;
    }
    if (ghost.current) ghost.current.style.transform = `translate(${x}px, ${y}px)`;
    if (y < EDGE) window.scrollBy(0, -10);
    else if (y > window.innerHeight - EDGE) window.scrollBy(0, 10);
    const t = targetAt(x, y, p.item);
    if (t !== overRef.current) {
      overRef.current = t;
      setOver(t);
    }
  }

  function end(commit: boolean) {
    const p = pending.current;
    cleanup.current();
    pending.current = null;
    if (!p) return;
    window.clearTimeout(p.timer);
    if (p.active) {
      droppedAt.current = Date.now();
      const t = overRef.current;
      setDrag(null);
      setOver(null);
      overRef.current = null;
      if (commit && t) opts.current.onDrop(p.item, t);
    }
  }

  function start(e: PointerEvent, item: T, label: string) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    end(false);
    const p: Pending<T> = { item, label, x0: e.clientX, y0: e.clientY, active: false, timer: 0 };
    let last = { x: e.clientX, y: e.clientY };
    p.timer = window.setTimeout(() => {
      p.active = true;
      navigator.vibrate?.(12);
      window.getSelection()?.removeAllRanges();
      setDrag({ item, label });
      requestAnimationFrame(() => move(last.x, last.y));
    }, HOLD_MS);
    pending.current = p;

    const onPointerMove = (ev: globalThis.PointerEvent) => {
      last = { x: ev.clientX, y: ev.clientY };
      move(ev.clientX, ev.clientY);
    };
    // 触摸：拖动时阻止页面滚动；浏览器接管滚动后 pointer 事件会中断，所以坐标也从 touch 事件拿
    const onTouchMove = (ev: TouchEvent) => {
      const t = ev.touches[0];
      if (!t) return;
      if (p.active) ev.preventDefault();
      last = { x: t.clientX, y: t.clientY };
      move(t.clientX, t.clientY);
    };
    const onUp = () => end(true);
    const onCancel = () => {
      if (!p.active) end(false);
    };
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && end(false);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('touchend', onUp);
    document.addEventListener('pointercancel', onCancel);
    document.addEventListener('touchcancel', onCancel);
    document.addEventListener('keydown', onKey);
    cleanup.current = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('touchend', onUp);
      document.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('touchcancel', onCancel);
      document.removeEventListener('keydown', onKey);
    };
  }

  /** 放在可以拖的元素上 */
  function bind(item: T, label: string): DragProps {
    return {
      onPointerDown: (e: PointerEvent) => start(e, item, label),
      // 刚拖完松手时浏览器还会补一个点击，不能让它打开链接或勾选
      onClickCapture: (e: MouseEvent) => {
        if (Date.now() - droppedAt.current < 500) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      onContextMenu: (e: MouseEvent) => e.preventDefault(),
      'data-drag-src': drag?.item === item ? '' : undefined,
      style: { WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' },
    };
  }

  const overlay = drag
    ? createPortal(
        <div ref={ghost} className="drag-ghost" aria-hidden="true">
          <span>{drag.label}</span>
        </div>,
        document.body,
      )
    : null;

  return { bind, dragging: drag?.item ?? null, over, overlay };
}
