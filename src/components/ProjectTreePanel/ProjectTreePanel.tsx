import { useCallback, useEffect, useRef, useState } from 'react';
import { message, open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { Protocol, ProjectRow, ModuleRow, ApiEndpointRow } from '../../types';
import { useRequestStore } from '../../stores/requestStore';
import { useResponseStore } from '../../stores/responseStore';
import {
  listProjects,
  listModulesByProjectIds,
  listEndpointsByModuleIds,
  addProject,
  addModule,
  updateProject,
  updateModule,
  deleteProject,
  deleteModule,
  deleteApiEndpoint,
  getProject,
  searchProjectTree,
  copyApiEndpoint,
  moveApiEndpoint,
  reorderModules,
  reorderEndpoints,
} from '../../lib/db';
import { Modal } from '../Modal/Modal';
import { FastTooltip } from '../FastTooltip/FastTooltip';
import { parseProjectGlobalConfig } from '../../lib/projectMerge';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import {
  buildAllExpanded,
  loadExpandedModules,
  loadExpandedProjects,
  mergeExpandedWithTree,
  saveExpandedProjectState,
} from '../../lib/projectTreeExpandStorage';
import {
  IconProjectTreeAddModule,
  IconProjectTreeCollapseAll,
  IconProjectTreeDocHtml,
  IconProjectTreeExpandAll,
  IconProjectTreeExport,
  IconProjectTreeRename,
} from './projectTreeToolbarIcons';
import {
  buildProjectExportPayload,
  importProjectAsNew,
  importProjectMergeInto,
  parseProjectExportJson,
  ProjectImportError,
  serializeProjectExport,
  type ApixProjectExportFile,
} from '../../lib/projectImportExport';
import { parseOpenApiToProjectExport } from '../../lib/projectOpenApiImport';
import { buildProjectApiDocHtml } from '../../lib/projectApiDocHtml';
import '../Modal/Modal.css';

interface TreeData {
  projects: ProjectRow[];
  modulesByProject: Record<number, ModuleRow[]>;
  endpointsByModule: Record<number, ApiEndpointRow[]>;
}

interface ProjectTreeScrollTarget {
  projectId: number;
  moduleId?: number | null;
  endpointId?: number | null;
}

type DeleteConfirmTarget =
  | { kind: 'project'; project: ProjectRow }
  | { kind: 'module'; projectId: number; module: ModuleRow }
  | { kind: 'endpoint'; projectId: number; moduleId: number; endpoint: ApiEndpointRow };

function sanitizeFileName(name: string): string {
  const s = name.replace(/[/\\?%*:|"<>]/g, '_').trim();
  return s.slice(0, 80) || 'project';
}

async function loadTree(): Promise<TreeData> {
  const projects = await listProjects();
  const modulesByProject = await listModulesByProjectIds(projects.map((p) => p.id));
  const moduleIds = Object.values(modulesByProject).flat().map((m) => m.id);
  const endpointsByModule = await listEndpointsByModuleIds(moduleIds);
  return { projects, modulesByProject, endpointsByModule };
}

export function ProjectTreePanel() {
  const panelRef = useRef<HTMLDivElement>(null);
  const [tree, setTree] = useState<TreeData>({ projects: [], modulesByProject: {}, endpointsByModule: {} });
  const [loading, setLoading] = useState(true);
  const loadedOnceRef = useRef(false);
  const [expandedProject, setExpandedProject] = useState<Record<number, boolean>>({});
  const [expandedModule, setExpandedModule] = useState<Record<number, boolean>>({});

  const [modalProjectOpen, setModalProjectOpen] = useState(false);
  const [modalModuleProjectId, setModalModuleProjectId] = useState<number | null>(null);
  const [renameProjectTarget, setRenameProjectTarget] = useState<ProjectRow | null>(null);
  const [renameModuleCtx, setRenameModuleCtx] = useState<{
    module: ModuleRow;
    projectId: number;
  } | null>(null);
  const [importPayload, setImportPayload] = useState<ApixProjectExportFile | null>(null);
  const [importMode, setImportMode] = useState<'new' | 'merge'>('new');
  const [importTargetId, setImportTargetId] = useState<number | null>(null);
  const [exportPicker, setExportPicker] = useState<{
    kind: 'json' | 'html';
    projectId: number;
    projectName: string;
    modules: ModuleRow[];
  } | null>(null);
  const [exportModuleSelection, setExportModuleSelection] = useState<Set<number>>(() => new Set());
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<Awaited<ReturnType<typeof searchProjectTree>>>([]);
  const [pendingSearchScrollTarget, setPendingSearchScrollTarget] = useState<ProjectTreeScrollTarget | null>(null);
  const [moveEndpointCtx, setMoveEndpointCtx] = useState<{
    endpoint: ApiEndpointRow;
    projectId: number;
    moduleId: number;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmTarget | null>(null);
  const [moveTargetModuleId, setMoveTargetModuleId] = useState<number | null>(null);
  const [moveModuleSearch, setMoveModuleSearch] = useState('');
  const [dragModuleCtx, setDragModuleCtx] = useState<{ projectId: number; moduleId: number } | null>(null);
  const [dragEndpointCtx, setDragEndpointCtx] = useState<{ moduleId: number; endpointId: number } | null>(null);

  const loadFrom = useRequestStore((s) => s.loadFrom);
  const setCurrentHistoryId = useRequestStore((s) => s.setCurrentHistoryId);
  const setProjectContext = useRequestStore((s) => s.setProjectContext);
  const enterProjectSettingsView = useRequestStore((s) => s.enterProjectSettingsView);
  const flushProjectGlobalsDraft = useRequestStore((s) => s.flushProjectGlobalsDraft);
  const setNewEndpointTargetModule = useRequestStore((s) => s.setNewEndpointTargetModule);
  const currentProjectId = useRequestStore((s) => s.currentProjectId);

  const projectsRefreshTrigger = useResponseStore((s) => s.projectsRefreshTrigger);
  const pendingTreeExpand = useResponseStore((s) => s.pendingTreeExpand);
  const refreshProjects = useResponseStore((s) => s.refreshProjects);
  const setPendingTreeExpand = useResponseStore((s) => s.setPendingTreeExpand);
  const setHttpResponse = useResponseStore((s) => s.setHttpResponse);
  const setMode = useResponseStore((s) => s.setMode);

  const fetchTree = useCallback(async (): Promise<TreeData> => {
    if (!loadedOnceRef.current) {
      setLoading(true);
    }
    try {
      const data = await loadTree();
      const savedP = loadExpandedProjects();
      const savedM = loadExpandedModules();
      const { expandedProject: nextP, expandedModule: nextM } = mergeExpandedWithTree(
        data.projects,
        data.modulesByProject,
        savedP,
        savedM,
        true
      );
      setTree(data);
      setExpandedProject(nextP);
      setExpandedModule(nextM);
      return data;
    } finally {
      setLoading(false);
      loadedOnceRef.current = true;
    }
  }, []);

  useEffect(() => {
    fetchTree();
  }, [fetchTree, projectsRefreshTrigger]);

  useEffect(() => {
    const q = searchKeyword.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      void searchProjectTree(q).then(setSearchResults).catch((e) => {
        console.error('searchProjectTree', e);
        setSearchResults([]);
      });
    }, 180);
    return () => window.clearTimeout(t);
  }, [searchKeyword]);

  useEffect(() => {
    if (loading) return;
    saveExpandedProjectState(expandedProject, expandedModule);
  }, [expandedProject, expandedModule, loading]);

  useEffect(() => {
    if (loading || !pendingTreeExpand) return;
    const { projectId, moduleId } = pendingTreeExpand;
    if (!tree.projects.some((p) => p.id === projectId)) return;
    if (moduleId != null) {
      const mods = tree.modulesByProject[projectId] ?? [];
      if (!mods.some((m) => m.id === moduleId)) return;
    }
    setExpandedProject((e) => ({ ...e, [projectId]: true }));
    if (moduleId != null) {
      setExpandedModule((e) => ({ ...e, [moduleId]: true }));
    }
    setPendingTreeExpand(null);
  }, [loading, tree.projects, tree.modulesByProject, pendingTreeExpand, setPendingTreeExpand]);

  useEffect(() => {
    if (!pendingSearchScrollTarget) return;
    const selector =
      pendingSearchScrollTarget.endpointId != null
        ? `[data-project-tree-endpoint-id="${pendingSearchScrollTarget.endpointId}"]`
        : pendingSearchScrollTarget.moduleId != null
          ? `[data-project-tree-module-id="${pendingSearchScrollTarget.moduleId}"]`
          : `[data-project-tree-project-id="${pendingSearchScrollTarget.projectId}"]`;
    const el = panelRef.current?.querySelector<HTMLElement>(selector);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setPendingSearchScrollTarget(null);
  }, [expandedModule, expandedProject, pendingSearchScrollTarget, tree.endpointsByModule, tree.modulesByProject, tree.projects]);

  const handleExpandAll = useCallback(() => {
    const { expandedProject: nextP, expandedModule: nextM } = buildAllExpanded(
      tree.projects,
      tree.modulesByProject,
      true
    );
    setExpandedProject(nextP);
    setExpandedModule(nextM);
  }, [tree.projects, tree.modulesByProject]);

  const handleCollapseAll = useCallback(() => {
    const { expandedProject: nextP, expandedModule: nextM } = buildAllExpanded(
      tree.projects,
      tree.modulesByProject,
      false
    );
    setExpandedProject(nextP);
    setExpandedModule(nextM);
  }, [tree.projects, tree.modulesByProject]);

  const openExportPicker = useCallback(
    (kind: 'json' | 'html', p: ProjectRow) => {
      const mods = tree.modulesByProject[p.id] ?? [];
      setExportPicker({ kind, projectId: p.id, projectName: p.name, modules: mods });
      setExportModuleSelection(new Set(mods.map((m) => m.id)));
    },
    [tree.modulesByProject]
  );

  const toggleExportModule = useCallback((moduleId: number) => {
    setExportModuleSelection((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }, []);

  const setExportAllModules = useCallback(
    (selected: boolean) => {
      if (!exportPicker) return;
      if (selected) {
        setExportModuleSelection(new Set(exportPicker.modules.map((m) => m.id)));
      } else {
        setExportModuleSelection(new Set());
      }
    },
    [exportPicker]
  );

  const handleConfirmExportPicker = useCallback(async () => {
    if (!exportPicker) return;
    const ids = exportPicker.modules
      .filter((m) => exportModuleSelection.has(m.id))
      .map((m) => m.id);
    if (exportPicker.modules.length > 0 && ids.length === 0) {
      await message('请至少选择一个模块。', { title: '导出', kind: 'warning' });
      return;
    }
    try {
      const payload = await buildProjectExportPayload(exportPicker.projectId, { moduleIds: ids });
      if (!payload) {
        await message('无法读取项目数据。', { title: '导出失败', kind: 'error' });
        return;
      }
      if (exportPicker.kind === 'json') {
        const path = await save({
          defaultPath: `${sanitizeFileName(exportPicker.projectName)}.apix-project.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        if (path == null) return;
        await writeTextFile(path, serializeProjectExport(payload));
        await message('导出成功。', { title: 'Apix', kind: 'info' });
      } else {
        const html = buildProjectApiDocHtml(payload);
        const path = await save({
          defaultPath: `${sanitizeFileName(exportPicker.projectName)}-api-doc.html`,
          filters: [{ name: 'HTML', extensions: ['html'] }],
        });
        if (path == null) return;
        await writeTextFile(path, html);
        await message('已导出接口文档 HTML（适合 query 路由类 URL，可离线打开）。', { title: 'Apix', kind: 'info' });
      }
      setExportPicker(null);
    } catch (e) {
      console.error(e);
      const detail = e instanceof Error ? e.message : String(e);
      await message(`导出失败：${detail}`, { title: 'Apix', kind: 'error' });
    }
  }, [exportPicker, exportModuleSelection]);

  const handlePickImportFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'API 或项目文件', extensions: ['json', 'yaml', 'yml'] }],
      });
      if (selected == null || Array.isArray(selected)) return;
      const text = await readTextFile(selected);
      let payload: ApixProjectExportFile;
      try {
        payload = parseProjectExportJson(text);
      } catch {
        payload = parseOpenApiToProjectExport(text);
      }
      setImportPayload(payload);
      setImportMode('new');
      const st = useRequestStore.getState();
      const pid = st.currentProjectId ?? tree.projects[0]?.id ?? null;
      setImportTargetId(pid);
    } catch (e) {
      const msg = e instanceof ProjectImportError ? e.message : String(e);
      await message(msg, { title: '导入失败', kind: 'error' });
    }
  }, [tree.projects]);

  const handleConfirmImport = useCallback(async () => {
    if (!importPayload) return;
    try {
      if (importMode === 'merge') {
        const projects = await listProjects();
        const tid = importTargetId ?? projects[0]?.id ?? null;
        if (tid == null) {
          await message('没有可合并的目标项目。', { title: 'Apix', kind: 'error' });
          return;
        }
        await importProjectMergeInto(tid, importPayload);
        await message(
          '已合并到所选项目（目标项目的全局 Headers/变量未改动）。',
          { title: 'Apix', kind: 'info' }
        );
      } else {
        await importProjectAsNew(importPayload);
        await message('已新建项目并导入完成。', { title: 'Apix', kind: 'info' });
      }
      setImportPayload(null);
      refreshProjects();
      await fetchTree();
    } catch (e) {
      const msg = e instanceof ProjectImportError ? e.message : String(e);
      await message(msg, { title: '导入失败', kind: 'error' });
    }
  }, [importPayload, importMode, importTargetId, fetchTree, refreshProjects]);

  const handleOpenProjectGlobals = async (projectId: number) => {
    await flushProjectGlobalsDraft();
    const row = await getProject(projectId);
    if (!row) return;
    const cfg = parseProjectGlobalConfig(row.global_config);
    await enterProjectSettingsView(projectId, cfg);
    setExpandedProject((e) => ({ ...e, [projectId]: true }));
    setCurrentHistoryId(null);
  };

  const handleSelectEndpoint = async (projectId: number, moduleId: number, ep: ApiEndpointRow) => {
    setNewEndpointTargetModule({ projectId, moduleId });
    // 须先 flush 再读库：否则 setProjectContext 内 flush 写入 DB 后仍会用此处预先读取的旧 global_config 覆盖 store
    await flushProjectGlobalsDraft();
    const proj = await getProject(projectId);
    const cfg = proj ? parseProjectGlobalConfig(proj.global_config) : { headers: [], variables: [] };
    await setProjectContext({
      projectId,
      moduleId,
      endpointId: ep.id,
      globalConfig: cfg,
    });
    await loadFrom({
      protocol: ep.protocol as Protocol,
      method: ep.method ?? undefined,
      url: ep.url,
      headers: ep.headers,
      params: ep.params ?? undefined,
      body: ep.body ?? undefined,
      endpointRemark: ep.name,
    });
    setCurrentHistoryId(null);

    if (ep.protocol === 'http') {
      setMode('http');
      const hasSavedResponse =
        ep.response_status != null ||
        (ep.response_body != null && ep.response_body.length > 0);
      if (hasSavedResponse) {
        let respHeaders: Record<string, string> = {};
        if (ep.response_headers) {
          try {
            respHeaders = JSON.parse(ep.response_headers) as Record<string, string>;
          } catch {
            /* ignore */
          }
        }
        setHttpResponse({
          status: ep.response_status ?? undefined,
          statusText: '',
          headers: respHeaders,
          body: ep.response_body ?? '',
          timeMs: ep.response_time_ms ?? undefined,
          loading: false,
          error: undefined,
        });
      } else {
        setHttpResponse({
          loading: false,
          error: undefined,
          headers: {},
          body: '',
          status: undefined,
          statusText: undefined,
          timeMs: undefined,
        });
      }
    } else {
      setHttpResponse({
        loading: false,
        error: undefined,
        headers: {},
        body: '',
        status: undefined,
        statusText: undefined,
        timeMs: undefined,
      });
    }
  };

  const handleSearchResultOpen = async (result: Awaited<ReturnType<typeof searchProjectTree>>[number]) => {
    setExpandedProject((e) => ({ ...e, [result.projectId]: true }));
    const moduleId = result.moduleId;
    if (moduleId != null) {
      setExpandedModule((e) => ({ ...e, [moduleId]: true }));
    }
    setPendingSearchScrollTarget({
      projectId: result.projectId,
      moduleId,
      endpointId: result.endpointId,
    });
    if (result.endpointId != null && moduleId != null) {
      const ep = (tree.endpointsByModule[moduleId] ?? []).find((x) => x.id === result.endpointId);
      if (ep) await handleSelectEndpoint(result.projectId, moduleId, ep);
    } else if (result.kind === 'project') {
      await handleOpenProjectGlobals(result.projectId);
    }
  };

  const refreshAfterTreeMutation = async (): Promise<TreeData> => {
    refreshProjects();
    return await fetchTree();
  };

  const handleCopyEndpoint = async (projectId: number, moduleId: number, ep: ApiEndpointRow) => {
    const copiedEndpointId = await copyApiEndpoint(ep.id, moduleId);
    const nextTree = await refreshAfterTreeMutation();
    setExpandedProject((e) => ({ ...e, [projectId]: true }));
    setExpandedModule((e) => ({ ...e, [moduleId]: true }));
    if (!copiedEndpointId) return;
    setPendingSearchScrollTarget({ projectId, moduleId, endpointId: copiedEndpointId });
    const copiedEndpoint = (nextTree.endpointsByModule[moduleId] ?? []).find((x) => x.id === copiedEndpointId);
    if (copiedEndpoint) {
      await handleSelectEndpoint(projectId, moduleId, copiedEndpoint);
    }
  };

  const openMoveEndpoint = (projectId: number, moduleId: number, endpoint: ApiEndpointRow) => {
    setMoveEndpointCtx({ projectId, moduleId, endpoint });
    setMoveTargetModuleId(moduleId);
    setMoveModuleSearch('');
  };

  const closeMoveEndpoint = () => {
    setMoveEndpointCtx(null);
    setMoveModuleSearch('');
  };

  useEscapeToClose(importPayload != null, () => setImportPayload(null));
  useEscapeToClose(exportPicker != null, () => setExportPicker(null));
  useEscapeToClose(moveEndpointCtx != null, closeMoveEndpoint);
  useEscapeToClose(deleteConfirm != null, () => setDeleteConfirm(null));

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    const target = deleteConfirm;
    setDeleteConfirm(null);

    if (target.kind === 'project') {
      await deleteProject(target.project.id);
      const st0 = useRequestStore.getState();
      if (st0.newEndpointTargetModule?.projectId === target.project.id) {
        st0.setNewEndpointTargetModule(null);
      }
      if (currentProjectId === target.project.id) {
        await st0.clearProjectContext();
      }
    } else if (target.kind === 'module') {
      await deleteModule(target.module.id);
      const st1 = useRequestStore.getState();
      if (st1.newEndpointTargetModule?.moduleId === target.module.id) {
        st1.setNewEndpointTargetModule(null);
      }
    } else {
      await deleteApiEndpoint(target.endpoint.id);
      const st = useRequestStore.getState();
      if (st.currentEndpointId === target.endpoint.id) {
        await st.setProjectContext({
          projectId: target.projectId,
          moduleId: target.moduleId,
          endpointId: null,
          globalConfig: st.projectGlobalConfig ?? { headers: [], variables: [] },
        });
        await st.newEndpointDraft();
      }
    }

    refreshProjects();
    await fetchTree();
  };

  const handleConfirmMoveEndpoint = async () => {
    if (!moveEndpointCtx || moveTargetModuleId == null || moveTargetModuleId === moveEndpointCtx.moduleId) return;
    await moveApiEndpoint(moveEndpointCtx.endpoint.id, moveTargetModuleId);
    const targetProject =
      tree.projects.find((p) => (tree.modulesByProject[p.id] ?? []).some((m) => m.id === moveTargetModuleId)) ??
      tree.projects.find((p) => p.id === moveEndpointCtx.projectId);
    if (targetProject) setExpandedProject((e) => ({ ...e, [targetProject.id]: true }));
    setExpandedModule((e) => ({ ...e, [moveTargetModuleId]: true }));
    closeMoveEndpoint();
    await refreshAfterTreeMutation();
  };

  const handleDropModule = async (projectId: number, targetModuleId: number) => {
    if (!dragModuleCtx || dragModuleCtx.projectId !== projectId || dragModuleCtx.moduleId === targetModuleId) return;
    const mods = [...(tree.modulesByProject[projectId] ?? [])];
    const from = mods.findIndex((m) => m.id === dragModuleCtx.moduleId);
    const to = mods.findIndex((m) => m.id === targetModuleId);
    if (from < 0 || to < 0) return;
    const [moved] = mods.splice(from, 1);
    mods.splice(to, 0, moved);
    setTree((prev) => ({
      ...prev,
      modulesByProject: { ...prev.modulesByProject, [projectId]: mods },
    }));
    await reorderModules(projectId, mods.map((m) => m.id));
    await refreshAfterTreeMutation();
  };

  const handleDropEndpoint = async (moduleId: number, targetEndpointId: number) => {
    if (!dragEndpointCtx || dragEndpointCtx.moduleId !== moduleId || dragEndpointCtx.endpointId === targetEndpointId) return;
    const eps = [...(tree.endpointsByModule[moduleId] ?? [])];
    const from = eps.findIndex((ep) => ep.id === dragEndpointCtx.endpointId);
    const to = eps.findIndex((ep) => ep.id === targetEndpointId);
    if (from < 0 || to < 0) return;
    const [moved] = eps.splice(from, 1);
    eps.splice(to, 0, moved);
    setTree((prev) => ({
      ...prev,
      endpointsByModule: { ...prev.endpointsByModule, [moduleId]: eps },
    }));
    await reorderEndpoints(moduleId, eps.map((ep) => ep.id));
    await refreshAfterTreeMutation();
  };

  const methodClass = (m?: string) => {
    if (!m) return '';
    const lower = m.toUpperCase();
    if (lower === 'GET') return 'method-get';
    if (lower === 'POST') return 'method-post';
    if (lower === 'PUT') return 'method-put';
    if (lower === 'PATCH') return 'method-patch';
    if (lower === 'DELETE') return 'method-delete';
    if (lower === 'HEAD') return 'method-head';
    if (lower === 'OPTIONS') return 'method-options';
    return '';
  };

  const moveModuleChoices = tree.projects.flatMap((project) =>
    (tree.modulesByProject[project.id] ?? []).map((module) => ({
      endpointCount: (tree.endpointsByModule[module.id] ?? []).length,
      module,
      project,
    }))
  );
  const normalizedMoveSearch = moveModuleSearch.trim().toLowerCase();
  const filteredMoveModuleChoices = normalizedMoveSearch
    ? moveModuleChoices.filter(
        ({ module, project }) =>
          module.name.toLowerCase().includes(normalizedMoveSearch) ||
          project.name.toLowerCase().includes(normalizedMoveSearch)
      )
    : moveModuleChoices;
  const currentMoveModule = moveModuleChoices.find(({ module }) => module.id === moveEndpointCtx?.moduleId);
  const deleteConfirmCopy = deleteConfirm
    ? deleteConfirm.kind === 'project'
      ? {
          title: '删除项目',
          message: `删除项目「${deleteConfirm.project.name}」及其下所有模块与接口？`,
        }
      : deleteConfirm.kind === 'module'
        ? {
            title: '删除模块',
            message: `删除模块「${deleteConfirm.module.name}」及其下所有接口？`,
          }
        : {
            title: '删除接口',
            message: `删除接口「${deleteConfirm.endpoint.name}」？`,
          }
    : null;

  return (
    <div ref={panelRef} className="favorites-panel project-tree-panel">
      <div className="project-tree-fixed">
        <div className="panel-header project-tree-header">
          <div className="project-tree-header-main">
            <h3>项目</h3>
            <p className="project-tree-header-hint">先点模块名，再用 + 新建</p>
          </div>
          <div className="project-tree-header-actions">
            <div className="project-tree-bulk-row">
              <FastTooltip label="展开所有项目与模块">
                <button
                  type="button"
                  className="project-tree-bulk-btn"
                  onClick={handleExpandAll}
                  aria-label="展开所有项目与模块"
                >
                  <IconProjectTreeExpandAll />
                </button>
              </FastTooltip>
              <FastTooltip label="折叠所有项目与模块">
                <button
                  type="button"
                  className="project-tree-bulk-btn"
                  onClick={handleCollapseAll}
                  aria-label="折叠所有项目与模块"
                >
                  <IconProjectTreeCollapseAll />
                </button>
              </FastTooltip>
              <FastTooltip label="新建项目">
                <button type="button" className="project-tree-add-root" onClick={() => setModalProjectOpen(true)}>
                  + 项目
                </button>
              </FastTooltip>
              <FastTooltip label="从 JSON 文件导入项目（可新建或合并到已有项目）">
                <button type="button" className="project-tree-add-root" onClick={() => void handlePickImportFile()}>
                  导入
                </button>
              </FastTooltip>
            </div>
          </div>
        </div>

        <div className="project-tree-search">
          <input
            type="search"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="搜索项目、模块、接口、URL、Header"
            aria-label="搜索项目"
          />
          {searchResults.length > 0 && (
            <div className="project-tree-search-results">
              {searchResults.map((r, idx) => (
                <button
                  type="button"
                  key={`${r.kind}-${r.projectId}-${r.moduleId ?? 'p'}-${r.endpointId ?? idx}`}
                  className="project-tree-search-result"
                  onClick={() => void handleSearchResultOpen(r)}
                >
                  <span>{r.endpointName ?? r.moduleName ?? r.projectName}</span>
                  <small>
                    {r.projectName}
                    {r.moduleName ? ` / ${r.moduleName}` : ''}
                    {r.url ? ` · ${r.url}` : ''}
                  </small>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {importPayload && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setImportPayload(null)}
        >
          <div
            className="modal-dialog project-import-dialog"
            role="dialog"
            aria-labelledby="project-import-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="project-import-title" className="modal-title">
              导入项目
            </h3>
            <p className="project-import-summary muted">
              源项目「{importPayload.project.name}」，共 {importPayload.modules.length} 个模块。
            </p>
            <div className="project-import-options">
              <label className="project-import-radio">
                <input
                  type="radio"
                  name="import-mode"
                  checked={importMode === 'new'}
                  onChange={() => setImportMode('new')}
                />
                新建项目（名称冲突时自动加后缀）
              </label>
              <label className="project-import-radio">
                <input
                  type="radio"
                  name="import-mode"
                  checked={importMode === 'merge'}
                  onChange={() => setImportMode('merge')}
                  disabled={tree.projects.length === 0}
                />
                合并到已有项目（追加模块与接口）
              </label>
            </div>
            {importMode === 'merge' && tree.projects.length > 0 && (
              <div className="project-import-target">
                <span className="project-import-target-label">目标项目</span>
                <select
                  className="project-import-select"
                  value={importTargetId ?? tree.projects[0]?.id ?? ''}
                  onChange={(e) => setImportTargetId(Number(e.target.value))}
                >
                  {tree.projects.map((proj) => (
                    <option key={proj.id} value={proj.id}>
                      {proj.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn modal-btn-cancel"
                onClick={() => setImportPayload(null)}
              >
                取消
              </button>
              <button type="button" className="modal-btn modal-btn-confirm" onClick={() => void handleConfirmImport()}>
                导入
              </button>
            </div>
          </div>
        </div>
      )}

      {exportPicker && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setExportPicker(null)}
        >
          <div
            className="modal-dialog project-export-dialog"
            role="dialog"
            aria-labelledby="project-export-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="project-export-title" className="modal-title">
              {exportPicker.kind === 'json' ? '导出项目 JSON' : '导出接口文档 HTML'} · {exportPicker.projectName}
            </h3>
            <p className="project-export-hint muted">
              项目全局 Headers 与变量会始终包含在导出内容中。请勾选要导出的模块：
            </p>
            {exportPicker.modules.length === 0 ? (
              <p className="muted">该项目下暂无模块，将仅导出项目名称与全局配置。</p>
            ) : (
              <>
                <div className="project-export-bulk">
                  <button
                    type="button"
                    className="project-tree-mini-btn"
                    onClick={() => setExportAllModules(true)}
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    className="project-tree-mini-btn"
                    onClick={() => setExportAllModules(false)}
                  >
                    全不选
                  </button>
                </div>
                <ul className="project-export-module-list">
                  {exportPicker.modules.map((m) => (
                    <li key={m.id} className="project-export-module-item">
                      <label className="project-export-module-label">
                        <input
                          type="checkbox"
                          checked={exportModuleSelection.has(m.id)}
                          onChange={() => toggleExportModule(m.id)}
                        />
                        {m.name}
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="modal-actions">
              <button type="button" className="modal-btn modal-btn-cancel" onClick={() => setExportPicker(null)}>
                取消
              </button>
              <button
                type="button"
                className="modal-btn modal-btn-confirm"
                onClick={() => void handleConfirmExportPicker()}
              >
                导出
              </button>
            </div>
          </div>
        </div>
      )}

      {moveEndpointCtx && (
        <div className="modal-overlay" role="presentation" onClick={closeMoveEndpoint}>
          <div
            className="modal-dialog project-move-dialog"
            role="dialog"
            aria-labelledby="project-move-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="project-move-header">
              <h3 id="project-move-title" className="modal-title">
                移动接口
              </h3>
              <p className="project-move-title">移动“{moveEndpointCtx.endpoint.name}”</p>
              <p className="project-move-hint">搜索并选择新的目标模块，接口会从当前模块移出。</p>
            </div>
            <div className="project-move-current-card">
              <span className="project-move-card-label">当前模块</span>
              <strong>{currentMoveModule ? `${currentMoveModule.project.name} / ${currentMoveModule.module.name}` : '未知模块'}</strong>
              <span className="project-move-endpoint-meta">
                {moveEndpointCtx.endpoint.protocol}
                {moveEndpointCtx.endpoint.method ? ` · ${moveEndpointCtx.endpoint.method}` : ''}
                {moveEndpointCtx.endpoint.url ? ` · ${moveEndpointCtx.endpoint.url}` : ''}
              </span>
            </div>
            <div className="project-move-search">
              <input
                type="search"
                aria-label="搜索目标模块"
                placeholder="搜索模块或项目"
                value={moveModuleSearch}
                onChange={(e) => setMoveModuleSearch(e.target.value)}
              />
            </div>
            <div className="project-move-module-list" role="list" aria-label="目标模块列表">
              {filteredMoveModuleChoices.length === 0 ? (
                <p className="project-move-empty muted">没有找到匹配的模块。</p>
              ) : (
                filteredMoveModuleChoices.map(({ endpointCount, module, project }) => {
                  const isCurrent = module.id === moveEndpointCtx.moduleId;
                  const isSelected = module.id === moveTargetModuleId;
                  return (
                    <button
                      key={module.id}
                      type="button"
                      className={`project-move-module-item${isSelected ? ' selected' : ''}${isCurrent ? ' current' : ''}`}
                      aria-label={`选择目标模块：${module.name}`}
                      aria-pressed={isSelected}
                      onClick={() => setMoveTargetModuleId(module.id)}
                    >
                      <span className="project-move-module-main">
                        <span className="project-move-module-name">{module.name}</span>
                        <span className="project-move-module-project">{project.name}</span>
                      </span>
                      <span className="project-move-module-side">
                        {isCurrent ? <span className="project-move-current-pill">当前</span> : null}
                        <span>{endpointCount} 个接口</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="modal-actions project-move-actions">
              <button type="button" className="modal-btn modal-btn-cancel" onClick={closeMoveEndpoint}>
                取消
              </button>
              <button
                type="button"
                className="modal-btn modal-btn-confirm"
                disabled={moveTargetModuleId == null || moveTargetModuleId === moveEndpointCtx.moduleId}
                onClick={() => void handleConfirmMoveEndpoint()}
              >
                确认移动
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmCopy && (
        <div className="modal-overlay" role="presentation" onClick={() => setDeleteConfirm(null)}>
          <div
            className="modal-dialog project-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="project-delete-title" className="modal-title">
              {deleteConfirmCopy.title}
            </h3>
            <p className="muted">{deleteConfirmCopy.message}</p>
            <div className="modal-actions">
              <button type="button" className="modal-btn modal-btn-cancel" onClick={() => setDeleteConfirm(null)}>
                取消
              </button>
              <button type="button" className="modal-btn modal-btn-confirm" onClick={() => void handleConfirmDelete()}>
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={modalProjectOpen}
        title="新建项目"
        placeholder="项目名称"
        onClose={() => setModalProjectOpen(false)}
        onConfirm={async (name) => {
          if (!name) return;
          const projectId = await addProject(name);
          refreshProjects();
          await fetchTree();
          const row = await getProject(projectId);
          const cfg = row ? parseProjectGlobalConfig(row.global_config) : { headers: [], variables: [] };
          await enterProjectSettingsView(projectId, cfg);
          setExpandedProject((e) => ({ ...e, [projectId]: true }));
        }}
      />

      <Modal
        open={modalModuleProjectId != null}
        title="新建模块"
        placeholder="模块名称"
        onClose={() => setModalModuleProjectId(null)}
        onConfirm={async (name) => {
          if (!name || modalModuleProjectId == null) return;
          const pid = modalModuleProjectId;
          const moduleId = await addModule(pid, name);
          refreshProjects();
          await fetchTree();
          setExpandedProject((e) => ({ ...e, [pid]: true }));
          if (moduleId > 0) {
            setNewEndpointTargetModule({ projectId: pid, moduleId });
          }
        }}
      />

      <Modal
        key={renameProjectTarget ? `rename-proj-${renameProjectTarget.id}` : 'rename-proj'}
        open={renameProjectTarget != null}
        title="重命名项目"
        placeholder="项目名称"
        defaultValue={renameProjectTarget?.name ?? ''}
        onClose={() => setRenameProjectTarget(null)}
        onConfirm={async (name) => {
          if (!renameProjectTarget) return;
          const next = name.trim() || '未命名项目';
          await updateProject(renameProjectTarget.id, { name: next });
          refreshProjects();
          await fetchTree();
        }}
      />

      <Modal
        key={renameModuleCtx ? `rename-mod-${renameModuleCtx.module.id}` : 'rename-mod'}
        open={renameModuleCtx != null}
        title="重命名模块"
        placeholder="模块名称"
        defaultValue={renameModuleCtx?.module.name ?? ''}
        onClose={() => setRenameModuleCtx(null)}
        onConfirm={async (name) => {
          if (!renameModuleCtx) return;
          const next = name.trim() || '未命名模块';
          await updateModule(renameModuleCtx.module.id, { name: next });
          refreshProjects();
          await fetchTree();
        }}
      />

      <div className="project-tree-scroll">
        {loading ? (
          <p className="muted">加载中...</p>
        ) : tree.projects.length === 0 ? (
          <p className="muted">暂无项目，点击「+ 项目」创建</p>
        ) : (
          <ul className="project-tree-list">
            {tree.projects.map((p) => (
              <li key={p.id} className="project-tree-node" data-project-tree-project-id={p.id}>
              <div className="project-tree-row">
                <button
                  type="button"
                  className="project-tree-chevron"
                  aria-expanded={!!expandedProject[p.id]}
                  onClick={() => setExpandedProject((e) => ({ ...e, [p.id]: !e[p.id] }))}
                >
                  {expandedProject[p.id] ? '▼' : '▶'}
                </button>
                <FastTooltip label="项目全局：Headers 与变量">
                  <button
                    type="button"
                    className="project-tree-label project-tree-name-btn"
                    onClick={() => void handleOpenProjectGlobals(p.id)}
                  >
                    {p.name}
                  </button>
                </FastTooltip>
                <FastTooltip label="新建模块">
                  <button
                    type="button"
                    className="project-tree-mini-btn project-tree-mini-btn--icon"
                    onClick={() => setModalModuleProjectId(p.id)}
                    aria-label="新建模块"
                  >
                    <IconProjectTreeAddModule />
                  </button>
                </FastTooltip>
                <FastTooltip label="导出该项目为 JSON 文件（可选择模块）">
                  <button
                    type="button"
                    className="project-tree-mini-btn project-tree-mini-btn--icon"
                    onClick={() => openExportPicker('json', p)}
                    aria-label="导出项目 JSON"
                  >
                    <IconProjectTreeExport />
                  </button>
                </FastTooltip>
                <FastTooltip label="导出接口文档 HTML（可选择模块）">
                  <button
                    type="button"
                    className="project-tree-mini-btn project-tree-mini-btn--icon"
                    onClick={() => openExportPicker('html', p)}
                    aria-label="导出接口文档 HTML"
                  >
                    <IconProjectTreeDocHtml />
                  </button>
                </FastTooltip>
                <FastTooltip label="重命名项目">
                  <button
                    type="button"
                    className="project-tree-mini-btn project-tree-mini-btn--icon"
                    onClick={() => setRenameProjectTarget(p)}
                    aria-label="重命名项目"
                  >
                    <IconProjectTreeRename />
                  </button>
                </FastTooltip>
                <FastTooltip label="删除项目">
                  <button
                    type="button"
                    className="project-tree-mini-btn project-tree-mini-btn--icon danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirm({ kind: 'project', project: p });
                    }}
                    aria-label="删除项目"
                  >
                    ×
                  </button>
                </FastTooltip>
              </div>

              {expandedProject[p.id] && (
                <ul className="project-tree-children">
                  {(tree.modulesByProject[p.id] ?? []).map((m) => (
                    <li
                      key={m.id}
                      className="project-tree-node module-node"
                      data-project-tree-module-id={m.id}
                      draggable
                      onDragStart={() => setDragModuleCtx({ projectId: p.id, moduleId: m.id })}
                      onDragOver={(e) => {
                        if (dragModuleCtx?.projectId === p.id) e.preventDefault();
                      }}
                      onDrop={() => void handleDropModule(p.id, m.id)}
                      onDragEnd={() => setDragModuleCtx(null)}
                    >
                      <div className="project-tree-row">
                        <button
                          type="button"
                          className="project-tree-chevron"
                          aria-expanded={!!expandedModule[m.id]}
                          onClick={() => setExpandedModule((e) => ({ ...e, [m.id]: !e[m.id] }))}
                        >
                          {expandedModule[m.id] ? '▼' : '▶'}
                        </button>
                        <FastTooltip label="展开或收起接口列表；+ 新建将默认在此模块下创建接口">
                          <button
                            type="button"
                            className="project-tree-label project-tree-module-name-btn"
                            aria-expanded={!!expandedModule[m.id]}
                            onClick={() => {
                              setNewEndpointTargetModule({ projectId: p.id, moduleId: m.id });
                              setExpandedModule((e) => ({ ...e, [m.id]: !e[m.id] }));
                            }}
                          >
                            {m.name}
                          </button>
                        </FastTooltip>
                        <FastTooltip label="重命名模块">
                          <button
                            type="button"
                            className="project-tree-mini-btn project-tree-mini-btn--icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenameModuleCtx({ module: m, projectId: p.id });
                            }}
                            aria-label="重命名模块"
                          >
                            <IconProjectTreeRename />
                          </button>
                        </FastTooltip>
                        <FastTooltip label="删除模块">
                          <button
                            type="button"
                            className="project-tree-mini-btn project-tree-mini-btn--icon danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm({ kind: 'module', projectId: p.id, module: m });
                            }}
                            aria-label="删除模块"
                          >
                            ×
                          </button>
                        </FastTooltip>
                      </div>
                      {expandedModule[m.id] && (
                        <ul className="project-tree-endpoints">
                          {(tree.endpointsByModule[m.id] ?? []).map((ep) => (
                            <li
                              key={ep.id}
                              className="project-endpoint-item"
                              data-project-tree-endpoint-id={ep.id}
                              draggable
                              onDragStart={(e) => {
                                e.stopPropagation();
                                setDragEndpointCtx({ moduleId: m.id, endpointId: ep.id });
                              }}
                              onDragOver={(e) => {
                                if (dragEndpointCtx?.moduleId === m.id) e.preventDefault();
                              }}
                              onDrop={(e) => {
                                e.stopPropagation();
                                void handleDropEndpoint(m.id, ep.id);
                              }}
                              onDragEnd={() => setDragEndpointCtx(null)}
                              onClick={() => handleSelectEndpoint(p.id, m.id, ep)}
                            >
                              <div className="project-endpoint-main">
                                <div className="project-endpoint-title-row">
                                  <span className="favorite-item-name">{ep.name}</span>
                                </div>
                                <div className="project-endpoint-meta-row">
                                  <div className="project-endpoint-tags" aria-label="接口类型">
                                    <span className="item-protocol">{ep.protocol}</span>
                                    {ep.method && (
                                      <span className={`item-method ${methodClass(ep.method)}`}>{ep.method}</span>
                                    )}
                                  </div>
                                  <div className="project-endpoint-actions">
                                    <FastTooltip label="复制接口">
                                      <button
                                        type="button"
                                        className="project-endpoint-action-btn"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void handleCopyEndpoint(p.id, m.id, ep);
                                        }}
                                        aria-label="复制接口"
                                      >
                                        ⧉
                                      </button>
                                    </FastTooltip>
                                    <FastTooltip label="移动接口">
                                      <button
                                        type="button"
                                        className="project-endpoint-action-btn"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openMoveEndpoint(p.id, m.id, ep);
                                        }}
                                        aria-label="移动接口"
                                      >
                                        ⇢
                                      </button>
                                    </FastTooltip>
                                    <FastTooltip label="删除">
                                      <button
                                        type="button"
                                        className="project-endpoint-action-btn project-endpoint-action-btn--danger"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setDeleteConfirm({ kind: 'endpoint', projectId: p.id, moduleId: m.id, endpoint: ep });
                                        }}
                                        aria-label="删除接口"
                                      >
                                        ×
                                      </button>
                                    </FastTooltip>
                                  </div>
                                </div>
                              </div>
                              <FastTooltip label={ep.url}>
                                <span className="favorite-item-url">{ep.url}</span>
                              </FastTooltip>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
