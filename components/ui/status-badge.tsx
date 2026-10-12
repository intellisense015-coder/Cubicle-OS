// TITLE: SHARED STATUS BADGE
export function StatusBadge({ children, tone = "neutral" }) {
  return <span className={`status-tag status-badge-${tone}`}>{children}</span>;
}
