import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRequestStore } from '../stores/requestStore';
import { useResponseStore } from '../stores/responseStore';

const mocks = vi.hoisted(() => ({
  sendHttpRequest: vi.fn(),
  addHistory: vi.fn().mockResolvedValue(undefined),
  updateHistory: vi.fn().mockResolvedValue(undefined),
  addApiEndpoint: vi.fn().mockResolvedValue(999),
  updateApiEndpoint: vi.fn().mockResolvedValue(undefined),
  getModuleById: vi.fn().mockResolvedValue({ id: 11, project_id: 1, name: '模块' }),
  getHistoryById: vi.fn(),
  getFavoriteById: vi.fn(),
  updateFavorite: vi.fn().mockResolvedValue(undefined),
  appendErrorLog: vi.fn(),
}));

vi.mock('../lib/http', () => ({
  buildUrl: (url: string, params: Record<string, string>) => {
    const query = new URLSearchParams(params).toString();
    return query ? `${url}?${query}` : url;
  },
  sendHttpRequest: mocks.sendHttpRequest,
}));

vi.mock('../lib/db', () => ({
  addHistory: mocks.addHistory,
  updateHistory: mocks.updateHistory,
  addApiEndpoint: mocks.addApiEndpoint,
  updateApiEndpoint: mocks.updateApiEndpoint,
  getModuleById: mocks.getModuleById,
  getHistoryById: mocks.getHistoryById,
  getFavoriteById: mocks.getFavoriteById,
  updateFavorite: mocks.updateFavorite,
}));

vi.mock('../lib/errorLog', () => ({
  appendErrorLog: mocks.appendErrorLog,
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn(),
}));

import { useHttpRequest } from './useHttpRequest';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function setRequestA(overrides: Partial<ReturnType<typeof useRequestStore.getState>> = {}) {
  useRequestStore.setState({
    protocol: 'http',
    method: 'POST',
    url: 'https://a.example.test/items',
    headers: [{ key: 'x-source', value: 'A', description: '', enabled: true }],
    queryParams: [{ key: 'page', value: '1', description: '', enabled: true }],
    bodyType: 'raw',
    body: '{"request":"A"}',
    rawType: 'json',
    endpointRemark: '请求 A',
    currentHistoryId: null,
    currentFavoriteId: null,
    suppressPersistToProject: false,
    currentProjectId: 1,
    currentModuleId: 11,
    currentEndpointId: 111,
    projectGlobalConfig: { headers: [], variables: [] },
    ...overrides,
  });
}

function switchToRequestB(overrides: Partial<ReturnType<typeof useRequestStore.getState>> = {}) {
  useRequestStore.setState({
    protocol: 'http',
    method: 'GET',
    url: 'https://b.example.test/private',
    headers: [{ key: 'x-source', value: 'B', description: '', enabled: true }],
    queryParams: [{ key: 'page', value: '2', description: '', enabled: true }],
    bodyType: 'raw',
    body: '{"request":"B"}',
    rawType: 'json',
    endpointRemark: '请求 B',
    currentHistoryId: null,
    currentFavoriteId: null,
    suppressPersistToProject: false,
    currentProjectId: 2,
    currentModuleId: 22,
    currentEndpointId: 222,
    projectGlobalConfig: { headers: [], variables: [] },
    ...overrides,
  });
}

const responseA = {
  status: 200,
  statusText: 'OK',
  headers: { 'content-type': 'application/json' },
  body: '{"private":"A"}',
  timeMs: 31,
};

