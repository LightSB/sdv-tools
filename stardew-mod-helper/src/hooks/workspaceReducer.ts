import { APP_CONFIG } from '../config';
import type { AppState } from '../types/domain';
import type {
  ConflictPrompt,
  CloudModRef,
  ExplorerState,
  GitHubSettings,
  LocalMod,
  ProgressInfo,
  UpdateDetectionResult,
  WorkspaceState,
} from '../types/workspace';

/** HYDRATE_LIBRARY 携带的非敏感 meta（token 永远不在此处）。 */
export interface LibraryHydrateMeta {
  selectedPackIds?: string[];
  github?: GitHubSettings;
  cloudMods?: CloudModRef[];
}

/** 工作区初始 GitHub 设置（无 token）。 */
export function defaultGitHubSettings(): GitHubSettings {
  return {
    owner: '',
    repo: '',
    branch: APP_CONFIG.github.defaultBranch,
    basePath: APP_CONFIG.github.defaultBasePath,
    status: 'unconfigured',
    connectedAt: null,
    error: '',
  };
}

/** 工作区状态切片 action；v1 的 LegacyAction 由 useAppState 保持原样并并入联合类型。 */
export type WorkspaceAction =
  | { type: 'ADD_LOCAL_MODS'; mods: LocalMod[] }
  | { type: 'REPLACE_LOCAL_MOD'; mod: LocalMod }
  | { type: 'REMOVE_LOCAL_MOD'; id: string }
  | { type: 'TOGGLE_PACK_SELECT'; id: string }
  | { type: 'ADD_SELECTED'; ids: string[] }
  | { type: 'SET_CHECKING_IDS'; ids: string[] }
  | { type: 'APPLY_UPDATE_RESULT'; id: string; result: UpdateDetectionResult; checkedAt: string }
  | { type: 'RESET_UPDATE_RESULT'; id: string }
  | { type: 'SET_LIBRARY_QUERY'; query: string }
  | { type: 'SET_INCLUDE_CLOUD'; include: boolean }
  | { type: 'SET_EXPLORER'; explorer: ExplorerState }
  | { type: 'SET_CLOUD_MODS'; mods: CloudModRef[] }
  | { type: 'SET_GITHUB_CONFIG'; settings: GitHubSettings }
  | { type: 'SET_SYNC_BUSY'; busy: boolean }
  | { type: 'SET_CONFLICT'; conflict: ConflictPrompt | null }
  | { type: 'HYDRATE_LIBRARY'; mods: LocalMod[]; meta: LibraryHydrateMeta }
  | { type: 'SET_UPLOAD_PROGRESS'; progress: ProgressInfo | null }
  | { type: 'SET_PACK_PROGRESS'; progress: ProgressInfo | null }
  | { type: 'SET_SYNC_PROGRESS'; progress: ProgressInfo | null };

/** 工作区初始态：全部为空 / idle，不读取任何 storage key（Q1/Q4）。 */
export function createWorkspaceInitialState(): WorkspaceState {
  return {
    localMods: [],
    selectedPackIds: [],
    librarySearch: { query: '', includeCloud: true },
    explorer: { modId: null, path: [] },
    checkingIds: [],
    uploadProgress: null,
    packProgress: null,
    syncProgress: null,
    cloudMods: [],
    github: defaultGitHubSettings(),
    syncBusy: false,
    conflict: null,
    libraryHydrated: false,
  };
}

