import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { APP_CONFIG } from '../config';
import * as dbService from '../services/dbService';
import { executeDownloadPlan } from '../services/downloadService';
import { exportLibrary as exportLibraryFile, type ExportFormat } from '../services/exportService';
import * as githubService from '../services/githubService';
import { buildDownloadPlan, buildParsedMod, parseModIds } from '../services/modParser';
import { fetchFiles, fetchModInfo, validateKey } from '../services/nexusApi';
import { detectAllUpdates, detectModUpdate, extractNexusModIds } from '../services/updateService';
import {
  buildPackFileName,
  buildTreeFromEntries,
  extractManifest,
  packTreeToZip,
  parseModsZip,
  resolveModFolderName,
} from '../services/zipService';
import type {
  AppState,
  DownloadPlan,
  HistoryEntry,
  KeyStatus,
  ParsedMod,
  PremiumTier,
  TabKey,
  ThemeMode,
} from '../types/domain';
import type {
  CloudModRef,
  ConflictPrompt,
  FlatFileItem,
  FSTreeNode,
  GitHubConfig,
  GitHubSettings,
  LocalMod,
  ProgressInfo,
  ProgressTarget,
  UpdateDetectionResult,
} from '../types/workspace';
import { triggerBrowserDownload } from '../utils/download';
import { formatError } from '../utils/errors';
import { normalizeGameVersion } from '../utils/version';
import * as fsTree from '../utils/fsTree';
import { matchModsByInputIds } from '../utils/idSelect';
import { useLocalStorage } from './useLocalStorage';
import { useToast } from './useToast';
import {
  createWorkspaceInitialState,
  defaultGitHubSettings,
  workspaceReducer,
  type WorkspaceAction,
} from './workspaceReducer';

export interface AppActions {
  setKey(apiKey: string): void;
  clearKey(): void;
  validate(): Promise<void>;
  setIdsInput(value: string): void;
  resolveMods(input?: string): Promise<void>;
  selectFile(modId: number, fileId: number): void;
  toggleChinese(modId: number): void;
  download(modId: number, manualAction?: 'open' | 'copy'): Promise<void>;
  /** 【新增 R27】按历史记录再次下载；默认仅重下该记录文件，不带汉化/前置（Q5） */
  redownload(entry: HistoryEntry, manualAction?: 'open' | 'copy'): Promise<void>;
  setTheme(theme: ThemeMode): void;
  setTab(tab: TabKey): void;
  clearHistory(): void;

  /* ===== v3 工作区保留（上传/勾选/检测/打包/进度） ===== */
  uploadFolderZip(file: File): Promise<void>;
  uploadSingleZips(files: File[]): Promise<void>;
  togglePackSelect(localId: string): void;
  removeLocalMod(localId: string): void;
  checkUpdates(force?: boolean): Promise<void>;
  checkOneUpdate(localId: string, force?: boolean): Promise<void>;
  packSelected(): Promise<void>;
  setProgress(target: ProgressTarget, progress: ProgressInfo | null): void;

  /* ===== v4 新增：模组库搜索 / ID 勾选 / 文件树浏览与编辑 ===== */
  setLibraryQuery(query: string): void;
  setIncludeCloud(include: boolean): void;
  selectByIds(input: string): void;
  openFolder(modId: string): void;
  navigateInto(nodeId: string): void;
  navigateUp(): void;
  closeFolder(): void;
  pickFilesIntoNode(modId: string, parentId: string | null, files: File[]): Promise<void>;
  addFolderIntoNode(modId: string, parentId: string | null, name: string): void;
  renameNode(modId: string, nodeId: string, name: string): void;
  deleteNode(modId: string, nodeId: string): void;

  /* ===== v4 新增：GitHub 云端（全手动 Q2） ===== */
  configureGitHub(input: GitHubSettings & { token: string }): void;
  clearGitHubConfig(): void;
  testGitHubConnection(): Promise<void>;
  refreshCloudMods(): Promise<void>;
  syncToCloud(ids?: string[]): Promise<void>;
  pullFromCloud(folderNames?: string[]): Promise<void>;
  deleteCloudMod(folderName: string): Promise<void>;
  resolveConflict(choice: 'local' | 'remote'): Promise<void>;
  /** 取消冲突二选一：仅清空冲突标记与内存载荷，不写入任一侧（§5.2）。 */
  dismissConflict(): void;

  /* ===== v4 新增：库管理 / 导出 / 启动恢复 ===== */
  exportLibrary(format: ExportFormat): void;
  clearLocalLibrary(): void;
  hydrateLibrary(): Promise<void>;
}

type LegacyAction =
  | { type: 'SET_KEY'; value: string }
  | { type: 'CLEAR_KEY' }
  | {
      type: 'SET_KEY_STATUS';
      status: KeyStatus;
      tier: PremiumTier;
      userName: string | null;
      message: string;
    }
  | { type: 'SET_IDS_INPUT'; value: string }
  | { type: 'START_RESOLVE'; ids: number[] }
  | { type: 'FINISH_RESOLVE'; mods: ParsedMod[] }
  | { type: 'MOD_ERROR'; modId: number; error: string | null }
  | { type: 'SELECT_FILE'; modId: number; fileId: number }
  | { type: 'TOGGLE_CHINESE'; modId: number }
  | { type: 'ADD_HISTORY'; entries: HistoryEntry[] }
  | { type: 'CLEAR_HISTORY' }
  | { type: 'SET_THEME'; theme: ThemeMode }
  | { type: 'SET_TAB'; tab: TabKey };

type ReducerAction = LegacyAction | WorkspaceAction;

const MAX_HISTORY = 200;

/** 调用期临时装配 GitHubConfig；token 仅来自 localStorage，不进 state / IDB / 日志。 */
function buildGithubConfig(state: AppState): GitHubConfig | null {
  const token = githubService.readToken();
  if (!state.github.owner.trim() || !state.github.repo.trim() || !token) {
    return null;
  }
  return { ...state.github, token };
}

interface PullPayload {
  ref: CloudModRef;
  folderName: string;
  files: FlatFileItem[];
  shaMap: Record<string, string>;
  remoteModifiedAt: string;
  local: LocalMod | undefined;
}

function createInitialState(
  apiKey: string,
  history: HistoryEntry[],
  theme: ThemeMode,
  lastIds: string,
): AppState {
  return {
    apiKey,
    keyStatus: 'unset',
    tier: 'standard',
    userName: null,
    keyMessage: apiKey.length > 0 ? '密钥已保存在本机，请点击校验' : '',
    idsInput: lastIds,
    mods: [],
    loadingIds: [],
    loadErrors: {},
    selectedFiles: {},
    includeChinese: {},
    history: Array.isArray(history) ? history.slice(0, MAX_HISTORY) : [],
    theme: theme === 'dark' ? 'dark' : 'light',
    tab: 'download',
    ...createWorkspaceInitialState(),
  };
}

