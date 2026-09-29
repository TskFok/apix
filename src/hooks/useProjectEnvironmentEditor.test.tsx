import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseProjectGlobalConfig, serializeProjectGlobalConfig } from '../lib/projectMerge';
import { useRequestStore } from '../stores/requestStore';
import { useResponseStore } from '../stores/responseStore';
import type { ProjectRow } from '../types';
import { useProjectEnvironmentEditor } from './useProjectEnvironmentEditor';

const mocks = vi.hoisted(() => ({ getProject: vi.fn(), updateProject: vi.fn() }));
vi.mock('../lib/db', () => mocks);

function project(id: number, baseUrl = `https://project-${id}.test`): ProjectRow {
  return {
    id, name: `项目 ${id}`, sort_order: 0, created_at: 0, updated_at: 0,
    global_config: serializeProjectGlobalConfig({ headers: [], variables: [], baseUrl }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProject.mockImplementation(async (id: number) => project(id));
  mocks.updateProject.mockResolvedValue(undefined);
  useRequestStore.setState({
    currentProjectId: 1,
    currentModuleId: 11,
    currentEndpointId: 111,
    url: '/unsaved-request',
    body: '未保存的请求正文',
    projectGlobalConfig: parseProjectGlobalConfig(project(1).global_config),
  });
  useResponseStore.setState({ projectsRefreshTrigger: 0 });
});

describe('useProjectEnvironmentEditor', () => {
  it('未选择和选择当前项目时复用请求配置及保存方法', async () => {
    const { result } = renderHook(() => useProjectEnvironmentEditor());
    const request = useRequestStore.getState();
    expect(result.current.context).toEqual({
      projectId: 1,
      config: request.projectGlobalConfig,
      updateConfig: request.updateProjectGlobalConfig,
      flush: request.flushProjectGlobalsDraft,
    });
    await act(async () => { await result.current.selectEnvironmentProject(project(1)); });
    expect(result.current.context.config).toBe(request.projectGlobalConfig);
    expect(mocks.getProject).not.toHaveBeenCalled();
  });

  it('读取目标项目最新配置，保存时固定目标 ID，保留当前请求', async () => {
    const { result } = renderHook(() => useProjectEnvironmentEditor());
    const request = useRequestStore.getState();
    await act(async () => { await result.current.selectEnvironmentProject(project(2, 'https://stale.test')); });
    expect(result.current.context.config?.baseUrl).toBe('https://project-2.test');
    act(() => result.current.context.updateConfig({ ...result.current.context.config!, baseUrl: 'https://edited.test' }));
    await act(async () => { expect(await result.current.context.flush()).toBe(true); });
    expect(mocks.updateProject).toHaveBeenCalledWith(2, expect.objectContaining({
      global_config: expect.stringContaining('https://edited.test'),
    }));
    expect(useRequestStore.getState()).toBe(request);
    expect(useResponseStore.getState().projectsRefreshTrigger).toBe(1);
  });

  it('加载期间隐藏配置，忽略较早选择的迟到响应', async () => {
    const slow = deferred<ProjectRow>();
    mocks.getProject.mockImplementation((id: number) => id === 2 ? slow.promise : Promise.resolve(project(id)));
    const { result } = renderHook(() => useProjectEnvironmentEditor());
    let first!: Promise<boolean>;
    act(() => { first = result.current.selectEnvironmentProject(project(2)); });
    expect(result.current.context.projectId).toBe(2);
    expect(result.current.context.config).toBeNull();
    await act(async () => { await result.current.selectEnvironmentProject(project(3)); });
    await act(async () => { slow.resolve(project(2)); await first; });
    expect(result.current.context.projectId).toBe(3);
    expect(result.current.context.config?.baseUrl).toBe('https://project-3.test');
  });

  it('切换前保存旧草稿，并串行去重连续保存', async () => {
    const save = deferred<void>();
    mocks.updateProject.mockImplementationOnce(() => save.promise);
    const { result } = renderHook(() => useProjectEnvironmentEditor());
    await act(async () => { await result.current.selectEnvironmentProject(project(2)); });
    const unchanged = result.current.context;
    await act(async () => { await unchanged.flush(); });
    expect(mocks.updateProject).not.toHaveBeenCalled();
    act(() => result.current.context.updateConfig({ ...result.current.context.config!, baseUrl: 'https://first.test' }));
    let first!: Promise<boolean>;
    act(() => { first = result.current.context.flush(); });
    await waitFor(() => expect(mocks.updateProject).toHaveBeenCalledTimes(1));
    act(() => result.current.context.updateConfig({ ...result.current.context.config!, baseUrl: 'https://latest.test' }));
    let second!: Promise<boolean>;
    let change!: Promise<boolean>;
    act(() => {
      second = result.current.context.flush();
      change = result.current.selectEnvironmentProject(project(3));
    });
    expect(mocks.getProject).not.toHaveBeenCalledWith(3);
    expect(mocks.updateProject).toHaveBeenCalledTimes(1);
    await act(async () => { save.resolve(); await Promise.all([first, second, change]); });
    expect(mocks.updateProject).toHaveBeenCalledTimes(2);
    expect(mocks.updateProject.mock.calls[1][0]).toBe(2);
    expect(JSON.parse(mocks.updateProject.mock.calls[1][1].global_config).baseUrl).toBe('https://latest.test');
    expect(result.current.context.projectId).toBe(3);
    await act(async () => { await unchanged.flush(); });
    expect(mocks.updateProject).toHaveBeenCalledTimes(2);
  });

  it('返回请求上下文前完成旧独立草稿保存', async () => {
    const { result } = renderHook(() => useProjectEnvironmentEditor());
    await act(async () => { await result.current.selectEnvironmentProject(project(2)); });
    act(() => result.current.context.updateConfig({ ...result.current.context.config!, baseUrl: 'https://saved.test' }));
    await act(async () => { expect(await result.current.selectEnvironmentProject(null)).toBe(true); });
    expect(mocks.updateProject).toHaveBeenCalledWith(2, expect.anything());
    expect(result.current.context.config).toBe(useRequestStore.getState().projectGlobalConfig);
  });

  it('连续返回请求上下文时都必须等待旧草稿保存完成', async () => {
    const save = deferred<void>();
    mocks.updateProject.mockImplementationOnce(() => save.promise);
    const { result } = renderHook(() => useProjectEnvironmentEditor());
    await act(async () => { await result.current.selectEnvironmentProject(project(2)); });
    act(() => result.current.context.updateConfig({ ...result.current.context.config!, baseUrl: 'https://saved.test' }));
    let first!: Promise<boolean>;
    act(() => { first = result.current.selectEnvironmentProject(null); });
    await waitFor(() => expect(mocks.updateProject).toHaveBeenCalledTimes(1));
    let second!: Promise<boolean>;
    let secondFinished = false;
    await act(async () => {
      second = result.current.selectEnvironmentProject(null).then((saved) => {
        secondFinished = true;
        return saved;
      });
      await Promise.resolve();
    });
    expect(secondFinished).toBe(false);
    await act(async () => {
      save.resolve();
      expect(await first).toBe(false);
      expect(await second).toBe(true);
    });
    expect(mocks.updateProject).toHaveBeenCalledTimes(1);
  });

  it('保存失败时保留旧项目草稿供重试', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useProjectEnvironmentEditor());
    await act(async () => { await result.current.selectEnvironmentProject(project(2)); });
    act(() => result.current.context.updateConfig({ ...result.current.context.config!, baseUrl: 'https://retry.test' }));
    mocks.updateProject.mockRejectedValueOnce(new Error('保存失败'));
    await act(async () => { expect(await result.current.selectEnvironmentProject(project(3))).toBe(false); });
    expect(result.current.context.projectId).toBe(2);
    expect(result.current.context.config?.baseUrl).toBe('https://retry.test');
    expect(mocks.getProject).not.toHaveBeenCalledWith(3);
    await act(async () => { expect(await result.current.context.flush()).toBe(true); });
    log.mockRestore();
  });

  it('请求切换后仍为已选项目创建独立上下文', async () => {
    const { result } = renderHook(() => useProjectEnvironmentEditor());
    await act(async () => { await result.current.selectEnvironmentProject(project(1)); });
    act(() => useRequestStore.setState({ currentProjectId: 2, projectGlobalConfig: parseProjectGlobalConfig(project(2).global_config) }));
    await waitFor(() => expect(result.current.context.config?.baseUrl).toBe('https://project-1.test'));
    expect(result.current.context.projectId).toBe(1);
  });
});
