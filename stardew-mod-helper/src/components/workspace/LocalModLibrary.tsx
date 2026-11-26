import { useMemo, useState } from 'react';
import { APP_CONFIG } from '../../config';
import { useApp } from '../../hooks/useAppState';
import type { ExportFormat } from '../../services/exportService';
import type { LocalMod, UpdateStatus } from '../../types/workspace';
import { formatFileSize } from '../../utils/format';
import EmptyState from '../ui/EmptyState';
import Skeleton from '../ui/Skeleton';
import FileTreeExplorer from './FileTreeExplorer';
import GitHubPanel from './GitHubPanel';
import IdAutoSelect from './IdAutoSelect';
import LocalModCard from './LocalModCard';
import UploadZone from './UploadZone';

type SortMode = 'name' | 'status';
const statusOrder: Record<UpdateStatus, number> = { outdated: 0, unknown: 1, latest: 2 };

interface LocalModLibraryProps {
  onGoPack: () => void;
}

/** 分段①：上传 + 排序 + 检测全部 + ID 勾选 / 导出 / 清空 / GitHub + 500MB 软提示（R36/R37/R45/R51/R53/Q9）。 */
export default function LocalModLibrary({ onGoPack }: LocalModLibraryProps) {
  const { state, actions } = useApp();
  const [sort, setSort] = useState<SortMode>('name');
  const [showIds, setShowIds] = useState(false);
  const [showGitHub, setShowGitHub] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('md');

  const sorted = useMemo<LocalMod[]>(
    () =>
      [...state.localMods].sort((a, b) =>
        sort === 'name'
          ? a.name.localeCompare(b.name, 'zh-CN')
          : statusOrder[a.updateStatus] - statusOrder[b.updateStatus] ||
            a.name.localeCompare(b.name, 'zh-CN'),
      ),
    [sort, state.localMods],
  );
  const checking = state.checkingIds.length > 0;
  const totalSize = state.localMods.reduce((sum, mod) => sum + mod.totalSize, 0);
  const overSoftLimit = totalSize > APP_CONFIG.librarySoftLimitBytes;

  return (
    <div className="space-y-4">
      <UploadZone />

      {state.explorer.modId !== null ? (
        <FileTreeExplorer />
      ) : (
        <section className="app-card p-4" aria-label="本地模组库">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--app-text)]">本地模组库</h2>
            <p className="text-[11px] text-[var(--app-muted)]">
              共 {state.localMods.length} 个模组 · {formatFileSize(totalSize / 1024)} · 已勾选{' '}
              {state.selectedPackIds.length} 个
            </p>
          </div>

          {overSoftLimit && (
            <div
              role="status"
              className="mt-3 rounded-xl px-3 py-2 text-[11px] leading-relaxed text-[var(--app-muted)]"
              style={{ backgroundColor: 'var(--app-surface)' }}
            >
              本地库已超过 500MB，可能占用较多设备存储。可导出清单后清空本地库；云端同步仍由你手动决定。
            </div>
          )}

          {!state.libraryHydrated ? (
            <div className="mt-3">
              <Skeleton count={2} />
            </div>
          ) : (
            <>
              {state.localMods.length > 0 && (
                <>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="primary-btn flex-1 text-xs"
                      disabled={checking}
                      onClick={() => void actions.checkUpdates(false)}
                    >
                      检测全部
                    </button>
                    <button
                      type="button"
                      className="secondary-btn flex-1 text-xs"
                      disabled={state.selectedPackIds.length === 0}
                      onClick={onGoPack}
                    >
                      打包所选
                    </button>
                    <button
                      type="button"
                      className="secondary-btn text-xs"
                      onClick={() => setSort(sort === 'name' ? 'status' : 'name')}
                      aria-label={`当前按${sort === 'name' ? '名称' : '状态'}排序，点击切换`}
                    >
                      {sort === 'name' ? '名称 A–Z' : '状态优先'}
                    </button>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className="secondary-btn text-xs" onClick={() => setShowIds((v) => !v)}>
                      按 ID 勾选
                    </button>
                    <select
                      value={exportFormat}
                      onChange={(event) => setExportFormat(event.target.value as ExportFormat)}
                      aria-label="导出清单格式"
                      className="tap-target rounded-xl border px-2 text-xs text-[var(--app-text)]"
                      style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
                    >
                      <option value="md">MD</option>
                      <option value="json">JSON</option>
                      <option value="csv">CSV</option>
                    </select>
                    <button
                      type="button"
                      className="secondary-btn text-xs"
                      onClick={() => actions.exportLibrary(exportFormat)}
                    >
                      导出清单
                    </button>
                    <button
                      type="button"
                      className="secondary-btn text-xs"
                      onClick={() => setShowGitHub((v) => !v)}
                    >
                      GitHub 同步
                    </button>
                    <button type="button" className="secondary-btn text-xs" onClick={actions.clearLocalLibrary}>
                      清空本地库
                    </button>
                  </div>
                </>
              )}

              {showIds && (
                <div className="mt-3">
                  <IdAutoSelect />
                </div>
              )}
              {showGitHub && (
                <div className="mt-3">
                  <GitHubPanel />
                </div>
              )}

              {state.localMods.length === 0 ? (
                <div className="mt-3">
                  <EmptyState
                    title="本地模组库还是空的"
                    description="上传 Mods 文件夹打包的 zip 开始管理。模组文件已保存在本机浏览器（IndexedDB），刷新后仍在。"
                  />
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {sorted.map((mod) => (
                    <LocalModCard key={mod.id} mod={mod} />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
