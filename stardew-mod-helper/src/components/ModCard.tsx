import { useState } from 'react';
import { APP_CONFIG } from '../config';
import { useApp } from '../hooks/useAppState';
import type { ParsedMod } from '../types/domain';
import { formatAuthors } from '../utils/format';
import { checkVersionNote } from '../utils/version';
import DownloadActions from './DownloadActions';
import FileList from './FileList';
import PrerequisiteList from './PrerequisiteList';

interface ModCardProps {
  mod: ParsedMod;
  error?: string;
}

/** 单个模组卡片：概览、标签、文件选择、前置列表与下载操作。 */
export default function ModCard({ mod, error }: ModCardProps) {
  const { state, actions } = useApp();
  const [showFiles, setShowFiles] = useState(mod.files.length > 1);
  const [imageFailed, setImageFailed] = useState(false);
  const selectedFileId = state.selectedFiles[mod.modId] ?? mod.mainFile?.file_id ?? 0;
  const includeChinese = state.includeChinese[mod.modId] ?? false;
  const modPageUrl = `${APP_CONFIG.webBaseUrl}/${APP_CONFIG.gameDomain}/mods/${mod.modId}`;
  const selectedFile = mod.files.find((file) => file.file_id === selectedFileId);
  const versionNote = checkVersionNote(selectedFile?.game_version) ?? mod.versionNote;

  return (
    <article className="app-card p-4" aria-label={`模组 ${mod.meta.name}`}>
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs leading-relaxed text-rose-400"
        >
          加载失败：{error}
        </p>
      )}

      <div className="flex gap-3">
        {mod.meta.picture_url && !imageFailed ? (
          <img
            src={mod.meta.picture_url}
            alt={`${mod.meta.name} 预览图`}
            onError={() => setImageFailed(true)}
            loading="lazy"
            className="h-24 w-24 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-xl bg-brand-500/10 text-brand-500"
          >
            {/* 田园风幼苗占位：单色低透明，替换 v1 像素游戏机 */}
            <svg
              viewBox="0 0 48 48"
              className="h-9 w-9 opacity-60"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M24 40V22" strokeLinecap="round" />
              <path d="M24 26c-8 0-13-5-13-13 8 0 13 5 13 13Z" strokeLinejoin="round" />
              <path d="M24 30c8 0 13-5 13-13-8 0-13 5-13 13Z" strokeLinejoin="round" />
            </svg>
            <span className="text-[10px] opacity-70">暂无预览图</span>
          </span>
        )}

        <div className="min-w-0 flex-1">
          {/* 名称独立成行 */}
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-[var(--app-text)]">
              {mod.meta.name}
            </h3>
            <a
              href={modPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="tap-target flex h-9 shrink-0 items-center rounded-lg px-1 text-[11px] font-medium text-brand-500"
              aria-label={`在 N 网查看 ${mod.meta.name}`}
            >
              N 网 ↗
            </a>
          </div>
          {/* 作者独立成行，带小图标，复用 formatAuthors */}
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--app-muted)]">
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <circle cx="12" cy="8" r="3.2" />
              <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" strokeLinecap="round" />
            </svg>
            <span className="min-w-0 truncate">{formatAuthors(mod.meta.authors)}</span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">版本 {mod.meta.version || '—'}</span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">ID {mod.modId}</span>
          </p>
          {/* 摘要：浅底圆角区块，仍为纯文本（不做 BBCode 富文本） */}
          <p
            className="mt-2 line-clamp-2 rounded-xl px-3 py-2 text-xs leading-relaxed text-[var(--app-muted)]"
            style={{ backgroundColor: 'var(--app-surface-raised)' }}
          >
            {mod.plainSummary || '该模组暂无简介。'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {mod.mainFile && (
          <span className="chip chip--main">主文件 · {mod.mainFile.version}</span>
        )}
        {mod.chineseFiles.length > 0 && (
          <span className="chip chip--chinese">汉化可用 · {mod.chineseFiles.length}</span>
        )}
        {mod.prerequisites.length > 0 && (
          <span className="chip chip--prereq">需前置 {mod.prerequisites.length} 项</span>
        )}
        {mod.isChineseTranslation && (
          <span className="chip chip--chinese">汉化模组</span>
        )}
        {versionNote && (
          <span
            role="status"
            className="chip chip--version flex w-full text-left leading-relaxed"
          >
            {versionNote}
          </span>
        )}
      </div>

      {mod.files.length > 0 && (
        <button
          type="button"
          onClick={() => setShowFiles((previous) => !previous)}
          aria-expanded={showFiles}
          aria-label={showFiles ? '收起文件列表' : `展开 ${mod.files.length} 个文件`}
          className="tap-target mt-3 flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold text-[var(--app-text)]"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <span className="flex-1">
            文件列表 · {mod.files.length}
            <span className="ml-2 font-normal text-[var(--app-muted)]">
              {selectedFileId > 0 ? `已选 ${selectedFileId}` : '尚未选择'}
            </span>
          </span>
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 transition-transform ${showFiles ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {showFiles && (
        <FileList
          mod={mod}
          selectedFileId={selectedFileId}
          includeChinese={includeChinese}
          onSelect={(fileId) => actions.selectFile(mod.modId, fileId)}
          onToggleChinese={() => actions.toggleChinese(mod.modId)}
        />
      )}

      <PrerequisiteList items={mod.prerequisites} />
      <DownloadActions modId={mod.modId} />
    </article>
  );
}
