import { describe, it, expect } from 'vitest';
import {
  APIX_PROJECT_EXPORT_FORMAT,
  APIX_PROJECT_EXPORT_VERSION,
  parseProjectExportJson,
  type ApixProjectExportFile,
} from './projectImportExport';
import { defaultEndpointNameFromUrl } from './persistProjectEndpoint';
import {
  breakdownUrl,
  buildEndpointDocCurl,
  buildLastResponseDocSection,
  buildProjectApiDocHtml,
  endpointEffectiveRequestUrl,
  escapeHtml,
} from './projectApiDocHtml';

describe('buildLastResponseDocSection', () => {
  it('仅输出状态与耗时，并因安全原因省略真实响应内容', () => {
    const html = buildLastResponseDocSection({
      name: 'a',
      protocol: 'http',
      method: 'GET',
      url: 'https://x',
      headers: '[]',
      params: null,
      body: null,
      sort_order: 0,
      response_status: 200,
      response_time_ms: 42,
      response_headers: JSON.stringify({ 'Content-Type': 'application/json' }),
      response_body: '{"ok":true}',
    });
    expect(html).toContain('最近一次响应');
    expect(html).toContain('HTTP 200');
    expect(html).toContain('42 ms');
    expect(html).toContain('安全');
    expect(html).toContain('省略');
    expect(html).not.toContain('Content-Type');
    expect(html).not.toContain('application/json');
    expect(html).not.toContain('{&quot;ok&quot;:true}');
  });

  it('无持久化响应时返回空串', () => {
    expect(
      buildLastResponseDocSection({
        name: 'a',
        protocol: 'http',
        method: 'GET',
        url: 'https://x',
        headers: '[]',
        params: null,
        body: null,
        sort_order: 0,
      })
    ).toBe('');
  });
});

