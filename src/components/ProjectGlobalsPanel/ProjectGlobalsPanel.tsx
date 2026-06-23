import { useCallback, useEffect, useMemo, useState } from 'react';
import { confirm, message } from '@tauri-apps/plugin-dialog';
import type { KeyValueField, ProjectGlobalVariable, ProjectGlobalVariableTarget } from '../../types';
import { useRequestStore } from '../../stores/requestStore';
import { getProject } from '../../lib/db';
import { DEFAULT_PROJECT_ENVIRONMENTS, getProjectBaseUrl, getProjectHeaderRows } from '../../lib/projectMerge';
import { FastTooltip } from '../FastTooltip/FastTooltip';

const GLOBAL_AUTOSAVE_DEBOUNCE_MS = 550;

const EMPTY_KV: KeyValueField = { key: '', value: '', description: '', enabled: true };
const EMPTY_GLOBAL_VARIABLE: ProjectGlobalVariable = {
  key: '',
  value: '',
  description: '',
  enabled: true,
  target: 'body',
};

type EnvironmentEditMode = 'create' | 'rename' | null;

const REMOVE_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    <path d="M10 11v6M14 11v6" strokeLinecap="round" />
  </svg>
);

function withTrailingEmpty(rows: KeyValueField[]): KeyValueField[] {
  if (rows.length === 0) return [{ ...EMPTY_KV }];
  const last = rows[rows.length - 1];
  if (last.key || last.value) return [...rows, { ...EMPTY_KV }];
  return rows;
}

function withTrailingEmptyVariable(rows: ProjectGlobalVariable[]): ProjectGlobalVariable[] {
  if (rows.length === 0) return [{ ...EMPTY_GLOBAL_VARIABLE }];
  const last = rows[rows.length - 1];
  if (last.key || last.value) return [...rows, { ...EMPTY_GLOBAL_VARIABLE }];
  return rows.map((row) => ({ ...row, target: row.target ?? 'body' }));
}

function normalizeVariableTarget(value: string): ProjectGlobalVariableTarget {
  return value === 'params' ? 'params' : 'body';
}

function getVariableRowsForEditing(
  environmentVariables: ProjectGlobalVariable[] | undefined,
  legacyVariables: ProjectGlobalVariable[] | undefined
): ProjectGlobalVariable[] {
  if (environmentVariables && environmentVariables.length > 0) return environmentVariables;
  return legacyVariables ?? [];
}

function nextEnvironmentId(): string {
  return `env-${Date.now().toString(36)}`;
}

