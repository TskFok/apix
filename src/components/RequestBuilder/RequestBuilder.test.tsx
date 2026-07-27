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

  it('Raw Body 禁用 WebKit 文本替换以保留 ASCII 双引号', () => {
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
    fireEvent.click(screen.getByLabelText('raw'));

    expect(screen.getByPlaceholderText('{"key": "value"}')).toHaveAttribute(
      'spellcheck',
      'false'
    );
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

  it('从弹窗导入 cURL 并回填请求表单', () => {
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

    fireEvent.click(screen.getByRole('button', { name: '导入 cURL 命令' }));
    const curlInput = screen.getByPlaceholderText('curl -X POST ...');
    expect(curlInput.tagName).toBe('TEXTAREA');
    fireEvent.change(curlInput, {
      target: {
        value:
          "curl -X POST -H 'Content-Type: application/json' -d '{\"name\":\"Ada\"}' 'https://api.example.com/users?source=cli'",
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '填充请求' }));

    const state = useRequestStore.getState();
    expect(state.protocol).toBe('http');
    expect(state.method).toBe('POST');
    expect(state.url).toBe('https://api.example.com/users');
    expect(state.headers[0]).toMatchObject({
      key: 'Content-Type',
      value: 'application/json',
    });
    expect(state.queryParams[0]).toMatchObject({ key: 'source', value: 'cli' });
    expect(state.bodyType).toBe('raw');
    expect(state.rawType).toBe('json');
    expect(state.body).toBe('{"name":"Ada"}');
  });

  it('导入无效 cURL 时保留当前请求', () => {
    useRequestStore.getState().setMethod('PATCH');
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

    fireEvent.click(screen.getByRole('button', { name: '导入 cURL 命令' }));
    fireEvent.change(screen.getByPlaceholderText('curl -X POST ...'), {
      target: { value: 'curl -X POST -d {}' },
    });
    fireEvent.click(screen.getByRole('button', { name: '填充请求' }));

    expect(useRequestStore.getState().method).toBe('PATCH');
    expect(useRequestStore.getState().url).toBe('https://example.com/api');
  });
});