describe('buildEndpointDocCurl', () => {
  it('GET 合并 URL 与 Query，并脱敏 Token Header', () => {
    const curl = buildEndpointDocCurl({
      name: 'x',
      protocol: 'http',
      method: 'GET',
      url: 'https://host/api.php',
      headers: JSON.stringify([{ key: 'X-Token', value: 'abc', description: '', enabled: true }]),
      params: JSON.stringify([{ key: 's', value: 'a/b', description: '', enabled: true }]),
      body: null,
      sort_order: 0,
    });
    expect(curl.startsWith('curl ')).toBe(true);
    expect(curl).toContain('X-Token: [已脱敏]');
    expect(curl).not.toContain('X-Token: abc');
    expect(curl).toContain('https://host/api.php');
  });

  it('脱敏认证 Header、secret 查询参数与 JSON 密码', () => {
    const curl = buildEndpointDocCurl({
      name: 'x',
      protocol: 'http',
      method: 'POST',
      url: 'https://alice:userinfo-secret@host/api?client-secret=url-secret&view=summary#access_token=fragment-secret',
      headers: JSON.stringify([
        { key: 'Authorization', value: 'Bearer header-secret', description: '', enabled: true },
        { key: 'X-Trace', value: 'trace-visible', description: '', enabled: true },
      ]),
      params: JSON.stringify([
        { key: 'API_TOKEN', value: 'param-secret', description: '', enabled: true },
        { key: 'page', value: '2', description: '', enabled: true },
      ]),
      body: JSON.stringify({
        bodyType: 'raw',
        bodyFormFields: [],
        body: JSON.stringify({ profile: { name: 'Ada', pass_word: 'body-secret' } }),
        rawType: 'json',
        binaryPath: '',
      }),
      sort_order: 0,
    });

    expect(curl).toContain('trace-visible');
    expect(curl).toContain('summary');
    expect(curl).toContain('Ada');
    expect(curl).toContain('[已脱敏]');
    for (const secret of [
      'alice',
      'userinfo-secret',
      'url-secret',
      'header-secret',
      'param-secret',
      'body-secret',
      'fragment-secret',
    ]) {
      expect(curl).not.toContain(secret);
    }
  });

  it.each([
    'https://alice:userinfo-secret@{{host}}:{{port}}/api?page=1',
    'https://alice:p@ss@{{host}}:{{port}}/api?page=1',
    '//alice:userinfo-secret@example.com/api?page=1',
  ])('URL 标准解析失败时仍移除 userinfo：%s', (url) => {
    const curl = buildEndpointDocCurl({
      name: 'x',
      protocol: 'http',
      method: 'GET',
      url,
      headers: '[]',
      params: null,
      body: null,
      sort_order: 0,
    });

    expect(curl).toContain('page=1');
    expect(curl).not.toContain('alice');
    expect(curl).not.toContain('userinfo-secret');
    expect(curl).not.toContain('p@ss');
    expect(curl).not.toContain('ss@');
  });

  it('非 JSON raw 内容默认省略，保留类型说明且不会进入 data-curl', () => {
    const payload: ApixProjectExportFile = {
      format: APIX_PROJECT_EXPORT_FORMAT,
      version: APIX_PROJECT_EXPORT_VERSION,
      exportedAt: 1_700_000_000_000,
      project: { name: 'P', global_config: '{"headers":[],"variables":[]}' },
      modules: [
        {
          name: 'M',
          sort_order: 0,
          endpoints: [
            {
              name: '文本请求',
              protocol: 'http',
              method: 'POST',
              url: 'https://host/text',
              headers: '[]',
              params: null,
              body: JSON.stringify({
                bodyType: 'raw',
                bodyFormFields: [],
                body: 'password=unstructured-secret',
                rawType: 'text',
                binaryPath: '',
              }),
              sort_order: 0,
            },
          ],
        },
      ],
    };

    const html = buildProjectApiDocHtml(payload);

    expect(html).toContain('raw（text）');
    expect(html).toContain('安全');
    expect(html).toContain('省略');
    expect(html).not.toContain('unstructured-secret');
    expect(html).not.toContain('--data-raw');
  });

  it('旧导入 Body 缺少类型时按 raw JSON 脱敏并保留非敏感字段', () => {
    const imported = parseProjectExportJson(
      JSON.stringify({
        format: APIX_PROJECT_EXPORT_FORMAT,
        version: APIX_PROJECT_EXPORT_VERSION,
        exportedAt: 1,
        project: { name: '旧项目', global_config: '{}' },
        modules: [
          {
            name: 'M',
            sort_order: 0,
            endpoints: [
              {
                name: '旧接口',
                protocol: 'http',
                method: 'POST',
                url: 'https://host/legacy',
                headers: '[]',
                params: null,
                body: JSON.stringify({
                  body: JSON.stringify({ name: 'Ada', password: 'body-secret' }),
                }),
                sort_order: 0,
              },
            ],
          },
        ],
      })
    );

    const html = buildProjectApiDocHtml(imported);

    expect(html).toContain('Ada');
    expect(html).toContain('已脱敏');
    expect(html).not.toContain('body-secret');
  });

  it('未知 Body 类型默认省略原始内容', () => {
    const payload: ApixProjectExportFile = {
      format: APIX_PROJECT_EXPORT_FORMAT,
      version: APIX_PROJECT_EXPORT_VERSION,
      exportedAt: 1,
      project: { name: 'P', global_config: '{}' },
      modules: [
        {
          name: 'M',
          sort_order: 0,
          endpoints: [
            {
              name: '未知 Body',
              protocol: 'http',
              method: 'POST',
              url: 'https://host/unknown',
              headers: '[]',
              params: null,
              body: JSON.stringify({
                bodyType: 'graphql',
                body: 'query with unknown-body-secret',
                rawType: 'text',
                bodyFormFields: [],
              }),
              sort_order: 0,
            },
          ],
        },
      ],
    };

    const html = buildProjectApiDocHtml(payload);

    expect(html).toContain('安全');
    expect(html).toContain('省略');
    expect(html).not.toContain('unknown-body-secret');
    expect(html).not.toContain('--data-raw');
  });

  it('脱敏签名和常见认证字段，同时保留分页及模型参数', () => {
    const curl = buildEndpointDocCurl({
      name: '签名请求',
      protocol: 'http',
      method: 'GET',
      url: 'https://host/api?key=plain-api-key-secret&signature=s1&sig=s2&X-Amz-Signature=s3&X-Goog-Signature=s4&page=2&max_tokens=512',
      headers: '[]',
      params: JSON.stringify([
        { key: 'passphrase', value: 'p1', description: '', enabled: true },
        { key: 'private_key', value: 'p2', description: '', enabled: true },
        { key: 'password_confirmation', value: 'p3', description: '', enabled: true },
        { key: 'token_value', value: 'p4', description: '', enabled: true },
      ]),
      body: null,
      sort_order: 0,
    });

    expect(curl).toContain('page=2');
    expect(curl).toContain('max_tokens=512');
    expect(curl).toContain('%5B%E5%B7%B2%E8%84%B1%E6%95%8F%5D');
    for (const secret of ['plain-api-key-secret', 's1', 's2', 's3', 's4', 'p1', 'p2', 'p3', 'p4']) {
      expect(curl).not.toContain(`=${secret}`);
    }
  });
});

describe('escapeHtml', () => {
  it('转义 HTML 特殊字符', () => {
    expect(escapeHtml('<a>&"')).toBe('&lt;a&gt;&amp;&quot;');
  });
});

