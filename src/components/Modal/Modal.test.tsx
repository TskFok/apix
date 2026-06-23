import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal', () => {
  it('按 Escape 关闭弹窗', () => {
    const onClose = vi.fn();

    render(<Modal open title="新建项目" placeholder="项目名称" onClose={onClose} />);

    expect(screen.getByText('新建项目')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
