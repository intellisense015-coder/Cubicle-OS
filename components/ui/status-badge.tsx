// TITLE: SHARED STATUS BADGE
export function StatusBadge({ children, tone = "neutral", title }: { children: any; tone?: string; title?: string }) {
  return <span className={`status-tag status-badge-${tone}`} title={title}>{children}</span>;
}
