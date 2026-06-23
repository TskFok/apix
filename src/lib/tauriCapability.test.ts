import { describe, expect, it } from 'vitest';
import defaultCapability from '../../src-tauri/capabilities/default.json';

interface TauriCapability {
  permissions: Array<string | { identifier: string }>;
}

const capability = defaultCapability as TauriCapability;

describe('Tauri capability', () => {
  it('允许前端同步应用原生主题', () => {
    expect(capability.permissions).toContain('core:app:allow-set-app-theme');
  });
});
