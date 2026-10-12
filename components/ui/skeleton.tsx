"use client";

export function Skeleton({ className = "", style = {} }) {
  return <span aria-hidden="true" className={`app-skeleton-block ${className}`.trim()} style={style} />;
}

export function AppSkeleton() {
  return <div className="app-skeleton-screen" role="status" aria-label="Loading workspace">
    <aside className="app-skeleton-sidebar"><Skeleton className="app-skeleton-logo" /><Skeleton className="app-skeleton-nav" /><Skeleton className="app-skeleton-nav" /><Skeleton className="app-skeleton-nav" /><Skeleton className="app-skeleton-nav" /><Skeleton className="app-skeleton-footer" /></aside>
    <div className="app-skeleton-main"><div className="app-skeleton-header"><Skeleton style={{ width: 92, height: 10 }} /><Skeleton style={{ width: 360, height: 34 }} /><Skeleton style={{ width: 116, height: 34 }} /></div><div className="app-skeleton-kpis"><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div><Skeleton className="app-skeleton-panel" /><Skeleton className="app-skeleton-panel app-skeleton-panel-short" /></div>
    <style jsx global>{`
      .app-skeleton-screen { min-height: 100vh; display: flex; gap: 24px; padding: 14px; background: var(--bg, #f4f7f5); color: var(--ink, #17201d); }
      .app-skeleton-sidebar { width: 240px; min-height: calc(100vh - 28px); flex: 0 0 240px; display: flex; flex-direction: column; gap: 10px; padding: 18px 12px; border-radius: 26px; background: var(--paper, #fff); }
      .app-skeleton-main { min-width: 0; flex: 1; padding: 10px 18px 24px; }
      .app-skeleton-header { display: flex; align-items: center; justify-content: space-between; gap: 18px; height: 58px; }
      .app-skeleton-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-top: 26px; }
      .app-skeleton-block { display: block; border-radius: 12px; background: color-mix(in srgb, var(--muted, #89958f) 16%, transparent); animation: app-skeleton-pulse 1.35s ease-in-out infinite; }
      .app-skeleton-logo { width: 42px; height: 42px; border-radius: 13px; margin-bottom: 18px; }
      .app-skeleton-nav { width: 100%; height: 36px; border-radius: 11px; }
      .app-skeleton-footer { width: 100%; height: 42px; margin-top: auto; border-radius: 12px; }
      .app-skeleton-kpis .app-skeleton-block { height: 138px; border-radius: 22px; }
      .app-skeleton-panel { height: 260px; margin-top: 16px; border-radius: 22px; }
      .app-skeleton-panel-short { height: 130px; }
      @keyframes app-skeleton-pulse { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
      @media (max-width: 900px) { .app-skeleton-sidebar { display: none; } .app-skeleton-main { padding: 8px; } .app-skeleton-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 560px) { .app-skeleton-header { gap: 8px; } .app-skeleton-header .app-skeleton-block:nth-child(2) { width: 150px !important; } .app-skeleton-kpis .app-skeleton-block { height: 112px; } }
    `}</style>
  </div>;
}