describe('breakdownUrl', () => {
  it('解析 api.php 查询路由', () => {
    const u = 'https://xx.com/api.php?s=order/getDiscountCombinations';
    const b = breakdownUrl(u);
    expect(b.ok).toBe(true);
    expect(b.origin).toBe('https://xx.com');
    expect(b.pathname).toBe('/api.php');
    expect(b.searchParams).toEqual([{ key: 's', value: 'order/getDiscountCombinations' }]);
  });
});

describe('buildProjectApiDocHtml', () => {
  const base: ApixProjectExportFile = {
    format: APIX_PROJECT_EXPORT_FORMAT,
    version: APIX_PROJECT_EXPORT_VERSION,
    exportedAt: 1_700_000_000_000,
    project: { name: 'P<script>', global_config: '{"headers":[],"variables":[]}' },
    modules: [
      {
        name: '订单',
        sort_order: 0,
        endpoints: [
          {
            name: '优惠组合',
            protocol: 'http',
            method: 'GET',
            url: 'https://xx.com/api.php?s=order/getDiscountCombinations',
            headers: '[]',
            params: null,
            body: null,
            sort_order: 0,
          },
        ],
      },
    ],
  };

  it('保留完整 URL 与查询参数分解且标题已转义', () => {
    const html = buildProjectApiDocHtml(base);
    expect(html).toContain('https://xx.com/api.php?s=order/getDiscountCombinations');
    expect(html).toContain('order/getDiscountCombinations');
    expect(html).toContain('api.php');
    expect(html).toContain('P&lt;script&gt;');
    expect(html).not.toContain('P<script>');
    expect(html).toContain('<summary>地址分解</summary>');
    expect(html).toContain('copy-url-btn');
    expect(html).toContain('data-url=');
    expect(html).toContain('复制 URL');
    expect(html).toContain('copy-curl-btn');
    expect(html).toContain('data-curl=');
    expect(html).not.toContain('项目全局 Headers');
  });

  it.each([
    '/login?token=derived-secret',
    '{{baseUrl}}/api?token=derived-secret',
    'api?token=derived-secret',
  ])('接口名由 UI 默认命名流程生成时脱敏其中的 secret query：%s', (url) => {
    const payload: ApixProjectExportFile = {
      ...base,
      modules: [
        {
          name: 'M',
          sort_order: 0,
          endpoints: [
            {
              name: defaultEndpointNameFromUrl(url),
              protocol: 'http',
              method: 'GET',
              url,
              headers: '[]',
              params: null,
              body: null,
              sort_order: 0,
            },
          ],
        },
      ],
    };

    const html = buildProjectApiDocHtml(payload);

    expect(html).not.toContain('derived-secret');
  });

  it('保留与 URL 无关的自由接口标题', () => {
    const payload: ApixProjectExportFile = {
      ...base,
      modules: [
        {
          name: 'M',
          sort_order: 0,
          endpoints: [
            {
              name: '手工标题 token=仅作说明',
              protocol: 'http',
              method: 'GET',
              url: 'api?token=derived-secret',
              headers: '[]',
              params: null,
              body: null,
              sort_order: 0,
            },
          ],
        },
      ],
    };

    const html = buildProjectApiDocHtml(payload);

    expect(html).toContain('手工标题 token=仅作说明');
    expect(html).not.toContain('derived-secret');
  });

  it('复制与展示均为地址栏 URL 与 Params 表合并结果', () => {
    const payload: ApixProjectExportFile = {
      ...base,
      modules: [
        {
          name: 'M',
          sort_order: 0,
          endpoints: [
            {
              name: 'x',
              protocol: 'http',
              method: 'GET',
              url: 'https://host/api.php',
              headers: '[]',
              params: JSON.stringify([
                { key: 's', value: 'order/getDiscountCombinations', description: '', enabled: true },
              ]),
              body: null,
              sort_order: 0,
            },
          ],
        },
      ],
    };
    const html = buildProjectApiDocHtml(payload);
    expect(html).toContain('https://host/api.php?s=order%2FgetDiscountCombinations');
    expect(html).toContain('data-url=');
    expect(endpointEffectiveRequestUrl(payload.modules[0].endpoints[0])).toBe(
      'https://host/api.php?s=order%2FgetDiscountCombinations'
    );
  });

  it('复制按钮 data-url 中对 & 做属性转义', () => {
    const payload: ApixProjectExportFile = {
      ...base,
      modules: [
        {
          name: 'M',
          sort_order: 0,
          endpoints: [
            {
              name: 'x',
              protocol: 'http',
              method: 'GET',
              url: 'https://x.com/a?foo=1&bar=2',
              headers: '[]',
              params: null,
              body: null,
              sort_order: 0,
            },
          ],
        },
      ],
    };
    const html = buildProjectApiDocHtml(payload);
    expect(html).toContain('data-url="https://x.com/a?foo=1&amp;bar=2"');
  });

  it('含最近一次响应时仅写入元数据和安全省略说明', () => {
    const payload: ApixProjectExportFile = {
      ...base,
      modules: [
        {
          name: 'M',
          sort_order: 0,
          endpoints: [
            {
              name: 'x',
              protocol: 'http',
              method: 'GET',
              url: 'https://x.com/',
              headers: '[]',
              params: null,
              body: null,
              sort_order: 0,
              response_status: 201,
              response_time_ms: 18,
              response_headers: JSON.stringify({ 'Set-Cookie': 'session=response-cookie-secret' }),
              response_body: '{"email":"person@example.com"}',
            },
          ],
        },
      ],
    };
    const html = buildProjectApiDocHtml(payload);
    expect(html).toContain('最近一次响应');
    expect(html).toContain('HTTP 201');
    expect(html).toContain('18 ms');
    expect(html).toContain('安全');
    expect(html).toContain('省略');
    expect(html).not.toContain('Set-Cookie');
    expect(html).not.toContain('response-cookie-secret');
    expect(html).not.toContain('person@example.com');
  });

  it('文档正文、复制属性与 cURL 均不包含请求密钥或绝对文件路径', () => {
    const payload: ApixProjectExportFile = {
      ...base,
      modules: [
        {
          name: 'M',
          sort_order: 0,
          endpoints: [
            {
              name: '安全导出',
              protocol: 'http',
              method: 'POST',
              url: 'https://alice:url-password@host/upload?access-token=url-token&view=summary',
              headers: JSON.stringify([
                { key: 'aUtHoRiZaTiOn', value: 'Bearer auth-token', description: '', enabled: true },
                { key: 'coo-kie', value: 'sid=cookie-secret', description: '', enabled: true },
                { key: 'X-Trace', value: 'trace-visible', description: '', enabled: true },
              ]),
              params: JSON.stringify([
                { key: 'client_secret', value: 'query-secret', description: '', enabled: true },
                { key: 'page', value: '2', description: '', enabled: true },
              ]),
              body: JSON.stringify({
                bodyType: 'form-data',
                bodyFormFields: [
                  {
                    key: 'PASSWORD',
                    value: 'form-password',
                    description: '',
                    enabled: true,
                    type: 'text',
                  },
                  {
                    key: 'displayName',
                    value: 'Ada',
                    description: '',
                    enabled: true,
                    type: 'text',
                  },
                  {
                    key: 'attachment',
                    value: '',
                    description: '',
                    enabled: true,
                    type: 'file',
                    files: [{ name: 'report.csv', path: '/Users/alice/private/report.csv' }],
                  },
                ],
                body: '',
                rawType: 'text',
                binaryPath: '',
              }),
              sort_order: 0,
            },
            {
              name: '二进制上传',
              protocol: 'http',
              method: 'POST',
              url: 'https://host/binary',
              headers: '[]',
              params: null,
              body: JSON.stringify({
                bodyType: 'binary',
                bodyFormFields: [],
                body: '',
                rawType: 'text',
                binaryPath: 'C:\\Users\\alice\\private\\archive.zip',
              }),
              sort_order: 1,
            },
          ],
        },
      ],
    };

    const html = buildProjectApiDocHtml(payload);

    expect(html).toContain('trace-visible');
    expect(html).toContain('summary');
    expect(html).toContain('Ada');
    expect(html).toContain('report.csv');
    expect(html).toContain('archive.zip');
    expect(html).toContain('已脱敏');
    for (const secret of [
      'alice:url-password',
      'url-token',
      'auth-token',
      'cookie-secret',
      'query-secret',
      'form-password',
      '/Users/alice/private',
      'C:\\Users\\alice\\private',
    ]) {
      expect(html).not.toContain(secret);
    }
  });

  it('非 HTTP 记入页脚说明', () => {
    const payload: ApixProjectExportFile = {
      ...base,
      modules: [
        {
          name: 'A',
          sort_order: 0,
          endpoints: [
            {
              name: 'ws1',
              protocol: 'ws',
              method: null,
              url: 'wss://x/ws',
              headers: '[]',
              params: null,
              body: null,
              sort_order: 0,
            },
          ],
        },
      ],
    };
    const html = buildProjectApiDocHtml(payload);
    expect(html).toContain('非 HTTP');
    expect(html).toContain('ws1');
  });
});
