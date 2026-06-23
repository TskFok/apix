import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { FastTooltip, FAST_TOOLTIP_DEFAULT_DELAY_MS } from './FastTooltip';

describe('FastTooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('悬停后按延迟显示文案，并移除原生 title', async () => {
    render(
      <FastTooltip label="快速提示">
        <button type="button" title="慢速原生">
          操作
        </button>
      </FastTooltip>
    );
    const btn = screen.getByRole('button', { name: '操作' });
    expect(btn).not.toHaveAttribute('title');

    fireEvent.mouseEnter(btn);
    await act(async () => {
      vi.advanceTimersByTime(FAST_TOOLTIP_DEFAULT_DELAY_MS - 1);
    });
    expect(document.querySelector('.fast-tooltip')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await waitFor(() => {
      expect(document.querySelector('.fast-tooltip')).toHaveTextContent('快速提示');
    });

    fireEvent.mouseLeave(btn);
    await act(async () => {
      await waitFor(() => {
        expect(document.querySelector('.fast-tooltip')).toBeNull();
      });
    });
  });

  it('在延迟结束前移出指针则不显示', async () => {
    render(
      <FastTooltip label="不应出现">
        <button type="button">x</button>
      </FastTooltip>
    );
    const btn = screen.getByRole('button', { name: 'x' });
    fireEvent.mouseEnter(btn);
    await act(async () => {
      vi.advanceTimersByTime(FAST_TOOLTIP_DEFAULT_DELAY_MS - 1);
    });
    fireEvent.mouseLeave(btn);
    await act(async () => {
      vi.advanceTimersByTime(5);
    });
    expect(document.querySelector('.fast-tooltip')).toBeNull();
  });
});
