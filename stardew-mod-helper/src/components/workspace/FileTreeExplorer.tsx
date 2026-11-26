import { useMemo, useRef, useState } from 'react';
import { useApp } from '../../hooks/useAppState';
import type { FSTreeNode } from '../../types/workspace';
import { formatFileSize } from '../../utils/format';
import { triggerBrowserDownload } from '../../utils/download';
import { isTextFile, listChildren, textPreview, type TextPreview } from '../../utils/fsTree';
import EmptyState from '../ui/EmptyState';
import Breadcrumb from './Breadcrumb';

interface PreviewState {
  title: string;
  isText: boolean;
  preview: string;
  truncated: boolean;
  /** 二进制文件的下载/删除目标 */
  node: FSTreeNode | null;
}

/** 文件夹树浏览主体：逐级浏览 + 增删改名 + 文本预览（Q6 只读，无在线编辑入口）。 */
export default function FileTreeExplorer() {
  const { state, actions } = useApp();
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const { modId, path } = state.explorer;
  const mod = state.localMods.find((item) => item.id === modId);
  const children = useMemo<FSTreeNode[]>(
    () => (mod ? listChildren(mod.fileTree, path) : []),
    [mod, path],
  );
  const parentId: string | null = path.length > 0 ? path[path.length - 1] : null;

  if (!mod) {
    return null;
  }

  const openNode = async (node: FSTreeNode): Promise<void> => {
    if (node.kind === 'dir') {
      actions.navigateInto(node.nodeId);
      return;
    }
    if (!node.data) {
      return;
    }
    if (!isTextFile(node.name, node.mime ?? node.data.type)) {
      setPreview({ title: node.name, isText: false, preview: '', truncated: false, node });
      return;
    }
    const result: TextPreview = await textPreview(node.data, node.name, node.mime ?? node.data.type);
    setPreview({
      title: node.name,
      isText: result.isText,
      preview: result.preview,
      truncated: result.truncated,
      node,
    });
  };

  const addFolder = (): void => {
    const name = window.prompt('新文件夹名称');
    if (name && name.trim().length > 0) {
      actions.addFolderIntoNode(mod.id, parentId, name.trim());
    }
  };

  const rename = (node: FSTreeNode): void => {
    const name = window.prompt(`重命名 ${node.name}`, node.name);
    if (name && name.trim().length > 0 && name.trim() !== node.name) {
      actions.renameNode(mod.id, node.nodeId, name.trim());
    }
  };

  const remove = (node: FSTreeNode): void => {
    const hint = node.kind === 'dir' ? '（包含其中所有内容）' : '';
    if (window.confirm(`确定删除 ${node.name} ${hint}？此操作不可撤销。`)) {
      actions.deleteNode(mod.id, node.nodeId);
      setPreview(null);
    }
  };

  const downloadBinary = (node: FSTreeNode): void => {
    if (!node.data) {
      return;
    }
    const url = URL.createObjectURL(node.data);
    triggerBrowserDownload(url, node.name);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="app-card p-4" aria-label={`浏览模组 ${mod.name}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--app-text)]">{mod.name}</h2>
        <button type="button" className="secondary-btn text-xs" onClick={actions.closeFolder}>
          关闭浏览
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="secondary-btn text-xs"
          onClick={actions.navigateUp}
          disabled={path.length === 0}
          aria-label="返回上级目录"
        >
          ← 返回上级
        </button>
        <button
          type="button"
          className="secondary-btn text-xs"
          onClick={() => fileInput.current?.click()}
          aria-label="添加文件到当前目录"
        >
          + 文件
        </button>
        <button type="button" className="secondary-btn text-xs" onClick={addFolder} aria-label="新建文件夹">
          + 文件夹
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length > 0) {
              void actions.pickFilesIntoNode(mod.id, parentId, files);
            }
            event.target.value = '';
          }}
        />
      </div>

      <Breadcrumb />

      {children.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="此文件夹为空" description="用上方按钮添加文件或新建文件夹。" />
        </div>
      ) : (
        <ul className="mt-3 space-y-1" style={{ borderLeft: '2px solid var(--app-border)' }}>
          {children.map((node) => {
            const count = node.kind === 'dir' ? node.children.length : 0;
            return (
              <li key={node.nodeId} className="tree-row">
                <button
                  type="button"
                  className="tap-target flex min-w-0 flex-1 items-center gap-2 px-2 text-left"
                  onClick={() => void openNode(node)}
                  aria-label={node.kind === 'dir' ? `进入文件夹 ${node.name}` : `查看文件 ${node.name}`}
                >
                  <span aria-hidden="true" className="shrink-0 text-brand-500">
                    {node.kind === 'dir' ? '📁' : '📄'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-[var(--app-text)]">{node.name}</span>
                  <span className="shrink-0 text-[11px] text-[var(--app-muted)]">
                    {node.kind === 'dir' ? `${count} 项` : formatFileSize(node.size / 1024)}
                  </span>
                </button>
                <button
                  type="button"
                  className="tap-target shrink-0 px-2 text-[11px] text-[var(--app-muted)]"
                  onClick={() => rename(node)}
                  aria-label={`重命名 ${node.name}`}
                >
                  改名
                </button>
                <button
                  type="button"
                  className="tap-target shrink-0 px-2 text-[11px] text-[var(--app-muted)]"
                  onClick={() => remove(node)}
                  aria-label={`删除 ${node.name}`}
                >
                  删除
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-[var(--app-muted)]">
        此处的增删改名即打包源，所见即所得；修改会自动保存到本机浏览器。
      </p>

      {preview && (
        <div className="modal-mask" role="dialog" aria-modal="true" aria-label={`预览 ${preview.title}`}>
          <div className="app-card w-full max-w-md p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="min-w-0 truncate text-sm font-semibold text-[var(--app-text)]">{preview.title}</h3>
              <button type="button" className="secondary-btn text-xs" onClick={() => setPreview(null)}>
                关闭
              </button>
            </div>
            {preview.isText ? (
              <>
                <pre className="modal-scroll mt-3 whitespace-pre-wrap break-all rounded-xl px-3 py-2 text-[11px] leading-relaxed text-[var(--app-text)]">
                  {preview.preview}
                </pre>
                {preview.truncated && (
                  <p className="mt-2 text-[11px] text-[var(--app-muted)]">内容较长，仅显示前 2000 字符（只读预览）。</p>
                )}
              </>
            ) : (
              <>
                <p className="mt-3 text-xs leading-relaxed text-[var(--app-muted)]">
                  二进制文件，不提供在线编辑。可下载到本地或删除。
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="primary-btn flex-1 text-xs"
                    onClick={() => preview.node && downloadBinary(preview.node)}
                  >
                    下载
                  </button>
                  <button
                    type="button"
                    className="secondary-btn flex-1 text-xs"
                    onClick={() => preview.node && remove(preview.node)}
                  >
                    删除
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
