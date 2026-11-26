import { useApp } from '../hooks/useAppState';

const DOWNGRADE_HINT = 'N 网 Premium 用户可一键直链下载';

/** 下载操作区：Premium 一键直下；标准用户降级为「打开网页 / 复制链接」双按钮。 */
export default function DownloadActions({ modId }: { modId: number }) {
  const { state, actions } = useApp();
  const isPremium = state.keyStatus === 'valid' && state.tier === 'premium';
  const disabled = state.keyStatus !== 'valid';

  if (isPremium) {
    return (
      <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--app-border)' }}>
        <button
          type="button"
          onClick={() => void actions.download(modId)}
          disabled={disabled}
          className="primary-btn w-full"
          aria-label={`一键下载模组 ${modId}`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          一键下载
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--app-border)' }}>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void actions.download(modId, 'open')}
          disabled={disabled}
          className="primary-btn w-full px-3"
          aria-label={`打开模组 ${modId} 的 N 网文件页手动下载`}
        >
          打开 N 网下载
        </button>
        <button
          type="button"
          onClick={() => void actions.download(modId, 'copy')}
          disabled={disabled}
          className="secondary-btn w-full px-3"
          aria-label={`复制模组 ${modId} 的下载链接`}
        >
          复制链接
        </button>
      </div>
      <p className="mt-2 text-center text-[11px] text-[var(--app-muted)]" role="status">
        {DOWNGRADE_HINT}
      </p>
    </div>
  );
}
