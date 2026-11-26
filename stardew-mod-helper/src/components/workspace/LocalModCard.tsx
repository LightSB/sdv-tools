import { apiPath } from '../../config';
import { useApp } from '../../hooks/useAppState';
import type { LocalMod } from '../../types/workspace';
import { formatFileSize } from '../../utils/format';

const statusMeta = {
  latest: { label: '已是最新版', className: 'chip chip--main' },
  outdated: { label: '有新版本', className: 'chip chip--version' },
  unknown: { label: '无法检测', className: 'chip chip--muted' },
} as const;

const syncMeta = {
  'local-only': { label: '仅本地', className: 'chip chip--muted' },
  synced: { label: '已同步', className: 'chip chip--main' },
  'local-ahead': { label: '待同步', className: 'chip chip--version' },
  'remote-ahead': { label: '云端较新', className: 'chip chip--version' },
  conflict: { label: '待同步', className: 'chip chip--version' },
  error: { label: '同步异常', className: 'chip chip--error' },
} as const;

interface LocalModCardProps {
  mod: LocalMod;
}

/** 单模组卡片：文件夹卡片 + 进入浏览；勾选独立；状态文案极简（R50/R52/Q7）。 */
export default function LocalModCard({ mod }: LocalModCardProps) {
  const { state, actions } = useApp();
  const selected = state.selectedPackIds.includes(mod.id);
  const checking = state.checkingIds.includes(mod.id);
  const status = statusMeta[mod.updateStatus];
  const sync = syncMeta[mod.syncStatus];
  const primaryModId = mod.nexusModIds[0] ?? null;

  const openModPage = (modId: number): void => {
    window.open(apiPath.modPage(modId), '_blank', 'noopener');
  };

  return (
    <article className="app-card p-4" aria-label={`本地模组 ${mod.name}`}>
      <div className="flex flex-wrap items-start gap-2">
        <label className="tap-target flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-1 text-xs text-[var(--app-muted)]">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-600"
            checked={selected}
            disabled={mod.fileCount === 0}
            onChange={() => actions.togglePackSelect(mod.id)}
            aria-label={`勾选 ${mod.name} 用于打包`}
          />
          打包
        </label>
        <button
          type="button"
          className="tap-target min-w-0 flex-1 rounded-xl px-2 py-1 text-left"
          onClick={() => actions.openFolder(mod.id)}
          aria-label={`进入浏览 ${mod.name}`}
        >
          <span className="block truncate text-sm font-semibold text-[var(--app-text)]">📁 {mod.name}</span>
          <span className="mt-1 block text-[11px] text-[var(--app-muted)]">
            {mod.fileCount} 个文件 · {formatFileSize(mod.totalSize / 1024)} · 目录 {mod.rootFolder || mod.cloudFolderName || '—'}
          </span>
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className={status.className}>
          {status.label}
          {mod.updateStatus === 'outdated' && mod.updateInfo ? ` v${mod.updateInfo.version}` : ''}
        </span>
        <span className={sync.className}>{sync.label}</span>
        {checking && (
          <span className="chip chip--muted" role="status">
            <svg viewBox="0 0 24 24" className="h-3 w-3 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
            </svg>
            检测中
          </span>
        )}
      </div>

      {/* Q7：latest/outdated 不渲染 checkError；unknown 仅一行简短原因，无灰底块 */}
      {mod.updateStatus === 'unknown' && mod.checkError.length > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--app-muted)]">{mod.checkError}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="secondary-btn flex-1 text-xs"
          disabled={checking}
          onClick={() => void actions.checkOneUpdate(mod.id)}
        >
          更新检测
        </button>
        {primaryModId !== null && (
          <button
            type="button"
            className="secondary-btn flex-1 text-xs"
            onClick={() => openModPage(primaryModId)}
          >
            {mod.updateStatus === 'outdated' ? '查看新版本' : '打开 N 网'}
          </button>
        )}
        <button
          type="button"
          className="secondary-btn text-xs"
          onClick={() => actions.removeLocalMod(mod.id)}
          aria-label={`移除 ${mod.name}`}
        >
          移除
        </button>
      </div>
    </article>
  );
}
