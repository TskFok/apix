import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as db from './db';

const { getStateRequest, refreshProjects } = vi.hoisted(() => ({
  getStateRequest: vi.fn(),
  refreshProjects: vi.fn(),
}));

vi.mock('../stores/requestStore', () => ({
  useRequestStore: {
    getState: () => getStateRequest(),
  },
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

  it('suppressPersistToProject 时不写入', async () => {
    getStateRequest.mockReturnValue({
      suppressPersistToProject: true,
      protocol: 'http',
      currentEndpointId: 1,
    });
    await persistProjectHttpResponseIfNeeded({
      status: 200,
      headers: {},
      body: 'ok',
    });
    expect(db.updateApiEndpoint).not.toHaveBeenCalled();
  });

  it('非 http 协议不写入', async () => {
    getStateRequest.mockReturnValue({
      suppressPersistToProject: false,
      protocol: 'ws',
      currentEndpointId: 1,
    });
    await persistProjectHttpResponseIfNeeded({ status: 200, headers: {}, body: 'x' });
    expect(db.updateApiEndpoint).not.toHaveBeenCalled();
  });

  it('无 endpointId 不写入', async () => {
    getStateRequest.mockReturnValue({
      suppressPersistToProject: false,
      protocol: 'http',
      currentEndpointId: null,
    });
    await persistProjectHttpResponseIfNeeded({ status: 200, headers: {}, body: 'x' });
    expect(db.updateApiEndpoint).not.toHaveBeenCalled();
  });

  it('项目内 http 成功时更新响应列并刷新树', async () => {
    getStateRequest.mockReturnValue({
      suppressPersistToProject: false,
      protocol: 'http',
      currentEndpointId: 42,
    });
    await persistProjectHttpResponseIfNeeded({
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
