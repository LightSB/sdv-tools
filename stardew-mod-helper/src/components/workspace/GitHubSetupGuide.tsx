import { useState } from 'react';
import { APP_CONFIG } from '../../config';
import { useApp } from '../../hooks/useAppState';
import type { GitHubSettings } from '../../types/workspace';

const STEPS = [
  '打开 GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token。',
  'Repository access 选 Only select repositories，只勾选你自己的目标私有仓库。',
  'Permissions → Contents: Read and write；设置过期时间后生成并复制 token。',
  '在下方填入 token 与 owner/repo（如 LightSB/my-stardew-mods）；分支默认 main，根路径默认 mods/。',
  '点「测试连接」验证只读权限；成功后即可在云端面板手动同步或拉取。',
];

/** fine-grained PAT 5 步引导 + 配置表单 + 测试连接（R49/Q5）。token 只进 localStorage。 */
export default function GitHubSetupGuide() {
  const { state, actions } = useApp();
  const [token, setToken] = useState('');
  const [owner, setOwner] = useState(state.github.owner);
  const [repo, setRepo] = useState(state.github.repo);
  const [branch, setBranch] = useState(state.github.branch || APP_CONFIG.github.defaultBranch);
  const [basePath, setBasePath] = useState(state.github.basePath || APP_CONFIG.github.defaultBasePath);

  const save = (): void => {
    const settings: GitHubSettings & { token: string } = {
      owner: owner.trim(),
      repo: repo.trim(),
      branch: branch.trim() || APP_CONFIG.github.defaultBranch,
      basePath: basePath.trim() || APP_CONFIG.github.defaultBasePath,
      status: 'unconfigured',
      connectedAt: null,
      error: '',
      token: token.trim(),
    };
    actions.configureGitHub(settings);
    setToken('');
  };

  return (
    <section className="app-card p-4" aria-label="GitHub 云端配置">
      <h3 className="text-sm font-semibold text-[var(--app-text)]">连接你自己的 GitHub 私有仓库</h3>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[11px] leading-relaxed text-[var(--app-muted)]">
        {STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--app-muted)]">
        Token 仅保存在本机浏览器 localStorage，不进服务器、不进日志；清除配置只删 token，已同步数据不会被清除。
      </p>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Fine-grained PAT（仅存本机 localStorage）"
          aria-label="GitHub token"
          className="tap-target min-w-0 rounded-xl border px-3 text-xs text-[var(--app-text)] sm:col-span-2"
          style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
        />
        <input
          type="text"
          value={owner}
          onChange={(event) => setOwner(event.target.value)}
          placeholder="owner，如 LightSB"
          aria-label="GitHub owner"
          className="tap-target min-w-0 rounded-xl border px-3 text-xs text-[var(--app-text)]"
          style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
        />
        <input
          type="text"
          value={repo}
          onChange={(event) => setRepo(event.target.value)}
          placeholder="repo，如 my-stardew-mods"
          aria-label="GitHub repo"
          className="tap-target min-w-0 rounded-xl border px-3 text-xs text-[var(--app-text)]"
          style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
        />
        <input
          type="text"
          value={branch}
          onChange={(event) => setBranch(event.target.value)}
          placeholder="分支（默认 main）"
          aria-label="GitHub 分支"
          className="tap-target min-w-0 rounded-xl border px-3 text-xs text-[var(--app-text)]"
          style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
        />
        <input
          type="text"
          value={basePath}
          onChange={(event) => setBasePath(event.target.value)}
          placeholder="仓库内根路径（默认 mods/）"
          aria-label="GitHub 根路径"
          className="tap-target min-w-0 rounded-xl border px-3 text-xs text-[var(--app-text)]"
          style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="primary-btn flex-1 text-xs" onClick={save}>
          保存配置
        </button>
        <button
          type="button"
          className="secondary-btn flex-1 text-xs"
          onClick={() => void actions.testGitHubConnection()}
        >
          测试连接
        </button>
        <button type="button" className="secondary-btn text-xs" onClick={actions.clearGitHubConfig}>
          清除配置
        </button>
      </div>

      {state.github.status !== 'unconfigured' && (
        <p
          role="status"
          className={`mt-3 rounded-xl px-3 py-2 text-[11px] leading-relaxed ${
            state.github.status === 'error' ? 'chip--error' : 'chip--main'
          }`}
        >
          {state.github.status === 'connected'
            ? `已连接${state.github.connectedAt ? ` · ${state.github.connectedAt}` : ''}`
            : state.github.error}
        </p>
      )}
    </section>
  );
}
