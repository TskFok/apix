import { describe, it, expect, beforeEach } from 'vitest';
import { useRequestStore } from './requestStore';

describe('requestStore', () => {
  beforeEach(() => {
    useRequestStore.getState().newRequest();
  });

  describe('getBodyForStorage / loadFrom 支持 form-data 文件字段', () => {
    it('persist 和 restore 带 type/filePath 的 form 字段', () => {
      const store = useRequestStore.getState();
      store.setBodyFormFields([
        { key: 'avatar', value: 'photo.png', description: '', type: 'file', filePath: '/tmp/photo.png' },
        { key: 'name', value: 'test', description: '', type: 'text' },
      ]);
      store.setBodyType('form-data');

      const stored = store.getBodyForStorage();
      expect(() => JSON.parse(stored)).not.toThrow();

      const parsed = JSON.parse(stored) as { bodyFormFields: Array<{ key: string; value: string; type?: string; filePath?: string }> };
      expect(parsed.bodyFormFields).toHaveLength(2);
      expect(parsed.bodyFormFields[0]).toMatchObject({
        key: 'avatar',
        value: 'photo.png',
        type: 'file',
        filePath: '/tmp/photo.png',
      });
      expect(parsed.bodyFormFields[1]).toMatchObject({
        key: 'name',
        value: 'test',
        type: 'text',
      });

      store.loadFrom({
        protocol: 'http',
        url: 'https://example.com',
        body: stored,
      });

      const fields = useRequestStore.getState().bodyFormFields;
      expect(fields[0].type).toBe('file');
      expect(fields[0].filePath).toBe('/tmp/photo.png');
      expect(fields[0].value).toBe('photo.png');
      expect(fields[1].type).toBe('text');
      expect(fields[1].value).toBe('test');
    });

    it('persist 和 restore 带 files 数组的多文件字段', () => {
      const store = useRequestStore.getState();
      store.setBodyFormFields([
        {
          key: 'attachments',
          value: '',
          description: '',
          type: 'file',
          files: [
            { path: '/tmp/a.pdf', name: 'a.pdf' },
            { path: '/tmp/b.png', name: 'b.png' },
          ],
        },
      ]);
      store.setBodyType('form-data');

      const stored = store.getBodyForStorage();
      const parsed = JSON.parse(stored) as { bodyFormFields: Array<{ key: string; files?: Array<{ path: string; name: string }> }> };
      expect(parsed.bodyFormFields[0].files).toHaveLength(2);
      expect(parsed.bodyFormFields[0].files).toMatchObject([
        { path: '/tmp/a.pdf', name: 'a.pdf' },
        { path: '/tmp/b.png', name: 'b.png' },
      ]);

      store.loadFrom({
        protocol: 'http',
        url: 'https://example.com',
        body: stored,
      });

      const fields = useRequestStore.getState().bodyFormFields;
      expect(fields[0].files).toHaveLength(2);
      expect(fields[0].files?.[0]).toEqual({ path: '/tmp/a.pdf', name: 'a.pdf' });
      expect(fields[0].files?.[1]).toEqual({ path: '/tmp/b.png', name: 'b.png' });
    });
  });

  describe('getHeadersRecord / getQueryParamsRecord 只包含 enabled 为 true 的行', () => {
    it('过滤掉 enabled 为 false 的 header', () => {
      const store = useRequestStore.getState();
      store.setHeaders([
        { key: 'A', value: '1', description: '', enabled: true },
        { key: 'B', value: '2', description: '', enabled: false },
        { key: 'C', value: '3', description: '', enabled: true },
      ]);
      const record = store.getHeadersRecord();
      expect(record).toEqual({ A: '1', C: '3' });
    });

    it('过滤掉 enabled 为 false 的 queryParam', () => {
      const store = useRequestStore.getState();
      store.setQueryParams([
        { key: 'x', value: '1', description: '', enabled: true },
        { key: 'y', value: '2', description: '', enabled: false },
      ]);
      const record = store.getQueryParamsRecord();
      expect(record).toEqual({ x: '1' });
    });
  });
});