function reducer(state: AppState, action: ReducerAction): AppState {
  switch (action.type) {
    case 'SET_KEY':
      return {
        ...state,
        apiKey: action.value,
        keyStatus: 'unset',
        tier: 'standard',
        userName: null,
        keyMessage: action.value.length > 0 ? '密钥已更新，请重新校验' : '',
      };
    case 'CLEAR_KEY':
      return {
        ...state,
        apiKey: '',
        keyStatus: 'unset',
        tier: 'standard',
        userName: null,
        keyMessage: '',
      };
    case 'SET_KEY_STATUS':
      return {
        ...state,
        keyStatus: action.status,
        tier: action.tier,
        userName: action.userName,
        keyMessage: action.message,
      };
    case 'SET_IDS_INPUT':
      return { ...state, idsInput: action.value };
    case 'START_RESOLVE':
      return {
        ...state,
        loadingIds: action.ids,
        loadErrors: {},
        mods: [],
        selectedFiles: {},
        includeChinese: {},
      };
    case 'FINISH_RESOLVE': {
      const selectedFiles: Record<number, number> = {};
      const includeChinese: Record<number, boolean> = {};
      for (const mod of action.mods) {
        if (mod.mainFile) {
          selectedFiles[mod.modId] = mod.mainFile.file_id;
        }
        includeChinese[mod.modId] = false;
      }
      return {
        ...state,
        loadingIds: [],
        mods: action.mods,
        selectedFiles,
        includeChinese,
      };
    }
    case 'MOD_ERROR': {
      const loadErrors = { ...state.loadErrors };
      if (action.error) {
        loadErrors[action.modId] = action.error;
      } else {
        delete loadErrors[action.modId];
      }
      return { ...state, loadErrors };
    }
    case 'SELECT_FILE':
      return {
        ...state,
        selectedFiles: { ...state.selectedFiles, [action.modId]: action.fileId },
      };
    case 'TOGGLE_CHINESE':
      return {
        ...state,
        includeChinese: {
          ...state.includeChinese,
          [action.modId]: !state.includeChinese[action.modId],
        },
      };
    case 'ADD_HISTORY':
      return { ...state, history: [...action.entries, ...state.history].slice(0, MAX_HISTORY) };
    case 'CLEAR_HISTORY':
      return { ...state, history: [] };
    case 'SET_THEME':
      return { ...state, theme: action.theme };
    case 'SET_TAB':
      return { ...state, tab: action.tab };
    default:
      return workspaceReducer(state, action);
  }
}

interface AppStoreValue {
  state: AppState;
  actions: AppActions;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [storedKey, setStoredKey, removeStoredKey] = useLocalStorage<string>(
    APP_CONFIG.storageKeys.apiKey,
    '',
  );
  const [storedHistory, setStoredHistory] = useLocalStorage<HistoryEntry[]>(
    APP_CONFIG.storageKeys.history,
    [],
  );
  const [storedTheme, setStoredTheme] = useLocalStorage<ThemeMode>(
    APP_CONFIG.storageKeys.theme,
    'light',
  );
  const [storedLastIds, setStoredLastIds] = useLocalStorage<string>(APP_CONFIG.storageKeys.lastIds, '');

  const [state, dispatch] = useReducer(
    reducer,
    createInitialState(storedKey, storedHistory, storedTheme, storedLastIds),
  );
  const { pushToast } = useToast();
  // 异步编排读取「最新一次渲染」的 state，避免长流程中的闭包过期。
  const stateRef = useRef(state);
  stateRef.current = state;
  const hydratedOnceRef = useRef(false);
  /** Q3：冲突未选择前，待落库的拉取载荷只存内存，绝不写任一侧。 */
  const pendingPullRef = useRef<PullPayload[]>([]);

