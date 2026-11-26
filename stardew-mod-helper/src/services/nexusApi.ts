import { APP_CONFIG, apiPath } from '../config';
import type { KeyValidationResult, PremiumTier } from '../types/domain';
import type {
  DownloadLink,
  Mod,
  ModFile,
  ValidateResponse,
} from '../types/nexus';
import { NexusApiError } from '../utils/errors';

/**
 * 统一 fetch 封装：拼 URL、注入 apikey / Application-* 头、错误归一化。
 * path 必须以 '/' 开头且由 apiPath() 生成；endpoint 中不含密钥。
 */
export async function request<T>(
  path: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<T> {
  if (typeof path !== 'string' || !path.startsWith('/')) {
    throw new NexusApiError('内部错误：API 路径格式不正确', 0, String(path));
  }

  const url = `${APP_CONFIG.apiBaseUrl}${path.slice(1)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: apiKey,
        'Application-Name': APP_CONFIG.applicationName,
        'Application-Version': APP_CONFIG.applicationVersion,
        Accept: 'application/json',
      },
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new NexusApiError('网络异常，请检查连接', 0, path);
  }

  if (!response.ok) {
    throw new NexusApiError(`请求失败（HTTP ${response.status}）`, response.status, path);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new NexusApiError('服务器返回了无法解析的内容', response.status, path);
  }
}

/** 校验 Key：无效 Key 返回 valid:false 而非抛错；网络异常抛 NexusApiError。 */
export async function validateKey(apiKey: string): Promise<KeyValidationResult> {
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    return {
      valid: false,
      tier: 'standard',
      userName: null,
      message: '请先填写 API Key',
    };
  }

  try {
    const data = await request<ValidateResponse>(apiPath.validate(), apiKey.trim());
    const tier: PremiumTier = Boolean(data.is_premium) ? 'premium' : 'standard';
    const userName = typeof data.name === 'string' && data.name.trim().length > 0 ? data.name.trim() : null;
    return {
      valid: true,
      tier,
      userName,
      message:
        tier === 'premium'
          ? '密钥有效 · Premium 用户，可一键直下'
          : '密钥有效 · 标准用户，下载将降级为手动方式',
    };
  } catch (error) {
    if (error instanceof NexusApiError && error.status === 401) {
      return {
        valid: false,
        tier: 'standard',
        userName: null,
        message: 'API Key 无效或已过期，请检查后重试',
      };
    }
    throw error;
  }
}

/** 获取模组元数据。 */
export async function fetchModInfo(modId: number, apiKey: string): Promise<Mod> {
  return request<Mod>(apiPath.modInfo(modId), apiKey);
}

/** 获取文件列表；异常返回结构时回退为空数组。 */
export async function fetchFiles(modId: number, apiKey: string): Promise<ModFile[]> {
  const files = await request<ModFile[]>(apiPath.files(modId), apiKey);
  return Array.isArray(files) ? files : [];
}

/**
 * 生成下载直链。
 * 调用契约：仅当 tier === 'premium' 时由 DownloadService 调用；
 * 本函数不校验 tier，Premium 守卫由 buildDownloadPlan() 与 DownloadService 双重保证。
 * 非 Premium 路径绝不可触达此函数。
 */
export async function getDownloadLink(
  modId: number,
  fileId: number,
  apiKey: string,
): Promise<string> {
  const path = apiPath.downloadLink(modId, fileId);
  const links = await request<DownloadLink[]>(path, apiKey);
  if (!Array.isArray(links) || links.length === 0 || typeof links[0]?.URI !== 'string' || links[0].URI.length === 0) {
    throw new NexusApiError('未获取到可用的下载直链', 0, path);
  }
  return links[0].URI;
}
