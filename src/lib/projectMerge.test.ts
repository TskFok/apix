import { describe, it, expect } from 'vitest';
import {
  substituteInString,
  keyValueFieldsToRecord,
  mergeHeaderRecords,
  mergeGlobalVariablesIntoBodyFormFields,
  buildResolvedForSend,
  parseProjectGlobalConfig,
} from './projectMerge';
import type { ProjectGlobalConfig } from '../types';

describe('substituteInString', () => {
  it('replaces defined variables', () => {
    expect(substituteInString('{{base}}/v1', { base: 'https://a.com' })).toBe('https://a.com/v1');
  });

  it('allows spaces inside braces', () => {
    expect(substituteInString('{{  token  }}', { token: 'abc' })).toBe('abc');
  });

  it('leaves unknown placeholders', () => {
    expect(substituteInString('{{missing}}', {})).toBe('{{missing}}');
  });
});

describe('keyValueFieldsToRecord', () => {
  it('skips disabled rows', () => {
    expect(
      keyValueFieldsToRecord([
        { key: 'A', value: '1', description: '', enabled: true },
        { key: 'B', value: '2', description: '', enabled: false },
      ])
    ).toEqual({ A: '1' });
  });
});

describe('mergeHeaderRecords', () => {
  it('endpoint overrides global for same key', () => {
    expect(mergeHeaderRecords({ A: 'g', B: '1' }, { A: 'e' })).toEqual({ A: 'e', B: '1' });
  });
});

describe('mergeGlobalVariablesIntoBodyFormFields', () => {
  it('prepends global-only keys as text fields', () => {
    const out = mergeGlobalVariablesIntoBodyFormFields(
      [
        { key: 'a', value: '1', description: '', enabled: true },
        { key: 'b', value: '2', description: '', enabled: true },
      ],
      [{ key: 'b', value: '接口', description: '', enabled: true, type: 'text' }]
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ key: 'a', value: '1', type: 'text' });
    expect(out[1]).toMatchObject({ key: 'b', value: '接口' });
  });

  it('skips global row when endpoint already has the key', () => {
    const out = mergeGlobalVariablesIntoBodyFormFields(
      [{ key: 'x', value: 'g', description: '', enabled: true }],
      [{ key: 'x', value: 'e', description: '', enabled: true, type: 'text' }]
    );
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe('e');
  });
});

