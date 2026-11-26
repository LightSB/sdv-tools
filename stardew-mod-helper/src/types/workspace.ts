/** 【v4】工作区专属领域类型：层级文件树（Blob 字节）＋ IndexedDB 持久化契约 ＋ GitHub 云端同步。 */

/** 【重构 S1】层级文件树节点；data 用 Blob（Q1），nodeId 稳定、name 仅当前层级。 */
export interface FSTreeNode {
  /** 稳定唯一 id（crypto.randomUUID 兜底）；增删改名定位用，绝不随改名变化 */
  nodeId: string;
  /** 文件名或文件夹名，仅当前层级，不含路径分隔符 */
  name: string;
  kind: 'dir' | 'file';
  /** 仅 dir 有；file 为 [] */
  children: FSTreeNode[];
  /** 仅 file 有：字节 Blob；打包前 await blob.arrayBuffer() */
  data?: Blob;
  /** file 字节数；dir 恒为 0（汇总由 computeStats 现场算） */
  size: number;
  /** 由扩展名推断，供 textPreview 判断，如 application/json */
  mime?: string;
}

/** 扁平文件项：zip 解压 / 云端下载 → 建树的中间结构。 */
export interface FlatFileItem {
  /** 相对模组根、'/' 分隔、无前导 './' */
  path: string;
  blob: Blob;
  mime?: string;
}

/** SMAPI manifest.json 解析后的归一化结构（键名按 lowercase 匹配后填入）。 */
export interface Manifest {
  Name: string;
  Author: string;
  Version: string;
  Description: string;
  UpdateKeys: string[];
  UniqueID: string;
}

/** manifest 解析结果：缺失 / JSON 非法时 manifest=null 且带 reason（R39）。 */
export interface ManifestParseResult {
  manifest: Manifest | null;
  reason?: string;
}

/** 更新状态三值；"检测中"用 checkingIds 表达，不污染此联合类型（PRD 5.2）。 */
export type UpdateStatus = 'latest' | 'outdated' | 'unknown';

/** 本地模组来源；'cloud' 为从云端拉取到本地（v4 扩展）。 */
export type ModSource = 'folder-zip' | 'single-zip' | 'cloud';

/** 【新增】本地模组与云端的同步关系（Q2/Q3）。 */
export type LocalSyncStatus =
  | 'local-only'
  | 'synced'
  | 'local-ahead'
  | 'remote-ahead'
  | 'conflict'
  | 'error';

/** 线上最新主文件信息（只来自 files.json，绝不来自 download_link.json）。 */
export interface UpdateInfo {
  modId: number;
  version: string;
  /** ISO 8601 UTC */
  uploadedAt: string;
  fileId: number;
}

/** 【重构+扩展】本地模组（上传解压后生成，完整持久化到 IndexedDB）。 */
export interface LocalMod {
  /** 上传时生成的本地唯一标识（UUID）；用于勾选、定位、检测回调 */
  id: string;
  /** manifest.Name ?? rootFolder ?? zip 文件名（Q7 兜底顺序展示用） */
  name: string;
  author: string;
  version: string;
  description: string;
  /** 原始解析对象；无 / 解析失败为 null（R39 判定依据） */
  manifest: Manifest | null;
  /** 原始 UpdateKeys，保留 'Nexus:2400@X' 原样，仅供卡片展示 */
  updateKeys: string[];
  /** 去 @子键、仅 Nexus: 前缀、数字校验后去重的 modId（供检测与跳转） */
  nexusModIds: number[];
  /** 【换类型】FSTreeNode[] 层级树，data 为 Blob */
  fileTree: FSTreeNode[];
  fileCount: number;
  /** 总字节数，卡片展示与大小提示 */
  totalSize: number;
  /** zip 内顶层文件夹名；无文件夹时为 ''（Q7 一级优先来源） */
  rootFolder: string;
  source: ModSource;
  /** manifest.UniqueID，去重提示用，可空 */
  uniqueId: string;
  updateStatus: UpdateStatus;
  updateInfo: UpdateInfo | null;
  /** unknown 时必填：无 manifest / 无 Nexus UpdateKeys / 401 / 429 / 网络错误等 */
  checkError: string;
  /** ISO 8601 UTC；null 表示未检测。缓存判定基准（Q8 10min） */
  lastCheckedAt: string | null;
  /** 加入本地库时间（ISO 8601 UTC），时间兜底检测的首次基准 */
  addedAt: string;
  /** 【新增】本地有未同步改动（上传/树增删改名/更新检测结果后标脏） */
  dirty: boolean;
  /** 【新增】最近一次本地内容改动时间 ISO（冲突比对用） */
  modifiedAt: string;
  /** 【新增】同步状态（Q2/Q3） */
  syncStatus: LocalSyncStatus;
  /** 【新增】最近成功同步到云端的时间 ISO；null 表示未同步过 */
  lastSyncedAt: string | null;
  /** 【新增】仓库内目录名（Q4：rootFolder 优先，缺失用安全化 name） */
  cloudFolderName: string;
  /** 【新增】文件相对路径 → GitHub blob sha（增量更新/冲突判断） */
  fileShaMap: Record<string, string>;
  // 注意：勾选态只存 AppState.selectedPackIds，不在模组上重复维护（单一数据源）
}

