import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { ProjectTreePanel } from './ProjectTreePanel';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { buildProjectExportPayload, importProjectAsNew, parseProjectExportJson } from '../../lib/projectImportExport';
import { useRequestStore } from '../../stores/requestStore';
import type { ApiEndpointRow, ModuleRow, ProjectRow } from '../../types';

const {
  moduleRowsRef,
  endpointRowsRef,
  addModuleMock,
  copyApiEndpointMock,
  moveApiEndpointMock,
  deleteProjectMock,
  deleteModuleMock,
  deleteApiEndpointMock,
  updateProjectMock,
  updateModuleMock,
  getProjectMock,
  searchProjectTreeMock,
  listProjectsMock,
  listModulesByProjectIdsMock,
  listEndpointsByModuleIdsMock,
  testProject,
} = vi.hoisted(() => {
  const moduleRowsRef: { current: ModuleRow[] } = { current: [] };
  const endpointRowsRef: { current: ApiEndpointRow[] } = { current: [] };
  const testProject: ProjectRow = {
    id: 1,
    name: '测试项目',
    sort_order: 0,
    global_config: '{}',
    created_at: 0,
    updated_at: 0,
  };
  return {
    moduleRowsRef,
    endpointRowsRef,
    addModuleMock: vi.fn(),
    copyApiEndpointMock: vi.fn(),
    moveApiEndpointMock: vi.fn(),
    deleteProjectMock: vi.fn(),
    deleteModuleMock: vi.fn(),
    deleteApiEndpointMock: vi.fn(),
    updateProjectMock: vi.fn(),
    updateModuleMock: vi.fn(),
    getProjectMock: vi.fn(),
    searchProjectTreeMock: vi.fn(),
    listProjectsMock: vi.fn(),
    listModulesByProjectIdsMock: vi.fn(),
    listEndpointsByModuleIdsMock: vi.fn(),
    testProject,
  };
});

