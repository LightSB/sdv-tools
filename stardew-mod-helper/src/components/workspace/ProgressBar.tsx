import type { ProgressInfo } from '../../types/workspace';

const phaseLabels: Record<ProgressInfo['phase'], string> = {
  reading: '读取文件',
  unzip: '解压文件',
  manifest: '解析 manifest',
  checking: '检测更新',
  packing: '打包文件',
  syncing: '同步云端',
  done: '完成',
};

/** 通用阶段进度条：读取 ProgressInfo 的 phase/current/total（R44）。 */
export default function ProgressBar({ progress }: { progress: ProgressInfo | null }) {
  if (!progress) {
    return null;
  }
  const total = progress.total > 0 ? progress.total : 1;
  const current = Math.max(0, Math.min(progress.current, total));
  const percent = Math.round((current / total) * 100);

  return (
    <div className="app-card mt-3 p-3" role="status" aria-label={`${phaseLabels[progress.phase]}进度`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0 truncate font-semibold text-[var(--app-text)]">
          {progress.message ?? phaseLabels[progress.phase]}
        </span>
        <span className="shrink-0 text-[var(--app-muted)]">
          {current}/{total} · {percent}%
        </span>
      </div>
      <div
        className="progress-track mt-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
