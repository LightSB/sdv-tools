/** 加载骨架屏：与 ModCard 的视觉结构对齐。 */
export default function Skeleton({ count = 2 }: { count?: number }) {
  const total = Math.max(1, Math.min(count, 8));
  return (
    <div className="space-y-4" role="status" aria-label="正在加载模组信息">
      {Array.from({ length: total }, (_, index) => (
        <div key={index} className="app-card animate-pulse p-4">
          <div className="flex gap-3">
            <div className="h-16 w-16 shrink-0 rounded-xl bg-slate-500/20" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 w-2/3 rounded bg-slate-500/20" />
              <div className="h-3 w-1/3 rounded bg-slate-500/15" />
              <div className="h-3 w-full rounded bg-slate-500/10" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <div className="h-6 w-16 rounded-full bg-slate-500/15" />
            <div className="h-6 w-20 rounded-full bg-slate-500/15" />
          </div>
        </div>
      ))}
      <span className="sr-only">正在从 N 网获取模组元数据与文件列表…</span>
    </div>
  );
}
