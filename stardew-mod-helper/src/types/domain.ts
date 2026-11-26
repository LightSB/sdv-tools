import type { Mod, ModFile } from './nexus';
// 引入 v4 工作区类型（无 token）
import type {
  CloudModRef,
  ConflictPrompt,
  ExplorerState,
  GitHubSettings,
  LibrarySearchState,
  LocalMod,
  ProgressInfo,
} from './workspace';

export type PremiumTier = 'premium' | 'standard';
export type KeyStatus = 'unset' | 'checking' | 'valid' | 'invalid' | 'error';
export type DownloadAction = 'direct' | 'open' | 'copy';
export type DownloadKind = 'main' | 'chinese' | 'prerequisite';
export type ThemeMode = 'dark' | 'light';
/** TabKey：下载 → 工作区 → 历史（不变） */
export type TabKey = 'download' | 'workspace' | 'history';
/** 【新增】WorkspacePanel 三分段 key：v3 的 'search' 更名 'library' */
export type WorkspaceSegment = 'local' | 'library' | 'pack';

/** 识别出的前置模组 */
export interface Prerequisite {
  modId: number;
  name: string;
  url: string;
  source: 'knowledge' | 'description';
  note?: string;
}

/** 单个模组聚合后的领域对象（UI 直接消费） */
export interface ParsedMod {
  modId: number;
  meta: Mod;
  files: ModFile[];
  mainFile: ModFile | null;
  chineseFiles: ModFile[];
  prerequisites: Prerequisite[];
  plainSummary: string;
  isChineseTranslation: boolean;
  /** 版本兼容提醒文案：由 buildParsedMod 基于主文件派生；无风险/无版本时不写此字段 */
  versionNote?: string;
}

/** 下载队列中的一项 */
export interface DownloadItem {
  modId: number;
  file: ModFile;
  kind: DownloadKind;
}

/** 由 ParsedMod + 用户选择 + 会员等级生成的执行计划 */
export interface DownloadPlan {
  tier: PremiumTier;
  action: DownloadAction;
  items: DownloadItem[];
  filePageUrls: Record<string, string>;
  note?: string;
}

export interface DownloadResult {
  item: DownloadItem;
  ok: boolean;
  uri?: string;
  error?: string;
}

/** 下载历史条目 */
export interface HistoryEntry {
  id: string;
  modId: number;
  modName: string;
  fileId: number;
  fileName: string;
  version: string;
  tier: PremiumTier;
  action: DownloadAction;
  downloadedAt: string;
  /** 下载时一并带入的汉化文件名；旧记录无此字段，导出留空（Q7） */
  chinese?: string[];
  /** 下载时识别到的前置名称；旧记录无此字段，导出留空（Q7） */
  prerequisites?: string[];
  /** 所选文件的游戏兼容版本（归一化字符串）；旧记录无此字段，导出留空（Q7） */
  gameVersion?: string;
}

export interface KeyValidationResult {
  valid: boolean;
  tier: PremiumTier;
  userName: string | null;
  message: string;
}

/** 全局状态（reducer 管理）；v1/v2 字段全部保留，工作区字段按 v4 重组 */
export interface AppState {
  apiKey: string;
  keyStatus: KeyStatus;
  tier: PremiumTier;
  userName: string | null;
  keyMessage: string;
  idsInput: string;
  mods: ParsedMod[];
  loadingIds: number[];
  loadErrors: Record<number, string>;
  selectedFiles: Record<number, number>;
  includeChinese: Record<number, boolean>;
  history: HistoryEntry[];
  theme: ThemeMode;
  tab: TabKey;

  // ↓↓↓ v4 工作区字段↓↓↓
  localMods: LocalMod[];
  selectedPackIds: string[];
  librarySearch: LibrarySearchState;
  explorer: ExplorerState;
  checkingIds: string[];
  uploadProgress: ProgressInfo | null;
  packProgress: ProgressInfo | null;
  syncProgress: ProgressInfo | null;
  cloudMods: CloudModRef[];
  /** 无 token */
  github: GitHubSettings;
  syncBusy: boolean;
  conflict: ConflictPrompt | null;
  /** 防止 hydrate 前渲染空库闪烁 */
  libraryHydrated: boolean;
}
