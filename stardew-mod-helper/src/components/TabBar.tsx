import { useApp } from '../hooks/useAppState';
import type { TabKey } from '../types/domain';

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'download', label: '下载' },
  { key: 'workspace', label: '工作区' },
  { key: 'history', label: '历史' },
];

function TabIcon({ tab }: { tab: TabKey }) {
  if (tab === 'download') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (tab === 'workspace') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" strokeLinejoin="round" />
        <path d="M3 11h18" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 5h16v14H4zM8 5V3h8v2M8 10h8M8 14h8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 底部固定三 Tab：44px 以上触控区并适配 iOS 安全区。 */
export default function TabBar() {
  const { state, actions } = useApp();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-xl"
      style={{
        borderColor: 'var(--app-border)',
        backgroundColor: state.theme === 'dark' ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.88)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      role="tablist"
      aria-label="主导航"
    >
      <div className="mx-auto flex w-full max-w-2xl">
        {tabs.map((tab) => {
          const active = state.tab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`切换到${tab.label}`}
              onClick={() => actions.setTab(tab.key)}
              className={`tap-target flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold transition ${
                active ? 'text-brand-500' : 'text-[var(--app-muted)]'
              }`}
            >
              <TabIcon tab={tab.key} />
              {tab.label}
              {active && <span aria-hidden="true" className="h-0.5 w-6 rounded-full bg-brand-500" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
