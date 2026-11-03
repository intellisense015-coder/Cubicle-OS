"use client";

export function Skeleton({ className = "", style = {} }) {
  return <span aria-hidden="true" className={`app-skeleton-block ${className}`.trim()} style={style} />;
}

export function AppSkeleton() {
  return <div className="app-skeleton-screen" role="status" aria-label="Loading workspace">
    <div className="app-skeleton-main"><div className="app-skeleton-header"><Skeleton style={{ width: 92, height: 10 }} /><Skeleton style={{ width: 360, height: 34 }} /><Skeleton style={{ width: 116, height: 34 }} /></div><div className="app-skeleton-kpis"><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div><Skeleton className="app-skeleton-panel" /><Skeleton className="app-skeleton-panel app-skeleton-panel-short" /></div>
    <style jsx global>{`
      .app-skeleton-screen { min-height: 100vh; display: flex; padding: 14px; background: var(--bg, #f4f7f5); color: var(--ink, #17201d); }
      .app-skeleton-main { min-width: 0; width: 100%; padding: 10px 18px 24px; }
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
      @media (max-width: 900px) { .app-skeleton-main { padding: 8px; } .app-skeleton-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 560px) { .app-skeleton-header { gap: 8px; } .app-skeleton-header .app-skeleton-block:nth-child(2) { width: 150px !important; } .app-skeleton-kpis .app-skeleton-block { height: 112px; } }
    `}</style>
  </div>;
}

export function RouteSkeleton() {
  return <div className="app-route-skeleton" role="status" aria-label="Loading page">
    <div className="app-route-skeleton-heading"><Skeleton style={{ width: 170, height: 26 }} /><Skeleton style={{ width: 112, height: 30 }} /></div>
    <div className="app-route-skeleton-grid"><Skeleton /><Skeleton /><Skeleton /></div>
    <Skeleton className="app-route-skeleton-panel" />
    <Skeleton className="app-route-skeleton-panel app-route-skeleton-panel-short" />
    <style jsx global>{`
      .app-route-skeleton { box-sizing: border-box; width: 100%; min-height: calc(100dvh - 70px); padding: 18px 0 32px; background: var(--cream); color: var(--ink); }
      .app-route-skeleton .app-skeleton-block { display: block; border-radius: 12px; background: color-mix(in srgb, var(--muted, #89958f) 16%, transparent); animation: app-route-skeleton-pulse 1.35s ease-in-out infinite; }
      @keyframes app-route-skeleton-pulse { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
      .app-route-skeleton-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
      .app-route-skeleton-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
      .app-route-skeleton-grid .app-skeleton-block { height: 126px; border-radius: 28px; }
      .app-route-skeleton-panel { width: 100%; height: 300px; margin-top: 16px; border-radius: 30px; }
      .app-route-skeleton-panel-short { height: 150px; }
      @media (max-width: 900px) { .app-route-skeleton-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 560px) { .app-route-skeleton-grid { grid-template-columns: 1fr; } .app-route-skeleton { padding-top: 10px; } }
    `}</style>
  </div>;
}