describe('buildResolvedForSend', () => {
  const global: ProjectGlobalConfig = {
    headers: [
      { key: 'X-Global', value: 'g', description: '', enabled: true },
      { key: 'X-Auth', value: 'Bearer {{token}}', description: '', enabled: true },
    ],
    variables: [{ key: 'token', value: 'SECRET', description: '', enabled: true }],
  };

  it('merges headers and substitutes; endpoint wins same key', () => {
    const r = buildResolvedForSend(
      {
        url: '{{base}}/x',
        headers: [{ key: 'X-Auth', value: 'Bearer local', description: '', enabled: true }],
        queryParams: [{ key: 'q', value: '{{token}}', description: '', enabled: true }],
        bodyType: 'raw',
        bodyFormFields: [],
        body: '{"t":"{{token}}"}',
        binaryPath: '',
      },
      global
    );
    expect(r.url).toBe('{{base}}/x');
    expect(r.headers['X-Global']).toBe('g');
    expect(r.headers['X-Auth']).toBe('Bearer local');
    expect(r.queryParams.q).toBe('SECRET');
    expect(r.body).toBe('{"t":"SECRET"}');
  });

  it('does not substitute file field values in form-data', () => {
    const r = buildResolvedForSend(
      {
        url: 'http://x',
        headers: [],
        queryParams: [],
        bodyType: 'form-data',
        bodyFormFields: [
          { key: 'f', value: '{{token}}', description: '', enabled: true, type: 'file', files: [] },
          { key: 't', value: '{{token}}', description: '', enabled: true, type: 'text' },
        ],
        body: '',
        binaryPath: '',
      },
      global
    );
    const fileRow = r.bodyFormFields.find((x) => x.key === 'f');
    const textRow = r.bodyFormFields.find((x) => x.key === 't');
    expect(fileRow?.type).toBe('file');
    expect(fileRow?.value).toBe('{{token}}');
    expect(textRow?.value).toBe('SECRET');
  });

  it('merges global variables as default form fields when key not on endpoint', () => {
    const g: ProjectGlobalConfig = {
      headers: [],
      variables: [
        { key: 'client_id', value: 'cid-1', description: '', enabled: true, target: 'body' },
        { key: 't', value: 'from-global', description: '', enabled: true, target: 'body' },
      ],
    };
    const r = buildResolvedForSend(
      {
        url: 'http://x',
        headers: [],
        queryParams: [],
        bodyType: 'form-data',
        bodyFormFields: [{ key: 't', value: 'endpoint', description: '', enabled: true, type: 'text' }],
        body: '',
        binaryPath: '',
      },
      g
    );
    expect(r.bodyFormFields[0]).toMatchObject({ key: 'client_id', value: 'cid-1' });
    expect(r.bodyFormFields[1]).toMatchObject({ key: 't', value: 'endpoint' });
  });

  it('keeps legacy variables without target as default body fields', () => {
    const g = {
      headers: [],
      variables: [{ key: 'legacy', value: '1', description: '', enabled: true }],
    } as ProjectGlobalConfig;
    const r = buildResolvedForSend(
      {
        url: 'http://x',
        headers: [],
        queryParams: [],
        bodyType: 'x-www-form-urlencoded',
        bodyFormFields: [],
        body: '',
        binaryPath: '',
      },
      g
    );
    expect(r.bodyFormFields[0]).toMatchObject({ key: 'legacy', value: '1' });
  });

  it('merges params-target global variables into query params and lets endpoint params win', () => {
    const g = {
      headers: [],
      variables: [
        { key: 'client_id', value: 'global-client', description: '', enabled: true, target: 'params' },
        { key: 'lang', value: '{{locale}}', description: '', enabled: true, target: 'params' },
        { key: 'locale', value: 'zh-CN', description: '', enabled: true, target: 'body' },
      ],
    } as ProjectGlobalConfig;

    const r = buildResolvedForSend(
      {
        url: 'http://x',
        headers: [],
        queryParams: [{ key: 'client_id', value: 'endpoint-client', description: '', enabled: true }],
        bodyType: 'form-data',
        bodyFormFields: [],
        body: '',
        binaryPath: '',
      },
      g
    );

    expect(r.queryParams).toEqual({
      client_id: 'endpoint-client',
      lang: 'zh-CN',
    });
  });

  it('uses global baseUrl when endpoint url is a relative path', () => {
    const g = {
      headers: [],
      baseUrl: 'https://api.example.com/v1',
      variables: [],
    } as ProjectGlobalConfig;

    const r = buildResolvedForSend(
      {
        url: '/users',
        headers: [],
        queryParams: [],
        bodyType: 'raw',
        bodyFormFields: [],
        body: '',
        binaryPath: '',
      },
      g
    );

    expect(r.url).toBe('https://api.example.com/v1/users');
  });

  it('uses legacy top-level baseUrl and headers after parsing old global config', () => {
    const g = parseProjectGlobalConfig(
      JSON.stringify({
        headers: [{ key: 'X-Legacy', value: 'legacy', description: '', enabled: true }],
        baseUrl: 'https://legacy.example.com/v1',
        variables: [],
      })
    );

    const r = buildResolvedForSend(
      {
        url: '/users',
        headers: [],
        queryParams: [],
        bodyType: 'raw',
        bodyFormFields: [],
        body: '',
        binaryPath: '',
      },
      g
    );

    expect(r.url).toBe('https://legacy.example.com/v1/users');
    expect(r.headers['X-Legacy']).toBe('legacy');
  });

  it('keeps absolute endpoint url instead of applying global baseUrl', () => {
    const g = {
      headers: [],
      baseUrl: 'https://api.example.com',
      variables: [],
    } as ProjectGlobalConfig;

    const r = buildResolvedForSend(
      {
        url: 'https://other.example.com/users',
        headers: [],
        queryParams: [],
        bodyType: 'raw',
        bodyFormFields: [],
        body: '',
        binaryPath: '',
      },
      g
    );

    expect(r.url).toBe('https://other.example.com/users');
  });

  it('disabled global header not merged', () => {
    const g: ProjectGlobalConfig = {
      headers: [{ key: 'X', value: '1', description: '', enabled: false }],
      variables: [],
    };
    const r = buildResolvedForSend(
      {
        url: 'http://a',
        headers: [],
        queryParams: [],
        bodyType: 'raw',
        bodyFormFields: [],
        body: '',
        binaryPath: '',
      },
      g
    );
    expect(r.headers.X).toBeUndefined();
  });

  it('uses active environment variables for placeholder substitution', () => {
    const g = {
      headers: [],
      variables: [
        { key: 'base_url', value: 'https://shared.example.com', description: '', enabled: true },
        { key: 'token', value: 'SHARED_TOKEN', description: '', enabled: true },
      ],
      activeEnvironmentId: 'test',
      environments: [
        {
          id: 'dev',
          name: '开发',
          variables: [{ key: 'base_url', value: 'https://dev.example.com', description: '', enabled: true }],
        },
        {
          id: 'test',
          name: '测试',
          variables: [
            { key: 'base_url', value: 'https://test.example.com', description: '', enabled: true },
            { key: 'token', value: 'TEST_TOKEN', description: '', enabled: true },
          ],
        },
      ],
    } satisfies ProjectGlobalConfig;

    const r = buildResolvedForSend(
      {
        url: '{{base_url}}/users',
        headers: [],
        queryParams: [{ key: 'tenant', value: '{{token}}', description: '', enabled: true }],
        bodyType: 'raw',
        bodyFormFields: [],
        body: '{"token":"{{token}}"}',
        binaryPath: '',
      },
      g
    );

    expect(r.url).toBe('https://test.example.com/users');
    expect(r.queryParams.tenant).toBe('TEST_TOKEN');
    expect(r.body).toBe('{"token":"TEST_TOKEN"}');
  });

  it('falls back to legacy shared variables when active environment has no variables', () => {
    const g = {
      headers: [],
      variables: [{ key: 'token', value: 'SHARED_TOKEN', description: '', enabled: true }],
      activeEnvironmentId: 'test',
      environments: [
        {
          id: 'test',
          name: '测试',
          variables: [],
        },
      ],
    } satisfies ProjectGlobalConfig;

    const r = buildResolvedForSend(
      {
        url: 'https://api.example.com/{{token}}',
        headers: [],
        queryParams: [{ key: 'token', value: '{{token}}', description: '', enabled: true }],
        bodyType: 'raw',
        bodyFormFields: [],
        body: '{"token":"{{token}}"}',
        binaryPath: '',
      },
      g
    );

    expect(r.url).toBe('https://api.example.com/SHARED_TOKEN');
    expect(r.queryParams.token).toBe('SHARED_TOKEN');
    expect(r.body).toBe('{"token":"SHARED_TOKEN"}');
  });

  it('uses active environment base URL and headers', () => {
    const g: ProjectGlobalConfig = {
      baseUrl: 'https://legacy.example.com',
      headers: [{ key: 'X-Env', value: 'legacy', description: '', enabled: true }],
      variables: [{ key: 'token', value: 'SHARED_TOKEN', description: '', enabled: true }],
      activeEnvironmentId: 'prod',
      environments: [
        {
          id: 'test',
          name: '测试',
          baseUrl: 'https://test.example.com',
          headers: [{ key: 'X-Env', value: 'test', description: '', enabled: true }],
          variables: [],
        },
        {
          id: 'prod',
          name: '生产',
          baseUrl: 'https://prod.example.com',
          headers: [
            { key: 'X-Env', value: 'prod', description: '', enabled: true },
            { key: 'X-Token', value: '{{token}}', description: '', enabled: true },
          ],
          variables: [{ key: 'token', value: 'PROD_TOKEN', description: '', enabled: true }],
        },
      ],
    };

    const r = buildResolvedForSend(
      {
        url: '/users',
        headers: [{ key: 'X-Env', value: 'endpoint', description: '', enabled: true }],
        queryParams: [],
        bodyType: 'raw',
        bodyFormFields: [],
        body: '',
        binaryPath: '',
      },
      g
    );

    expect(r.url).toBe('https://prod.example.com/users');
    expect(r.headers['X-Env']).toBe('endpoint');
    expect(r.headers['X-Token']).toBe('PROD_TOKEN');
  });

  it('ignores auth config when resolving headers and query params', () => {
    const g = {
      headers: [{ key: 'X-Project', value: '{{tenant_id}}', description: '', enabled: true }],
      variables: [{ key: 'tenant_id', value: 'shared-tenant', description: '', enabled: true }],
      activeEnvironmentId: 'prod',
      environments: [
        {
          id: 'prod',
          name: '生产',
          variables: [
            { key: 'token', value: 'PROD_TOKEN', description: '', enabled: true },
            { key: 'tenant_id', value: 'prod-tenant', description: '', enabled: true },
          ],
        },
      ],
      auth: { type: 'apiKey', name: 'api_key', value: '{{token}}', in: 'query', enabled: true },
    } satisfies ProjectGlobalConfig;

    const r = buildResolvedForSend(
      {
        url: 'https://api.example.com',
        headers: [{ key: 'X-Project', value: 'endpoint-tenant', description: '', enabled: true }],
        queryParams: [],
        bodyType: 'raw',
        bodyFormFields: [],
        body: '',
        binaryPath: '',
      },
      g
    );

    expect(r.headers['X-Project']).toBe('endpoint-tenant');
    expect(r.queryParams.api_key).toBeUndefined();
  });

  it('does not apply project auth config while resolving requests', () => {
    const r = buildResolvedForSend(
      {
        url: 'https://api.example.com',
        headers: [],
        queryParams: [],
        bodyType: 'raw',
        bodyFormFields: [],
        body: '',
        binaryPath: '',
      },
      {
        headers: [],
        variables: [{ key: 'token', value: 'abc', description: '', enabled: true }],
        auth: { type: 'bearer', token: '{{token}}', enabled: true },
      } satisfies ProjectGlobalConfig
    );

    expect(r.headers.Authorization).toBeUndefined();
  });
});

