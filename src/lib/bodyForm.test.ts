import { describe, expect, it } from 'vitest';
import { parseBodyFormInput } from './bodyForm';

describe('parseBodyFormInput', () => {
  it('解析 a=1&b=1 为 Body 表单行', () => {
    expect(parseBodyFormInput('a=1&b=1')).toEqual([
      { key: 'a', value: '1', description: '', enabled: true, type: 'text' },
      { key: 'b', value: '1', description: '', enabled: true, type: 'text' },
    ]);
  });

  it('解码 URL 编码和值里的加号空格', () => {
    expect(parseBodyFormInput('name=%E5%BC%A0%E4%B8%89&msg=hello+world')).toEqual([
      { key: 'name', value: '张三', description: '', enabled: true, type: 'text' },
      { key: 'msg', value: 'hello world', description: '', enabled: true, type: 'text' },
    ]);
  });

  it('支持带问号查询串和完整 URL', () => {
    expect(parseBodyFormInput('?a=1&b=2')).toMatchObject([
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ]);
    expect(parseBodyFormInput('https://example.com/path?a=1&b=2')).toMatchObject([
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ]);
  });

  it('解析逐行冒号格式并保留方括号字段名', () => {
    const input = [
      'order_tag: cart',
      'cart_list: 171045,171046,171047,171068',
      'sample_goods[0][sku_id]: 100452',
      'sample_goods[0][num]: 3',
      'address[lng]: 121.42394',
      'enabled_ladder_ids[0]: 35',
    ].join('\n');

    expect(parseBodyFormInput(input)).toEqual([
      { key: 'order_tag', value: 'cart', description: '', enabled: true, type: 'text' },
      { key: 'cart_list', value: '171045,171046,171047,171068', description: '', enabled: true, type: 'text' },
      { key: 'sample_goods[0][sku_id]', value: '100452', description: '', enabled: true, type: 'text' },
      { key: 'sample_goods[0][num]', value: '3', description: '', enabled: true, type: 'text' },
      { key: 'address[lng]', value: '121.42394', description: '', enabled: true, type: 'text' },
      { key: 'enabled_ladder_ids[0]', value: '35', description: '', enabled: true, type: 'text' },
    ]);
  });

  it('冒号格式兼容 CRLF、空行、空值及重复字段', () => {
    expect(parseBodyFormInput(' \r\n tag : first \r\n\r\ntag: second\r\nempty:\r\n')).toMatchObject([
      { key: 'tag', value: 'first' },
      { key: 'tag', value: 'second' },
      { key: 'empty', value: '' },
    ]);
  });

  it('冒号格式只按首个冒号拆分且不解码值', () => {
    expect(parseBodyFormInput([
      'redirect: https://example.com/path?a=1&b=2',
      'token: demo+token/with==',
      'text: 100%25: a+b & c=d',
    ].join('\n'))).toMatchObject([
      { key: 'redirect', value: 'https://example.com/path?a=1&b=2' },
      { key: 'token', value: 'demo+token/with==' },
      { key: 'text', value: '100%25: a+b & c=d' },
    ]);
  });

  it('支持单行冒号字段', () => {
    expect(parseBodyFormInput('order_tag: cart')).toMatchObject([
      { key: 'order_tag', value: 'cart' },
    ]);
  });

  it('查询串中的 URL 与冒号仍按 URL 编码格式解析', () => {
    expect(parseBodyFormInput('redirect=https://example.com/path&time=12:30&tag=a&tag=b')).toMatchObject([
      { key: 'redirect', value: 'https://example.com/path' },
      { key: 'time', value: '12:30' },
      { key: 'tag', value: 'a' },
      { key: 'tag', value: 'b' },
    ]);
  });

  it('空输入不产生字段', () => {
    expect(parseBodyFormInput(' \r\n\t ')).toEqual([]);
  });
});
