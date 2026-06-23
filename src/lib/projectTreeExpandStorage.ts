import type { ModuleRow, ProjectRow } from '../types';

const KEY_PROJECTS = 'apix-project-tree-expanded-projects';
const KEY_MODULES = 'apix-project-tree-expanded-modules';

function parseBoolMap(raw: string | null): Record<number, boolean> {
  if (raw == null || raw === '') return {};
  try {
    const o = JSON.parse(raw) as Record<string, boolean>;
    const out: Record<number, boolean> = {};
    for (const [k, v] of Object.entries(o)) {
      const id = Number(k);
      if (!Number.isNaN(id)) out[id] = Boolean(v);
    }
    return out;
  } catch {
    return {};
  }
}

export function loadExpandedProjects(): Record<number, boolean> {
  if (typeof localStorage === 'undefined') return {};
  return parseBoolMap(localStorage.getItem(KEY_PROJECTS));
}

export function loadExpandedModules(): Record<number, boolean> {
  if (typeof localStorage === 'undefined') return {};
  return parseBoolMap(localStorage.getItem(KEY_MODULES));
}

export function saveExpandedProjectState(
  expandedProject: Record<number, boolean>,
  expandedModule: Record<number, boolean>
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY_PROJECTS, JSON.stringify(expandedProject));
    localStorage.setItem(KEY_MODULES, JSON.stringify(expandedModule));
  } catch {
    // quota / private mode
  }
}

/**
 * 按当前树节点合并本地记录；新出现的项目/模块用 defaultForNew（默认展开）。
 */
export function mergeExpandedWithTree(
  projects: ProjectRow[],
  modulesByProject: Record<number, ModuleRow[]>,
  savedProject: Record<number, boolean>,
  savedModule: Record<number, boolean>,
  defaultForNew = true
): { expandedProject: Record<number, boolean>; expandedModule: Record<number, boolean> } {
  const expandedProject: Record<number, boolean> = {};
  for (const p of projects) {
    expandedProject[p.id] = savedProject[p.id] ?? defaultForNew;
  }
  const expandedModule: Record<number, boolean> = {};
  for (const p of projects) {
    for (const m of modulesByProject[p.id] ?? []) {
      expandedModule[m.id] = savedModule[m.id] ?? defaultForNew;
    }
  }
  return { expandedProject, expandedModule };
}

export function buildAllExpanded(
  projects: ProjectRow[],
  modulesByProject: Record<number, ModuleRow[]>,
  value: boolean
): { expandedProject: Record<number, boolean>; expandedModule: Record<number, boolean> } {
  const expandedProject: Record<number, boolean> = {};
  for (const p of projects) {
    expandedProject[p.id] = value;
  }
  const expandedModule: Record<number, boolean> = {};
  for (const p of projects) {
    for (const m of modulesByProject[p.id] ?? []) {
      expandedModule[m.id] = value;
    }
  }
  return { expandedProject, expandedModule };
}
