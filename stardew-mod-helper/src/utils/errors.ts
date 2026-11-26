/**
 * 带状态码与端点的 API 错误。
 * 约定：message / endpoint 中绝不出现 apiKey。
 */
export class NexusApiError extends Error {
  readonly status: number;
  readonly endpoint: string;

  constructor(message: string, status: number, endpoint: string) {
    super(message);
    this.name = 'NexusApiError';
    this.status = status;
    this.endpoint = endpoint;
    Object.setPrototypeOf(this, NexusApiError.prototype);
  }
}

/** 兜底脱敏：移除可能被拼进错误文本的 key 形态字符串。 */
function redact(text: string): string {
  return text
    .replace(/apikey\s*[:=]\s*\S+/gi, 'apikey=***')
    .replace(/\b[0-9a-f]{32,}\b/gi, '***');
}

/** 把任意异常转成面向用户的中文文案，且绝不回显密钥。 */
export function formatError(err: unknown): string {
  if (err instanceof NexusApiError) {
    switch (err.status) {
      case 401:
        return 'API Key 无效或已过期，请重新校验';
      case 403:
        return '没有权限访问该资源';
      case 429:
        return '请求过于频繁，请稍后重试';
      default:
        if (err.status >= 500) {
          return 'N 网服务暂时不可用，请稍后重试';
        }
        if (err.status === 0) {
          return redact(err.message) || '网络异常，请检查连接';
        }
        return `请求失败（HTTP ${err.status}）`;
    }
  }

  if (err instanceof Error) {
    const message = redact(err.message).trim();
    if (/failed to fetch|networkerror|load failed|network request failed|timeout/i.test(message)) {
      return '网络异常，请检查连接后重试';
    }
    return message || '发生未知错误，请稍后重试';
  }

  const fallback = redact(String(err)).trim();
  return fallback || '发生未知错误，请稍后重试';
}
