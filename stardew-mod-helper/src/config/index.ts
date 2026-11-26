/**
 * 全局配置：game domain 的唯一配置点（D5）。
 * 所有 API 路径必须由 apiPath 派生，禁止在别处硬编码域名或 URL。
 */
export const APP_CONFIG = {
  appName: '星露谷模组下载助手',
  applicationName: 'stardew-mod-helper',
  applicationVersion: '1.0.0',
  gameDomain: 'stardewvalley',
  apiBaseUrl: 'https://api.nexusmods.com/v1/',
  webBaseUrl: 'https://www.nexusmods.com',
  /** SMAPI 版本兼容基线，内置可配置，不引入用户输入 */
  gameVersionBaseline: '1.6',
  /** 导出文件名前缀，最终形如 stardew-mods-2026-06-01.md */
  exportFileNamePrefix: 'stardew-mods',
  /** 更新检测：缓存有效期与并发上限（不变） */
  update: {
    cacheTtlMs: 10 * 60 * 1000,
    concurrency: 3,
  },
  /** 上传大小阈值（字节）：100MB 提示 / 300MB 二次确认（不变） */
  upload: {
    softLimitBytes: 100 * 1024 * 1024,
    hardLimitBytes: 300 * 1024 * 1024,
  },
  /** 打包文件名前缀，最终 stardew-mods-pack-YYYY-MM-DD.zip（不变） */
  pack: { fileNamePrefix: 'stardew-mods-pack' },
  /** 【新增 R49】GitHub 直连配置（限频数值唯一来源） */
  github: {
    apiBase: 'https://api.github.com',
    apiVersion: '2022-11-28',
    defaultBranch: 'main',
    defaultBasePath: 'mods/',
    /** Contents API 单文件上限 */
    maxFileBytes: 100 * 1024 * 1024,
    /** Contents API 目录列表上限 */
    maxFilesPerDir: 1000,
    /** token 唯一存储键（仅 localStorage） */
    tokenStorageKey: 'sdmh.githubToken',
  },
  /** 【新增 Q9】本地库软阈值：>500MB 提示，不硬限制 */
  librarySoftLimitBytes: 500 * 1024 * 1024,
  /** 【新增 R53】库清单文件名前缀 → stardew-mod-library-YYYY-MM-DD.{md|json|csv} */
  libraryExportFileNamePrefix: 'stardew-mod-library',
  /** 【新增 R49】IndexedDB 库约定 */
  db: { name: 'stardew-mod-helper', version: 1 },
  /** 不变；token 不入此表 */
  storageKeys: {
    apiKey: 'sdmh.apiKey',
    history: 'sdmh.history',
    theme: 'sdmh.theme',
    lastIds: 'sdmh.lastIds',
  },
} as const;

/** Nexus API v1 与网页端路径生成器（search 已随 R48 删除）。 */
export const apiPath = {
  validate: () => '/users/validate.json',
  modInfo: (modId: number) => `/games/${APP_CONFIG.gameDomain}/mods/${modId}.json`,
  files: (modId: number) => `/games/${APP_CONFIG.gameDomain}/mods/${modId}/files.json`,
  downloadLink: (modId: number, fileId: number) =>
    `/games/${APP_CONFIG.gameDomain}/mods/${modId}/files/${fileId}/download_link.json`,
  filePage: (modId: number, fileId: number) =>
    `${APP_CONFIG.webBaseUrl}/${APP_CONFIG.gameDomain}/mods/${modId}?tab=files&file_id=${fileId}`,
  /** 模组主页（不带 file_id），与 filePage() 并存、互不覆盖 */
  modPage: (modId: number) =>
    `${APP_CONFIG.webBaseUrl}/${APP_CONFIG.gameDomain}/mods/${modId}`,
} as const;
