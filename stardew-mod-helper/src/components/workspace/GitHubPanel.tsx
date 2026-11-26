import { useApp } from '../../hooks/useAppState';
import { formatFileSize } from '../../utils/format';
import EmptyState from '../ui/EmptyState';
import ProgressBar from './ProgressBar';
import GitHubSetupGuide from './GitHubSetupGuide';

/** 云端模组列表 + 全手动同步/拉取/删除 + 冲突二选一 + API 限制提示（R49/Q2/Q3/Q5）。 */
export default function GitHubPanel() {
  const { state, actions } = useApp();
  const busy = state.syncBusy;
  const folders = new Set(
    state.localMods.map((mod) => mod.cloudFolderName || mod.rootFolder || mod.name),
  );

  return (
    <section className="space-y-4" aria-label="GitHub 云端同步">
      <GitHubSetupGuide />

      <div className="app-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--app-text)]">云端模组（{state.cloudMods.length}）</h3>
          <button
            type="button"
            className="secondary-btn text-xs"
            disabled={busy || state.github.status !== 'connected'}
            onClick={() => void actions.refreshCloudMods()}
          >
            刷新云端列表
          </button>
        </div>
        <p className="mt-2 rounded-xl px-3 py-2 text-[11px] leading-relaxed text-[var(--app-muted)]" style={{ backgroundColor: 'var(--app-surface)' }}>
          同步全手动：只有点「同步到云端」才会把模组文件发往你自己的私有仓库。GitHub Contents API 单文件上限 100MB、目录上限 1000 文件，超限文件会被预警并跳过。
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="primary-btn flex-1 text-xs"
            disabled={busy || state.localMods.length === 0 || state.github.status !== 'connected'}
            onClick={() => void actions.syncToCloud()}
          >
            同步到云端
          </button>
          <button
            type="button"
            className="secondary-btn flex-1 text-xs"
            disabled={busy || state.cloudMods.length === 0 || state.github.status !== 'connected'}
            onClick={() => void actions.pullFromCloud()}
          >
            从云端拉取
          </button>
        </div>

        {state.cloudMods.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="云端列表还是空的"
              description="连接私有仓库后点「刷新云端列表」，或先把本地模组同步到云端。"
            />
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {state.cloudMods.map((ref) => {
              const linked = ref.localModId !== null && folders.has(ref.folderName);
              return (
                <li key={ref.folderName} className="rounded-xl border p-3" style={{ borderColor: 'var(--app-border)' }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-[var(--app-text)]">{ref.folderName}</p>
                      <p className="mt-1 text-[11px] text-[var(--app-muted)]">
                        {ref.fileCount} 个文件 · {formatFileSize(ref.totalSize / 1024)} · {linked ? '已在本地' : '未在本地'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="secondary-btn text-xs"
                        disabled={busy}
                        onClick={() => void actions.pullFromCloud([ref.folderName])}
                      >
                        拉取
                      </button>
                      <button
                        type="button"
                        className="secondary-btn text-xs"
                        disabled={busy}
                        onClick={() => void actions.deleteCloudMod(ref.folderName)}
                        aria-label={`删除云端 ${ref.folderName}`}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <ProgressBar progress={state.syncProgress} />
      </div>

      {/* Q3：冲突二选一；未选择前不写入任一侧，取消保留现状。 */}
      {state.conflict && (
        <div className="modal-mask" role="dialog" aria-modal="true" aria-label="云端同步冲突">
          <div className="app-card w-full max-w-md p-5">
            <h3 className="text-sm font-semibold text-[var(--app-text)]">发现冲突：本地与云端都改过</h3>
            <p className="mt-2 text-xs leading-relaxed text-[var(--app-text)]">
              本地改动时间：{state.conflict.localModifiedAt}
              <br />
              云端改动时间：{state.conflict.remoteModifiedAt || '未知'}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--app-muted)]">
              模组目录：{state.conflict.folderName}。请选择一侧覆盖另一侧，不会自动合并。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="primary-btn flex-1 text-xs"
                onClick={() => void actions.resolveConflict('local')}
              >
                以本地覆盖云端
              </button>
              <button
                type="button"
                className="secondary-btn flex-1 text-xs"
                onClick={() => void actions.resolveConflict('remote')}
              >
                以云端覆盖本地
              </button>
            </div>
            <button
              type="button"
              className="secondary-btn mt-2 w-full text-xs"
              onClick={actions.dismissConflict}
              aria-label="取消冲突处理并保持现状"
            >
              取消（保持现状）
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
