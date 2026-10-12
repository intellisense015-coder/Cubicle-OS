import { Inbox } from "lucide-react";

// TITLE: SHARED EMPTY STATE
export function EmptyState({ title, description }) {
  return <div className="empty-state"><span className="empty-state-icon"><Inbox size={18} /></span><strong>{title}</strong><p>{description}</p></div>;
}
