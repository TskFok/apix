import Database from '@tauri-apps/plugin-sql';
import type { HistoryItem, FavoriteItem, ProjectRow, ModuleRow, ApiEndpointRow, ProjectSearchResult } from '../types';

let db: Database | null = null;

const DB_PATH = 'sqlite:apix.db';

const DEFAULT_GLOBAL_CONFIG = '{"headers":[],"variables":[]}';

export async function initDb(): Promise<void> {
  if (db) return;
  db = await Database.load(DB_PATH);
  await db.execute('PRAGMA foreign_keys = ON');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS request_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      protocol TEXT NOT NULL,
      method TEXT,
      url TEXT NOT NULL,
      headers TEXT,
      params TEXT,
      body TEXT,
      created_at INTEGER NOT NULL,
      response_status INTEGER,
      response_time_ms INTEGER,
      response_headers TEXT,
      response_body TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      protocol TEXT NOT NULL,
      method TEXT,
      url TEXT NOT NULL,
      headers TEXT,
      params TEXT,
      body TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  try {
    await db.execute('ALTER TABLE request_history ADD COLUMN params TEXT');
  } catch {
    // column exists
  }
  try {
    await db.execute('ALTER TABLE request_history ADD COLUMN response_headers TEXT');
  } catch {
    // column exists
  }
  try {
    await db.execute('ALTER TABLE request_history ADD COLUMN response_body TEXT');
  } catch {
    // column exists
  }
  try {
    await db.execute('ALTER TABLE favorites ADD COLUMN params TEXT');
  } catch {
    // column exists
  }
  try {
    await db.execute('ALTER TABLE request_history ADD COLUMN remark TEXT');
  } catch {
    // column exists
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      global_config TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS api_endpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      protocol TEXT NOT NULL,
      method TEXT,
      url TEXT NOT NULL,
      headers TEXT,
      params TEXT,
      body TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await db.execute('CREATE INDEX IF NOT EXISTS idx_modules_project ON modules(project_id)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_endpoints_module ON api_endpoints(module_id)');

  for (const sql of [
    'ALTER TABLE api_endpoints ADD COLUMN response_status INTEGER',
    'ALTER TABLE api_endpoints ADD COLUMN response_time_ms INTEGER',
    'ALTER TABLE api_endpoints ADD COLUMN response_headers TEXT',
    'ALTER TABLE api_endpoints ADD COLUMN response_body TEXT',
  ]) {
    try {
      await db.execute(sql);
    } catch {
      // column exists
    }
  }
}

function getDb(): Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export async function addHistory(
  protocol: string,
  method: string | null,
  url: string,
  headers: string,
  params: string | null,
  body: string | null,
  responseStatus?: number,
  responseTimeMs?: number,
  responseHeaders?: string,
  responseBody?: string,
  remark?: string | null
): Promise<void> {
  await initDb();
  const database = getDb();
  const now = Date.now();
  await database.execute(
    `INSERT INTO request_history (protocol, method, url, headers, params, body, remark, created_at, response_status, response_time_ms, response_headers, response_body)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      protocol,
      method || null,
      url,
      headers,
      params || null,
      body || null,
      remark ?? null,
      now,
      responseStatus ?? null,
      responseTimeMs ?? null,
      responseHeaders ?? null,
      responseBody ?? null,
    ]
  );

  const result = await database.select<[{ count: number }]>(
    'SELECT COUNT(*) as count FROM request_history'
  );
  const count = result[0]?.count ?? 0;
  if (count > 100) {
    const cutoff = await database.select<[{ created_at: number }]>(
      'SELECT created_at FROM request_history ORDER BY created_at DESC LIMIT 1 OFFSET 99'
    );
    const cutoffTime = cutoff[0]?.created_at;
    if (cutoffTime != null) {
      await database.execute(
        'DELETE FROM request_history WHERE created_at < $1',
        [cutoffTime]
      );
    }
  }
}

export async function updateHistory(
  id: number,
  protocol: string,
  method: string | null,
  url: string,
  headers: string,
  params: string | null,
  body: string | null,
  responseStatus?: number,
  responseTimeMs?: number,
  responseHeaders?: string,
  responseBody?: string,
  remark?: string | null
): Promise<void> {
  await initDb();
  const database = getDb();
  const now = Date.now();
  await database.execute(
    `UPDATE request_history
     SET protocol = $1, method = $2, url = $3, headers = $4, params = $5, body = $6,
         remark = $7,
         created_at = $8, response_status = $9, response_time_ms = $10,
         response_headers = $11, response_body = $12
     WHERE id = $13`,
    [
      protocol,
      method || null,
      url,
      headers,
      params || null,
      body || null,
      remark ?? null,
      now,
      responseStatus ?? null,
      responseTimeMs ?? null,
      responseHeaders ?? null,
      responseBody ?? null,
      id,
    ]
  );
}

export async function getHistory(protocol?: string): Promise<HistoryItem[]> {
  await initDb();
  const database = getDb();
  let query = 'SELECT * FROM request_history ORDER BY created_at DESC LIMIT 100';
  const params: unknown[] = [];

  if (protocol) {
    query = 'SELECT * FROM request_history WHERE protocol = $1 ORDER BY created_at DESC LIMIT 100';
    params.push(protocol);
  }

  const rows = await database.select<HistoryItem[]>(query, params);
  return rows;
}

export async function clearHistory(): Promise<void> {
  await initDb();
  const database = getDb();
  await database.execute('DELETE FROM request_history');
}

export async function deleteHistoryById(id: number): Promise<void> {
  await initDb();
  const database = getDb();
  await database.execute('DELETE FROM request_history WHERE id = $1', [id]);
}

export async function getHistoryById(id: number): Promise<HistoryItem | null> {
  await initDb();
  const database = getDb();
  const rows = await database.select<HistoryItem[]>('SELECT * FROM request_history WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function addFavorite(
  name: string,
  protocol: string,
  method: string | null,
  url: string,
  headers: string,
  params: string | null,
  body: string | null
): Promise<number> {
  await initDb();
  const database = getDb();
  const now = Date.now();
  const result = await database.execute(
    `INSERT INTO favorites (name, protocol, method, url, headers, params, body, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [name, protocol, method || null, url, headers, params || null, body || null, now, now]
  );
  return result.lastInsertId ?? 0;
}

export async function getFavorites(protocol?: string): Promise<FavoriteItem[]> {
  await initDb();
  const database = getDb();
  let query = 'SELECT * FROM favorites ORDER BY updated_at DESC';
  const params: unknown[] = [];

  if (protocol) {
    query = 'SELECT * FROM favorites WHERE protocol = $1 ORDER BY updated_at DESC';
    params.push(protocol);
  }

  const rows = await database.select<FavoriteItem[]>(query, params);
  return rows;
}

export async function updateFavorite(
  id: number,
  name: string,
  protocol: string,
  method: string | null,
  url: string,
  headers: string,
  params: string | null,
  body: string | null
): Promise<void> {
  await initDb();
  const database = getDb();
  const now = Date.now();
  await database.execute(
    `UPDATE favorites SET name = $1, protocol = $2, method = $3, url = $4, headers = $5, params = $6, body = $7, updated_at = $8 WHERE id = $9`,
    [name, protocol, method || null, url, headers, params || null, body || null, now, id]
  );
}

export async function deleteFavorite(id: number): Promise<void> {
  await initDb();
  const database = getDb();
  await database.execute('DELETE FROM favorites WHERE id = $1', [id]);
}

export async function getFavoriteById(id: number): Promise<FavoriteItem | null> {
  await initDb();
  const database = getDb();
  const rows = await database.select<FavoriteItem[]>('SELECT * FROM favorites WHERE id = $1', [id]);
  return rows[0] ?? null;
}

// --- Projects / modules / api_endpoints ---

export async function listProjects(): Promise<ProjectRow[]> {
  await initDb();
  const database = getDb();
  return database.select<ProjectRow[]>(
    'SELECT * FROM projects ORDER BY sort_order ASC, id ASC'
  );
}

export async function getProject(id: number): Promise<ProjectRow | null> {
  await initDb();
  const database = getDb();
  const rows = await database.select<ProjectRow[]>('SELECT * FROM projects WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function addProject(name: string): Promise<number> {
  await initDb();
  const database = getDb();
  const now = Date.now();
  const maxRows = await database.select<[{ m: number | null }]>(
    'SELECT MAX(sort_order) as m FROM projects'
  );
  const sortOrder = (maxRows[0]?.m ?? -1) + 1;
  const result = await database.execute(
    `INSERT INTO projects (name, sort_order, global_config, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [name.trim() || '未命名项目', sortOrder, DEFAULT_GLOBAL_CONFIG, now, now]
  );
  return result.lastInsertId ?? 0;
}

export async function updateProject(
  id: number,
  patch: { name?: string; global_config?: string; sort_order?: number }
): Promise<void> {
  await initDb();
  const database = getDb();
  const now = Date.now();
  const row = await getProject(id);
  if (!row) return;
  await database.execute(
    `UPDATE projects SET name = $1, global_config = $2, sort_order = $3, updated_at = $4 WHERE id = $5`,
    [
      patch.name ?? row.name,
      patch.global_config ?? row.global_config,
      patch.sort_order ?? row.sort_order,
      now,
      id,
    ]
  );
}

export async function deleteProject(id: number): Promise<void> {
  await initDb();
  const database = getDb();
  await database.execute('DELETE FROM projects WHERE id = $1', [id]);
}

export async function listModules(projectId: number): Promise<ModuleRow[]> {
  await initDb();
  const database = getDb();
  return database.select<ModuleRow[]>(
    'SELECT * FROM modules WHERE project_id = $1 ORDER BY sort_order ASC, id ASC',
    [projectId]
  );
}

function buildInClause(ids: number[]): { clause: string; params: number[] } {
  const uniq = Array.from(new Set(ids.filter((id) => Number.isFinite(id))));
  return {
    clause: uniq.map((_, idx) => `$${idx + 1}`).join(', '),
    params: uniq,
  };
}

function groupRowsByNumberKey<T>(rows: T[], key: keyof T): Record<number, T[]> {
  const out: Record<number, T[]> = {};
  for (const row of rows) {
    const id = Number(row[key]);
    if (!Number.isFinite(id)) continue;
    if (!out[id]) out[id] = [];
    out[id].push(row);
  }
  return out;
}

export async function listModulesByProjectIds(projectIds: number[]): Promise<Record<number, ModuleRow[]>> {
  await initDb();
  const { clause, params } = buildInClause(projectIds);
  if (!clause) return {};
  const database = getDb();
  const rows = await database.select<ModuleRow[]>(
    `SELECT * FROM modules WHERE project_id IN (${clause}) ORDER BY project_id ASC, sort_order ASC, id ASC`,
    params
  );
  return groupRowsByNumberKey(rows, 'project_id');
}

export async function addModule(projectId: number, name: string, sortOrderOverride?: number): Promise<number> {
  await initDb();
  const database = getDb();
  const now = Date.now();
  let sortOrder: number;
  if (sortOrderOverride !== undefined) {
    sortOrder = sortOrderOverride;
  } else {
    const maxRows = await database.select<[{ m: number | null }]>(
      'SELECT MAX(sort_order) as m FROM modules WHERE project_id = $1',
      [projectId]
    );
    sortOrder = (maxRows[0]?.m ?? -1) + 1;
  }
  const result = await database.execute(
    `INSERT INTO modules (project_id, name, sort_order, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [projectId, name.trim() || '未命名模块', sortOrder, now, now]
  );
  return result.lastInsertId ?? 0;
}

export async function updateModule(
  id: number,
  patch: { name?: string; sort_order?: number }
): Promise<void> {
  await initDb();
  const database = getDb();
  const now = Date.now();
  const rows = await database.select<ModuleRow[]>('SELECT * FROM modules WHERE id = $1', [id]);
  const row = rows[0];
  if (!row) return;
  await database.execute(
    `UPDATE modules SET name = $1, sort_order = $2, updated_at = $3 WHERE id = $4`,
    [patch.name ?? row.name, patch.sort_order ?? row.sort_order, now, id]
  );
}

export async function deleteModule(id: number): Promise<void> {
  await initDb();
  const database = getDb();
  await database.execute('DELETE FROM modules WHERE id = $1', [id]);
}

export async function listEndpoints(moduleId: number): Promise<ApiEndpointRow[]> {
  await initDb();
  const database = getDb();
  return database.select<ApiEndpointRow[]>(
    'SELECT * FROM api_endpoints WHERE module_id = $1 ORDER BY sort_order ASC, id ASC',
    [moduleId]
  );
}

export async function listEndpointsByModuleIds(moduleIds: number[]): Promise<Record<number, ApiEndpointRow[]>> {
  await initDb();
  const { clause, params } = buildInClause(moduleIds);
  if (!clause) return {};
  const database = getDb();
  const rows = await database.select<ApiEndpointRow[]>(
    `SELECT * FROM api_endpoints WHERE module_id IN (${clause}) ORDER BY module_id ASC, sort_order ASC, id ASC`,
    params
  );
  return groupRowsByNumberKey(rows, 'module_id');
}

export async function getEndpoint(id: number): Promise<ApiEndpointRow | null> {
  await initDb();
  const database = getDb();
  const rows = await database.select<ApiEndpointRow[]>('SELECT * FROM api_endpoints WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function getModuleById(id: number): Promise<ModuleRow | null> {
  await initDb();
  const database = getDb();
  const rows = await database.select<ModuleRow[]>('SELECT * FROM modules WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function addApiEndpoint(
  moduleId: number,
  name: string,
  protocol: string,
  method: string | null,
  url: string,
  headers: string,
  params: string | null,
  body: string | null,
  sortOrderOverride?: number
): Promise<number> {
  await initDb();
  const database = getDb();
  const now = Date.now();
  let sortOrder: number;
  if (sortOrderOverride !== undefined) {
    sortOrder = sortOrderOverride;
  } else {
    const maxRows = await database.select<[{ m: number | null }]>(
      'SELECT MAX(sort_order) as m FROM api_endpoints WHERE module_id = $1',
      [moduleId]
    );
    sortOrder = (maxRows[0]?.m ?? -1) + 1;
  }
  const result = await database.execute(
    `INSERT INTO api_endpoints (module_id, name, protocol, method, url, headers, params, body, sort_order, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      moduleId,
      name.trim() || '未命名接口',
      protocol,
      method,
      url,
      headers,
      params,
      body,
      sortOrder,
      now,
      now,
    ]
  );
  return result.lastInsertId ?? 0;
}

export async function updateApiEndpoint(
  id: number,
  patch: {
    name?: string;
    protocol?: string;
    method?: string | null;
    url?: string;
    headers?: string;
    params?: string | null;
    body?: string | null;
    sort_order?: number;
    response_status?: number | null;
    response_time_ms?: number | null;
    response_headers?: string | null;
    response_body?: string | null;
  }
): Promise<void> {
  await initDb();
  const database = getDb();
  const now = Date.now();
  const row = await getEndpoint(id);
  if (!row) return;
  const responseStatus =
    patch.response_status !== undefined ? patch.response_status : row.response_status ?? null;
  const responseTimeMs =
    patch.response_time_ms !== undefined ? patch.response_time_ms : row.response_time_ms ?? null;
  const responseHeaders =
    patch.response_headers !== undefined ? patch.response_headers : row.response_headers ?? null;
  const responseBody =
    patch.response_body !== undefined ? patch.response_body : row.response_body ?? null;
  await database.execute(
    `UPDATE api_endpoints SET name = $1, protocol = $2, method = $3, url = $4, headers = $5, params = $6, body = $7, sort_order = $8,
     response_status = $9, response_time_ms = $10, response_headers = $11, response_body = $12, updated_at = $13 WHERE id = $14`,
    [
      patch.name ?? row.name,
      patch.protocol ?? row.protocol,
      patch.method !== undefined ? patch.method : row.method,
      patch.url ?? row.url,
      patch.headers ?? row.headers,
      patch.params !== undefined ? patch.params : row.params,
      patch.body !== undefined ? patch.body : row.body,
      patch.sort_order ?? row.sort_order,
      responseStatus,
      responseTimeMs,
      responseHeaders,
      responseBody,
      now,
      id,
    ]
  );
}

export async function deleteApiEndpoint(id: number): Promise<void> {
  await initDb();
  const database = getDb();
  await database.execute('DELETE FROM api_endpoints WHERE id = $1', [id]);
}

async function getNextEndpointSortOrder(moduleId: number): Promise<number> {
  const database = getDb();
  const rows = await database.select<[{ m: number | null }]>(
    'SELECT MAX(sort_order) as m FROM api_endpoints WHERE module_id = $1',
    [moduleId]
  );
  return (rows[0]?.m ?? -1) + 1;
}

export async function copyApiEndpoint(id: number, targetModuleId: number): Promise<number> {
  await initDb();
  const database = getDb();
  const source = await getEndpoint(id);
  if (!source) return 0;
  const now = Date.now();
  const sortOrder = await getNextEndpointSortOrder(targetModuleId);
  const result = await database.execute(
    `INSERT INTO api_endpoints (
      module_id, name, protocol, method, url, headers, params, body, sort_order,
      response_status, response_time_ms, response_headers, response_body, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      targetModuleId,
      `${source.name} 副本`,
      source.protocol,
      source.method,
      source.url,
      source.headers,
      source.params,
      source.body,
      sortOrder,
      source.response_status ?? null,
      source.response_time_ms ?? null,
      source.response_headers ?? null,
      source.response_body ?? null,
      now,
      now,
    ]
  );
  return result.lastInsertId ?? 0;
}

export async function moveApiEndpoint(id: number, targetModuleId: number): Promise<void> {
  await initDb();
  const database = getDb();
  const sortOrder = await getNextEndpointSortOrder(targetModuleId);
  await database.execute(
    'UPDATE api_endpoints SET module_id = $1, sort_order = $2, updated_at = $3 WHERE id = $4',
    [targetModuleId, sortOrder, Date.now(), id]
  );
}

export async function reorderModules(projectId: number, moduleIds: number[]): Promise<void> {
  await initDb();
  const database = getDb();
  const now = Date.now();
  for (let i = 0; i < moduleIds.length; i++) {
    await database.execute(
      'UPDATE modules SET sort_order = $1, updated_at = $2 WHERE id = $3 AND project_id = $4',
      [i, now, moduleIds[i], projectId]
    );
  }
}

export async function reorderEndpoints(moduleId: number, endpointIds: number[]): Promise<void> {
  await initDb();
  const database = getDb();
  const now = Date.now();
  for (let i = 0; i < endpointIds.length; i++) {
    await database.execute(
      'UPDATE api_endpoints SET sort_order = $1, updated_at = $2 WHERE id = $3 AND module_id = $4',
      [i, now, endpointIds[i], moduleId]
    );
  }
}

interface ProjectSearchDbRow {
  kind: 'project' | 'module' | 'endpoint';
  project_id: number;
  project_name: string;
  module_id?: number | null;
  module_name?: string | null;
  endpoint_id?: number | null;
  endpoint_name?: string | null;
  protocol?: string | null;
  method?: string | null;
  url?: string | null;
  match_text?: string | null;
}

export async function searchProjectTree(keyword: string): Promise<ProjectSearchResult[]> {
  await initDb();
  const q = keyword.trim();
  if (!q) return [];
  const like = `%${q}%`;
  const database = getDb();
  const rows = await database.select<ProjectSearchDbRow[]>(
    `SELECT
       CASE
         WHEN e.id IS NOT NULL AND (
           e.name LIKE $1 OR e.url LIKE $1 OR COALESCE(e.method, '') LIKE $1 OR COALESCE(e.headers, '') LIKE $1
         ) THEN 'endpoint'
         WHEN m.id IS NOT NULL AND m.name LIKE $1 THEN 'module'
         ELSE 'project'
       END AS kind,
       p.id AS project_id,
       p.name AS project_name,
       m.id AS module_id,
       m.name AS module_name,
       e.id AS endpoint_id,
       e.name AS endpoint_name,
       e.protocol AS protocol,
       e.method AS method,
       e.url AS url,
       COALESCE(e.name, e.url, m.name, p.name) AS match_text
     FROM projects p
     LEFT JOIN modules m ON m.project_id = p.id
     LEFT JOIN api_endpoints e ON e.module_id = m.id
     WHERE p.name LIKE $1
        OR m.name LIKE $1
        OR e.name LIKE $1
        OR e.url LIKE $1
        OR COALESCE(e.method, '') LIKE $1
        OR COALESCE(e.headers, '') LIKE $1
     ORDER BY p.sort_order ASC, p.id ASC, m.sort_order ASC, m.id ASC, e.sort_order ASC, e.id ASC
     LIMIT 100`,
    [like]
  );
  return rows.map((row) => ({
    kind: row.kind,
    projectId: row.project_id,
    projectName: row.project_name,
    moduleId: row.module_id ?? null,
    moduleName: row.module_name ?? null,
    endpointId: row.endpoint_id ?? null,
    endpointName: row.endpoint_name ?? null,
    protocol: (row.protocol as ProjectSearchResult['protocol']) ?? null,
    method: row.method ?? null,
    url: row.url ?? null,
    matchText: row.match_text ?? null,
  }));
}
