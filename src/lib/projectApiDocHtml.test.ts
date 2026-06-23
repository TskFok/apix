import { describe, it, expect } from 'vitest';
import {
  APIX_PROJECT_EXPORT_FORMAT,
  APIX_PROJECT_EXPORT_VERSION,
  type ApixProjectExportFile,
} from './projectImportExport';
import {
  breakdownUrl,
  buildEndpointDocCurl,
  buildLastResponseDocSection,
  buildProjectApiDocHtml,
  endpointEffectiveRequestUrl,
  escapeHtml,
} from './projectApiDocHtml';

describe('buildLastResponseDocSection', () => {
  it('输出状态、响应头表与响应体', () => {
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
    expect(html).toContain('Content-Type');
    expect(html).toContain('application/json');
    expect(html).toContain('{&quot;ok&quot;:true}');
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
  it('GET 合并 URL 与 Query，并带 Header', () => {
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
    expect(curl).toContain('X-Token: abc');
    expect(curl).toContain('https://host/api.php');
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

  it('含最近一次响应时写入文档', () => {
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
              response_headers: JSON.stringify({ 'X-Req-Id': 'abc' }),
              response_body: 'created',
            },
          ],
        },
      ],
    };
    const html = buildProjectApiDocHtml(payload);
    expect(html).toContain('最近一次响应');
    expect(html).toContain('HTTP 201');
    expect(html).toContain('X-Req-Id');
    expect(html).toContain('created');
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
