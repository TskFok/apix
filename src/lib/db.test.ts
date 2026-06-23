import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEndpointRow, ModuleRow } from '../types';

const loadMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: loadMock,
  },
}));

describe('db project helpers', () => {
  let selects: Array<{ sql: string; params?: unknown[] }>;
  let executes: Array<{ sql: string; params?: unknown[] }>;

  beforeEach(() => {
    vi.resetModules();
    selects = [];
    executes = [];
    loadMock.mockReset();
  });

  async function loadDb(selectImpl: (sql: string, params?: unknown[]) => unknown[] = () => []) {
    const fakeDb = {
      execute: vi.fn(async (sql: string, params?: unknown[]) => {
        executes.push({ sql, params });
        return { lastInsertId: 99 };
      }),
      select: vi.fn(async (sql: string, params?: unknown[]) => {
        selects.push({ sql, params });
        return selectImpl(sql, params);
      }),
    };
    loadMock.mockResolvedValue(fakeDb);
    return import('./db');
  }

  it('loads modules and endpoints in batches without per-row SQL', async () => {
    const db = await loadDb((sql) => {
      if (sql.includes('FROM modules')) {
        return [
          { id: 10, project_id: 1, name: 'A', sort_order: 0, created_at: 0, updated_at: 0 },
          { id: 20, project_id: 2, name: 'B', sort_order: 0, created_at: 0, updated_at: 0 },
        ] satisfies ModuleRow[];
      }
      if (sql.includes('FROM api_endpoints')) {
        return [
          {
            id: 100,
            module_id: 10,
            name: 'List',
            protocol: 'http',
            method: 'GET',
            url: '/x',
            headers: '[]',
            params: null,
            body: null,
            sort_order: 0,
            created_at: 0,
            updated_at: 0,
          },
        ] satisfies ApiEndpointRow[];
      }
      return [];
    });

    const modules = await db.listModulesByProjectIds([1, 2]);
    const endpoints = await db.listEndpointsByModuleIds([10, 20]);

    expect(modules[1]).toHaveLength(1);
    expect(modules[2]).toHaveLength(1);
    expect(endpoints[10]).toHaveLength(1);
    expect(selects.filter((x) => x.sql.includes('FROM modules'))).toHaveLength(1);
    expect(selects.filter((x) => x.sql.includes('FROM api_endpoints'))).toHaveLength(1);
  });

  it('searches project tree with one SQL query and returns hierarchy context', async () => {
    const db = await loadDb((sql) => {
      if (sql.includes('LEFT JOIN modules')) {
        return [
          {
            kind: 'endpoint',
            project_id: 1,
            project_name: 'P',
            module_id: 2,
            module_name: 'M',
            endpoint_id: 3,
            endpoint_name: '登录',
            method: 'POST',
            url: '/login',
            match_text: 'Authorization',
          },
        ];
      }
      return [];
    });

    const results = await db.searchProjectTree('auth');

    expect(results[0]).toMatchObject({ projectId: 1, moduleId: 2, endpointId: 3 });
    expect(selects.filter((x) => x.sql.includes('LEFT JOIN modules'))).toHaveLength(1);
  });

  it('copies and moves endpoints while assigning target module sort order', async () => {
    const db = await loadDb((sql) => {
      if (sql.includes('SELECT * FROM api_endpoints WHERE id')) {
        return [
          {
            id: 1,
            module_id: 10,
            name: '源接口',
            protocol: 'http',
            method: 'GET',
            url: '/a',
            headers: '[]',
            params: null,
            body: null,
            response_status: 200,
            response_time_ms: 12,
            response_headers: '{}',
            response_body: 'ok',
            sort_order: 0,
            created_at: 0,
            updated_at: 0,
          },
        ] satisfies ApiEndpointRow[];
      }
      if (sql.includes('MAX(sort_order)')) return [{ m: 4 }];
      return [];
    });

    await db.copyApiEndpoint(1, 20);
    await db.moveApiEndpoint(1, 30);

    expect(executes.some((x) => x.sql.includes('INSERT INTO api_endpoints'))).toBe(true);
    expect(executes.some((x) => x.sql.includes('UPDATE api_endpoints SET module_id'))).toBe(true);
  });

  it('reorders modules and endpoints with update statements only', async () => {
    const db = await loadDb();

    await db.reorderModules(1, [11, 12, 13]);
    await db.reorderEndpoints(2, [21, 22]);

    expect(selects).toHaveLength(0);
    expect(executes.filter((x) => x.sql.includes('UPDATE modules SET sort_order'))).toHaveLength(3);
    expect(executes.filter((x) => x.sql.includes('UPDATE api_endpoints SET sort_order'))).toHaveLength(2);
  });
});
