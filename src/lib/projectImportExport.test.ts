import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./db', () => ({
  getProject: vi.fn(),
  listModules: vi.fn(),
  listEndpoints: vi.fn(),
  listEndpointsByModuleIds: vi.fn(),
}));

import * as db from './db';
import {
  APIX_PROJECT_EXPORT_FORMAT,
  APIX_PROJECT_EXPORT_VERSION,
  buildProjectExportPayload,
  parseProjectExportJson,
  serializeProjectExport,
  ProjectImportError,
  type ApixProjectExportFile,
} from './projectImportExport';

const minimalValid: ApixProjectExportFile = {
  format: APIX_PROJECT_EXPORT_FORMAT,
  version: APIX_PROJECT_EXPORT_VERSION,
  exportedAt: 1,
  project: {
    name: 'Demo',
    global_config: '{"headers":[],"variables":[]}',
  },
  modules: [
    {
      name: 'M1',
      sort_order: 0,
      endpoints: [
        {
          name: '登录',
          protocol: 'http',
          method: 'POST',
          url: 'https://a.com',
          headers: '[]',
          params: null,
          body: '{}',
          sort_order: 0,
        },
      ],
    },
  ],
};

describe('parseProjectExportJson', () => {
  it('往返序列化', () => {
    const text = serializeProjectExport(minimalValid);
    const back = parseProjectExportJson(text);
    expect(back.project.name).toBe('Demo');
    expect(back.modules).toHaveLength(1);
    expect(back.modules[0].endpoints[0].url).toBe('https://a.com');
  });

  it('非法 JSON 抛错', () => {
    expect(() => parseProjectExportJson('')).toThrow(ProjectImportError);
  });

  it('format 不匹配抛错', () => {
    expect(() =>
      parseProjectExportJson(JSON.stringify({ ...minimalValid, format: 'x' }))
    ).toThrow(ProjectImportError);
  });
});

describe('buildProjectExportPayload', () => {
  const projectRow = {
    id: 1,
    name: 'P',
    sort_order: 0,
    global_config: '{}',
    created_at: 0,
    updated_at: 0,
  };

  beforeEach(() => {
    vi.mocked(db.getProject).mockReset();
    vi.mocked(db.listModules).mockReset();
    vi.mocked(db.listEndpoints).mockReset();
    vi.mocked(db.listEndpointsByModuleIds).mockReset();
  });

  it('moduleIds 仅导出所选模块', async () => {
    vi.mocked(db.getProject).mockResolvedValue(projectRow);
    vi.mocked(db.listModules).mockResolvedValue([
      { id: 10, project_id: 1, name: 'A', sort_order: 0, created_at: 0, updated_at: 0 },
      { id: 20, project_id: 1, name: 'B', sort_order: 1, created_at: 0, updated_at: 0 },
    ]);
    vi.mocked(db.listEndpoints).mockResolvedValue([]);
    vi.mocked(db.listEndpointsByModuleIds).mockResolvedValue({});
    const p = await buildProjectExportPayload(1, { moduleIds: [20] });
    expect(p?.modules).toHaveLength(1);
    expect(p?.modules[0].name).toBe('B');
  });

  it('未传 moduleIds 时导出全部模块', async () => {
    vi.mocked(db.getProject).mockResolvedValue(projectRow);
    vi.mocked(db.listModules).mockResolvedValue([
      { id: 10, project_id: 1, name: 'A', sort_order: 0, created_at: 0, updated_at: 0 },
    ]);
    vi.mocked(db.listEndpoints).mockResolvedValue([]);
    vi.mocked(db.listEndpointsByModuleIds).mockResolvedValue({});
    const p = await buildProjectExportPayload(1);
    expect(p?.modules).toHaveLength(1);
  });

  it('moduleIds 为空数组时不含模块', async () => {
    vi.mocked(db.getProject).mockResolvedValue(projectRow);
    vi.mocked(db.listModules).mockResolvedValue([
      { id: 10, project_id: 1, name: 'A', sort_order: 0, created_at: 0, updated_at: 0 },
    ]);
    vi.mocked(db.listEndpoints).mockResolvedValue([]);
    vi.mocked(db.listEndpointsByModuleIds).mockResolvedValue({});
    const p = await buildProjectExportPayload(1, { moduleIds: [] });
    expect(p?.modules).toEqual([]);
  });
});
