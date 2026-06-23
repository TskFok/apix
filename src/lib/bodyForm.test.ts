import { describe, expect, it } from 'vitest';
import { parseUrlEncodedBodyInput } from './bodyForm';

describe('parseUrlEncodedBodyInput', () => {
  it('解析 a=1&b=1 为 Body 表单行', () => {
    expect(parseUrlEncodedBodyInput('a=1&b=1')).toEqual([
      { key: 'a', value: '1', description: '', enabled: true, type: 'text' },
      { key: 'b', value: '1', description: '', enabled: true, type: 'text' },
    ]);
  });

  it('解码 URL 编码和值里的加号空格', () => {
    expect(parseUrlEncodedBodyInput('name=%E5%BC%A0%E4%B8%89&msg=hello+world')).toEqual([
      { key: 'name', value: '张三', description: '', enabled: true, type: 'text' },
      { key: 'msg', value: 'hello world', description: '', enabled: true, type: 'text' },
    ]);
  });

  it('支持带问号查询串和完整 URL', () => {
    expect(parseUrlEncodedBodyInput('?a=1&b=2')).toMatchObject([
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ]);
    expect(parseUrlEncodedBodyInput('https://example.com/path?a=1&b=2')).toMatchObject([
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ]);
  });
});
