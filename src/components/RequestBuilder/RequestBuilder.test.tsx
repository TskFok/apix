import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RequestBuilder } from './RequestBuilder';
import { useRequestStore } from '../../stores/requestStore';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

const noop = () => {};

describe('RequestBuilder', () => {
  beforeEach(async () => {
    await useRequestStore.getState().newRequest();
    useRequestStore.getState().setUrl('https://example.com/api');
  });

  it('复制 cURL 为图标按钮，保留无障碍名称', () => {
    const { container } = render(
      <RequestBuilder
        onSendHttp={noop}
        onConnectWs={noop}
        onDisconnectWs={noop}
        onConnectSse={noop}
        onDisconnectSse={noop}
        wsConnected={false}
        sseConnected={false}
      />
    );

    const btn = screen.getByRole('button', { name: '复制为 cURL 命令' });
    expect(btn).toBeInTheDocument();
    expect(container.querySelector('.request-copy-curl-icon-svg')).toBeInTheDocument();
    expect(btn.textContent?.trim()).toBe('');
  });

  it('地址栏编辑中保留原始输入，失焦后再同步规范展示', () => {
    render(
      <RequestBuilder
        onSendHttp={noop}
        onConnectWs={noop}
        onDisconnectWs={noop}
        onConnectSse={noop}
        onDisconnectSse={noop}
        wsConnected={false}
        sseConnected={false}
      />
    );

    const input = screen.getByPlaceholderText('https://api.example.com/...') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'HTTPS://EXAMPLE.COM/Path?A=1&B=' } });
    expect(input.value).toBe('HTTPS://EXAMPLE.COM/Path?A=1&B=');
    fireEvent.blur(input);
    expect(input.value).toBe('https://example.com/Path?A=1&B=');
  });

  it('从弹窗导入 a=1&b=1 格式数据到 Body 表格且不切换 Body 类型', () => {
    render(
      <RequestBuilder
        onSendHttp={noop}
        onConnectWs={noop}
        onDisconnectWs={noop}
        onConnectSse={noop}
        onDisconnectSse={noop}
        wsConnected={false}
        sseConnected={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Body' }));
    fireEvent.click(screen.getByRole('button', { name: '导入' }));

    const input = screen.getByPlaceholderText('a=1&b=1') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'a=1&b=1' } });
    fireEvent.click(screen.getByRole('button', { name: '填充 Body' }));

    expect(screen.getByLabelText('form-data')).toBeChecked();
    expect(screen.getByDisplayValue('a')).toBeInTheDocument();
    expect(screen.getByDisplayValue('b')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('1')).toHaveLength(2);
  });
});
