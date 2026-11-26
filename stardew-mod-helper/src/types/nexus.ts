/**
 * Nexus API v1 返回 DTO。
 * 字段名与 API 返回保持一致（snake_case），本层不做重命名。
 * v4：搜索相关 DTO 已整体移除，R48 搜索语义已删除。
 */

export interface NexusAuthor {
  user_id: number;
  name: string;
}

/** GET /users/validate.json */
export interface ValidateResponse {
  user_id: number;
  key: string;
  name: string;
  is_premium: boolean;
  is_supporter: boolean;
  profile_url?: string;
}

/** GET /games/{game}/mods/{modId}.json */
export interface Mod {
  mod_id: number;
  game_id: number;
  name: string;
  version: string | null;
  created_at: string;
  updated_at: string;
  issued_at?: string;
  authors: NexusAuthor[];
  summary: string;
  description: string;
  picture_url: string | null;
  category_name?: string;
  downloads?: number;
  endorsements?: number;
  uploaded_by?: string;
  available?: boolean;
  [key: string]: unknown;
}

/** GET /games/{game}/mods/{modId}/files.json -> ModFile[] */
export interface ModFile {
  file_id: number;
  file_name: string;
  version: string;
  category_name: string;
  is_primary: boolean;
  size_kb: number;
  uploaded_at: string;
  uploaded_by?: string;
  description?: string;
  downloads?: number;
  game_version?: string[] | string | null;
  content_localized?: string[] | null;
  [key: string]: unknown;
}

/** GET .../files/{fileId}/download_link.json -> DownloadLink[] */
export interface DownloadLink {
  URI: string;
  name?: string;
  short_name?: string;
}
