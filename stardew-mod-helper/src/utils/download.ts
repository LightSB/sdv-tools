/** 用临时 <a> 触发浏览器下载；跨域直链由浏览器按自身策略处理。 */
export function triggerBrowserDownload(url: string, filename?: string): void {
  if (typeof url !== 'string' || url.length === 0) {
    return;
  }
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = typeof filename === 'string' ? filename : '';
  anchor.rel = 'noopener noreferrer';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** 新窗口打开 N 网文件页；被弹窗拦截时降级为当前页跳转。 */
export function openFilePage(url: string): void {
  if (typeof url !== 'string' || url.length === 0) {
    return;
  }
  const opened = window.open(url, '_blank', 'noopener');
  if (!opened) {
    window.location.href = url;
  }
}

/** 复制文本：优先 Clipboard API，失败后用 textarea + execCommand 兜底。 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof text !== 'string' || text.length === 0) {
    return false;
  }

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 继续走兜底路径
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}
