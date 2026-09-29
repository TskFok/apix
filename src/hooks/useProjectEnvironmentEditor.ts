import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getProject, updateProject } from '../lib/db';
import { parseProjectGlobalConfig, serializeProjectGlobalConfig } from '../lib/projectMerge';
import { useRequestStore } from '../stores/requestStore';
import { useResponseStore } from '../stores/responseStore';
import type { ProjectGlobalConfig, ProjectRow } from '../types';

export type ProjectEnvironmentEditorContext = {
  projectId: number | null;
  config: ProjectGlobalConfig | null;
  updateConfig: (config: ProjectGlobalConfig) => void;
  flush: () => Promise<boolean>;
};

type IndependentDraft = {
  projectId: number;
  config: ProjectGlobalConfig;
  savedConfig: string;
  updateConfig: ProjectEnvironmentEditorContext['updateConfig'];
  flush: ProjectEnvironmentEditorContext['flush'];
};

function serializeDraft(config: ProjectGlobalConfig): string {
  return serializeProjectGlobalConfig({
    ...config,
    headers: config.headers.filter((row) => row.key || row.value),
    variables: config.variables.filter((row) => row.key || row.value),
    environments: config.environments?.map((env) => ({
      ...env,
      baseUrl: env.baseUrl ?? '',
      headers: (env.headers ?? []).filter((row) => row.key || row.value),
      variables: (env.variables ?? []).filter((row) => row.key || row.value),
    })),
  });
}

const ignoreUpdate = () => {};
const nothingToFlush = async () => true;

export function useProjectEnvironmentEditor() {
  const currentProjectId = useRequestStore((state) => state.currentProjectId);
  const requestConfig = useRequestStore((state) => state.projectGlobalConfig);
  const updateRequestConfig = useRequestStore((state) => state.updateProjectGlobalConfig);
  const flushRequestConfig = useRequestStore((state) => state.flushProjectGlobalsDraft);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [config, setConfig] = useState<ProjectGlobalConfig | null>(null);
  const selectedIdRef = useRef<number | null>(null);
  const independentIdRef = useRef<number | null>(null);
  const draftRef = useRef<IndependentDraft | null>(null);
  const selectionVersion = useRef(0);
  const saveTail = useRef<Promise<void>>(Promise.resolve());
  const loadingRef = useRef(false);

  const flushDraft = useCallback((draft: IndependentDraft): Promise<boolean> => {
    const save = saveTail.current.then(async () => {
      // 在队列开始执行时读取最新草稿，重复 flush 不再写入相同内容。
      const serialized = serializeDraft(draft.config);
      if (serialized === draft.savedConfig) return true;
      try {
        await updateProject(draft.projectId, { global_config: serialized });
        draft.savedConfig = serialized;
        useResponseStore.getState().refreshProjects();
        return true;
      } catch (error) {
        console.error('flushProjectEnvironmentEditor', error);
        return false;
      }
    });
    saveTail.current = save.then(() => {});
    return save;
  }, []);

  const selectProjectId = useCallback(async (projectId: number | null): Promise<boolean> => {
    const independentId = projectId === useRequestStore.getState().currentProjectId ? null : projectId;
    if (!loadingRef.current && selectedIdRef.current === projectId && independentIdRef.current === independentId &&
      (independentId === null || draftRef.current?.projectId === independentId)) {
      return true;
    }
    const version = ++selectionVersion.current;
    const previous = draftRef.current;
    selectedIdRef.current = projectId;
    independentIdRef.current = independentId;
    loadingRef.current = true;
    setSelectedProjectId(projectId);
    setConfig(null);
    if (previous && !(await flushDraft(previous))) {
      if (selectionVersion.current === version) {
        selectedIdRef.current = previous.projectId;
        independentIdRef.current = previous.projectId;
        loadingRef.current = false;
        setSelectedProjectId(previous.projectId);
        setConfig(previous.config);
      }
      return false;
    }
    if (selectionVersion.current !== version) return false;
    draftRef.current = null;
    if (independentId === null) {
      loadingRef.current = false;
      return true;
    }
    try {
      const project = await getProject(independentId);
      if (selectionVersion.current !== version) return false;
      if (!project) return false;
      const loadedConfig = parseProjectGlobalConfig(project.global_config);
      const draft: IndependentDraft = {
        projectId: independentId,
        config: loadedConfig,
        savedConfig: serializeDraft(loadedConfig),
        updateConfig: (nextConfig) => {
          if (draftRef.current !== draft || selectedIdRef.current !== draft.projectId) return;
          draft.config = nextConfig;
          setConfig(nextConfig);
        },
        flush: () => flushDraft(draft),
      };
      draftRef.current = draft;
      setConfig(loadedConfig);
      return true;
    } catch (error) {
      console.error('loadProjectEnvironmentEditor', error);
      return false;
    } finally {
      if (selectionVersion.current === version) loadingRef.current = false;
    }
  }, [flushDraft]);

  const selectEnvironmentProject = useCallback(
    (project: ProjectRow | null) => selectProjectId(project?.id ?? null),
    [selectProjectId]
  );

  useEffect(() => {
    const selectedId = selectedIdRef.current;
    const independentId = selectedId === currentProjectId ? null : selectedId;
    if (independentId !== independentIdRef.current) void selectProjectId(selectedId);
  }, [currentProjectId, selectProjectId]);

  useEffect(() => () => {
    selectionVersion.current += 1;
    if (draftRef.current) void flushDraft(draftRef.current);
  }, [flushDraft]);

  const context = useMemo<ProjectEnvironmentEditorContext>(() => {
    if (selectedProjectId === null || selectedProjectId === currentProjectId) {
      return { projectId: currentProjectId, config: requestConfig, updateConfig: updateRequestConfig, flush: flushRequestConfig };
    }
    const draft = draftRef.current?.projectId === selectedProjectId ? draftRef.current : null;
    return {
      projectId: selectedProjectId,
      config,
      updateConfig: draft?.updateConfig ?? ignoreUpdate,
      flush: draft?.flush ?? nothingToFlush,
    };
  }, [selectedProjectId, currentProjectId, requestConfig, updateRequestConfig, flushRequestConfig, config]);

  return { context, selectEnvironmentProject };
}
