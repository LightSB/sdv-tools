import { formatDate, formatFileSize } from '../utils/format';
import type { ParsedMod } from '../types/domain';

interface FileListProps {
  mod: ParsedMod;
  selectedFileId: number;
  includeChinese: boolean;
  onSelect: (fileId: number) => void;
  onToggleChinese: () => void;
}

/** 文件清单：单选文件、汉化高亮与「一起下载」勾选。 */
export default function FileList({
  mod,
  selectedFileId,
  includeChinese,
  onSelect,
  onToggleChinese,
}: FileListProps) {
  const chineseIds = new Set(mod.chineseFiles.map((file) => file.file_id));
  const primaryId = mod.mainFile?.file_id;

  if (mod.files.length === 0) {
    return (
      <p className="mt-3 rounded-xl border border-dashed px-3 py-6 text-center text-xs text-[var(--app-muted)]" style={{ borderColor: 'var(--app-border)' }}>
        该模组暂无可下载文件
      </p>
    );
  }

  return (
    <div className="mt-3" role="radiogroup" aria-label={`${mod.meta.name} 的文件列表`}>
      <div className="mb-2 flex items-center justify-between text-[11px] text-[var(--app-muted)]">
        <span>文件名 / 版本 / 分类 / 大小 / 时间</span>
        <span>共 {mod.files.length} 个文件</span>
      </div>
      <div className="space-y-2">
        {mod.files.map((file) => {
          const selected = file.file_id === selectedFileId;
          const isChinese = chineseIds.has(file.file_id);
          const isPrimary = file.file_id === primaryId || file.is_primary;

          return (
            <div key={file.file_id} className="flex gap-2">
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`选择文件 ${file.file_name}，版本 ${file.version}，${formatFileSize(file.size_kb)}`}
                onClick={() => onSelect(file.file_id)}
                className={`tap-target min-w-0 flex-1 rounded-xl border p-3 text-left transition ${
                  selected
                    ? 'border-brand-500 bg-brand-500/10'
                    : isChinese
                      ? 'border-accent-400/50 bg-accent-400/5'
                      : ''
                }`}
                style={!selected && !isChinese ? { borderColor: 'var(--app-border)' } : undefined}
              >
                <div className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                      selected ? 'border-brand-500 bg-brand-500' : 'border-current opacity-50'
                    }`}
                  >
                    {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-[var(--app-text)]">
                        {file.file_name}
                      </span>
                      {isPrimary && <span className="chip bg-sky-500/15 text-sky-400">主文件</span>}
                      {isChinese && <span className="chip bg-accent-400/15 text-accent-400">汉化</span>}
                    </p>
                    <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-[var(--app-muted)] sm:grid-cols-4">
                      <span className="truncate">版本 {file.version || '—'}</span>
                      <span className="truncate">{file.category_name || '未分类'}</span>
                      <span>{formatFileSize(file.size_kb)}</span>
                      <span className="truncate">{formatDate(file.uploaded_at)}</span>
                    </div>
                  </div>
                </div>
              </button>

              {isChinese && (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={includeChinese}
                  aria-label={`${includeChinese ? '取消' : '选择'}与 ${file.file_name} 一起下载汉化`}
                  onClick={onToggleChinese}
                  className={`tap-target flex w-[62px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border text-[10px] font-medium transition ${
                    includeChinese
                      ? 'border-accent-400 bg-accent-400/15 text-accent-400'
                      : 'text-[var(--app-muted)]'
                  }`}
                  style={!includeChinese ? { borderColor: 'var(--app-border)' } : undefined}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                      includeChinese ? 'border-accent-400 bg-accent-400 text-slate-900' : 'border-current'
                    }`}
                  >
                    {includeChinese ? '✓' : ''}
                  </span>
                  一起下载
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
