import { describe, expect, it } from 'vitest';
import { APIX_PROJECT_EXPORT_FORMAT } from './projectImportExport';
import { parseOpenApiToProjectExport } from './projectOpenApiImport';
import { parseProjectGlobalConfig } from './projectMerge';

describe('parseOpenApiToProjectExport', () => {
  it('converts OpenAPI 3 JSON paths into tag modules and endpoints', () => {
    const payload = parseOpenApiToProjectExport(
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'Pet API' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/pets': {
            get: {
              tags: ['pet'],
              summary: 'List pets',
              parameters: [
                { name: 'tenant_id', in: 'header', schema: { type: 'string' } },
                { name: 'page', in: 'query', schema: { type: 'integer' } },
              ],
            },
            post: {
              tags: ['pet'],
              operationId: 'createPet',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          '/health': {
            get: {
              summary: 'Health',
            },
          },
        },
      })
    );

    expect(payload.format).toBe(APIX_PROJECT_EXPORT_FORMAT);
    expect(payload.project.name).toBe('Pet API');
    expect(parseProjectGlobalConfig(payload.project.global_config).baseUrl).toBe('https://api.example.com');
    expect(payload.modules.map((m) => m.name)).toEqual(['pet', '默认模块']);
    expect(payload.modules[0].endpoints[0]).toMatchObject({
      name: 'List pets',
      method: 'GET',
      url: '/pets',
    });
    expect(JSON.parse(payload.modules[0].endpoints[0].headers)).toEqual([
      { key: 'tenant_id', value: '', description: '', enabled: true },
    ]);
    expect(JSON.parse(payload.modules[0].endpoints[0].params ?? '[]')).toEqual([
      { key: 'page', value: '', description: '', enabled: true },
    ]);
    expect(JSON.parse(payload.modules[0].endpoints[1].body ?? '{}').bodyType).toBe('raw');
  });

  it('converts Swagger 2 JSON host and basePath into global baseUrl', () => {
    const payload = parseOpenApiToProjectExport(
      JSON.stringify({
        swagger: '2.0',
        info: { title: 'Legacy API' },
        schemes: ['https'],
        host: 'legacy.example.com',
        basePath: '/v2',
        paths: {
          '/users/{id}': {
            get: {
              tags: ['users'],
              operationId: 'getUser',
              parameters: [
                { name: 'id', in: 'path', type: 'string' },
                { name: 'X-Trace', in: 'header', type: 'string' },
              ],
            },
          },
        },
      })
    );

    expect(payload.project.name).toBe('Legacy API');
    expect(parseProjectGlobalConfig(payload.project.global_config).baseUrl).toBe('https://legacy.example.com/v2');
    expect(payload.modules[0].endpoints[0]).toMatchObject({
      name: 'getUser',
      url: '/users/{{id}}',
    });
  });

  it('parses OpenAPI YAML', () => {
    const payload = parseOpenApiToProjectExport(`
openapi: 3.0.0
info:
  title: YAML API
servers:
  - url: https://yaml.example.com
paths:
  /ping:
    get:
      tags:
        - system
      summary: Ping
`);

    expect(payload.project.name).toBe('YAML API');
    expect(payload.modules[0].name).toBe('system');
    expect(payload.modules[0].endpoints[0].url).toBe('/ping');
  });
});
