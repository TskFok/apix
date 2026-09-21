import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetch } from '@tauri-apps/plugin-http';
import { openSSERequest } from './sseRequest';

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: vi.fn(),
}));

describe('openSSERequest', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
  });

  it('禁用插件自动重定向', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 200 }));

    await openSSERequest(
      'https://stream.example.test/events',
      { 'X-API-Key': 'secret' },
      new AbortController().signal
    );

    expect(fetch).toHaveBeenCalledWith(
      'https://stream.example.test/events',
      expect.objectContaining({ maxRedirections: 0 })
    );
  });

  it('将重定向响应作为安全拦截错误返回且不暴露 Location', async () => {
    const response = new Response('redirect body', {
      status: 307,
      statusText: 'Temporary Redirect',
      headers: { Location: 'https://evil.example.test/steal?token=secret' },
    });
    const cancel = vi.spyOn(response.body!, 'cancel');
    vi.mocked(fetch).mockResolvedValue(response);

    await expect(
      openSSERequest(
        'https://stream.example.test/events',
        { 'X-API-Key': 'secret' },
        new AbortController().signal
      )
    ).rejects.toThrow('SSE 请求已阻止重定向（HTTP 307），请直接使用目标地址');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('响应流取消失败时仍返回安全拦截错误', async () => {
    const response = new Response('redirect body', { status: 302 });
    vi.spyOn(response.body!, 'cancel').mockRejectedValue(new Error('cancel failed'));
    vi.mocked(fetch).mockResolvedValue(response);

    await expect(
      openSSERequest(
        'https://stream.example.test/events',
        { 'X-API-Key': 'secret' },
        new AbortController().signal
      )
    ).rejects.toThrow('SSE 请求已阻止重定向（HTTP 302），请直接使用目标地址');
  });
});
