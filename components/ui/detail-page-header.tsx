import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

type DetailPageHeaderProps = {
  backHref: string;
  backLabel: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function DetailPageHeader({ backHref, backLabel, title, description, actions }: DetailPageHeaderProps) {
  return <header className="detail-page-header">
    <Link href={backHref} className="detail-back-link">
      <span className="detail-back-icon" aria-hidden="true"><ArrowLeft size={15} /></span>
      <span>{backLabel}</span>
    </Link>
    <div className="detail-page-title-row">
      <div className="detail-page-title-copy">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="detail-page-actions">{actions}</div> : null}
    </div>
  </header>;
}