vi.mock('../../lib/db', () => ({
  listProjects: listProjectsMock,
  listModulesByProjectIds: listModulesByProjectIdsMock,
  listEndpointsByModuleIds: listEndpointsByModuleIdsMock,
  addProject: vi.fn(),
  addModule: addModuleMock,
  updateProject: updateProjectMock,
  updateModule: updateModuleMock,
  deleteProject: deleteProjectMock,
  deleteModule: deleteModuleMock,
  deleteApiEndpoint: deleteApiEndpointMock,
  getProject: getProjectMock,
  searchProjectTree: searchProjectTreeMock,
  copyApiEndpoint: copyApiEndpointMock,
  moveApiEndpoint: moveApiEndpointMock,
  reorderModules: vi.fn(),
  reorderEndpoints: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  confirm: vi.fn().mockResolvedValue(true),
  message: vi.fn().mockResolvedValue(undefined),
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock('../../lib/projectImportExport', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../lib/projectImportExport')>(),
  buildProjectExportPayload: vi.fn(),
  importProjectAsNew: vi.fn(),
}));

function createMemoryStorage(): Storage {
  const mem: Record<string, string> = {};
  return {
    getItem: (k: string) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
    setItem: (k: string, v: string) => {
      mem[k] = v;
    },
    removeItem: (k: string) => {
      delete mem[k];
    },
    clear: () => {
      Object.keys(mem).forEach((k) => delete mem[k]);
    },
    key: (i: number) => Object.keys(mem)[i] ?? null,
    get length() {
      return Object.keys(mem).length;
    },
  } as Storage;
}

describe('ProjectTreePanel', () => {
  beforeEach(async () => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    vi.clearAllMocks();
    moduleRowsRef.current = [];
    endpointRowsRef.current = [];
    listProjectsMock.mockResolvedValue([testProject]);
    getProjectMock.mockResolvedValue(testProject);
    searchProjectTreeMock.mockResolvedValue([]);
    listModulesByProjectIdsMock.mockImplementation(async (projectIds: number[]) => {
      const out: Record<number, ModuleRow[]> = {};
      for (const projectId of projectIds) {
        out[projectId] = moduleRowsRef.current.filter((m) => m.project_id === projectId);
      }
      return out;
    });
    listEndpointsByModuleIdsMock.mockImplementation(async (moduleIds: number[]) => {
      const out: Record<number, ApiEndpointRow[]> = {};
      for (const moduleId of moduleIds) {
        out[moduleId] = endpointRowsRef.current.filter((ep) => ep.module_id === moduleId);
      }
      return out;
    });
    addModuleMock.mockImplementation(async (projectId: number, name: string) => {
      const id = 42;
      moduleRowsRef.current.push({
        id,
        project_id: projectId,
        name,
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
      });
      return id;
    });
    copyApiEndpointMock.mockImplementation(async (id: number, targetModuleId: number) => {
      const source = endpointRowsRef.current.find((ep) => ep.id === id);
      if (!source) return 0;
      const copiedId = 101;
      endpointRowsRef.current.push({
        ...source,
        id: copiedId,
        module_id: targetModuleId,
        name: `${source.name} 副本`,
      });
      return copiedId;
    });
    moveApiEndpointMock.mockResolvedValue(undefined);
    updateProjectMock.mockResolvedValue(undefined);
    updateModuleMock.mockResolvedValue(undefined);
    await useRequestStore.getState().newRequest();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('项目行图标按钮具备 aria-label，且不挂原生 title（说明由 FastTooltip 更快展示）', async () => {
    render(<ProjectTreePanel />);
    expect(await screen.findByText('测试项目')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新建模块' })).not.toHaveAttribute('title');
    expect(screen.getByRole('button', { name: '新建模块' })).toHaveAttribute('aria-label', '新建模块');
    expect(screen.getByRole('button', { name: '导出项目 JSON' })).not.toHaveAttribute('title');
    expect(screen.getByRole('button', { name: '导出接口文档 HTML' })).not.toHaveAttribute('title');
    expect(screen.getByRole('button', { name: '重命名项目' })).not.toHaveAttribute('title');
  });

  it('HTML 导出弹窗说明敏感内容与真实响应会被安全省略', async () => {
    render(<ProjectTreePanel />);
    fireEvent.click(await screen.findByRole('button', { name: '导出接口文档 HTML' }));

    expect(await screen.findByRole('dialog', { name: /导出接口文档 HTML/ })).toHaveTextContent(
      '接口文档会脱敏认证与常见敏感字段，并省略最近响应内容和非结构化请求体'
    );
  });

  it('项目树搜索栏上方区域固定在列表滚动容器之外', async () => {
    const { container } = render(<ProjectTreePanel />);
    expect(await screen.findByText('测试项目')).toBeInTheDocument();

    const fixedArea = container.querySelector('.project-tree-fixed');
    const scrollArea = container.querySelector('.project-tree-scroll');
    const header = container.querySelector('.project-tree-header');
    const search = container.querySelector('.project-tree-search');
    const list = container.querySelector('.project-tree-list');

    expect(fixedArea).toContainElement(header as HTMLElement);
    expect(fixedArea).toContainElement(search as HTMLElement);
    expect(scrollArea).toContainElement(list as HTMLElement);
    expect(scrollArea).not.toContainElement(header as HTMLElement);
    expect(scrollArea).not.toContainElement(search as HTMLElement);
  });

  it('点击项目名称只切换列表展开状态，保留当前请求和项目上下文', async () => {
    moduleRowsRef.current = [
      {
        id: 10,
        project_id: 1,
        name: '用户模块',
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
      },
    ];
    await useRequestStore.getState().setProjectContext({
      projectId: 2,
      moduleId: 20,
      endpointId: 200,
      globalConfig: {
        headers: [{ key: 'X-Draft', value: 'draft', description: '', enabled: true }],
        variables: [],
      },
    });
    useRequestStore.getState().setUrl('https://api.example.com/draft');
    useRequestStore.getState().setCurrentHistoryId(99);
    const requestBeforeClick = useRequestStore.getState();

    const onSelectEnvironmentProject = vi.fn();
    render(<ProjectTreePanel onSelectEnvironmentProject={onSelectEnvironmentProject} />);
    const projectButton = await screen.findByRole('button', { name: '测试项目' });
    expect(screen.getByText('用户模块')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(projectButton);
    });
    expect(screen.queryByText('用户模块')).not.toBeInTheDocument();
    expect(projectButton).toHaveAttribute('aria-expanded', 'false');
    expect(useRequestStore.getState()).toEqual(requestBeforeClick);
    expect(onSelectEnvironmentProject).toHaveBeenCalledWith(testProject);

    await act(async () => {
      fireEvent.click(projectButton);
    });
    expect(screen.getByText('用户模块')).toBeInTheDocument();
    expect(projectButton).toHaveAttribute('aria-expanded', 'true');
    expect(useRequestStore.getState()).toEqual(requestBeforeClick);
    expect(onSelectEnvironmentProject).toHaveBeenCalledTimes(2);
  });

  it('点击模块名称选择所属项目环境，但保留当前请求归属', async () => {
    moduleRowsRef.current = [{ id: 10, project_id: 1, name: '用户模块', sort_order: 0, created_at: 0, updated_at: 0 }];
    await useRequestStore.getState().setProjectContext({
      projectId: 2,
      moduleId: 20,
      endpointId: 200,
      globalConfig: { headers: [], variables: [] },
    });
    useRequestStore.getState().setUrl('https://api.example.com/draft');
    const onSelectEnvironmentProject = vi.fn();
    render(<ProjectTreePanel onSelectEnvironmentProject={onSelectEnvironmentProject} />);

    fireEvent.click(await screen.findByRole('button', { name: '用户模块' }));

    expect(onSelectEnvironmentProject).toHaveBeenCalledWith(testProject);
    expect(useRequestStore.getState().newEndpointTargetModule).toEqual({ projectId: 1, moduleId: 10 });
    expect(useRequestStore.getState().currentProjectId).toBe(2);
    expect(useRequestStore.getState().currentEndpointId).toBe(200);
    expect(useRequestStore.getState().url).toBe('https://api.example.com/draft');
  });

  it('选择接口前等待环境编辑目标切换完成', async () => {
    moduleRowsRef.current = [{ id: 10, project_id: 1, name: '用户模块', sort_order: 0, created_at: 0, updated_at: 0 }];
    endpointRowsRef.current = [{
      id: 100, module_id: 10, name: '登录接口', protocol: 'http', method: 'GET',
      url: 'https://api.example.com/login', headers: '{}', params: '{}', body: '{}',
      sort_order: 0, created_at: 0, updated_at: 0,
      response_status: null, response_headers: null, response_body: null, response_time_ms: null,
    }];
    let finishEnvironmentSave!: () => void;
    const environmentSaved = new Promise<boolean>((resolve) => { finishEnvironmentSave = () => resolve(true); });
    const onSelectEnvironmentProject = vi.fn(() => environmentSaved);
    render(<ProjectTreePanel onSelectEnvironmentProject={onSelectEnvironmentProject} />);

    fireEvent.click(await screen.findByText('登录接口'));
    expect(onSelectEnvironmentProject).toHaveBeenCalledWith(null);
    expect(getProjectMock).not.toHaveBeenCalled();

    await act(async () => { finishEnvironmentSave(); });
    await waitFor(() => expect(getProjectMock).toHaveBeenCalledWith(1));
    expect(useRequestStore.getState().currentEndpointId).toBe(100);
  });

  it('环境草稿保存失败时不切换接口', async () => {
    moduleRowsRef.current = [{ id: 10, project_id: 1, name: '用户模块', sort_order: 0, created_at: 0, updated_at: 0 }];
    endpointRowsRef.current = [{
      id: 100, module_id: 10, name: '登录接口', protocol: 'http', method: 'GET',
      url: 'https://api.example.com/login', headers: '{}', params: '{}', body: '{}',
      sort_order: 0, created_at: 0, updated_at: 0,
      response_status: null, response_headers: null, response_body: null, response_time_ms: null,
    }];
    const onSelectEnvironmentProject = vi.fn().mockResolvedValue(false);
    render(<ProjectTreePanel onSelectEnvironmentProject={onSelectEnvironmentProject} />);

    fireEvent.click(await screen.findByText('登录接口'));
    await waitFor(() => expect(onSelectEnvironmentProject).toHaveBeenCalledWith(null));

    expect(getProjectMock).not.toHaveBeenCalled();
    expect(useRequestStore.getState().currentEndpointId).toBeNull();
  });

  it('新建模块后默认选中该模块，供「+ 新建」创建接口', async () => {
    render(<ProjectTreePanel />);

    expect(await screen.findByText('测试项目')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '展开所有项目与模块' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '折叠所有项目与模块' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '新建模块' }));
    const input = screen.getByPlaceholderText('模块名称');
    fireEvent.change(input, { target: { value: '新模块' } });
    fireEvent.click(screen.getByRole('button', { name: '确定' }));

    await waitFor(() => {
      expect(useRequestStore.getState().newEndpointTargetModule).toEqual({
        projectId: 1,
        moduleId: 42,
      });
    });
    expect(addModuleMock).toHaveBeenCalledWith(1, '新模块');
  });

  it('重命名项目会调用 updateProject', async () => {
    render(<ProjectTreePanel />);
    expect(await screen.findByText('测试项目')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重命名项目' }));
    const input = screen.getByPlaceholderText('项目名称');
    fireEvent.change(input, { target: { value: '改后项目' } });
    fireEvent.click(screen.getByRole('button', { name: '确定' }));

    await waitFor(() => {
      expect(updateProjectMock).toHaveBeenCalledWith(1, { name: '改后项目' });
    });
  });

  it('重命名模块会调用 updateModule', async () => {
    moduleRowsRef.current = [
      {
        id: 10,
        project_id: 1,
        name: '原模块',
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
      },
    ];
    render(<ProjectTreePanel />);
    expect(await screen.findByText('原模块')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重命名模块' }));
    const input = screen.getByPlaceholderText('模块名称');
    fireEvent.change(input, { target: { value: '新模块名' } });
    fireEvent.click(screen.getByRole('button', { name: '确定' }));

    await waitFor(() => {
      expect(updateModuleMock).toHaveBeenCalledWith(10, { name: '新模块名' });
    });
  });

  it.each([
    ['删除项目', deleteProjectMock, 1],
    ['删除模块', deleteModuleMock, 10],
    ['删除接口', deleteApiEndpointMock, 100],
  ] as const)('%s弹窗打开后直接按 Enter 确认', async (title, deleteMock, id) => {
    moduleRowsRef.current = [{
      id: 10, project_id: 1, name: '用户模块', sort_order: 0, created_at: 0, updated_at: 0,
    }];
    endpointRowsRef.current = [{
      id: 100, module_id: 10, name: '登录接口', protocol: 'http', method: 'GET',
      url: 'https://api.example.com/login', headers: '{}', params: '{}', body: '{}',
      sort_order: 0, created_at: 0, updated_at: 0, response_status: null,
      response_headers: null, response_body: null, response_time_ms: null,
    }];
    render(<ProjectTreePanel />);
    const trigger = await screen.findByRole('button', { name: title });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: title });
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });

    await waitFor(() => expect(deleteMock).toHaveBeenCalledExactlyOnceWith(id));
    expect(screen.queryByRole('dialog', { name: title })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('导入项目弹窗按 Enter 执行导入', async () => {
    const json = JSON.stringify({
      format: 'apix-project', version: 1, exportedAt: 1790726400000,
      project: { name: '导入项目', global_config: '{}' }, modules: [],
    });
    const payload = parseProjectExportJson(json);
    vi.mocked(open).mockResolvedValueOnce('/tmp/project.json');
    vi.mocked(readTextFile).mockResolvedValueOnce(json);
    render(<ProjectTreePanel />);
    fireEvent.click(await screen.findByRole('button', { name: '导入' }));
    const dialog = await screen.findByRole('dialog', { name: '导入项目' });

    expect(dialog).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });

    await waitFor(() => expect(importProjectAsNew).toHaveBeenCalledExactlyOnceWith(payload));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });

  it.each([
    ['输入法组合输入', { isComposing: true }],
    ['输入法兼容键码', { keyCode: 229 }],
    ['长按重复事件', { repeat: true }],
    ['Ctrl 组合键', { ctrlKey: true }],
    ['Command 组合键', { metaKey: true }],
    ['Alt 组合键', { altKey: true }],
    ['Shift 组合键', { shiftKey: true }],
  ])('删除确认忽略%s中的 Enter', async (_name, eventOptions) => {
    render(<ProjectTreePanel />);
    fireEvent.click(await screen.findByRole('button', { name: '删除项目' }));
    const dialog = screen.getByRole('dialog', { name: '删除项目' });

    fireEvent.keyDown(dialog, { key: 'Enter', ...eventOptions });

    expect(deleteProjectMock).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
  });

  it('取消按钮上的 Enter 保留按钮默认行为，弹窗关闭后不再响应回车', async () => {
    render(<ProjectTreePanel />);
    fireEvent.click(await screen.findByRole('button', { name: '删除项目' }));
    const cancel = within(screen.getByRole('dialog', { name: '删除项目' }))
      .getByRole('button', { name: '取消' });
    cancel.focus();

    // jsdom 不模拟键盘激活按钮；检查默认事件未被拦截，再模拟浏览器的 click。
    expect(fireEvent.keyDown(cancel, { key: 'Enter' })).toBe(true);
    expect(deleteProjectMock).not.toHaveBeenCalled();
    fireEvent.click(cancel);
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });

    expect(screen.queryByRole('dialog', { name: '删除项目' })).not.toBeInTheDocument();
    expect(deleteProjectMock).not.toHaveBeenCalled();
  });

  it('导出项目弹窗按 Enter 打开保存对话框', async () => {
    vi.mocked(buildProjectExportPayload).mockResolvedValueOnce(parseProjectExportJson(JSON.stringify({
      format: 'apix-project', version: 1, exportedAt: 1790726400000,
      project: { name: '测试项目', global_config: '{}' }, modules: [],
    })));
    vi.mocked(save).mockResolvedValueOnce(null);
    render(<ProjectTreePanel />);
    fireEvent.click(await screen.findByRole('button', { name: '导出项目 JSON' }));
    const dialog = await screen.findByRole('dialog', { name: /导出项目 JSON/ });

    expect(dialog).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });

  it('按 Escape 关闭删除项目确认弹窗且不删除项目', async () => {
    render(<ProjectTreePanel />);
    expect(await screen.findByText('测试项目')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '删除项目' }));
    expect(screen.getByRole('dialog', { name: '删除项目' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: '删除项目' })).not.toBeInTheDocument();
    expect(deleteProjectMock).not.toHaveBeenCalled();
  });

  it('按 Escape 关闭删除模块确认弹窗且不删除模块', async () => {
    moduleRowsRef.current = [
      {
        id: 10,
        project_id: 1,
        name: '用户模块',
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
      },
    ];
    render(<ProjectTreePanel />);
    expect(await screen.findByText('用户模块')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '删除模块' }));
    expect(screen.getByRole('dialog', { name: '删除模块' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: '删除模块' })).not.toBeInTheDocument();
    expect(deleteModuleMock).not.toHaveBeenCalled();
  });

  it('按 Escape 关闭删除接口确认弹窗且不删除接口', async () => {
    moduleRowsRef.current = [
      {
        id: 10,
        project_id: 1,
        name: '用户模块',
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
      },
    ];
    endpointRowsRef.current = [
      {
        id: 100,
        module_id: 10,
        name: '登录接口',
        protocol: 'http',
        method: 'GET',
        url: 'https://api.example.com/login',
        headers: '{}',
        params: '{}',
        body: '{}',
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
        response_status: null,
        response_headers: null,
        response_body: null,
        response_time_ms: null,
      },
    ];
    render(<ProjectTreePanel />);
    expect(await screen.findByText('登录接口')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '删除接口' }));
    expect(screen.getByRole('dialog', { name: '删除接口' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: '删除接口' })).not.toBeInTheDocument();
    expect(deleteApiEndpointMock).not.toHaveBeenCalled();
  });

  it('接口项将协议、method 与操作按钮放在接口名下一层', async () => {
    moduleRowsRef.current = [
      {
        id: 10,
        project_id: 1,
        name: '用户模块',
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
      },
    ];
    endpointRowsRef.current = [
      {
        id: 100,
        module_id: 10,
        name: '登录接口',
        protocol: 'http',
        method: 'GET',
        url: 'https://api.example.com/login',
        headers: '{}',
        params: '{}',
        body: '{}',
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
        response_status: null,
        response_headers: null,
        response_body: null,
        response_time_ms: null,
      },
    ];

    render(<ProjectTreePanel />);

    const endpointName = await screen.findByText('登录接口');
    const endpointItem = endpointName.closest('.project-endpoint-item');
    expect(endpointItem).not.toBeNull();

    const titleRow = endpointItem?.querySelector('.project-endpoint-title-row');
    const metaRow = endpointItem?.querySelector('.project-endpoint-meta-row');
    expect(titleRow).toContainElement(endpointName);
    expect(titleRow?.querySelector('.item-protocol')).toBeNull();
    expect(titleRow?.querySelector('.item-method')).toBeNull();

    expect(metaRow).toContainElement(screen.getByText('http'));
    expect(metaRow).toContainElement(screen.getByText('GET'));
    expect(metaRow).toContainElement(screen.getByRole('button', { name: '复制接口' }));
    expect(metaRow).toContainElement(screen.getByRole('button', { name: '移动接口' }));
    expect(metaRow).toContainElement(screen.getByRole('button', { name: '删除接口' }));
  });

  it('点击复制接口后跳转到新复制的接口位置', async () => {
    const scrollIntoViewMock = vi.fn();
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });
    moduleRowsRef.current = [
      {
        id: 10,
        project_id: 1,
        name: '用户模块',
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
      },
    ];
    endpointRowsRef.current = [
      {
        id: 100,
        module_id: 10,
        name: '登录接口',
        protocol: 'http',
        method: 'GET',
        url: 'https://api.example.com/login',
        headers: '{}',
        params: '{}',
        body: '{}',
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
        response_status: null,
        response_headers: null,
        response_body: null,
        response_time_ms: null,
      },
    ];

    render(<ProjectTreePanel />);
    expect(await screen.findByText('登录接口')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '复制接口' }));

    await waitFor(() => {
      expect(copyApiEndpointMock).toHaveBeenCalledWith(100, 10);
      expect(screen.getByText('登录接口 副本')).toBeInTheDocument();
      expect(useRequestStore.getState().currentEndpointId).toBe(101);
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    });
  });

  it.each(['点击', '回车', '搜索框回车'])('移动接口弹窗以可搜索模块列表选择目标模块并%s确认', async (method) => {
    moduleRowsRef.current = [
      {
        id: 10,
        project_id: 1,
        name: '认证模块',
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
      },
      {
        id: 20,
        project_id: 1,
        name: '用户模块',
        sort_order: 1,
        created_at: 0,
        updated_at: 0,
      },
      {
        id: 30,
        project_id: 1,
        name: '订单模块',
        sort_order: 2,
        created_at: 0,
        updated_at: 0,
      },
    ];
    endpointRowsRef.current = [
      {
        id: 100,
        module_id: 10,
        name: '登录接口',
        protocol: 'http',
        method: 'GET',
        url: 'https://api.example.com/login',
        headers: '{}',
        params: '{}',
        body: '{}',
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
        response_status: null,
        response_headers: null,
        response_body: null,
        response_time_ms: null,
      },
    ];

    render(<ProjectTreePanel />);
    expect(await screen.findByText('登录接口')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '移动接口' }));

    const dialog = screen.getByRole('dialog', { name: '移动接口' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('移动“登录接口”')).toBeInTheDocument();
    expect(within(dialog).getByText('当前模块')).toBeInTheDocument();
    expect(within(dialog).getAllByText('认证模块').length).toBeGreaterThan(0);
    expect(within(dialog).getByPlaceholderText('搜索模块或项目')).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: 'Enter' });
    expect(moveApiEndpointMock).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByPlaceholderText('搜索模块或项目'), { target: { value: '用户' } });
    expect(within(dialog).getByRole('button', { name: '选择目标模块：用户模块' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '选择目标模块：订单模块' })).not.toBeInTheDocument();

    const targetModule = within(dialog).getByRole('button', { name: '选择目标模块：用户模块' });
    targetModule.focus();
    expect(fireEvent.keyDown(targetModule, { key: 'Enter' })).toBe(true);
    fireEvent.click(targetModule);
    expect(moveApiEndpointMock).not.toHaveBeenCalled();
    if (method === '回车') {
      fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    } else if (method === '搜索框回车') {
      const search = within(dialog).getByPlaceholderText('搜索模块或项目');
      search.focus();
      fireEvent.keyDown(search, { key: 'Enter' });
    } else {
      fireEvent.click(within(dialog).getByRole('button', { name: '确认移动' }));
    }

    await waitFor(() => {
      expect(moveApiEndpointMock).toHaveBeenCalledExactlyOnceWith(100, 20);
    });
  });

  it('按 Escape 关闭移动接口弹窗', async () => {
    moduleRowsRef.current = [
      {
        id: 10,
        project_id: 1,
        name: '认证模块',
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
      },
      {
        id: 20,
        project_id: 1,
        name: '用户模块',
        sort_order: 1,
        created_at: 0,
        updated_at: 0,
      },
    ];
    endpointRowsRef.current = [
      {
        id: 100,
        module_id: 10,
        name: '登录接口',
        protocol: 'http',
        method: 'GET',
        url: 'https://api.example.com/login',
        headers: '{}',
        params: '{}',
        body: '{}',
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
        response_status: null,
        response_headers: null,
        response_body: null,
        response_time_ms: null,
      },
    ];

    render(<ProjectTreePanel />);
    expect(await screen.findByText('登录接口')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '移动接口' }));
    expect(screen.getByRole('dialog', { name: '移动接口' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: '移动接口' })).not.toBeInTheDocument();
  });

  it('点击搜索到的接口结果后展开并滚动到对应接口位置', async () => {
    const scrollIntoViewMock = vi.fn();
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });
    moduleRowsRef.current = [
      {
        id: 10,
        project_id: 1,
        name: '用户模块',
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
      },
    ];
    endpointRowsRef.current = [
      {
        id: 100,
        module_id: 10,
        name: '登录接口',
        protocol: 'http',
        method: 'GET',
        url: 'https://api.example.com/login',
        headers: '{}',
        params: '{}',
        body: '{}',
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
        response_status: null,
        response_headers: null,
        response_body: null,
        response_time_ms: null,
      },
    ];
    searchProjectTreeMock.mockResolvedValue([
      {
        kind: 'endpoint',
        projectId: 1,
        projectName: '测试项目',
        moduleId: 10,
        moduleName: '用户模块',
        endpointId: 100,
        endpointName: '登录接口',
        protocol: 'http',
        method: 'GET',
        url: 'https://api.example.com/login',
        matchText: '登录接口',
      },
    ]);

    render(<ProjectTreePanel />);
    expect(await screen.findByText('登录接口')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '折叠所有项目与模块' }));
    await waitFor(() => {
      expect(screen.queryByText('登录接口')).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索项目' }), { target: { value: '登录' } });
    fireEvent.click(await screen.findByText('登录接口'));

    await waitFor(() => {
      const endpointItem = screen
        .getAllByText('登录接口')
        .map((el) => el.closest('.project-endpoint-item'))
        .find(Boolean);
      expect(endpointItem).not.toBeNull();
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    });
  });
});
