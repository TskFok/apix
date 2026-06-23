import {
  cloneElement,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactElement,
  type Ref,
  type SyntheticEvent,
} from 'react';
import { createPortal } from 'react-dom';

/** 明显快于浏览器原生 `title` 的默认延迟 */
export const FAST_TOOLTIP_DEFAULT_DELAY_MS = 100;

function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (value: T | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === 'function') ref(value);
      else ref.current = value;
    }
  };
}

function chainHandlers<E extends SyntheticEvent>(
  a: ((e: E) => void) | undefined,
  b: (e: E) => void
) {
  return (e: E) => {
    a?.(e);
    b(e);
  };
}

export type FastTooltipProps = {
  label: string;
  children: ReactElement;
  /** 悬停 / 聚焦后多少毫秒显示 */
  delayMs?: number;
};

export function FastTooltip({ label, children, delayMs = FAST_TOOLTIP_DEFAULT_DELAY_MS }: FastTooltipProps) {
  const tooltipId = useId();
  const anchorRef = useRef<HTMLElement | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);
  const [placement, setPlacement] = useState<'top' | 'bottom'>('top');
  const [coords, setCoords] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  const clearTimer = useCallback(() => {
    if (showTimerRef.current != null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  const updatePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const centerX = r.left + r.width / 2;
    if (r.top < 52) {
      setPlacement('bottom');
      setCoords({ left: centerX, top: r.bottom + 8 });
    } else {
      setPlacement('top');
      setCoords({ left: centerX, top: r.top - 8 });
    }
  }, []);

  const scheduleShow = useCallback(() => {
    clearTimer();
    showTimerRef.current = setTimeout(() => {
      showTimerRef.current = null;
      updatePosition();
      setVisible(true);
    }, delayMs);
  }, [clearTimer, delayMs, updatePosition]);

  const hide = useCallback(() => {
    clearTimer();
    setVisible(false);
  }, [clearTimer]);

  useLayoutEffect(() => {
    if (!visible) return;
    updatePosition();
    const onScrollOrResize = () => {
      updatePosition();
    };
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [visible, updatePosition]);

  const child = children as ReactElement<{ ref?: Ref<HTMLElement> } & Record<string, unknown>>;
  const prevDesc = child.props['aria-describedby'] as string | undefined;
  const describedBy =
    visible ? (prevDesc ? `${prevDesc} ${tooltipId}` : tooltipId) : prevDesc;

  const mergedRef = mergeRefs(anchorRef, child.props.ref as Ref<HTMLElement> | undefined);

  const cloned = cloneElement(child, {
    ...child.props,
    title: undefined,
    'aria-describedby': describedBy,
    ref: mergedRef,
    onMouseEnter: chainHandlers(child.props.onMouseEnter as ((e: MouseEvent) => void) | undefined, scheduleShow),
    onMouseLeave: chainHandlers(child.props.onMouseLeave as ((e: MouseEvent) => void) | undefined, hide),
    onFocus: chainHandlers(child.props.onFocus as ((e: FocusEvent) => void) | undefined, scheduleShow),
    onBlur: chainHandlers(child.props.onBlur as ((e: FocusEvent) => void) | undefined, hide),
  });

  const transform = placement === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)';

  return (
    <>
      {cloned}
      {visible &&
        createPortal(
          <span
            id={tooltipId}
            role="tooltip"
            className="fast-tooltip"
            style={{
              position: 'fixed',
              left: coords.left,
              top: coords.top,
              transform,
              zIndex: 20000,
              pointerEvents: 'none',
            }}
          >
            {label}
          </span>,
          document.body
        )}
    </>
  );
}