/** 单次上传的解析产出；坏包隔离到 skipped，不阻断其他文件。 */
export interface ModParseOutcome {
  mods: LocalMod[];
  skipped: Array<{ name: string; reason: string }>;
  /** UniqueID 或名称疑似重复的名字，供 UI Toast「检测到 N 个可能重复的模组」 */
  duplicateNames: string[];
  /** 【新增 R47】识别到的顶层文件夹名，供 Toast「已识别 N 个模组文件夹：A、B…」 */
  recognizedFolders: string[];
}

/** 更新检测的单条结果（service 内部吞异常后返回，便于失败隔离）。 */
export interface UpdateDetectionResult {
  status: UpdateStatus;
  updateInfo: UpdateInfo | null;
  checkError: string;
}

/** 【新增】GitHub 连接设置（存 state/IDB meta，**永不含 token**）。 */
export interface GitHubSettings {
  owner: string;
  repo: string;
  /** 默认 'main' */
  branch: string;
  /** 默认 'mods/' */
  basePath: string;
  status: 'unconfigured' | 'connected' | 'error';
  /** ISO */
  connectedAt: string | null;
  error: string;
}

/** 【新增】服务层配置：设置 + 调用期 token（仅内存，来自 localStorage）。 */
export interface GitHubConfig extends GitHubSettings {
  token: string;
}

/** 【新增】云端模组映射（PRD 5.3）。 */
export interface CloudModRef {
  folderName: string;
  /** `${basePath}${folderName}` */
  remotePath: string;
  /** 未拉取到本地时为 null（Q8） */
  localModId: string | null;
  /** ISO */
  lastSyncedAt: string;
  syncStatus: LocalSyncStatus;
  /** 文件相对路径 → blob sha */
  fileShaMap: Record<string, string>;
  fileCount: number;
  totalSize: number;
  /** 云端最近提交时间 ISO（冲突比对用） */
  remoteModifiedAt: string;
}

/** 【新增 R48/Q8】模组库搜索状态（纯本地，零网络）。 */
export interface LibrarySearchState {
  query: string;
  /** 是否把云端已同步元数据纳入结果（Q8 默认 true） */
  includeCloud: boolean;
}

/** 【新增 R50】文件浏览器导航状态（提升到 useAppState）。 */
export interface ExplorerState {
  /** 正在浏览的本地模组 id；null 表示未进入 */
  modId: string | null;
  /** 从模组根开始的 nodeId 路径；[] 表示当前在模组根 */
  path: string[];
}

/** 【新增 Q3】冲突提示载荷。 */
export interface ConflictPrompt {
  localModId: string;
  folderName: string;
  /** LocalMod.modifiedAt */
  localModifiedAt: string;
  /** CloudModRef.remoteModifiedAt */
  remoteModifiedAt: string;
}

/** 统一进度载荷；上传/解压/manifest/检测/打包/同步共用。 */
export type ProgressPhase = 'reading' | 'unzip' | 'manifest' | 'checking' | 'packing' | 'syncing' | 'done';
export interface ProgressInfo {
  phase: ProgressPhase;
  current: number;
  total: number;
  message?: string;
}
export type ProgressCallback = (progress: ProgressInfo) => void;
export type ProgressTarget = 'upload' | 'pack' | 'sync';

/** 【重组】工作区状态切片 = AppState 中 v4 工作区字段的契约。 */
export interface WorkspaceState {
  localMods: LocalMod[];
  selectedPackIds: string[];
  librarySearch: LibrarySearchState;
  explorer: ExplorerState;
  checkingIds: string[];
  uploadProgress: ProgressInfo | null;
  packProgress: ProgressInfo | null;
  syncProgress: ProgressInfo | null;
  cloudMods: CloudModRef[];
  github: GitHubSettings;
  syncBusy: boolean;
  conflict: ConflictPrompt | null;
  libraryHydrated: boolean;
}
