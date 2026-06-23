import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mergeExpandedWithTree,
  buildAllExpanded,
  loadExpandedProjects,
  loadExpandedModules,
  saveExpandedProjectState,
} from './projectTreeExpandStorage';
import type { ModuleRow, ProjectRow } from '../types';

function createMemoryStorage(): Storage {
  const mem: Record<string, string> = {};
  return {
    getItem: (k: string) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
    setItem: (k: string, v: string) => {
      mem[k] = v;
    },
    removeItem: (k: string) => {
      delete mem[k];
    },
    clear: () => {
      Object.keys(mem).forEach((k) => delete mem[k]);
    },
    key: (i: number) => Object.keys(mem)[i] ?? null,
    get length() {
      return Object.keys(mem).length;
    },
  } as Storage;
}

describe('projectTreeExpandStorage', () => {
  const projects: ProjectRow[] = [
    { id: 1, name: 'A', sort_order: 0, global_config: '{}', created_at: 0, updated_at: 0 },
    { id: 2, name: 'B', sort_order: 0, global_config: '{}', created_at: 0, updated_at: 0 },
  ];
  const modulesByProject: Record<number, ModuleRow[]> = {
    1: [{ id: 10, project_id: 1, name: 'm1', sort_order: 0, created_at: 0, updated_at: 0 }],
    2: [{ id: 20, project_id: 2, name: 'm2', sort_order: 0, created_at: 0, updated_at: 0 }],
  };

  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mergeExpandedWithTree 新节点默认展开', () => {
    const { expandedProject, expandedModule } = mergeExpandedWithTree(
      projects,
      modulesByProject,
      {},
      {},
      true
    );
    expect(expandedProject).toEqual({ 1: true, 2: true });
    expect(expandedModule).toEqual({ 10: true, 20: true });
  });

  it('mergeExpandedWithTree 尊重已保存的 false', () => {
    const { expandedProject, expandedModule } = mergeExpandedWithTree(
      projects,
      modulesByProject,
      { 1: false },
      { 10: false },
      true
    );
    expect(expandedProject[1]).toBe(false);
    expect(expandedProject[2]).toBe(true);
    expect(expandedModule[10]).toBe(false);
    expect(expandedModule[20]).toBe(true);
  });

  it('buildAllExpanded', () => {
    const open = buildAllExpanded(projects, modulesByProject, true);
    expect(open.expandedProject).toEqual({ 1: true, 2: true });
    expect(open.expandedModule).toEqual({ 10: true, 20: true });
    const closed = buildAllExpanded(projects, modulesByProject, false);
    expect(closed.expandedProject).toEqual({ 1: false, 2: false });
    expect(closed.expandedModule).toEqual({ 10: false, 20: false });
  });

  it('save / load 往返', () => {
    saveExpandedProjectState({ 3: false }, { 30: true });
    expect(loadExpandedProjects()).toEqual({ 3: false });
    expect(loadExpandedModules()).toEqual({ 30: true });
  });
});
