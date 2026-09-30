import { useEffect, useRef, type KeyboardEvent } from 'react';

/** 让确认弹窗接收回车，同时保留内部控件自身的键盘交互。 */
export function useEnterToConfirm(open: boolean, onConfirm: () => void, enabled = true) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    ref.current?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      !open || event.key !== 'Enter' || event.defaultPrevented ||
      event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 ||
      event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
    ) return;

    if (event.repeat) {
      event.preventDefault();
      return;
    }

    const target = event.target;
    if (target instanceof Element && target.closest(
      'button, a[href], select, textarea, [contenteditable]:not([contenteditable="false"]), ' +
      '[role="button"], input[type="button"], input[type="submit"], input[type="reset"]'
    )) return;

    event.preventDefault();
    event.stopPropagation();
    if (enabled) onConfirm();
  };

  return { ref, tabIndex: -1, onKeyDown };
}