describe('useHttpRequest 请求归属', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRequestStore.setState(useRequestStore.getInitialState(), true);
    useResponseStore.setState(useResponseStore.getInitialState(), true);
    mocks.getHistoryById.mockImplementation(async (id: number) => ({
      id,
      protocol: 'http',
      method: 'POST',
      url: 'https://a.example.test/items',
      headers: '[]',
      params: '[]',
      body: null,
      remark: `历史 ${id}`,
      created_at: 1,
      response_status: null,
      response_time_ms: null,
      response_headers: null,
      response_body: null,
    }));
    mocks.getFavoriteById.mockImplementation(async (id: number) => ({
      id,
      name: `收藏 ${id}`,
      protocol: 'http',
      method: 'POST',
      url: 'https://a.example.test/items',
      headers: '[]',
      params: '[]',
      body: null,
      created_at: 1,
      updated_at: 1,
    }));
  });

  it('延迟响应期间切换项目时仍写回 A，且不覆盖 B 的响应视图', async () => {
    const pending = deferred<typeof responseA>();
    mocks.sendHttpRequest.mockReturnValueOnce(pending.promise);
    setRequestA();
    const expectedHeaders = JSON.stringify(useRequestStore.getState().headers);
    const expectedParams = JSON.stringify(useRequestStore.getState().queryParams);
    const expectedBody = useRequestStore.getState().getBodyForStorage();
    const { result } = renderHook(() => useHttpRequest());

    const sendPromise = result.current.send();
    await vi.waitFor(() => expect(mocks.sendHttpRequest).toHaveBeenCalledTimes(1));

    switchToRequestB();
    useResponseStore.getState().setHttpResponse({
      status: 204,
      statusText: 'No Content',
      headers: { 'x-endpoint': 'B' },
      body: 'B 已保存的响应',
      timeMs: 8,
      loading: false,
      error: undefined,
    });
    pending.resolve(responseA);
    await sendPromise;

    const responseWrites = mocks.updateApiEndpoint.mock.calls.filter(
      ([, patch]) => patch.response_body !== undefined
    );
    expect(responseWrites).toEqual([
      [111, {
        response_status: 200,
        response_time_ms: 31,
        response_headers: JSON.stringify(responseA.headers),
        response_body: responseA.body,
      }],
    ]);
    expect(mocks.addHistory).toHaveBeenCalledWith(
      'http',
      'POST',
      'https://a.example.test/items',
      expectedHeaders,
      expectedParams,
      expectedBody,
      200,
      31,
      JSON.stringify(responseA.headers),
      responseA.body,
      '请求 A'
    );
    expect(useResponseStore.getState().http).toMatchObject({
      status: 204,
      headers: { 'x-endpoint': 'B' },
      body: 'B 已保存的响应',
      timeMs: 8,
      loading: false,
    });
  });

  it('历史请求失败后切到收藏时仍只更新发起时的历史', async () => {
    const pending = deferred<typeof responseA>();
    mocks.sendHttpRequest.mockReturnValueOnce(pending.promise);
    setRequestA({
      currentHistoryId: 41,
      suppressPersistToProject: true,
      currentProjectId: null,
      currentModuleId: null,
      currentEndpointId: null,
    });
    const expectedHeaders = JSON.stringify(useRequestStore.getState().headers);
    const expectedParams = JSON.stringify(useRequestStore.getState().queryParams);
    const expectedBody = useRequestStore.getState().getBodyForStorage();
    const { result } = renderHook(() => useHttpRequest());

    const sendPromise = result.current.send();
    await vi.waitFor(() => expect(mocks.sendHttpRequest).toHaveBeenCalledTimes(1));
    switchToRequestB({
      currentHistoryId: null,
      currentFavoriteId: 52,
      suppressPersistToProject: true,
      currentProjectId: null,
      currentModuleId: null,
      currentEndpointId: null,
    });
    useResponseStore.getState().setHttpResponse({ body: '收藏 B 的响应', loading: false });
    pending.reject(new Error('A 请求失败'));
    await sendPromise;

    expect(mocks.updateHistory).toHaveBeenCalledWith(
      41,
      'http',
      'POST',
      'https://a.example.test/items',
      expectedHeaders,
      expectedParams,
      expectedBody,
      undefined,
      undefined,
      undefined,
      undefined,
      '请求 A'
    );
    expect(mocks.updateFavorite).not.toHaveBeenCalled();
    expect(mocks.addHistory).not.toHaveBeenCalled();
    expect(useResponseStore.getState().http).toMatchObject({
      body: '收藏 B 的响应',
      loading: false,
      error: undefined,
    });
  });

  it('收藏请求完成后切到历史时仍更新发起时的收藏并新增 A 的历史', async () => {
    const pending = deferred<typeof responseA>();
    mocks.sendHttpRequest.mockReturnValueOnce(pending.promise);
    setRequestA({
      currentFavoriteId: 51,
      suppressPersistToProject: true,
      currentProjectId: null,
      currentModuleId: null,
      currentEndpointId: null,
    });
    const expectedHeaders = JSON.stringify(useRequestStore.getState().headers);
    const expectedParams = JSON.stringify(useRequestStore.getState().queryParams);
    const expectedBody = useRequestStore.getState().getBodyForStorage();
    const { result } = renderHook(() => useHttpRequest());

    const sendPromise = result.current.send();
    await vi.waitFor(() => expect(mocks.sendHttpRequest).toHaveBeenCalledTimes(1));
    switchToRequestB({
      currentHistoryId: 42,
      currentFavoriteId: null,
      suppressPersistToProject: true,
      currentProjectId: null,
      currentModuleId: null,
      currentEndpointId: null,
    });
    pending.resolve(responseA);
    await sendPromise;

    expect(mocks.updateFavorite).toHaveBeenCalledWith(
      51,
      '请求 A',
      'http',
      'POST',
      'https://a.example.test/items',
      expectedHeaders,
      expectedParams,
      expectedBody
    );
    expect(mocks.updateHistory).not.toHaveBeenCalled();
    expect(mocks.addHistory).toHaveBeenCalledWith(
      'http',
      'POST',
      'https://a.example.test/items',
      expectedHeaders,
      expectedParams,
      expectedBody,
      200,
      31,
      JSON.stringify(responseA.headers),
      responseA.body,
      '请求 A'
    );
  });

  it('未切换时正常保存项目响应、历史并显示响应', async () => {
    mocks.sendHttpRequest.mockResolvedValueOnce(responseA);
    setRequestA();
    const { result } = renderHook(() => useHttpRequest());

    await result.current.send();

    expect(mocks.updateApiEndpoint).toHaveBeenCalledWith(111, {
      response_status: 200,
      response_time_ms: 31,
      response_headers: JSON.stringify(responseA.headers),
      response_body: responseA.body,
    });
    expect(mocks.addHistory).toHaveBeenCalledTimes(1);
    expect(useResponseStore.getState().http).toMatchObject({
      status: 200,
      statusText: 'OK',
      headers: responseA.headers,
      body: responseA.body,
      timeMs: 31,
      loading: false,
      error: undefined,
    });
  });

  it('请求期间编辑当前接口时不显示旧响应，但会结束自己的 loading', async () => {
    const pending = deferred<typeof responseA>();
    mocks.sendHttpRequest.mockReturnValueOnce(pending.promise);
    setRequestA();
    useResponseStore.getState().setHttpResponse({
      status: 202,
      headers: { 'x-before': 'edit' },
      body: '编辑前保留的响应',
      loading: false,
    });
    const { result } = renderHook(() => useHttpRequest());

    const sendPromise = result.current.send();
    await vi.waitFor(() => expect(mocks.sendHttpRequest).toHaveBeenCalledTimes(1));
    useRequestStore.setState({
      method: 'PUT',
      url: 'https://a.example.test/items/edited',
    });
    pending.resolve(responseA);
    await sendPromise;

    expect(useResponseStore.getState().http).toMatchObject({
      status: 202,
      headers: { 'x-before': 'edit' },
      body: '编辑前保留的响应',
      loading: false,
      error: undefined,
    });
  });

  it('较早请求先完成时不结束仍在等待的较新请求 loading', async () => {
    const first = deferred<typeof responseA>();
    const second = deferred<typeof responseA>();
    mocks.sendHttpRequest
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    setRequestA();
    const { result } = renderHook(() => useHttpRequest());

    const firstPromise = result.current.send();
    await vi.waitFor(() => expect(mocks.sendHttpRequest).toHaveBeenCalledTimes(1));
    useRequestStore.setState({ body: '{"request":"A2"}' });
    const secondPromise = result.current.send();
    await vi.waitFor(() => expect(mocks.sendHttpRequest).toHaveBeenCalledTimes(2));

    first.resolve({ ...responseA, body: '{"result":"A1"}' });
    await firstPromise;
    expect(useResponseStore.getState().http.loading).toBe(true);

    second.resolve({ ...responseA, body: '{"result":"A2"}' });
    await secondPromise;
    expect(useResponseStore.getState().http).toMatchObject({
      body: '{"result":"A2"}',
      loading: false,
    });
  });

  it('同一接口重复发送且响应乱序时只让较新的响应更新项目和视图', async () => {
    const first = deferred<typeof responseA>();
    const second = deferred<typeof responseA>();
    mocks.sendHttpRequest
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    setRequestA();
    const { result } = renderHook(() => useHttpRequest());

    const firstPromise = result.current.send();
    await vi.waitFor(() => expect(mocks.sendHttpRequest).toHaveBeenCalledTimes(1));
    useRequestStore.setState({ body: '{"request":"A2"}', endpointRemark: '请求 A2' });
    const secondPromise = result.current.send();
    await vi.waitFor(() => expect(mocks.sendHttpRequest).toHaveBeenCalledTimes(2));

    second.resolve({ ...responseA, body: '{"result":"A2"}', timeMs: 12 });
    await secondPromise;
    first.resolve({ ...responseA, body: '{"result":"A1"}', timeMs: 80 });
    await firstPromise;

    const responseWrites = mocks.updateApiEndpoint.mock.calls.filter(
      ([, patch]) => patch.response_body !== undefined
    );
    expect(responseWrites[responseWrites.length - 1]).toEqual([
      111,
      {
        response_status: 200,
        response_time_ms: 12,
        response_headers: JSON.stringify(responseA.headers),
        response_body: '{"result":"A2"}',
      },
    ]);
    expect(useResponseStore.getState().http).toMatchObject({
      body: '{"result":"A2"}',
      timeMs: 12,
      loading: false,
    });
    expect(mocks.addHistory).toHaveBeenCalledTimes(2);
  });

  it('同一历史重复发送且较早请求晚成功时不覆盖较新响应', async () => {
    const first = deferred<typeof responseA>();
    const second = deferred<typeof responseA>();
    mocks.sendHttpRequest
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    setRequestA({
      currentHistoryId: 41,
      suppressPersistToProject: true,
      currentProjectId: null,
      currentModuleId: null,
      currentEndpointId: null,
    });
    const { result } = renderHook(() => useHttpRequest());

    const firstPromise = result.current.send();
    await vi.waitFor(() => expect(mocks.sendHttpRequest).toHaveBeenCalledTimes(1));
    useRequestStore.setState({ body: '{"request":"history-B"}', endpointRemark: '历史 B' });
    const secondPromise = result.current.send();
    await vi.waitFor(() => expect(mocks.sendHttpRequest).toHaveBeenCalledTimes(2));

    second.resolve({ ...responseA, body: '{"result":"history-B"}', timeMs: 12 });
    await secondPromise;
    first.resolve({ ...responseA, body: '{"result":"history-A"}', timeMs: 80 });
    await firstPromise;

    expect(mocks.updateHistory).toHaveBeenCalledTimes(1);
    expect(mocks.updateHistory.mock.calls[0][0]).toBe(41);
    expect(mocks.updateHistory.mock.calls[0][10]).toBe('{"result":"history-B"}');
    expect(mocks.updateHistory.mock.calls[0][11]).toBe('历史 B');
  });

  it('同一历史重复发送且较早请求晚失败时不清空较新响应', async () => {
    const first = deferred<typeof responseA>();
    const second = deferred<typeof responseA>();
    mocks.sendHttpRequest
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    setRequestA({
      currentHistoryId: 41,
      suppressPersistToProject: true,
      currentProjectId: null,
      currentModuleId: null,
      currentEndpointId: null,
    });
    const { result } = renderHook(() => useHttpRequest());

    const firstPromise = result.current.send();
    await vi.waitFor(() => expect(mocks.sendHttpRequest).toHaveBeenCalledTimes(1));
    useRequestStore.setState({ body: '{"request":"history-B"}', endpointRemark: '历史 B' });
    const secondPromise = result.current.send();
    await vi.waitFor(() => expect(mocks.sendHttpRequest).toHaveBeenCalledTimes(2));

    second.resolve({ ...responseA, body: '{"result":"history-B"}', timeMs: 12 });
    await secondPromise;
    first.reject(new Error('history-A late failure'));
    await firstPromise;

    expect(mocks.updateHistory).toHaveBeenCalledTimes(1);
    expect(mocks.updateHistory.mock.calls[0][10]).toBe('{"result":"history-B"}');
    expect(mocks.updateHistory.mock.calls[0][11]).toBe('历史 B');
  });

  it('同一收藏重复发送且较早请求晚成功时不回滚收藏，但保留两条历史', async () => {
    const first = deferred<typeof responseA>();
    const second = deferred<typeof responseA>();
    mocks.sendHttpRequest
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    setRequestA({
      currentFavoriteId: 51,
      suppressPersistToProject: true,
      currentProjectId: null,
      currentModuleId: null,
      currentEndpointId: null,
    });
    const { result } = renderHook(() => useHttpRequest());

    const firstPromise = result.current.send();
    await vi.waitFor(() => expect(mocks.sendHttpRequest).toHaveBeenCalledTimes(1));
    useRequestStore.setState({ body: '{"request":"favorite-B"}', endpointRemark: '收藏 B' });
    const secondPromise = result.current.send();
    await vi.waitFor(() => expect(mocks.sendHttpRequest).toHaveBeenCalledTimes(2));

    second.resolve({ ...responseA, body: '{"result":"favorite-B"}', timeMs: 12 });
    await secondPromise;
    first.resolve({ ...responseA, body: '{"result":"favorite-A"}', timeMs: 80 });
    await firstPromise;

    expect(mocks.updateFavorite).toHaveBeenCalledTimes(1);
    expect(mocks.updateFavorite.mock.calls[0][0]).toBe(51);
    expect(mocks.updateFavorite.mock.calls[0][1]).toBe('收藏 B');
    expect(mocks.updateFavorite.mock.calls[0][7]).toContain('favorite-B');
    expect(mocks.addHistory).toHaveBeenCalledTimes(2);
    expect(mocks.addHistory.mock.calls.map((call) => call[9])).toEqual([
      '{"result":"favorite-B"}',
      '{"result":"favorite-A"}',
    ]);
  });
});
