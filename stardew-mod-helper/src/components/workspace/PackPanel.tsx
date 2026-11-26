import { useState } from 'react';
import { useApp } from '../../hooks/useAppState';
import type { LocalMod } from '../../types/workspace';
import { formatFileSize } from '../../utils/format';
import { computeStats } from '../../utils/fsTree';
import ProgressBar from './ProgressBar';

interface PackPanelProps {
  onGoLocal: () => void;
}

/** 分段③：只保留"打包所选"+二次确认+进度（R43/R44；待下载清单随 R48 删除）。 */
export default function PackPanel({ onGoLocal }: PackPanelProps) {
  const { state, actions } = useApp();
  const [confirming, setConfirming] = useState(false);
  const selectedIds = new Set(state.selectedPackIds);
  const selectedMods: LocalMod[] = state.localMods.filter(
    (mod) => selectedIds.has(mod.id) && mod.fileTree.some((node) => node.kind === 'file'),
  );
  const totalFiles = selectedMods.reduce((sum, mod) => sum + computeStats(mod.fileTree).fileCount, 0);
  const totalSize = selectedMods.reduce((sum, mod) => sum + mod.totalSize, 0);
  const busy = state.packProgress !== null && state.packProgress.phase !== 'done';

  const confirmPack = (): void => {
    setConfirming(false);
    void actions.packSelected();
  };

  return (
    <section className="app-card p-4" aria-label="打包所选">
      <h2 className="text-sm font-semibold text-[var(--app-text)]">打包所选</h2>
      <p className="mt-1 text-xs leading-relaxed text-[var(--app-muted)]">
        仅打包已勾选的本地模组，编辑后的文件树层级会原样保留。模组文件全程在本地处理，刷新后仍在本机浏览器中。
      </p>
      <p className="mt-2 text-[11px] text-[var(--app-muted)]">
        已选 {selectedMods.length} 个模组 · {totalFiles} 个文件 · {formatFileSize(totalSize / 1024)}
      </p>
      {selectedMods.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {selectedMods.map((mod) => (
            <li key={mod.id} className="chip chip--prereq">{mod.name}</li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="secondary-btn flex-1 text-xs" onClick={onGoLocal}>
          去勾选模组
        </button>
        <button
          type="button"
          className="primary-btn flex-1 text-xs"
          disabled={selectedMods.length === 0 || busy}
          onClick={() => setConfirming(true)}
        >
          打包所选
        </button>
      </div>

      {confirming && (
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }} role="dialog" aria-label="确认打包">
          <p className="text-xs font-semibold text-[var(--app-text)]">确认打包以下模组？</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--app-muted)]">
            {selectedMods.map((mod) => mod.name).join('、')} · 共 {selectedMods.length} 个模组 /{' '}
            {totalFiles} 个文件 / {formatFileSize(totalSize / 1024)}。解压后把文件夹放进游戏的 Mods 目录即可使用。
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" className="secondary-btn flex-1 text-xs" onClick={() => setConfirming(false)}>
              取消
            </button>
            <button type="button" className="primary-btn flex-1 text-xs" onClick={confirmPack}>
              确认打包
            </button>
          </div>
        </div>
      )}

      <ProgressBar progress={state.packProgress} />
    </section>
  );
}
