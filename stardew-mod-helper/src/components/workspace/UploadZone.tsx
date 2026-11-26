import { useRef, type DragEvent } from 'react';
import { APP_CONFIG } from '../../config';
import { useApp } from '../../hooks/useAppState';
import ProgressBar from './ProgressBar';

/** 双上传入口 + 拖放 + 大小预警 + IndexedDB 持久化说明（R33/R34/R44/R47/R49）。 */
export default function UploadZone() {
  const { state, actions } = useApp();
  const folderInput = useRef<HTMLInputElement>(null);
  const singleInput = useRef<HTMLInputElement>(null);
  const busy = state.uploadProgress !== null && state.uploadProgress.phase !== 'done';
  const softMb = Math.round(APP_CONFIG.upload.softLimitBytes / 1024 / 1024);
  const hardMb = Math.round(APP_CONFIG.upload.hardLimitBytes / 1024 / 1024);

  const onFolderDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && !busy) {
      void actions.uploadFolderZip(file);
    }
  };

  const onSingleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0 && !busy) {
      void actions.uploadSingleZips(files);
    }
  };

  return (
    <section className="app-card p-4" aria-label="上传本地模组">
      <h2 className="text-sm font-semibold text-[var(--app-text)]">上传本地模组</h2>
      <p className="mt-1 text-xs leading-relaxed text-[var(--app-muted)]">
        上传你把 Mods 文件夹里所有模组文件夹一起压缩的 zip。工具会按每个顶层文件夹识别为一个模组。
      </p>

      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={onFolderDrop}
        className="mt-3 flex flex-col gap-2 rounded-xl border border-dashed p-3"
        style={{ borderColor: 'var(--app-border)' }}
      >
        <button
          type="button"
          className="primary-btn w-full"
          disabled={busy}
          onClick={() => folderInput.current?.click()}
        >
          上传整个 Mods 文件夹打包的 zip（推荐）
        </button>
        <p className="text-center text-[11px] leading-snug text-[var(--app-muted)]">
          顶层每个模组文件夹会被识别为一个独立模组；也可把 zip 拖到这里
        </p>
        <input
          ref={folderInput}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void actions.uploadFolderZip(file);
            }
            event.target.value = '';
          }}
        />
      </div>

      <details className="mt-3">
        <summary className="tap-target cursor-pointer text-xs font-semibold text-[var(--app-muted)]">
          更多方式：单个模组 zip（可多选）
        </summary>
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={onSingleDrop}
          className="mt-2 flex flex-col gap-2 rounded-xl border border-dashed p-3"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <p className="text-[11px] leading-relaxed text-[var(--app-muted)]">
            适合单个模组单独分发时；每个 zip 视为一个模组，支持同名外层目录。
          </p>
          <button
            type="button"
            className="secondary-btn w-full"
            disabled={busy}
            onClick={() => singleInput.current?.click()}
          >
            选择单个模组 zip
          </button>
          <input
            ref={singleInput}
            type="file"
            multiple
            accept=".zip,application/zip"
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length > 0) {
                void actions.uploadSingleZips(files);
              }
              event.target.value = '';
            }}
          />
        </div>
      </details>

      <p className="mt-3 rounded-xl px-3 py-2 text-[11px] leading-relaxed text-[var(--app-muted)]" style={{ backgroundColor: 'var(--app-surface)' }}>
        单个 zip 超过 {softMb}MB 会提示耗时，超过 {hardMb}MB 需再次确认。模组文件已保存在本机浏览器（IndexedDB），刷新/关闭后仍在；仅当你主动"同步到云端"时才发往你自己的私有仓库。
      </p>
      <ProgressBar progress={state.uploadProgress} />
    </section>
  );
}
