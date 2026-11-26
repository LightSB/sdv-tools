import ApiKeyPanel from './components/ApiKeyPanel';
import HistoryPanel from './components/HistoryPanel';
import ModCard from './components/ModCard';
import ModIdInput from './components/ModIdInput';
import StatusBar from './components/StatusBar';
import TabBar from './components/TabBar';
import EmptyState from './components/ui/EmptyState';
import Skeleton from './components/ui/Skeleton';
import Toast from './components/ui/Toast';
import WorkspacePanel from './components/workspace/WorkspacePanel';
import { AppStoreProvider, useApp } from './hooks/useAppState';
import { ToastProvider } from './hooks/useToast';

function AppContent() {
  const { state } = useApp();
  const failedIds = Object.keys(state.loadErrors)
    .map(Number)
    .filter((id) => !state.mods.some((mod) => mod.modId === id));
  const isInitial = state.mods.length === 0 && state.loadingIds.length === 0 && failedIds.length === 0;

  return (
    <div className="min-h-screen">
      <StatusBar />
      <main className="mx-auto w-full max-w-2xl space-y-4 px-4 pb-32 pt-4">
        {state.tab === 'download' ? (
          <>
            <ApiKeyPanel />
            <ModIdInput />

            {state.loadingIds.length > 0 && (
              <Skeleton count={Math.min(state.loadingIds.length, 3)} />
            )}

            {state.mods.length > 0 && (
              <div className="space-y-4">
                {state.mods.map((mod) => (
                  <ModCard key={mod.modId} mod={mod} error={state.loadErrors[mod.modId]} />
                ))}
              </div>
            )}

            {failedIds.map((id) => (
              <div key={id} className="app-card p-4" role="alert">
                <h3 className="text-sm font-semibold text-[var(--app-text)]">模组 {id} 加载失败</h3>
                <p className="mt-1 text-xs leading-relaxed text-rose-400">{state.loadErrors[id]}</p>
                <p className="mt-2 text-xs text-[var(--app-muted)]">其他模组不受影响，可继续下载已加载的卡片。</p>
              </div>
            ))}

            {isInitial && (
              <EmptyState
                title="粘贴 ID，开始整理模组"
                description="支持数字 ID 与 N 网链接混排。工具会带你一次看清文件、汉化与前置。"
              />
            )}
          </>
        ) : state.tab === 'workspace' ? (
          <WorkspacePanel />
        ) : (
          <HistoryPanel />
        )}
      </main>

      <TabBar />
      <Toast />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppStoreProvider>
        <AppContent />
      </AppStoreProvider>
    </ToastProvider>
  );
}
