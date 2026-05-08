import type { ReactNode } from "react";
import MarketingShell from "./MarketingShell";
import type { MarketingSubView } from "./marketingTypes";

interface MarketingArticleShellProps {
  active: MarketingSubView;
  onNavigate: (page: MarketingSubView) => void;
  onOpenPortal: () => void;
  annTag: string;
  annText: string;
  title: string;
  updated: string;
  children: ReactNode;
}

export default function MarketingArticleShell({
  active,
  onNavigate,
  onOpenPortal,
  annTag,
  annText,
  title,
  updated,
  children
}: MarketingArticleShellProps) {
  return (
    <MarketingShell active={active} onNavigate={onNavigate} onOpenPortal={onOpenPortal} annTag={annTag} annText={annText}>
      <article className="fxLegalPage">
        <p className="fxEyebrow">{annTag}</p>
        <h1 className="fxLegalTitle">{title}</h1>
        <p className="fxLegalUpdated">Last updated: {updated}</p>
        <div className="fxLegalContent">{children}</div>
      </article>
    </MarketingShell>
  );
}