  // apiKey 由 setKey / clearKey 直接读写，避免清除后又被 effect 写回空字符串
  useEffect(() => {
    setStoredHistory(state.history.slice(0, MAX_HISTORY));
  }, [setStoredHistory, state.history]);
  useEffect(() => {
    setStoredTheme(state.theme);
  }, [setStoredTheme, state.theme]);
  useEffect(() => {
    setStoredLastIds(state.idsInput);
  }, [setStoredLastIds, state.idsInput]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.theme === 'dark');
  }, [state.theme]);

  const setKey = useCallback(
    (apiKey: string): void => {
      dispatch({ type: 'SET_KEY', value: apiKey });
      setStoredKey(apiKey);
    },
    [setStoredKey],
  );

  const clearKey = useCallback((): void => {
    dispatch({ type: 'CLEAR_KEY' });
    removeStoredKey();
    pushToast('已从本机清除 API Key', 'info');
  }, [pushToast, removeStoredKey]);

  const validate = useCallback(async (): Promise<void> => {
    const key = state.apiKey.trim();
    if (key.length === 0) {
      pushToast('请先填写 API Key', 'error');
      return;
    }
    dispatch({
      type: 'SET_KEY_STATUS',
      status: 'checking',
      tier: 'standard',
      userName: null,
      message: '正在校验密钥…',
    });
    try {
      const result = await validateKey(key);
      if (result.valid) {
        dispatch({
          type: 'SET_KEY_STATUS',
          status: 'valid',
          tier: result.tier,
          userName: result.userName,
          message: result.message,
        });
        pushToast(result.message, 'success');
      } else {
        dispatch({
          type: 'SET_KEY_STATUS',
          status: 'invalid',
          tier: 'standard',
          userName: null,
          message: result.message,
        });
        pushToast(result.message, 'error');
      }
    } catch (error) {
      const message = formatError(error);
      dispatch({
        type: 'SET_KEY_STATUS',
        status: 'error',
        tier: 'standard',
        userName: null,
        message,
      });
      pushToast(message, 'error');
    }
  }, [pushToast, state.apiKey]);

  const setIdsInput = useCallback((value: string): void => {
    dispatch({ type: 'SET_IDS_INPUT', value });
  }, []);

  const resolveMods = useCallback(
    async (input?: string): Promise<void> => {
      const ids = parseModIds(input ?? state.idsInput);
      if (ids.length === 0) {
        pushToast('未识别到有效的模组 ID', 'error');
        return;
      }
      if (state.apiKey.trim().length === 0) {
        pushToast('请先配置 API Key', 'error');
        return;
      }
      if (state.keyStatus !== 'valid') {
        pushToast('API Key 尚未通过校验，请先校验', 'error');
        return;
      }

      dispatch({ type: 'START_RESOLVE', ids });
      const settled = await Promise.allSettled(
        ids.map(async (id): Promise<ParsedMod> => {
          const [meta, files] = await Promise.all([
            fetchModInfo(id, state.apiKey),
            fetchFiles(id, state.apiKey),
          ]);
          return buildParsedMod(id, meta, files);
        }),
      );

      const loaded: ParsedMod[] = [];
      let failed = 0;
      settled.forEach((entry, index) => {
        if (entry.status === 'fulfilled') {
          loaded.push(entry.value);
          dispatch({ type: 'MOD_ERROR', modId: ids[index], error: null });
        } else {
          failed += 1;
          dispatch({ type: 'MOD_ERROR', modId: ids[index], error: formatError(entry.reason) });
        }
      });
      dispatch({ type: 'FINISH_RESOLVE', mods: loaded });
      pushToast(
        failed === 0
          ? `已加载 ${loaded.length} 个模组`
          : `已加载 ${loaded.length} 个模组，${failed} 个失败`,
        failed === 0 ? 'success' : 'info',
      );
    },
    [pushToast, state.apiKey, state.idsInput, state.keyStatus],
  );

  const selectFile = useCallback((modId: number, fileId: number): void => {
    dispatch({ type: 'SELECT_FILE', modId, fileId });
  }, []);

  const toggleChinese = useCallback((modId: number): void => {
    dispatch({ type: 'TOGGLE_CHINESE', modId });
  }, []);

  /**
   * 内部 helper：执行计划 → 写历史 → Toast。
   * 由 download() 与 redownload() 共用；仅为纯抽取，不改变 v1 行为。
   */
  const runPlanAndRecord = useCallback(
    async (plan: DownloadPlan, mod: ParsedMod): Promise<void> => {
      if (plan.items.length === 0) {
        pushToast('没有可下载的文件', 'error');
        return;
      }
      if (plan.action === 'direct') {
        pushToast('请在弹窗中允许多个下载', 'info');
      }

      const results = await executeDownloadPlan(plan, state.apiKey);
      const now = Date.now();
      const entries: HistoryEntry[] = results
        .filter((result) => result.ok)
        .map((result, index) => ({
          id: `${result.item.modId}:${result.item.file.file_id}:${now + index}`,
          modId: result.item.modId,
          modName: mod.meta.name,
          fileId: result.item.file.file_id,
          fileName: result.item.file.file_name,
          version: result.item.file.version,
          tier: plan.tier,
          action: plan.action,
          downloadedAt: new Date().toISOString(),
          chinese: mod.chineseFiles.map((file) => file.file_name),
          prerequisites: mod.prerequisites.map((prerequisite) => prerequisite.name),
          gameVersion: normalizeGameVersion(result.item.file.game_version),
        }));
      if (entries.length > 0) {
        dispatch({ type: 'ADD_HISTORY', entries });
      }

      const failures = results.filter((result) => !result.ok);
      if (failures.length > 0) {
        pushToast(`${failures.length} 项失败：${failures[0].error ?? '未知错误'}`, 'error');
      } else if (plan.action === 'copy') {
        pushToast('已复制文件页链接到剪贴板', 'success');
      } else if (plan.action === 'open') {
        pushToast('已打开 N 网文件页', 'success');
      } else {
        pushToast('已开始下载，请留意浏览器下载列表', 'success');
      }
    },
    [pushToast, state.apiKey],
  );

  const download = useCallback(
    async (modId: number, manualAction?: 'open' | 'copy'): Promise<void> => {
      const mod = state.mods.find((item) => item.modId === modId);
      if (!mod) {
        pushToast('未找到该模组', 'error');
        return;
      }
      if (state.keyStatus !== 'valid') {
        pushToast('请先校验 API Key', 'error');
        return;
      }
      const fileId = state.selectedFiles[modId] ?? mod.mainFile?.file_id ?? 0;
      if (fileId === 0) {
        pushToast('请先选择要下载的文件', 'error');
        return;
      }

      const plan = buildDownloadPlan(
        mod,
        fileId,
        state.includeChinese[modId] ?? false,
        state.tier,
        manualAction,
      );
      await runPlanAndRecord(plan, mod);
    },
    [
      pushToast,
      state.keyStatus,
      state.mods,
      state.selectedFiles,
      state.includeChinese,
      state.tier,
      runPlanAndRecord,
    ],
  );

  const redownload = useCallback(
    async (entry: HistoryEntry, manualAction?: 'open' | 'copy'): Promise<void> => {
      if (state.keyStatus !== 'valid') {
        pushToast('请先配置并校验 API Key 后再下载', 'error');
        return;
      }
      let mod = state.mods.find((item) => item.modId === entry.modId);
      if (!mod) {
        const [meta, files] = await Promise.all([
          fetchModInfo(entry.modId, state.apiKey),
          fetchFiles(entry.modId, state.apiKey),
        ]);
        mod = buildParsedMod(entry.modId, meta, files);
      }
      const plan = buildDownloadPlan(mod, entry.fileId, false, state.tier, manualAction);
      await runPlanAndRecord(plan, mod);
    },
    [state.keyStatus, state.mods, state.apiKey, state.tier, runPlanAndRecord, pushToast],
  );

  const setTheme = useCallback((theme: ThemeMode): void => {
    dispatch({ type: 'SET_THEME', theme });
  }, []);

  const setTab = useCallback((tab: TabKey): void => {
    dispatch({ type: 'SET_TAB', tab });
  }, []);

  const clearHistory = useCallback((): void => {
    dispatch({ type: 'CLEAR_HISTORY' });
    pushToast('已清空下载历史', 'info');
  }, [pushToast]);

  /* ===== v3 工作区 actions（v4 增加 IndexedDB 落库） ===== */

  const uploadFolderZip = useCallback(
    async (file: File): Promise<void> => {
      if (state.uploadProgress && state.uploadProgress.phase !== 'done') {
        pushToast('正在处理上一个文件，请稍候', 'info');
        return;
      }
      if (
        file.size > APP_CONFIG.upload.hardLimitBytes &&
        !window.confirm('文件超过 300MB，解压可能占用较多内存，确定继续吗？')
      ) {
        return;
      }
      if (file.size > APP_CONFIG.upload.softLimitBytes) {
        pushToast('文件较大，处理可能需要一点时间，请保持页面在前台', 'info');
      }
      dispatch({
        type: 'SET_UPLOAD_PROGRESS',
        progress: { phase: 'reading', current: 0, total: file.size, message: '正在读取 zip' },
      });
      try {
        const outcome = await parseModsZip(file, 'folder-zip', (progress) =>
          dispatch({ type: 'SET_UPLOAD_PROGRESS', progress }),
        );
        if (outcome.mods.length > 0) {
          dispatch({ type: 'ADD_LOCAL_MODS', mods: outcome.mods });
          pushToast(`已导入 ${outcome.mods.length} 个模组`, 'success');
          if (outcome.recognizedFolders.length > 0) {
            pushToast(
              `已识别 ${outcome.recognizedFolders.length} 个模组文件夹：${outcome.recognizedFolders.join('、')}`,
              'info',
            );
          }
          for (const mod of outcome.mods) {
            void dbService.saveMod(mod).catch(() => pushToast('本地保存失败，刷新后可能丢失', 'info'));
          }
          void dbService
            .saveMeta('selectedPackIds', stateRef.current.selectedPackIds)
            .catch(() => undefined);
          void dbService.saveMeta('schemaVersion', 4).catch(() => undefined);
        }
        if (outcome.duplicateNames.length > 0) {
          pushToast(`检测到 ${outcome.duplicateNames.length} 个可能重复的模组，请自行确认`, 'info');
        }
        if (outcome.skipped.length > 0) {
          pushToast(`${outcome.skipped.length} 个文件无法解析：${outcome.skipped[0].reason}`, 'error');
        }
        dispatch({
          type: 'SET_UPLOAD_PROGRESS',
          progress: {
            phase: 'done',
            current: file.size,
            total: file.size,
            message: '导入完成',
          },
        });
      } catch (error) {
        dispatch({ type: 'SET_UPLOAD_PROGRESS', progress: null });
        pushToast(formatError(error), 'error');
      }
    },
    [pushToast, state.uploadProgress],
  );

  const uploadSingleZips = useCallback(
    async (files: File[]): Promise<void> => {
      if (state.uploadProgress && state.uploadProgress.phase !== 'done') {
        pushToast('正在处理上一个文件，请稍候', 'info');
        return;
      }
      const candidates: File[] = [];
      for (const file of files) {
        if (
          file.size > APP_CONFIG.upload.hardLimitBytes &&
          !window.confirm(`${file.name} 超过 300MB，解压可能占用较多内存，确定继续吗？`)
        ) {
          continue;
        }
        candidates.push(file);
      }
      if (candidates.length === 0) {
        return;
      }
      if (candidates.some((file) => file.size > APP_CONFIG.upload.softLimitBytes)) {
        pushToast('文件较大，处理可能需要一点时间，请保持页面在前台', 'info');
      }
      const totalBytes = candidates.reduce((sum, file) => sum + file.size, 0);
      dispatch({
        type: 'SET_UPLOAD_PROGRESS',
        progress: { phase: 'reading', current: 0, total: totalBytes, message: '正在读取 zip' },
      });
      const mods: LocalMod[] = [];
      const skipped: Array<{ name: string; reason: string }> = [];
      const duplicateNames: string[] = [];
      let doneBytes = 0;
      try {
        for (const file of candidates) {
          try {
            const outcome = await parseModsZip(file, 'single-zip', (progress) =>
              dispatch({
                type: 'SET_UPLOAD_PROGRESS',
                progress: {
                  ...progress,
                  current: doneBytes + progress.current,
                  total: totalBytes,
                },
              }),
            );
            mods.push(...outcome.mods);
            skipped.push(...outcome.skipped);
            duplicateNames.push(...outcome.duplicateNames);
          } catch (error) {
            skipped.push({ name: file.name, reason: formatError(error) });
          }
          doneBytes += file.size;
        }
        if (mods.length > 0) {
          dispatch({ type: 'ADD_LOCAL_MODS', mods });
          pushToast(`已导入 ${mods.length} 个模组`, 'success');
          for (const mod of mods) {
            void dbService.saveMod(mod).catch(() => pushToast('本地保存失败，刷新后可能丢失', 'info'));
          }
          void dbService
            .saveMeta('selectedPackIds', stateRef.current.selectedPackIds)
            .catch(() => undefined);
          void dbService.saveMeta('schemaVersion', 4).catch(() => undefined);
        }
        if (duplicateNames.length > 0) {
          pushToast(`检测到 ${duplicateNames.length} 个可能重复的模组，请自行确认`, 'info');
        }
        if (skipped.length > 0) {
          pushToast(`${skipped.length} 个文件无法解析：${skipped[0].reason}`, 'error');
        }
        dispatch({
          type: 'SET_UPLOAD_PROGRESS',
          progress: {
            phase: 'done',
            current: totalBytes,
            total: totalBytes,
            message: '导入完成',
          },
        });
      } catch (error) {
        dispatch({ type: 'SET_UPLOAD_PROGRESS', progress: null });
        pushToast(formatError(error), 'error');
      }
    },
    [pushToast, state.uploadProgress],
  );

  const togglePackSelect = useCallback((localId: string): void => {
    dispatch({ type: 'TOGGLE_PACK_SELECT', id: localId });
    const current = stateRef.current;
    if (!current.localMods.some((mod) => mod.id === localId && mod.fileCount > 0)) {
      return;
    }
    const next = current.selectedPackIds.includes(localId)
      ? current.selectedPackIds.filter((id) => id !== localId)
      : [...current.selectedPackIds, localId];
    void dbService.saveMeta('selectedPackIds', next).catch(() => undefined);
  }, []);

  const removeLocalMod = useCallback((localId: string): void => {
    dispatch({ type: 'REMOVE_LOCAL_MOD', id: localId });
    void dbService.deleteMod(localId).catch(() => undefined);
    const next = stateRef.current.selectedPackIds.filter((id) => id !== localId);
    void dbService.saveMeta('selectedPackIds', next).catch(() => undefined);
  }, []);

  const checkUpdates = useCallback(
    async (force = false): Promise<void> => {
      if (state.keyStatus !== 'valid') {
        pushToast('请先校验 API Key 后再检测更新', 'error');
        return;
      }
      if (state.localMods.length === 0) {
        pushToast('模组库为空，请先上传模组', 'info');
        return;
      }
      const checkedAt = new Date().toISOString();
      dispatch({ type: 'SET_CHECKING_IDS', ids: state.localMods.map((mod) => mod.id) });
      let outdatedCount = 0;
      let unknownCount = 0;
      try {
        await detectAllUpdates(
          state.localMods,
          state.apiKey,
          (id, result: UpdateDetectionResult) => {
            dispatch({ type: 'APPLY_UPDATE_RESULT', id, result, checkedAt });
            const current = stateRef.current.localMods.find((mod) => mod.id === id);
            if (current) {
              void dbService
                .saveMod({
                  ...current,
                  updateStatus: result.status,
                  updateInfo: result.updateInfo,
                  checkError: result.checkError,
                  lastCheckedAt: checkedAt,
                  dirty: true,
                  modifiedAt: checkedAt,
                })
                .catch(() => undefined);
            }
            if (result.status === 'outdated') {
              outdatedCount += 1;
            } else if (result.status === 'unknown') {
              unknownCount += 1;
            }
          },
          force,
        );
        pushToast(
          `检测完成：${outdatedCount} 个有新版本${
            unknownCount > 0 ? `，${unknownCount} 个无法检测` : ''
          }`,
          outdatedCount > 0 ? 'info' : 'success',
        );
      } catch (error) {
        pushToast(formatError(error), 'error');
      } finally {
        dispatch({ type: 'SET_CHECKING_IDS', ids: [] });
      }
    },
    [pushToast, state.apiKey, state.keyStatus, state.localMods],
  );

  const checkOneUpdate = useCallback(
    async (localId: string, force = false): Promise<void> => {
      if (state.keyStatus !== 'valid') {
        pushToast('请先校验 API Key 后再检测更新', 'error');
        return;
      }
      const mod = state.localMods.find((item) => item.id === localId);
      if (!mod) {
        pushToast('未找到该模组', 'error');
        return;
      }
      if (force) {
        dispatch({ type: 'RESET_UPDATE_RESULT', id: localId });
      }
      dispatch({ type: 'SET_CHECKING_IDS', ids: [localId] });
      try {
        const result = await detectModUpdate(mod, state.apiKey);
        const checkedAt = new Date().toISOString();
        dispatch({ type: 'APPLY_UPDATE_RESULT', id: localId, result, checkedAt });
        void dbService
          .saveMod({
            ...mod,
            updateStatus: result.status,
            updateInfo: result.updateInfo,
            checkError: result.checkError,
            lastCheckedAt: checkedAt,
            dirty: true,
            modifiedAt: checkedAt,
          })
          .catch(() => undefined);
        if (result.status === 'outdated') {
          pushToast(`发现新版本 ${result.updateInfo?.version ?? ''}`, 'info');
        } else if (result.status === 'unknown') {
          pushToast(result.checkError || '无法检测更新', 'info');
        } else {
          pushToast('已是最新版本', 'success');
        }
      } catch (error) {
        const result: UpdateDetectionResult = {
          status: 'unknown',
          updateInfo: null,
          checkError: formatError(error),
        };
        dispatch({
          type: 'APPLY_UPDATE_RESULT',
          id: localId,
          result,
          checkedAt: new Date().toISOString(),
        });
        pushToast(result.checkError, 'error');
      } finally {
        dispatch({ type: 'SET_CHECKING_IDS', ids: [] });
      }
    },
    [pushToast, state.apiKey, state.keyStatus, state.localMods],
  );

  const packSelected = useCallback(async (): Promise<void> => {
    const selected = new Set(state.selectedPackIds);
    const mods = state.localMods.filter(
      (mod) => selected.has(mod.id) && mod.fileTree.some((node) => node.kind === 'file'),
    );
    if (mods.length === 0) {
      pushToast('请先勾选要打包的模组', 'error');
      return;
    }
    const totalFiles = mods.reduce(
      (sum, mod) => sum + fsTree.computeStats(mod.fileTree).fileCount,
      0,
    );
    dispatch({
      type: 'SET_PACK_PROGRESS',
      progress: { phase: 'packing', current: 0, total: totalFiles, message: '准备打包' },
    });
    try {
      const blob = await packTreeToZip(mods, (progress) =>
        dispatch({ type: 'SET_PACK_PROGRESS', progress }),
      );
      const url = URL.createObjectURL(blob);
      triggerBrowserDownload(url, buildPackFileName());
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      dispatch({
        type: 'SET_PACK_PROGRESS',
        progress: { phase: 'done', current: 1, total: 1, message: '打包完成' },
      });
      pushToast('已打包：解压后把文件夹放进游戏的 Mods 目录即可使用', 'success');
    } catch (error) {
      dispatch({ type: 'SET_PACK_PROGRESS', progress: null });
      pushToast(formatError(error), 'error');
    }
  }, [pushToast, state.localMods, state.selectedPackIds]);

  const setProgress = useCallback((target: ProgressTarget, progress: ProgressInfo | null): void => {
    if (target === 'upload') {
      dispatch({ type: 'SET_UPLOAD_PROGRESS', progress });
    } else if (target === 'pack') {
      dispatch({ type: 'SET_PACK_PROGRESS', progress });
    } else {
      dispatch({ type: 'SET_SYNC_PROGRESS', progress });
    }
  }, []);

  /* ===== v4：库搜索 / ID 勾选 / 文件树浏览与编辑 ===== */

  const setLibraryQuery = useCallback((query: string): void => {
    dispatch({ type: 'SET_LIBRARY_QUERY', query });
  }, []);

  const setIncludeCloud = useCallback((include: boolean): void => {
    dispatch({ type: 'SET_INCLUDE_CLOUD', include });
  }, []);

  const selectByIds = useCallback(
    (input: string): void => {
      const ids = parseModIds(input);
      if (ids.length === 0) {
        pushToast('未识别到有效的模组 ID', 'error');
        return;
      }
      const { matchedIds, unmatchedIds } = matchModsByInputIds(stateRef.current.localMods, ids);
      if (matchedIds.length === 0) {
        pushToast('未在模组库中找到匹配的模组', 'info');
        return;
      }
      dispatch({ type: 'ADD_SELECTED', ids: matchedIds });
      const next = Array.from(new Set([...stateRef.current.selectedPackIds, ...matchedIds]));
      void dbService.saveMeta('selectedPackIds', next).catch(() => undefined);
      pushToast(
        `已自动勾选 ${matchedIds.length} 个模组${
          unmatchedIds.length > 0 ? `；未匹配 ID：${unmatchedIds.join('、')}` : ''
        }`,
        unmatchedIds.length > 0 ? 'info' : 'success',
      );
    },
    [pushToast],
  );

  /** 树编辑统一出口：纯函数出新树 → 重算统计 → 标脏 → reducer + IDB 落库。 */
  const editTree = useCallback(
    (modId: string, mutate: (tree: FSTreeNode[]) => FSTreeNode[]): void => {
      const mod = stateRef.current.localMods.find((item) => item.id === modId);
      if (!mod) {
        pushToast('未找到该模组', 'error');
        return;
      }
      const fileTree = mutate(mod.fileTree);
      const stats = fsTree.computeStats(fileTree);
      const modifiedAt = new Date().toISOString();
      const updated: LocalMod = {
        ...mod,
        fileTree,
        fileCount: stats.fileCount,
        totalSize: stats.totalSize,
        dirty: true,
        modifiedAt,
        syncStatus: mod.syncStatus === 'synced' ? 'local-ahead' : mod.syncStatus,
      };
      dispatch({ type: 'REPLACE_LOCAL_MOD', mod: updated });
      void dbService.saveMod(updated).catch(() => pushToast('本地保存失败，刷新后可能丢失', 'info'));
    },
    [pushToast],
  );

  const openFolder = useCallback((modId: string): void => {
    dispatch({ type: 'SET_EXPLORER', explorer: { modId, path: [] } });
  }, []);

  /** nodeId 若已在当前路径中则截断到该级（面包屑跳转），否则追加（进入子目录）。 */
  const navigateInto = useCallback(
    (nodeId: string): void => {
      const { modId, path } = stateRef.current.explorer;
      if (!modId) {
        return;
      }
      const mod = stateRef.current.localMods.find((item) => item.id === modId);
      const node = mod ? fsTree.findNode(mod.fileTree, nodeId) : null;
      if (!node || node.kind !== 'dir') {
        return;
      }
      const index = path.indexOf(nodeId);
      const nextPath = index >= 0 ? path.slice(0, index + 1) : [...path, nodeId];
      dispatch({ type: 'SET_EXPLORER', explorer: { modId, path: nextPath } });
    },
    [],
  );

  const navigateUp = useCallback((): void => {
    const { modId, path } = stateRef.current.explorer;
    if (!modId || path.length === 0) {
      return;
    }
    dispatch({ type: 'SET_EXPLORER', explorer: { modId, path: path.slice(0, -1) } });
  }, []);

  const closeFolder = useCallback((): void => {
    dispatch({ type: 'SET_EXPLORER', explorer: { modId: null, path: [] } });
  }, []);

  const pickFilesIntoNode = useCallback(
    async (modId: string, parentId: string | null, files: File[]): Promise<void> => {
      const candidates = Array.isArray(files) ? files.filter((file) => file && file.size >= 0) : [];
      if (candidates.length === 0) {
        return;
      }
      const nodes: FSTreeNode[] = [];
      for (const file of candidates) {
        const bytes = await fsTree.blobToBytes(file);
        const mime = file.type || fsTree.guessMime(file.name);
        const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
        nodes.push({
          nodeId: fsTree.makeNodeId(),
          name: fsTree.safeNodeName(file.name, '未命名文件'),
          kind: 'file',
          children: [],
          data: blob,
          size: blob.size,
          mime,
        });
      }
      editTree(modId, (tree) =>
        nodes.reduce((acc, node) => fsTree.insertFile(acc, parentId, node), tree),
      );
    },
    [editTree],
  );

  const addFolderIntoNode = useCallback(
    (modId: string, parentId: string | null, name: string): void => {
      const node: FSTreeNode = {
        nodeId: fsTree.makeNodeId(),
        name: fsTree.safeNodeName(name, '新建文件夹'),
        kind: 'dir',
        children: [],
        size: 0,
      };
      editTree(modId, (tree) => fsTree.insertFolder(tree, parentId, node));
    },
    [editTree],
  );

  const renameNode = useCallback(
    (modId: string, nodeId: string, name: string): void => {
      editTree(modId, (tree) => fsTree.renameNode(tree, nodeId, name));
    },
    [editTree],
  );

  const deleteNode = useCallback(
    (modId: string, nodeId: string): void => {
      const { modId: browsingId, path } = stateRef.current.explorer;
      if (browsingId === modId && path.includes(nodeId)) {
        const index = path.indexOf(nodeId);
        dispatch({
          type: 'SET_EXPLORER',
          explorer: { modId, path: path.slice(0, index) },
        });
      }
      editTree(modId, (tree) => fsTree.deleteNode(tree, nodeId));
    },
    [editTree],
  );

  /* ===== v4：GitHub 云端（全手动；无任何挂载即同步的 useEffect） ===== */

  const configureGitHub = useCallback(
    (input: GitHubSettings & { token: string }): void => {
      if (!input.owner.trim() || !input.repo.trim() || !input.token.trim()) {
        pushToast('请填写 token、owner 与 repo', 'error');
        return;
      }
      const settings = githubService.configure(input);
      dispatch({ type: 'SET_GITHUB_CONFIG', settings });
      void dbService.saveMeta('github', settings).catch(() => undefined);
      pushToast('GitHub 配置已保存在本机；token 仅存 localStorage', 'success');
    },
    [pushToast],
  );

  const clearGitHubConfig = useCallback((): void => {
    githubService.clearToken();
    const settings = defaultGitHubSettings();
    dispatch({ type: 'SET_GITHUB_CONFIG', settings });
    void dbService.saveMeta('github', settings).catch(() => undefined);
    pushToast('已清除本机 token 与连接配置；已同步的数据未被删除', 'info');
  }, [pushToast]);

  const testGitHubConnection = useCallback(async (): Promise<void> => {
    const cfg = buildGithubConfig(stateRef.current);
    if (!cfg) {
      pushToast('请先在上方保存 token、owner 与 repo', 'error');
      return;
    }
    const result = await githubService.testConnection(cfg);
    const settings: GitHubSettings = result.ok
      ? { ...stateRef.current.github, status: 'connected', connectedAt: new Date().toISOString(), error: '' }
      : { ...stateRef.current.github, status: 'error', error: result.message };
    dispatch({ type: 'SET_GITHUB_CONFIG', settings });
    void dbService.saveMeta('github', settings).catch(() => undefined);
    pushToast(result.message, result.ok ? 'success' : 'error');
  }, [pushToast]);

  const refreshCloudMods = useCallback(async (): Promise<void> => {
    const cfg = buildGithubConfig(stateRef.current);
    if (!cfg) {
      pushToast('请先配置并测试 GitHub 连接', 'error');
      return;
    }
    dispatch({ type: 'SET_SYNC_BUSY', busy: true });
    try {
      const listed = await githubService.listCloudMods(cfg);
      const previous = stateRef.current.cloudMods;
      const merged = listed.map((ref) => {
        const old = previous.find((item) => item.folderName === ref.folderName);
        return old
          ? {
              ...ref,
              localModId: old.localModId,
              fileShaMap: old.fileShaMap,
              fileCount: old.fileCount,
              totalSize: old.totalSize,
              lastSyncedAt: old.lastSyncedAt,
              remoteModifiedAt: old.remoteModifiedAt,
            }
          : ref;
      });
      dispatch({ type: 'SET_CLOUD_MODS', mods: merged });
      void dbService.saveMeta('cloudMods', merged).catch(() => undefined);
      pushToast(`已刷新云端模组：${merged.length} 个`, 'success');
    } catch (error) {
      pushToast(formatError(error), 'error');
    } finally {
      dispatch({ type: 'SET_SYNC_BUSY', busy: false });
    }
  }, [pushToast]);

  const syncToCloud = useCallback(
    async (ids?: string[]): Promise<void> => {
      const cfg = buildGithubConfig(stateRef.current);
      if (!cfg) {
        pushToast('请先配置并测试 GitHub 连接', 'error');
        return;
      }
      const candidates = stateRef.current.localMods.filter(
        (mod) => (!ids || ids.includes(mod.id)) && mod.fileCount > 0,
      );
      if (candidates.length === 0) {
        pushToast('没有可同步的本地模组', 'info');
        return;
      }
      dispatch({ type: 'SET_SYNC_BUSY', busy: true });
      dispatch({
        type: 'SET_SYNC_PROGRESS',
        progress: { phase: 'syncing', current: 0, total: candidates.length, message: '准备同步' },
      });
      let synced = 0;
      try {
        for (let index = 0; index < candidates.length; index += 1) {
          const mod = candidates[index];
          const folderName = mod.cloudFolderName || resolveModFolderName(mod);
          const ref = stateRef.current.cloudMods.find((item) => item.folderName === folderName);
          const onWarn = (msg: string): void => pushToast(msg, 'info');
          try {
            const result =
              ref && Object.keys(mod.fileShaMap).length > 0
                ? await githubService.updateMod(cfg, mod, ref, onWarn)
                : await githubService.uploadMod(cfg, mod, onWarn);
            const updated: LocalMod = {
              ...mod,
              dirty: false,
              syncStatus: 'synced',
              lastSyncedAt: result.lastSyncedAt,
              cloudFolderName: result.folderName,
              fileShaMap: result.fileShaMap,
            };
            dispatch({ type: 'REPLACE_LOCAL_MOD', mod: updated });
            await dbService.saveMod(updated).catch(() => undefined);
            const nextRef: CloudModRef = { ...result, localModId: mod.id };
            const others = stateRef.current.cloudMods.filter(
              (item) => item.folderName !== nextRef.folderName,
            );
            dispatch({ type: 'SET_CLOUD_MODS', mods: [...others, nextRef] });
            void dbService.saveMeta('cloudMods', [...others, nextRef]).catch(() => undefined);
            void dbService.saveCloudMod(nextRef).catch(() => undefined);
            synced += 1;
          } catch (error) {
            pushToast(`${mod.name} 同步失败：${formatError(error)}`, 'error');
          }
          dispatch({
            type: 'SET_SYNC_PROGRESS',
            progress: {
              phase: 'syncing',
              current: index + 1,
              total: candidates.length,
              message: `正在同步 ${mod.name}`,
            },
          });
        }
        pushToast(`已同步 ${synced} 个模组到云端`, synced > 0 ? 'success' : 'info');
      } finally {
        dispatch({ type: 'SET_SYNC_BUSY', busy: false });
        dispatch({
          type: 'SET_SYNC_PROGRESS',
          progress: { phase: 'done', current: 1, total: 1, message: '同步完成' },
        });
      }
    },
    [pushToast],
  );

  /** 云端 → 本地的纯加工：不 dispatch、不落库；供拉取与冲突解决共用。 */
  const materializePull = useCallback(
    async (payload: PullPayload): Promise<{ mod: LocalMod; ref: CloudModRef }> => {
      const fileTree = await buildTreeFromEntries(payload.files);
      const stats = fsTree.computeStats(fileTree);
      const now = new Date().toISOString();
      const parsed = await extractManifest(fileTree);
      const manifest = parsed.manifest;
      const updateKeys = manifest?.UpdateKeys ?? payload.local?.updateKeys ?? [];
      const local = payload.local;
      const mod: LocalMod = local
        ? {
            ...local,
            fileTree,
            fileCount: stats.fileCount,
            totalSize: stats.totalSize,
            source: 'cloud',
            dirty: false,
            modifiedAt: now,
            syncStatus: 'synced',
            lastSyncedAt: now,
            cloudFolderName: payload.folderName,
            fileShaMap: payload.shaMap,
            manifest: manifest ?? local.manifest,
            updateKeys,
            nexusModIds: manifest ? extractNexusModIds(updateKeys) : local.nexusModIds,
            version: manifest?.Version || local.version,
            author: manifest?.Author || local.author,
          }
        : {
            id: fsTree.makeNodeId(),
            name: manifest?.Name || payload.folderName,
            author: manifest?.Author ?? '',
            version: manifest?.Version ?? '',
            description: manifest?.Description ?? '',
            manifest,
            updateKeys,
            nexusModIds: extractNexusModIds(updateKeys),
            fileTree,
            fileCount: stats.fileCount,
            totalSize: stats.totalSize,
            rootFolder: payload.folderName,
            source: 'cloud',
            uniqueId: manifest?.UniqueID ?? '',
            updateStatus: 'unknown',
            updateInfo: null,
            checkError: '尚未检测',
            lastCheckedAt: null,
            addedAt: now,
            dirty: false,
            modifiedAt: now,
            syncStatus: 'synced',
            lastSyncedAt: now,
            cloudFolderName: payload.folderName,
            fileShaMap: payload.shaMap,
          };
      const ref: CloudModRef = {
        ...payload.ref,
        localModId: mod.id,
        fileShaMap: payload.shaMap,
        fileCount: stats.fileCount,
        totalSize: stats.totalSize,
        remoteModifiedAt: payload.remoteModifiedAt || payload.ref.remoteModifiedAt,
        lastSyncedAt: now,
        syncStatus: 'synced',
      };
      return { mod, ref };
    },
    [],
  );

  /** 提交一批拉取结果：reducer + IDB；冲突未解决前不会被调用。 */
  const commitPulls = useCallback(
    async (payloads: PullPayload[]): Promise<void> => {
      const produced: Array<{ mod: LocalMod; ref: CloudModRef }> = [];
      for (const payload of payloads) {
        produced.push(await materializePull(payload));
      }
      for (const { mod } of produced) {
        const exists = stateRef.current.localMods.some((item) => item.id === mod.id);
        dispatch(exists ? { type: 'REPLACE_LOCAL_MOD', mod } : { type: 'ADD_LOCAL_MODS', mods: [mod] });
        await dbService.saveMod(mod).catch(() => undefined);
      }
      const producedRefs = produced.map(({ ref }) => ref);
      const others = stateRef.current.cloudMods.filter(
        (ref) => !producedRefs.some((item) => item.folderName === ref.folderName),
      );
      const merged = [...others, ...producedRefs];
      dispatch({ type: 'SET_CLOUD_MODS', mods: merged });
      void dbService.saveMeta('cloudMods', merged).catch(() => undefined);
      for (const ref of producedRefs) {
        void dbService.saveCloudMod(ref).catch(() => undefined);
      }
    },
    [materializePull],
  );

  const pullFromCloud = useCallback(
    async (folderNames?: string[]): Promise<void> => {
      const cfg = buildGithubConfig(stateRef.current);
      if (!cfg) {
        pushToast('请先配置并测试 GitHub 连接', 'error');
        return;
      }
      const refs = stateRef.current.cloudMods.filter(
        (ref) => !folderNames || folderNames.length === 0 || folderNames.includes(ref.folderName),
      );
      if (refs.length === 0) {
        pushToast('没有可拉取的云端模组，请先刷新云端列表', 'info');
        return;
      }
      dispatch({ type: 'SET_SYNC_BUSY', busy: true });
      try {
        const clean: PullPayload[] = [];
        const conflictPayloads: PullPayload[] = [];
        let firstConflict: ConflictPrompt | null = null;
        for (const ref of refs) {
          const downloaded = await githubService.downloadMod(cfg, ref);
          const local = stateRef.current.localMods.find(
            (mod) =>
              mod.id === ref.localModId ||
              mod.cloudFolderName === ref.folderName ||
              mod.rootFolder === ref.folderName,
          );
          const payload: PullPayload = {
            ref,
            folderName: downloaded.folderName,
            files: downloaded.files,
            shaMap: downloaded.shaMap,
            remoteModifiedAt: downloaded.remoteModifiedAt,
            local,
          };
          const shaChanged =
            local !== undefined &&
            Object.keys(downloaded.shaMap).some(
              (path) =>
                local.fileShaMap[path] !== undefined &&
                local.fileShaMap[path] !== downloaded.shaMap[path],
            );
          if (local && local.dirty && shaChanged) {
            conflictPayloads.push(payload);
            if (firstConflict === null) {
              firstConflict = {
                localModId: local.id,
                folderName: ref.folderName,
                localModifiedAt: local.modifiedAt,
                remoteModifiedAt: downloaded.remoteModifiedAt,
              };
            }
          } else {
            clean.push(payload);
          }
        }
        // Q3：冲突项绝不写入任一侧，等待用户二选一。
        pendingPullRef.current = conflictPayloads;
        if (clean.length > 0) {
          await commitPulls(clean);
        }
        if (firstConflict) {
          dispatch({ type: 'SET_CONFLICT', conflict: firstConflict });
          pushToast('存在冲突，请选择以本地覆盖云端或以云端覆盖本地', 'info');
        } else {
          pushToast(`已从云端拉取 ${clean.length} 个模组`, clean.length > 0 ? 'success' : 'info');
        }
      } catch (error) {
        pushToast(formatError(error), 'error');
      } finally {
        dispatch({ type: 'SET_SYNC_BUSY', busy: false });
      }
    },
    [commitPulls, pushToast],
  );

  const deleteCloudMod = useCallback(
    async (folderName: string): Promise<void> => {
      const cfg = buildGithubConfig(stateRef.current);
      if (!cfg) {
        pushToast('请先配置并测试 GitHub 连接', 'error');
        return;
      }
      if (!window.confirm(`确定删除云端模组 ${folderName}？本地模组库不受影响。`)) {
        return;
      }
      dispatch({ type: 'SET_SYNC_BUSY', busy: true });
      try {
        await githubService.deleteMod(cfg, folderName);
        const merged = stateRef.current.cloudMods.filter((ref) => ref.folderName !== folderName);
        dispatch({ type: 'SET_CLOUD_MODS', mods: merged });
        void dbService.saveMeta('cloudMods', merged).catch(() => undefined);
        pushToast('已删除云端模组（本地数据未受影响）', 'success');
      } catch (error) {
        pushToast(formatError(error), 'error');
      } finally {
        dispatch({ type: 'SET_SYNC_BUSY', busy: false });
      }
    },
    [pushToast],
  );

  const resolveConflict = useCallback(
    async (choice: 'local' | 'remote'): Promise<void> => {
      const pending = pendingPullRef.current;
      pendingPullRef.current = [];
      dispatch({ type: 'SET_CONFLICT', conflict: null });
      if (pending.length === 0) {
        return;
      }
      const cfg = buildGithubConfig(stateRef.current);
      if (!cfg) {
        pushToast('请先配置并测试 GitHub 连接', 'error');
        return;
      }
      dispatch({ type: 'SET_SYNC_BUSY', busy: true });
      try {
        if (choice === 'remote') {
          await commitPulls(pending);
          pushToast(`已用云端覆盖 ${pending.length} 个模组`, 'success');
        } else {
          for (const item of pending) {
            if (!item.local) {
              continue;
            }
            const result = await githubService.uploadMod(cfg, item.local, (msg) => pushToast(msg, 'info'));
            const updated: LocalMod = {
              ...item.local,
              dirty: false,
              syncStatus: 'synced',
              lastSyncedAt: result.lastSyncedAt,
              cloudFolderName: result.folderName,
              fileShaMap: result.fileShaMap,
            };
            dispatch({ type: 'REPLACE_LOCAL_MOD', mod: updated });
            await dbService.saveMod(updated).catch(() => undefined);
            const nextRef: CloudModRef = { ...result, localModId: updated.id };
            const others = stateRef.current.cloudMods.filter(
              (ref) => ref.folderName !== nextRef.folderName,
            );
            dispatch({ type: 'SET_CLOUD_MODS', mods: [...others, nextRef] });
            void dbService.saveMeta('cloudMods', [...others, nextRef]).catch(() => undefined);
          }
          pushToast(`已用本地覆盖 ${pending.length} 个模组`, 'success');
        }
      } catch (error) {
        pushToast(formatError(error), 'error');
      } finally {
        dispatch({ type: 'SET_SYNC_BUSY', busy: false });
      }
    },
    [commitPulls, pushToast],
  );

  /** 取消：保留现状，不写本地也不写云端。 */
  const dismissConflict = useCallback((): void => {
    pendingPullRef.current = [];
    dispatch({ type: 'SET_CONFLICT', conflict: null });
  }, []);

  /* ===== v4：库管理 / 导出 / 启动恢复 ===== */

  const exportLibrary = useCallback(
    (format: ExportFormat): void => {
      const { localMods, cloudMods } = stateRef.current;
      const ok = exportLibraryFile(localMods, cloudMods, format);
      pushToast(
        ok ? `已导出库清单（${format.toUpperCase()}）` : '模组库为空，无法导出清单',
        ok ? 'success' : 'info',
      );
    },
    [pushToast],
  );

  const clearLocalLibrary = useCallback((): void => {
    if (!window.confirm('确定清空本地模组库？此操作不可撤销，已同步到云端的数据不受影响。')) {
      return;
    }
    void dbService
      .clearAll(true)
      .then(() => {
        dispatch({
          type: 'HYDRATE_LIBRARY',
          mods: [],
          meta: {
            selectedPackIds: [],
            github: defaultGitHubSettings(),
            cloudMods: [],
          },
        });
        pendingPullRef.current = [];
        pushToast('已清空本地模组库', 'info');
      })
      .catch(() => pushToast('清空失败，请稍后重试', 'error'));
  }, [pushToast]);

  const hydrateLibrary = useCallback(async (): Promise<void> => {
    try {
      const [mods, selectedPackIds, github, cloudMods] = await Promise.all([
        dbService.loadAllMods(),
        dbService.loadMeta<string[]>('selectedPackIds'),
        dbService.loadMeta<GitHubSettings>('github'),
        dbService.loadMeta<CloudModRef[]>('cloudMods'),
      ]);
      dispatch({
        type: 'HYDRATE_LIBRARY',
        mods,
        meta: { selectedPackIds, github, cloudMods },
      });
    } catch {
      // 隐私模式 / 配额失败：不白屏、不弹错误遮罩，仍可继续上传新模组。
      dispatch({ type: 'HYDRATE_LIBRARY', mods: [], meta: {} });
      pushToast('本地库读取失败，本次会话仍可继续上传模组', 'info');
    }
  }, [pushToast]);

  // 启动恢复：只调用一次；失败已在 hydrateLibrary 内部吞掉。
  useEffect(() => {
    if (hydratedOnceRef.current) {
      return;
    }
    hydratedOnceRef.current = true;
    void hydrateLibrary();
  }, [hydrateLibrary]);

  const actions = useMemo<AppActions>(
    () => ({
      setKey,
      clearKey,
      validate,
      setIdsInput,
      resolveMods,
      selectFile,
      toggleChinese,
      download,
      redownload,
      setTheme,
      setTab,
      clearHistory,
      uploadFolderZip,
      uploadSingleZips,
      togglePackSelect,
      removeLocalMod,
      checkUpdates,
      checkOneUpdate,
      packSelected,
      setProgress,
      setLibraryQuery,
      setIncludeCloud,
      selectByIds,
      openFolder,
      navigateInto,
      navigateUp,
      closeFolder,
      pickFilesIntoNode,
      addFolderIntoNode,
      renameNode,
      deleteNode,
      configureGitHub,
      clearGitHubConfig,
      testGitHubConnection,
      refreshCloudMods,
      syncToCloud,
      pullFromCloud,
      deleteCloudMod,
      resolveConflict,
      dismissConflict,
      exportLibrary,
      clearLocalLibrary,
      hydrateLibrary,
    }),
    [
      setKey,
      clearKey,
      validate,
      setIdsInput,
      resolveMods,
      selectFile,
      toggleChinese,
      download,
      redownload,
      setTheme,
      setTab,
      clearHistory,
      uploadFolderZip,
      uploadSingleZips,
      togglePackSelect,
      removeLocalMod,
      checkUpdates,
      checkOneUpdate,
      packSelected,
      setProgress,
      setLibraryQuery,
      setIncludeCloud,
      selectByIds,
      openFolder,
      navigateInto,
      navigateUp,
      closeFolder,
      pickFilesIntoNode,
      addFolderIntoNode,
      renameNode,
      deleteNode,
      configureGitHub,
      clearGitHubConfig,
      testGitHubConnection,
      refreshCloudMods,
      syncToCloud,
      pullFromCloud,
      deleteCloudMod,
      resolveConflict,
      dismissConflict,
      exportLibrary,
      clearLocalLibrary,
      hydrateLibrary,
    ],
  );

  const value = useMemo<AppStoreValue>(() => ({ state, actions }), [state, actions]);
  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useApp(): { state: AppState; actions: AppActions } {
  const context = useContext(AppStoreContext);
  if (!context) {
    throw new Error('useApp 必须在 AppStoreProvider 内使用');
  }
  return context;
}