describe('parseProjectGlobalConfig', () => {
  it('returns empty for invalid json', () => {
    expect(parseProjectGlobalConfig('not json').headers).toEqual([]);
  });

  it('keeps old variables as shared variables and creates default environments', () => {
    const cfg = parseProjectGlobalConfig(
      JSON.stringify({
        headers: [],
        variables: [{ key: 'token', value: 'old', description: '', enabled: true }],
      })
    );

    expect(cfg.variables[0].key).toBe('token');
    expect(cfg.environments?.map((x) => x.name)).toEqual(['开发', '测试', '生产']);
    expect(cfg.activeEnvironmentId).toBe(cfg.environments?.[0].id);
    expect(cfg.auth).toBeUndefined();
  });

  it('parses baseUrl and variable target', () => {
    const cfg = parseProjectGlobalConfig(
      JSON.stringify({
        headers: [],
        baseUrl: 'https://api.example.com',
        variables: [
          { key: 'client_id', value: 'cid', description: '', enabled: true, target: 'params' },
          { key: 'secret', value: 's', description: '', enabled: true, target: 'body' },
          { key: 'bad', value: 'x', description: '', enabled: true, target: 'header' },
        ],
      })
    );

    expect(cfg.baseUrl).toBe('https://api.example.com');
    expect(cfg.variables[0].target).toBe('params');
    expect(cfg.variables[1].target).toBe('body');
    expect(cfg.variables[2].target).toBe('body');
  });

  it('parses environment baseUrl and headers', () => {
    const cfg = parseProjectGlobalConfig(
      JSON.stringify({
        headers: [{ key: 'X-Legacy', value: 'legacy', description: '', enabled: true }],
        baseUrl: 'https://legacy.example.com',
        activeEnvironmentId: 'test',
        environments: [
          {
            id: 'test',
            name: '测试',
            baseUrl: 'https://test.example.com',
            headers: [{ key: 'X-Env', value: 'test', description: '', enabled: true }],
            variables: [],
          },
        ],
      })
    );

    expect(cfg.environments?.[0].baseUrl).toBe('https://test.example.com');
    expect(cfg.environments?.[0].headers?.[0].key).toBe('X-Env');
  });
});
