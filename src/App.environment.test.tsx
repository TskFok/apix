import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { message } from '@tauri-apps/plugin-dialog';
import App from './App';
import { useRequestStore } from './stores/requestStore';
import type { ProjectRow } from './types';

const { projects, updateProject } = vi.hoisted(() => ({
  projects: [] as ProjectRow[],
  updateProject: vi.fn(),
}));

vi.mock('@tauri-apps/api/app', () => ({ setTheme: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  message: vi.fn(), confirm: vi.fn(), open: vi.fn(), save: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile: vi.fn(), writeTextFile: vi.fn() }));
vi.mock('./lib/errorLog', () => ({ setupGlobalErrorCollection: vi.fn() }));
vi.mock('./lib/db', () => ({
  initDb: vi.fn().mockResolvedValue(undefined),
  getProject: vi.fn(async (id: number) => projects.find((p) => p.id === id) ?? null),
  listProjects: vi.fn(async () => [...projects]),
  listModulesByProjectIds: vi.fn(async () => ({
    1: [{ id: 10, project_id: 1, name: '用户模块', sort_order: 0, created_at: 0, updated_at: 0 }],
  })),
  listEndpointsByModuleIds: vi.fn(async () => ({})),
  updateProject,
  addProject: vi.fn(), addModule: vi.fn(), updateModule: vi.fn(),
  deleteProject: vi.fn(), deleteModule: vi.fn(), deleteApiEndpoint: vi.fn(),
  searchProjectTree: vi.fn(), copyApiEndpoint: vi.fn(), moveApiEndpoint: vi.fn(),
  reorderModules: vi.fn(), reorderEndpoints: vi.fn(),
}));
vi.mock('./hooks/useHttpRequest', () => ({ useHttpRequest: () => ({ send: vi.fn() }) }));
vi.mock('./hooks/useWebSocket', () => ({
  useWebSocket: () => ({ connect: vi.fn(), disconnect: vi.fn(), send: vi.fn() }),
}));
vi.mock('./hooks/useSSE', () => ({ useSSE: () => ({ connect: vi.fn(), disconnect: vi.fn() }) }));
vi.mock('./components/RequestBuilder', () => ({ RequestBuilder: () => null }));
vi.mock('./components/ResponseViewer', () => ({ ResponseViewer: () => null }));
vi.mock('./components/StreamViewer', () => ({ StreamViewer: () => null }));
vi.mock('./components/HistoryPanel', () => ({ HistoryPanel: () => null }));
vi.mock('./components/FavoritesPanel', () => ({ FavoritesPanel: () => null }));

describe('项目树环境入口', () => {
  afterEach(() => vi.unstubAllGlobals());

  beforeEach(async () => {
    vi.clearAllMocks();
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    updateProject.mockImplementation(async (id: number, patch: Partial<ProjectRow>) => {
      const project = projects.find((p) => p.id === id);
      if (project) Object.assign(project, patch);
    });
    await useRequestStore.getState().newRequest();
    projects.splice(0, projects.length, {
      id: 1, name: '用户项目', sort_order: 0, created_at: 0, updated_at: 0,
      global_config: JSON.stringify({
        headers: [], variables: [], activeEnvironmentId: 'test',
        environments: [{ id: 'test', name: '测试', baseUrl: 'https://test.example.com', headers: [], variables: [] }],
      }),
    });
  });

  it.each(['用户项目', '用户模块'])('点击%s后可打开环境编辑且不改变当前请求', async (name) => {
    useRequestStore.getState().setUrl('https://draft.example.com');
    const requestBefore = useRequestStore.getState();
    render(<App />);
    expect(screen.queryByRole('button', { name: /打开环境快速编辑/ })).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name }));
    fireEvent.click(await screen.findByRole('button', { name: '打开环境快速编辑，当前环境：测试' }));

    const dialog = screen.getByRole('dialog', { name: '项目全局快速编辑' });
    expect(within(dialog).getByLabelText('Base URL')).toHaveValue('https://test.example.com');
    expect(useRequestStore.getState()).toMatchObject({
      url: requestBefore.url,
      currentProjectId: null,
      currentModuleId: null,
      currentEndpointId: null,
      projectGlobalConfig: null,
    });
  });

  it('浏览另一项目时环境编辑保存到所选项目，原接口和环境保持不变', async () => {
    const originalConfig = {
      headers: [], variables: [], activeEnvironmentId: 'prod',
      environments: [{ id: 'prod', name: '生产', baseUrl: 'https://prod.example.com', headers: [], variables: [] }],
    };
    await useRequestStore.getState().setProjectContext({
      projectId: 2, moduleId: 20, endpointId: 200, globalConfig: originalConfig,
    });
    useRequestStore.getState().setUrl('/original');
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '用户项目' }));
    fireEvent.click(await screen.findByRole('button', { name: '打开环境快速编辑，当前环境：测试' }));
    const dialog = screen.getByRole('dialog', { name: '项目全局快速编辑' });
    fireEvent.change(within(dialog).getByLabelText('Base URL'), { target: { value: 'https://saved.example.com' } });
    await act(async () => {
      fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    });
    expect(JSON.parse(projects[0].global_config).environments[0].baseUrl).toBe('https://saved.example.com');
    fireEvent.change(within(dialog).getByLabelText('Base URL'), { target: { value: 'https://edited.example.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '关闭项目全局快速编辑' }));

    await waitFor(() => {
      expect(JSON.parse(projects[0].global_config).environments[0].baseUrl).toBe('https://edited.example.com');
    });
    expect(useRequestStore.getState()).toMatchObject({
      currentProjectId: 2, currentModuleId: 20, currentEndpointId: 200,
      url: '/original', projectGlobalConfig: originalConfig,
    });

    fireEvent.click(screen.getByRole('button', { name: '历史' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '打开环境快速编辑，当前环境：生产' })).toBeInTheDocument();
    });
  });

  it('同项目环境编辑立即同步当前请求配置，快捷键保存后关闭', async () => {
    await useRequestStore.getState().setProjectContext({
      projectId: 1, moduleId: 10, endpointId: 100,
      globalConfig: JSON.parse(projects[0].global_config),
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: '用户模块' }));
    fireEvent.click(await screen.findByRole('button', { name: '打开环境快速编辑，当前环境：测试' }));
    const dialog = screen.getByRole('dialog', { name: '项目全局快速编辑' });
    fireEvent.change(within(dialog).getByLabelText('Base URL'), { target: { value: 'https://same.example.com' } });
    expect(useRequestStore.getState().projectGlobalConfig?.environments?.[0].baseUrl).toBe('https://same.example.com');
    await act(async () => {
      fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    });
    expect(JSON.parse(projects[0].global_config).environments[0].baseUrl).toBe('https://same.example.com');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('项目设置页打开其他项目的环境弹窗时，保存快捷键只处理弹窗', async () => {
    await useRequestStore.getState().enterProjectSettingsView(2, {
      headers: [], variables: [],
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: '用户项目' }));
    fireEvent.click(await screen.findByRole('button', { name: '打开环境快速编辑，当前环境：测试' }));
    const dialog = screen.getByRole('dialog', { name: '项目全局快速编辑' });
    fireEvent.change(within(dialog).getByLabelText('Base URL'), { target: { value: 'https://dialog.example.com' } });
    await act(async () => {
      fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    });
    expect(message).toHaveBeenCalledTimes(1);
    expect(JSON.parse(projects[0].global_config).environments[0].baseUrl).toBe('https://dialog.example.com');
  });
});
