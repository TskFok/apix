import { describe, it, expect, beforeEach, vi } from 'vitest';
import { updateProject } from '../lib/db';
import { useRequestStore } from './requestStore';

vi.mock('../lib/db', () => ({
  updateProject: vi.fn().mockResolvedValue(undefined),
}));

describe('requestStore', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await useRequestStore.getState().newRequest();
    useRequestStore.getState().setNewEndpointTargetModule(null);
  });

  describe('getBodyForStorage / loadFrom 支持 form-data 文件字段', () => {
    it('persist 和 restore 带 type/filePath 的 form 字段', async () => {
      const store = useRequestStore.getState();
      store.setBodyFormFields([
        { key: 'avatar', value: 'photo.png', description: '', type: 'file', filePath: '/tmp/photo.png' },
        { key: 'name', value: 'test', description: '', type: 'text' },
      ]);
      store.setBodyType('form-data');

      const stored = store.getBodyForStorage();
      expect(() => JSON.parse(stored)).not.toThrow();

      const parsed = JSON.parse(stored) as { bodyFormFields: Array<{ key: string; value: string; type?: string; filePath?: string }> };
      expect(parsed.bodyFormFields).toHaveLength(2);
      expect(parsed.bodyFormFields[0]).toMatchObject({
        key: 'avatar',
        value: 'photo.png',
        type: 'file',
        filePath: '/tmp/photo.png',
      });
      expect(parsed.bodyFormFields[1]).toMatchObject({
        key: 'name',
        value: 'test',
        type: 'text',
      });

      await store.loadFrom({
        protocol: 'http',
        url: 'https://example.com',
        body: stored,
      });

      const fields = useRequestStore.getState().bodyFormFields;
      expect(fields[0].type).toBe('file');
      expect(fields[0].filePath).toBe('/tmp/photo.png');
      expect(fields[0].value).toBe('photo.png');
      expect(fields[1].type).toBe('text');
      expect(fields[1].value).toBe('test');
    });

    it('persist 和 restore 带 files 数组的多文件字段', async () => {
      const store = useRequestStore.getState();
      store.setBodyFormFields([
        {
          key: 'attachments',
          value: '',
          description: '',
          type: 'file',
          files: [
            { path: '/tmp/a.pdf', name: 'a.pdf' },
            { path: '/tmp/b.png', name: 'b.png' },
          ],
        },
      ]);
      store.setBodyType('form-data');

      const stored = store.getBodyForStorage();
      const parsed = JSON.parse(stored) as { bodyFormFields: Array<{ key: string; files?: Array<{ path: string; name: string }> }> };
      expect(parsed.bodyFormFields[0].files).toHaveLength(2);
      expect(parsed.bodyFormFields[0].files).toMatchObject([
        { path: '/tmp/a.pdf', name: 'a.pdf' },
        { path: '/tmp/b.png', name: 'b.png' },
      ]);

      await store.loadFrom({
        protocol: 'http',
        url: 'https://example.com',
        body: stored,
      });

      const fields = useRequestStore.getState().bodyFormFields;
      expect(fields[0].files).toHaveLength(2);
      expect(fields[0].files?.[0]).toEqual({ path: '/tmp/a.pdf', name: 'a.pdf' });
      expect(fields[0].files?.[1]).toEqual({ path: '/tmp/b.png', name: 'b.png' });
    });
  });

  describe('currentHistoryId 追踪当前历史记录', () => {
    it('初始值为 null', () => {
      expect(useRequestStore.getState().currentHistoryId).toBeNull();
    });

    it('setCurrentHistoryId 设置历史 ID', () => {
      const store = useRequestStore.getState();
      store.setCurrentHistoryId(42);
      expect(useRequestStore.getState().currentHistoryId).toBe(42);
    });

    it('setCurrentHistoryId(null) 清除历史 ID', () => {
      const store = useRequestStore.getState();
      store.setCurrentHistoryId(42);
      expect(useRequestStore.getState().currentHistoryId).toBe(42);

      store.setCurrentHistoryId(null);
      expect(useRequestStore.getState().currentHistoryId).toBeNull();
    });

    it('newRequest 重置 currentHistoryId 为 null', async () => {
      const store = useRequestStore.getState();
      store.setCurrentHistoryId(99);
      expect(useRequestStore.getState().currentHistoryId).toBe(99);

      await store.newRequest();
      expect(useRequestStore.getState().currentHistoryId).toBeNull();
    });

    it('newRequest 清空项目上下文', async () => {
      const store = useRequestStore.getState();
      await store.setProjectContext({
        projectId: 1,
        moduleId: 2,
        endpointId: 3,
        globalConfig: { headers: [], variables: [] },
      });
      await store.newRequest();
      expect(useRequestStore.getState().currentProjectId).toBeNull();
      expect(useRequestStore.getState().currentModuleId).toBeNull();
      expect(useRequestStore.getState().currentEndpointId).toBeNull();
      expect(useRequestStore.getState().projectGlobalConfig).toBeNull();
    });

    it('enterProjectSettingsView 进入项目全局区并清空请求表单', async () => {
      const store = useRequestStore.getState();
      await store.setProjectContext({
        projectId: 1,
        moduleId: 2,
        endpointId: 3,
        globalConfig: { headers: [], variables: [] },
      });
      store.setUrl('https://api.example.com');
      store.setNewEndpointTargetModule({ projectId: 1, moduleId: 2 });
      await store.enterProjectSettingsView(9, {
        headers: [{ key: 'X', value: '1', description: '', enabled: true }],
        variables: [{ key: 'a', value: 'b', description: '', enabled: true }],
      });
      expect(useRequestStore.getState().mainWorkspace).toBe('project_settings');
      expect(useRequestStore.getState().currentProjectId).toBe(9);
      expect(useRequestStore.getState().currentModuleId).toBeNull();
      expect(useRequestStore.getState().currentEndpointId).toBeNull();
      expect(useRequestStore.getState().newEndpointTargetModule).toBeNull();
      expect(useRequestStore.getState().url).toBe('');
      expect(useRequestStore.getState().projectGlobalConfig?.headers[0]?.key).toBe('X');
    });

    it('setProjectContext 将 mainWorkspace 切回 request', async () => {
      await useRequestStore.getState().enterProjectSettingsView(1, { headers: [], variables: [] });
      await useRequestStore.getState().setProjectContext({
        projectId: 1,
        moduleId: 1,
        endpointId: 1,
        globalConfig: { headers: [], variables: [] },
      });
      expect(useRequestStore.getState().mainWorkspace).toBe('request');
    });

    it('flushProjectGlobalsDraft 在非全局页时返回 true', async () => {
      expect(await useRequestStore.getState().flushProjectGlobalsDraft()).toBe(true);
    });

    it('flushProjectGlobalsDraft 在请求页也保存快速编辑的全局配置', async () => {
      await useRequestStore.getState().setProjectContext({
        projectId: 4,
        moduleId: 1,
        endpointId: 1,
        globalConfig: {
          headers: [],
          variables: [],
          activeEnvironmentId: 'dev',
          environments: [{ id: 'dev', name: '开发', baseUrl: '', headers: [], variables: [] }],
        },
      });
      vi.mocked(updateProject).mockClear();

      useRequestStore.getState().updateProjectGlobalConfig({
        headers: [],
        variables: [],
        activeEnvironmentId: 'dev',
        environments: [
          {
            id: 'dev',
            name: '开发',
            baseUrl: '',
            headers: [{ key: 'X-Quick', value: '1', description: '', enabled: true }],
            variables: [],
          },
        ],
      });

      expect(await useRequestStore.getState().flushProjectGlobalsDraft()).toBe(true);
      expect(updateProject).toHaveBeenCalledWith(4, {
        global_config: expect.stringContaining('X-Quick'),
      });
    });

    it('flushProjectGlobalsDraft 写入成功返回 true', async () => {
      await useRequestStore.getState().enterProjectSettingsView(2, {
        headers: [{ key: 'K', value: 'V', description: '', enabled: true }],
        variables: [],
      });
      expect(await useRequestStore.getState().flushProjectGlobalsDraft()).toBe(true);
      expect(updateProject).toHaveBeenCalled();
    });

    it('离开全局页时 flush 会写入 updateProject', async () => {
      vi.mocked(updateProject).mockClear();
      await useRequestStore.getState().enterProjectSettingsView(3, {
        headers: [{ key: 'H', value: '1', description: '', enabled: true }],
        variables: [],
      });
      await useRequestStore.getState().setProjectContext({
        projectId: 3,
        moduleId: 1,
        endpointId: 1,
        globalConfig: { headers: [], variables: [] },
      });
      expect(updateProject).toHaveBeenCalled();
      const call = vi.mocked(updateProject).mock.calls[0];
      expect(call[0]).toBe(3);
      expect(String(call[1].global_config)).toContain('H');
    });

    it('loadFrom 将 mainWorkspace 置为 request', async () => {
      await useRequestStore.getState().enterProjectSettingsView(1, { headers: [], variables: [] });
      await useRequestStore.getState().loadFrom({ protocol: 'http', url: 'https://x.com' });
      expect(useRequestStore.getState().mainWorkspace).toBe('request');
    });

    it('clearProjectContext 将 mainWorkspace 置为 request', async () => {
      await useRequestStore.getState().enterProjectSettingsView(1, { headers: [], variables: [] });
      await useRequestStore.getState().clearProjectContext();
      expect(useRequestStore.getState().mainWorkspace).toBe('request');
    });

    it('newEndpointDraft 保留项目上下文并清空 endpoint', async () => {
      const store = useRequestStore.getState();
      await store.setProjectContext({
        projectId: 5,
        moduleId: 6,
        endpointId: 7,
        globalConfig: {
          headers: [{ key: 'A', value: '1', description: '', enabled: true }],
          variables: [],
        },
      });
      store.setUrl('https://old.com');
      await store.newEndpointDraft();
      expect(useRequestStore.getState().currentProjectId).toBe(5);
      expect(useRequestStore.getState().currentModuleId).toBe(6);
      expect(useRequestStore.getState().currentEndpointId).toBeNull();
      expect(useRequestStore.getState().url).toBe('');
      expect(useRequestStore.getState().projectGlobalConfig?.headers[0]?.key).toBe('A');
    });

    it('newEndpointDraft 清空 endpointRemark', async () => {
      const store = useRequestStore.getState();
      await store.setProjectContext({
        projectId: 1,
        moduleId: 2,
        endpointId: 3,
        globalConfig: { headers: [], variables: [] },
      });
      store.setEndpointRemark('旧标题');
      await store.newEndpointDraft();
      expect(useRequestStore.getState().endpointRemark).toBe('');
    });

    it('newRequest 清空 endpointRemark', async () => {
      const store = useRequestStore.getState();
      store.setEndpointRemark('x');
      await store.newRequest();
      expect(useRequestStore.getState().endpointRemark).toBe('');
    });

    it('newRequest 重置 suppressPersistToProject 与 currentFavoriteId', async () => {
      const store = useRequestStore.getState();
      store.setSuppressPersistToProject(true);
      store.setCurrentFavoriteId(5);
      await store.newRequest();
      expect(useRequestStore.getState().suppressPersistToProject).toBe(false);
      expect(useRequestStore.getState().currentFavoriteId).toBeNull();
    });

    it('loadFrom 可设置 endpointRemark，未传时为空', async () => {
      const store = useRequestStore.getState();
      store.setEndpointRemark('keep');
      await store.loadFrom({ protocol: 'http', url: 'https://a.com' });
      expect(useRequestStore.getState().endpointRemark).toBe('');
      await store.loadFrom({ protocol: 'http', url: 'https://b.com', endpointRemark: '接口A' });
      expect(useRequestStore.getState().endpointRemark).toBe('接口A');
    });

    it('loadFrom 不影响 currentHistoryId（由调用方单独设置）', async () => {
      const store = useRequestStore.getState();
      store.setCurrentHistoryId(10);

      await store.loadFrom({
        protocol: 'http',
        method: 'POST',
        url: 'https://example.com/api',
      });

      expect(useRequestStore.getState().currentHistoryId).toBe(10);
      expect(useRequestStore.getState().url).toBe('https://example.com/api');
    });
  });

  describe('newEndpointTargetModule', () => {
    it('setNewEndpointTargetModule 设置后 newRequest 仍保留（供项目 Tab + 新建使用）', async () => {
      useRequestStore.getState().setNewEndpointTargetModule({ projectId: 7, moduleId: 8 });
      await useRequestStore.getState().newRequest();
      expect(useRequestStore.getState().newEndpointTargetModule).toEqual({ projectId: 7, moduleId: 8 });
    });

    it('clearProjectContext 在清空当前项目时移除指向该项目的 target', async () => {
      await useRequestStore.getState().setProjectContext({
        projectId: 3,
        moduleId: 4,
        endpointId: 5,
        globalConfig: { headers: [], variables: [] },
      });
      useRequestStore.getState().setNewEndpointTargetModule({ projectId: 3, moduleId: 4 });
      await useRequestStore.getState().clearProjectContext();
      expect(useRequestStore.getState().newEndpointTargetModule).toBeNull();
    });

    it('clearProjectContext 保留指向其他项目的 target', async () => {
      await useRequestStore.getState().setProjectContext({
        projectId: 3,
        moduleId: 4,
        endpointId: null,
        globalConfig: { headers: [], variables: [] },
      });
      useRequestStore.getState().setNewEndpointTargetModule({ projectId: 99, moduleId: 1 });
      await useRequestStore.getState().clearProjectContext();
      expect(useRequestStore.getState().newEndpointTargetModule).toEqual({ projectId: 99, moduleId: 1 });
    });
  });

  describe('switchProjectEnvironment', () => {
    it('切换当前项目全局配置的 activeEnvironmentId', async () => {
      await useRequestStore.getState().setProjectContext({
        projectId: 1,
        moduleId: 2,
        endpointId: 3,
        globalConfig: {
          headers: [],
          variables: [],
          activeEnvironmentId: 'dev',
          environments: [
            { id: 'dev', name: '开发', baseUrl: '', headers: [], variables: [] },
            { id: 'prod', name: '生产', baseUrl: 'https://api.example.com', headers: [], variables: [] },
          ],
        },
      });

      useRequestStore.getState().switchProjectEnvironment('prod');

      expect(useRequestStore.getState().projectGlobalConfig?.activeEnvironmentId).toBe('prod');
    });

    it('在请求页切换环境时写回当前项目配置', async () => {
      await useRequestStore.getState().setProjectContext({
        projectId: 1,
        moduleId: 2,
        endpointId: 3,
        globalConfig: {
          headers: [],
          variables: [],
          activeEnvironmentId: 'dev',
          environments: [
            { id: 'dev', name: '开发', baseUrl: '', headers: [], variables: [] },
            { id: 'prod', name: '生产', baseUrl: 'https://api.example.com', headers: [], variables: [] },
          ],
        },
      });
      vi.mocked(updateProject).mockClear();

      await useRequestStore.getState().switchProjectEnvironment('prod');

      expect(updateProject).toHaveBeenCalledTimes(1);
      expect(updateProject).toHaveBeenCalledWith(1, {
        global_config: expect.stringContaining('"activeEnvironmentId":"prod"'),
      });
    });

    it('忽略不存在的环境 ID', async () => {
      await useRequestStore.getState().setProjectContext({
        projectId: 1,
        globalConfig: {
          headers: [],
          variables: [],
          activeEnvironmentId: 'dev',
          environments: [
            { id: 'dev', name: '开发', baseUrl: '', headers: [], variables: [] },
          ],
        },
      });

      useRequestStore.getState().switchProjectEnvironment('missing');

      expect(useRequestStore.getState().projectGlobalConfig?.activeEnvironmentId).toBe('dev');
    });

    it('切换同项目接口时保留当前已选环境', async () => {
      const globalConfig = {
        headers: [],
        variables: [],
        activeEnvironmentId: 'dev',
        environments: [
          { id: 'dev', name: '开发', baseUrl: '', headers: [], variables: [] },
          { id: 'prod', name: '生产', baseUrl: 'https://api.example.com', headers: [], variables: [] },
        ],
      };
      await useRequestStore.getState().setProjectContext({
        projectId: 1,
        moduleId: 2,
        endpointId: 3,
        globalConfig,
      });
      useRequestStore.getState().switchProjectEnvironment('prod');

      await useRequestStore.getState().setProjectContext({
        projectId: 1,
        moduleId: 2,
        endpointId: 4,
        globalConfig,
      });

      expect(useRequestStore.getState().projectGlobalConfig?.activeEnvironmentId).toBe('prod');
    });
  });

  describe('getHeadersRecord / getQueryParamsRecord 只包含 enabled 为 true 的行', () => {
    it('过滤掉 enabled 为 false 的 header', () => {
      const store = useRequestStore.getState();
      store.setHeaders([
        { key: 'A', value: '1', description: '', enabled: true },
        { key: 'B', value: '2', description: '', enabled: false },
        { key: 'C', value: '3', description: '', enabled: true },
      ]);
      const record = store.getHeadersRecord();
      expect(record).toEqual({ A: '1', C: '3' });
    });

    it('过滤掉 enabled 为 false 的 queryParam', () => {
      const store = useRequestStore.getState();
      store.setQueryParams([
        { key: 'x', value: '1', description: '', enabled: true },
        { key: 'y', value: '2', description: '', enabled: false },
      ]);
      const record = store.getQueryParamsRecord();
      expect(record).toEqual({ x: '1' });
    });
  });
});