export function ProjectGlobalsPanel() {
  const currentProjectId = useRequestStore((s) => s.currentProjectId);
  const projectGlobalConfig = useRequestStore((s) => s.projectGlobalConfig);
  const updateProjectGlobalConfig = useRequestStore((s) => s.updateProjectGlobalConfig);
  const flushProjectGlobalsDraft = useRequestStore((s) => s.flushProjectGlobalsDraft);

  const [projectName, setProjectName] = useState('');
  const [environmentEditMode, setEnvironmentEditMode] = useState<EnvironmentEditMode>(null);
  const [environmentNameDraft, setEnvironmentNameDraft] = useState('');

  const persistFingerprint = useMemo(
    () => (projectGlobalConfig ? JSON.stringify(projectGlobalConfig) : ''),
    [projectGlobalConfig]
  );

  useEffect(() => {
    if (currentProjectId == null || !projectGlobalConfig) return;
    const t = window.setTimeout(() => {
      void flushProjectGlobalsDraft();
    }, GLOBAL_AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [currentProjectId, persistFingerprint, flushProjectGlobalsDraft]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 's' && e.key !== 'S') return;
      if (!(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      void (async () => {
        const ok = await useRequestStore.getState().flushProjectGlobalsDraft();
        if (ok) {
          await message('已保存', { title: 'Apix', kind: 'info' });
        } else {
          await message('保存失败，请稍后重试或查看控制台日志。', { title: 'Apix', kind: 'error' });
        }
      })();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (currentProjectId == null) {
      setProjectName('');
      return;
    }
    void getProject(currentProjectId).then((row) => setProjectName(row?.name ?? ''));
  }, [currentProjectId]);

  const environments = projectGlobalConfig?.environments?.length
    ? projectGlobalConfig.environments
    : DEFAULT_PROJECT_ENVIRONMENTS;
  const activeEnvironmentId = projectGlobalConfig?.activeEnvironmentId ?? environments[0]?.id ?? 'dev';
  const activeEnvironment = environments.find((env) => env.id === activeEnvironmentId) ?? environments[0];
  const activeEnvironmentBaseUrl = getProjectBaseUrl(projectGlobalConfig);
  const configuredVariableRows = getVariableRowsForEditing(activeEnvironment?.variables, projectGlobalConfig?.variables);
  const variableRows = withTrailingEmptyVariable(configuredVariableRows);
  const configuredHeaderRows = getProjectHeaderRows(projectGlobalConfig);
  const headerRows = withTrailingEmpty(configuredHeaderRows);
  const configuredHeaderCount = configuredHeaderRows.filter((row) => row.key || row.value).length;
  const configuredVariableCount = configuredVariableRows.filter((row) => row.key || row.value).length;

  const patchConfig = useCallback(
    (patch: Partial<NonNullable<typeof projectGlobalConfig>>) => {
      if (!projectGlobalConfig || currentProjectId == null) return;
      updateProjectGlobalConfig({ ...projectGlobalConfig, ...patch });
    },
    [projectGlobalConfig, currentProjectId, updateProjectGlobalConfig]
  );

  const patchActiveEnvironment = useCallback(
    (patch: Partial<NonNullable<typeof activeEnvironment>>) => {
      if (!projectGlobalConfig || currentProjectId == null || !activeEnvironment) return;
      const nextEnvs = environments.map((env) =>
        env.id === activeEnvironment.id ? { ...env, ...patch } : env
      );
      updateProjectGlobalConfig({ ...projectGlobalConfig, environments: nextEnvs, activeEnvironmentId: activeEnvironment.id });
    },
    [projectGlobalConfig, currentProjectId, activeEnvironment, environments, updateProjectGlobalConfig]
  );

  const patchHeaders = useCallback(
    (next: KeyValueField[]) => {
      patchActiveEnvironment({ headers: next });
    },
    [patchActiveEnvironment]
  );

  const patchVariables = useCallback(
    (next: ProjectGlobalVariable[]) => {
      patchActiveEnvironment({ variables: next });
    },
    [patchActiveEnvironment]
  );

  const patchHeaderRow = useCallback(
    (i: number, patch: Partial<KeyValueField>) => {
      const next = headerRows.map((r) => ({ ...r }));
      next[i] = { ...next[i], ...patch };
      const last = next[next.length - 1];
      if (last.key || last.value) next.push({ ...EMPTY_KV });
      patchHeaders(next);
    },
    [headerRows, patchHeaders]
  );

  const removeHeaderRow = useCallback(
    (i: number) => {
      let next = headerRows.filter((_, idx) => idx !== i);
      if (next.length === 0) next = [{ ...EMPTY_KV }];
      const last = next[next.length - 1];
      if (last.key || last.value) next = [...next, { ...EMPTY_KV }];
      patchHeaders(next);
    },
    [headerRows, patchHeaders]
  );

  const addHeaderRow = useCallback(() => {
    patchHeaders([...headerRows, { ...EMPTY_KV }]);
  }, [headerRows, patchHeaders]);

  const patchVariableRow = useCallback(
    (i: number, patch: Partial<ProjectGlobalVariable>) => {
      const next = variableRows.map((r) => ({ ...r }));
      next[i] = { ...next[i], ...patch };
      const last = next[next.length - 1];
      if (last.key || last.value) next.push({ ...EMPTY_GLOBAL_VARIABLE });
      patchVariables(next);
    },
    [variableRows, patchVariables]
  );

  const removeVariableRow = useCallback(
    (i: number) => {
      let next = variableRows.filter((_, idx) => idx !== i);
      if (next.length === 0) next = [{ ...EMPTY_GLOBAL_VARIABLE }];
      const last = next[next.length - 1];
      if (last.key || last.value) next = [...next, { ...EMPTY_GLOBAL_VARIABLE }];
      patchVariables(next);
    },
    [variableRows, patchVariables]
  );

  const addVariableRow = useCallback(() => {
    patchVariables([...variableRows, { ...EMPTY_GLOBAL_VARIABLE }]);
  }, [variableRows, patchVariables]);

  const beginAddEnvironment = useCallback(() => {
    setEnvironmentEditMode('create');
    setEnvironmentNameDraft('新环境');
  }, []);

  const beginRenameEnvironment = useCallback(() => {
    if (!activeEnvironment) return;
    setEnvironmentEditMode('rename');
    setEnvironmentNameDraft(activeEnvironment.name);
  }, [activeEnvironment]);

  const cancelEnvironmentEdit = useCallback(() => {
    setEnvironmentEditMode(null);
    setEnvironmentNameDraft('');
  }, []);

  const submitEnvironmentEdit = useCallback(() => {
    if (!projectGlobalConfig) return;
    const name = environmentNameDraft.trim();
    if (!name) return;
    if (environmentEditMode === 'create') {
      const id = nextEnvironmentId();
      patchConfig({
        environments: [...environments, { id, name, baseUrl: '', headers: [], variables: [] }],
        activeEnvironmentId: id,
      });
      cancelEnvironmentEdit();
      return;
    }
    if (environmentEditMode !== 'rename' || !activeEnvironment) return;
    patchConfig({
      environments: environments.map((env) =>
        env.id === activeEnvironment.id ? { ...env, name } : env
      ),
    });
    cancelEnvironmentEdit();
  }, [
    projectGlobalConfig,
    environmentNameDraft,
    environmentEditMode,
    environments,
    activeEnvironment,
    patchConfig,
    cancelEnvironmentEdit,
  ]);

  const removeEnvironment = useCallback(async () => {
    if (!activeEnvironment || environments.length <= 1) return;
    const ok = await confirm(`删除环境「${activeEnvironment.name}」？`, {
      title: '确认删除',
      kind: 'warning',
    });
    if (!ok) return;
    const next = environments.filter((env) => env.id !== activeEnvironment.id);
    patchConfig({
      environments: next,
      activeEnvironmentId: next[0]?.id,
    });
    cancelEnvironmentEdit();
  }, [activeEnvironment, environments, patchConfig, cancelEnvironmentEdit]);

  if (currentProjectId == null || !projectGlobalConfig) return null;

  return (
    <div className="project-globals-panel">
      <div className="project-globals-panel-head">
        <h3 className="project-globals-panel-title">项目全局</h3>
        <FastTooltip label={projectName}>
          <span className="project-globals-panel-project-name">
            {projectName || `项目 #${currentProjectId}`}
          </span>
        </FastTooltip>
      </div>
      <p className="muted project-globals-intro">
        编辑后约半秒会自动写入数据库；切换侧栏标签、打开接口或历史/收藏时也会保存。当前环境的 Headers、Base URL 以及共享变量会在发送前合并，接口内同名 Header / Query / Body 优先。共享变量可用{' '}
        <code>{'{{变量名}}'}</code> 引用。
      </p>

      <section className="project-env-card" aria-label="环境配置">
        <div className="project-env-card-head">
          <div className="project-env-heading">
            <div className="project-globals-section-title project-env-title">环境配置</div>
            <div className="project-env-current">
              当前：<strong>{activeEnvironment?.name ?? '默认环境'}</strong>
            </div>
          </div>
          <div className="project-env-toolbar">
            <select
              className="project-import-select project-env-select"
              value={activeEnvironment?.id ?? ''}
              onChange={(e) => patchConfig({ activeEnvironmentId: e.target.value })}
              aria-label="选择环境"
            >
              {environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name}
                </option>
              ))}
            </select>
            <button type="button" className="project-env-action-btn primary" onClick={beginAddEnvironment}>
              新建
            </button>
            <button type="button" className="project-env-action-btn" onClick={beginRenameEnvironment} disabled={!activeEnvironment}>
              重命名
            </button>
            <button type="button" className="project-env-action-btn danger" onClick={removeEnvironment} disabled={environments.length <= 1}>
              删除
            </button>
          </div>
        </div>

        {environmentEditMode && (
          <div className="project-env-edit-row">
            <label className="project-env-name-field">
              <span>环境名称</span>
              <input
                autoCapitalize="off"
                autoCorrect="off"
                value={environmentNameDraft}
                onChange={(e) => setEnvironmentNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitEnvironmentEdit();
                  if (e.key === 'Escape') cancelEnvironmentEdit();
                }}
                autoFocus
              />
            </label>
            <button
              type="button"
              className="project-env-action-btn primary"
              onClick={submitEnvironmentEdit}
              disabled={!environmentNameDraft.trim()}
              aria-label={environmentEditMode === 'create' ? '确认新建环境' : '确认重命名环境'}
            >
              确认
            </button>
            <button type="button" className="project-env-action-btn" onClick={cancelEnvironmentEdit}>
              取消
            </button>
          </div>
        )}

        <div className="project-env-summary" aria-label="当前环境配置摘要">
          <span>{environments.length} 个环境</span>
          <span>{configuredHeaderCount} 个 Header</span>
          <span>{configuredVariableCount} 个变量</span>
          <span>自动保存</span>
        </div>

        <label className="project-global-base-url-field">
          <span>Base URL</span>
          <input
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="https://api.example.com 或 {{base_url}}"
            value={activeEnvironmentBaseUrl}
            onChange={(e) => patchActiveEnvironment({ baseUrl: e.target.value })}
          />
        </label>
      </section>

      <div className="project-globals-section-title">全局 Headers</div>
      <div className="form-fields-table">
        <div className="form-fields-header">
          <span className="col-checkbox" />
          <span className="col-key">key</span>
          <span className="col-value">value</span>
          <span className="col-desc">description</span>
          <span className="col-actions" />
        </div>
        {headerRows.map((row, i) => (
          <div key={`h-${activeEnvironment?.id}-${i}`} className="form-field-row">
            <label className="col-checkbox col-checkbox-label">
              <input
                type="checkbox"
                checked={row.enabled !== false}
                onChange={(e) => patchHeaderRow(i, { enabled: e.target.checked })}
              />
            </label>
            <div className="col-key">
              <input
                className="col-key-input"
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="Header"
                value={row.key}
                onChange={(e) => patchHeaderRow(i, { key: e.target.value })}
              />
            </div>
            <div className="col-value">
              <input
                className="col-value-input"
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="Value"
                value={row.value}
                onChange={(e) => patchHeaderRow(i, { value: e.target.value })}
              />
            </div>
            <div className="col-desc">
              <input
                className="col-desc-input"
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="描述（不参与请求）"
                value={row.description}
                onChange={(e) => patchHeaderRow(i, { description: e.target.value })}
              />
            </div>
            <div className="col-actions">
              <FastTooltip label="删除">
                <button type="button" className="remove-btn" onClick={() => removeHeaderRow(i)}>
                  {REMOVE_ICON}
                </button>
              </FastTooltip>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="form-add-btn" onClick={addHeaderRow}>
        + 添加 Header
      </button>

      <div className="project-globals-section-title">共享变量</div>
      <div className="form-fields-table">
        <div className="form-fields-header">
          <span className="col-checkbox" />
          <span className="col-key">key</span>
          <span className="col-value">value</span>
          <span className="col-desc">发送到 / description</span>
          <span className="col-actions" />
        </div>
        {variableRows.map((row, i) => (
          <div key={`v-${activeEnvironment?.id}-${i}`} className="form-field-row">
            <label className="col-checkbox col-checkbox-label">
              <input
                type="checkbox"
                checked={row.enabled !== false}
                onChange={(e) => patchVariableRow(i, { enabled: e.target.checked })}
              />
            </label>
            <div className="col-key">
              <input
                className="col-key-input"
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="key"
                value={row.key}
                onChange={(e) => patchVariableRow(i, { key: e.target.value })}
              />
            </div>
            <div className="col-value">
              <input
                className="col-value-input"
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="value"
                value={row.value}
                onChange={(e) => patchVariableRow(i, { value: e.target.value })}
              />
            </div>
            <div className="col-desc">
              <div className="project-global-variable-meta">
                <select
                  value={row.target ?? 'body'}
                  onChange={(e) => patchVariableRow(i, { target: normalizeVariableTarget(e.target.value) })}
                >
                  <option value="params">Params</option>
                  <option value="body">Body</option>
                </select>
                <input
                  className="col-desc-input"
                  autoCapitalize="off"
                  autoCorrect="off"
                  placeholder="描述（不参与请求）"
                  value={row.description}
                  onChange={(e) => patchVariableRow(i, { description: e.target.value })}
                />
              </div>
            </div>
            <div className="col-actions">
              <FastTooltip label="删除">
                <button type="button" className="remove-btn" onClick={() => removeVariableRow(i)}>
                  {REMOVE_ICON}
                </button>
              </FastTooltip>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="form-add-btn" onClick={addVariableRow}>
        + 添加变量
      </button>
    </div>
  );
}
