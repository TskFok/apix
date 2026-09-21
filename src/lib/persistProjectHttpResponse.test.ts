import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as db from './db';

const { refreshProjects } = vi.hoisted(() => ({
  refreshProjects: vi.fn(),
}));

vi.mock('../stores/responseStore', () => ({
  useResponseStore: {
    getState: () => ({ refreshProjects }),
  },
}));

import { persistProjectHttpResponseIfNeeded } from './persistProjectEndpoint';

describe('persistProjectHttpResponseIfNeeded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(db, 'updateApiEndpoint').mockResolvedValue(undefined);
  });

  it('无发起时 endpointId 时不写入', async () => {
    await persistProjectHttpResponseIfNeeded(null, {
      status: 200,
      headers: {},
      body: 'ok',
    });
    expect(db.updateApiEndpoint).not.toHaveBeenCalled();
  });

  it('按发起时 endpointId 更新响应列并刷新树', async () => {
    await persistProjectHttpResponseIfNeeded(42, {
      status: 201,
      headers: { 'content-type': 'application/json' },
      body: '{"a":1}',
      timeMs: 99,
    });
    expect(db.updateApiEndpoint).toHaveBeenCalledWith(42, {
      response_status: 201,
      response_time_ms: 99,
      response_headers: JSON.stringify({ 'content-type': 'application/json' }),
      response_body: '{"a":1}',
    });
    expect(refreshProjects).toHaveBeenCalled();
  });
});
