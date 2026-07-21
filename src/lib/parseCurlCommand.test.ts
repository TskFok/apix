import { describe, expect, it } from 'vitest';
import { parseCurlCommand, tokenizeCurlCommand } from './parseCurlCommand';

describe('tokenizeCurlCommand', () => {
  it('处理引号、转义空格和反斜杠续行', () => {
    const command = [
      'curl',
      "-H 'X-Name: hello world'",
      '--data-raw "{\\"name\\": \\"A B\\"}"',
      'https://api.example.com/users',
    ].join(' \\\n');

    expect(tokenizeCurlCommand(command)).toEqual([
      'curl',
      '-H',
      'X-Name: hello world',
      '--data-raw',
      '{"name": "A B"}',
      'https://api.example.com/users',
    ]);
  });
});

describe('parseCurlCommand', () => {
  it('回填 POST JSON、请求头与 URL', () => {
    expect(
      parseCurlCommand(
        "curl -X POST -H 'Content-Type: application/json' -H 'Authorization: Bearer token' --data-raw '{\"name\":\"Ada\"}' 'https://api.example.com/users?source=cli'"
      )
    ).toMatchObject({
      method: 'POST',
      url: 'https://api.example.com/users?source=cli',
      bodyType: 'raw',
      body: '{"name":"Ada"}',
      rawType: 'json',
      binaryPath: '',
        headers: [
          { key: 'Content-Type', value: 'application/json', description: '', enabled: true },
          { key: 'Authorization', value: 'Bearer token', description: '', enabled: true },
          { key: '', value: '', description: '', enabled: true },
      ],
    });
  });

  it('无显式方法时根据数据推断 POST，否则推断 GET', () => {
    expect(parseCurlCommand("curl -d 'a=1' https://api.example.com/form")?.method).toBe('POST');
    expect(parseCurlCommand('curl https://api.example.com/health')?.method).toBe('GET');
  });

  it('将 multipart 文本与文件字段回填为 form-data', () => {
    expect(
      parseCurlCommand(
        "curl -F 'name=Ada' -F 'avatar=@/tmp/ada.png' https://api.example.com/users"
      )
    ).toMatchObject({
      method: 'POST',
      bodyType: 'form-data',
      bodyFormFields: [
        { key: 'name', value: 'Ada', description: '', enabled: true, type: 'text' },
        {
          key: 'avatar',
          value: 'ada.png',
          description: '',
          enabled: true,
          type: 'file',
          files: [{ path: '/tmp/ada.png', name: 'ada.png' }],
        },
        { key: '', value: '', description: '', enabled: true, type: 'text' },
      ],
    });
  });

  it('将 data-binary 文件映射为 binary Body', () => {
    expect(
      parseCurlCommand('curl --data-binary @/tmp/import.csv https://api.example.com/import')
    ).toMatchObject({ bodyType: 'binary', binaryPath: '/tmp/import.csv', method: 'POST' });
  });

  it('按 Content-Type 推断 XML 和 Text，并在无 URL 时返回 null', () => {
    expect(
      parseCurlCommand(
        "curl -H 'Content-Type: application/soap+xml' -d '<x />' https://api.example.com"
      )?.rawType
    ).toBe('xml');
    expect(
      parseCurlCommand(
        "curl -H 'Content-Type: text/csv' -d 'a,b' https://api.example.com"
      )?.rawType
    ).toBe('text');
    expect(parseCurlCommand("curl -X POST -d '{}' ")).toBeNull();
    expect(parseCurlCommand('not-a-curl https://api.example.com')).toBeNull();
  });
});