/** 工作区切片 reducer：只改自己的 v4 字段，其余 AppState 字段原样透传。 */
export function workspaceReducer(state: AppState, action: WorkspaceAction): AppState {
  switch (action.type) {
    case 'ADD_LOCAL_MODS':
      return { ...state, localMods: [...state.localMods, ...action.mods] };

    case 'REPLACE_LOCAL_MOD':
      return {
        ...state,
        localMods: state.localMods.map((mod) => (mod.id === action.mod.id ? action.mod : mod)),
      };

    case 'REMOVE_LOCAL_MOD':
      return {
        ...state,
        localMods: state.localMods.filter((mod) => mod.id !== action.id),
        selectedPackIds: state.selectedPackIds.filter((id) => id !== action.id),
        checkingIds: state.checkingIds.filter((id) => id !== action.id),
        explorer:
          state.explorer.modId === action.id ? { modId: null, path: [] } : state.explorer,
        cloudMods: state.cloudMods.map((ref) =>
          ref.localModId === action.id ? { ...ref, localModId: null } : ref,
        ),
      };

    case 'TOGGLE_PACK_SELECT': {
      const target = state.localMods.find((mod) => mod.id === action.id);
      if (!target || target.fileCount === 0) {
        return state;
      }
      const selected = state.selectedPackIds.includes(action.id);
      return {
        ...state,
        selectedPackIds: selected
          ? state.selectedPackIds.filter((id) => id !== action.id)
          : [...state.selectedPackIds, action.id],
      };
    }

    case 'ADD_SELECTED': {
      const merged = new Set(state.selectedPackIds);
      for (const id of Array.isArray(action.ids) ? action.ids : []) {
        merged.add(id);
      }
      return { ...state, selectedPackIds: Array.from(merged) };
    }

    case 'SET_CHECKING_IDS':
      return { ...state, checkingIds: action.ids };

    case 'APPLY_UPDATE_RESULT':
      return {
        ...state,
        localMods: state.localMods.map((mod) =>
          mod.id === action.id
            ? {
                ...mod,
                updateStatus: action.result.status,
                updateInfo: action.result.updateInfo,
                checkError: action.result.checkError,
                lastCheckedAt: action.checkedAt,
                dirty: true,
                modifiedAt: action.checkedAt,
              }
            : mod,
        ),
      };

    case 'RESET_UPDATE_RESULT':
      return {
        ...state,
        localMods: state.localMods.map((mod) =>
          mod.id === action.id
            ? {
                ...mod,
                updateStatus: 'unknown' as const,
                updateInfo: null,
                checkError: '尚未检测',
                lastCheckedAt: null,
              }
            : mod,
        ),
      };

    case 'SET_LIBRARY_QUERY':
      return {
        ...state,
        librarySearch: { ...state.librarySearch, query: action.query },
      };

    case 'SET_INCLUDE_CLOUD':
      return {
        ...state,
        librarySearch: { ...state.librarySearch, includeCloud: action.include },
      };

    case 'SET_EXPLORER':
      return { ...state, explorer: action.explorer };

    case 'SET_CLOUD_MODS':
      return { ...state, cloudMods: action.mods };

    case 'SET_GITHUB_CONFIG':
      return { ...state, github: action.settings };

    case 'SET_SYNC_BUSY':
      return { ...state, syncBusy: action.busy };

    case 'SET_CONFLICT':
      return { ...state, conflict: action.conflict };

    case 'HYDRATE_LIBRARY':
      return {
        ...state,
        localMods: Array.isArray(action.mods) ? action.mods : [],
        selectedPackIds: Array.isArray(action.meta?.selectedPackIds) ? action.meta.selectedPackIds! : [],
        cloudMods: Array.isArray(action.meta?.cloudMods) ? action.meta.cloudMods! : [],
        github: action.meta?.github ?? defaultGitHubSettings(),
        explorer: { modId: null, path: [] },
        librarySearch: { query: '', includeCloud: true },
        checkingIds: [],
        conflict: null,
        syncBusy: false,
        uploadProgress: null,
        packProgress: null,
        syncProgress: null,
        libraryHydrated: true,
      };

    case 'SET_UPLOAD_PROGRESS':
      return { ...state, uploadProgress: action.progress };

    case 'SET_PACK_PROGRESS':
      return { ...state, packProgress: action.progress };

    case 'SET_SYNC_PROGRESS':
      return { ...state, syncProgress: action.progress };

    default:
      return state;
  }
}
