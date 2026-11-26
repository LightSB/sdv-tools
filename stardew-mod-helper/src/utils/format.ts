import type { NexusAuthor } from '../types/nexus';

/** KB → 人可读文件大小。 */
export function formatFileSize(sizeKb: number): string {
  if (!Number.isFinite(sizeKb) || sizeKb < 0) {
    return '—';
  }
  if (sizeKb < 1024) {
    return `${sizeKb.toFixed(sizeKb < 10 ? 1 : 0)} KB`;
  }
  const megabytes = sizeKb / 1024;
  if (megabytes < 1024) {
    return `${megabytes.toFixed(1)} MB`;
  }
  return `${(megabytes / 1024).toFixed(2)} GB`;
}

/** ISO 8601 → 本地化短日期时间。 */
export function formatDate(iso: string): string {
  if (typeof iso !== 'string' || iso.length === 0) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/** 作者数组 → 展示文案（超过 2 位折叠为「等」）。 */
export function formatAuthors(authors: NexusAuthor[]): string {
  if (!Array.isArray(authors) || authors.length === 0) {
    return '未知作者';
  }
  const names = authors
    .map((author) => (typeof author?.name === 'string' ? author.name.trim() : ''))
    .filter((name) => name.length > 0);
  if (names.length === 0) {
    return '未知作者';
  }
  if (names.length <= 2) {
    return names.join(' · ');
  }
  return `${names.slice(0, 2).join(' · ')} 等 ${names.length} 人`;
}
