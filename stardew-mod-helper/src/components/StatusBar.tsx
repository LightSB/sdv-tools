import { APP_CONFIG } from '../config';
import { useApp } from '../hooks/useAppState';
import type { KeyStatus } from '../types/domain';

interface StatusMeta {
  label: string;
  dot: string;
  badge: string;
}

const statusMeta: Record<KeyStatus, StatusMeta> = {
  unset: {
    label: '未配置密钥',
    dot: 'bg-slate-400',
    badge: 'border-slate-500/30 text-[var(--app-muted)]',
  },
  checking: {
    label: '正在校验…',
    dot: 'bg-sky-400 animate-pulse',
    badge: 'border-sky-400/40 text-sky-400',
  },
  valid: {
    label: '密钥已验证',
    dot: 'bg-brand-500',
    badge: 'border-brand-500/40 text-brand-500',
  },
  invalid: {
    label: '密钥无效',
    dot: 'bg-rose-500',
    badge: 'border-rose-500/40 text-rose-500',
  },
  error: {
    label: '校验失败',
    dot: 'bg-rose-500',
    badge: 'border-rose-500/40 text-rose-500',
  },
};

/** 顶部状态条：应用名、Key 状态徽标、主题切换。 */
export default function StatusBar() {
  const { state, actions } = useApp();
  const meta = statusMeta[state.keyStatus];
  const isPremium = state.keyStatus === 'valid' && state.tier === 'premium';
  const label = isPremium ? 'Premium 已验证' : meta.label;
  const badge = isPremium
    ? 'border-accent-400/50 text-accent-400'
    : meta.badge;
  const dot = isPremium ? 'bg-accent-400' : meta.dot;

  const openKeySettings = (): void => {
    actions.setTab('download');
    window.setTimeout(() => {
      document.getElementById('api-key-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur-xl"
      style={{
        borderColor: 'var(--app-border)',
        backgroundColor: state.theme === 'dark' ? 'rgba(15, 23, 42, 0.82)' : 'rgba(255, 255, 255, 0.82)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600/15 text-brand-500"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
            <path d="M12 2v4h-2V2h2ZM6 6h4v3H8v3H6V6Zm8 0h4v6h-2V9h-2V6ZM4 12h16v3H4v-3Zm2 4h12v4H6v-4Z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold tracking-tight text-[var(--app-text)]">
            {APP_CONFIG.appName}
          </h1>
          <p className="truncate text-[11px] text-[var(--app-muted)]">文件 · 汉化 · 前置，一屏看清</p>
        </div>
        <button
          type="button"
          onClick={openKeySettings}
          aria-label={`密钥状态：${label}，点击前往密钥设置`}
          className={`tap-target inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${badge}`}
        >
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dot}`} />
          {label}
        </button>
        <button
          type="button"
          onClick={() => actions.setTheme(state.theme === 'dark' ? 'light' : 'dark')}
          aria-label={state.theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
          className="tap-target flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-[var(--app-muted)]"
          style={{ borderColor: 'var(--app-border)' }}
        >
          {state.theme === 'dark' ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4a8.5 8.5 0 1 0 11.5 11.5Z" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
