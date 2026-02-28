import Database from '@tauri-apps/plugin-sql';
import type { HistoryItem, FavoriteItem } from '../types';

let db: Database | null = null;

const DB_PATH = 'sqlite:apix.db';

export async function initDb(): Promise<void> {
  if (db) return;
  db = await Database.load(DB_PATH);

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
  responseBody?: string
): Promise<void> {
  await initDb();
  const database = getDb();
  const now = Date.now();
  await database.execute(
    `INSERT INTO request_history (protocol, method, url, headers, params, body, created_at, response_status, response_time_ms, response_headers, response_body)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [protocol, method || null, url, headers, params || null, body || null, now, responseStatus ?? null, responseTimeMs ?? null, responseHeaders ?? null, responseBody ?? null]
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
