import type { ReactNode } from "react";
import type { MarketingSubView } from "./marketingTypes";
import SiteFooter from "./SiteFooter";

export interface MarketingShellProps {
  active: MarketingSubView;
  onNavigate: (page: MarketingSubView) => void;
  onOpenPortal: () => void;
  annTag?: string;
  annText?: string;
  children: ReactNode;
}

function MarketingShell({
  active,
  onNavigate,
  onOpenPortal,
  annTag = "PropPrime",
  annText = "Educational simulation stack — evaluation, funded desk personas, and payout workflows in one demo.",
  children
}: MarketingShellProps) {
  const navBtn = (id: MarketingSubView, label: string) => (
    <button
      type="button"
      className={`fxNavLink${active === id ? " fxNavLinkActive" : ""}`}
      onClick={() => onNavigate(id)}
      aria-current={active === id ? "page" : undefined}
    >
      {label}
    </button>
  );

  return (
    <div className="fxRoot">
      <div className="fxAnnBar">
        <div className="fxAnnInner">
          <span className="fxAnnTag">{annTag}</span>
          <span className="fxAnnText">{annText}</span>
          <button type="button" className="fxAnnCta" onClick={onOpenPortal}>
            Open portal
          </button>
        </div>
      </div>

      <header className="fxShellNav">
        <div className="fxShellNavInner">
          <button type="button" className="fxLogoBtn" onClick={() => onNavigate("home")} title="Home">
            <div className="fxLogoRow">
              <span className="fxLogoMark" aria-hidden="true" />
              <strong className="fxLogoWord">PropPrime</strong>
            </div>
          </button>

          <nav className="fxNavCenter" aria-label="Primary">
            {navBtn("home", "Home")}
            {navBtn("programs", "Programs")}
            {navBtn("how", "How It Works")}
            {navBtn("payouts", "Payouts")}
            {navBtn("resources", "Resources")}
          </nav>

          <div className="fxNavActions">
            <button type="button" className="fxLinkBtn" onClick={onOpenPortal}>
              Login / Register
            </button>
            <button type="button" className="fxCtaFilled" onClick={onOpenPortal}>
              Get funded
            </button>
          </div>
        </div>
      </header>

      <main className="fxSite">{children}</main>

      <SiteFooter onNavigate={onNavigate} onOpenPortal={onOpenPortal} variant="marketing" />
    </div>
  );
}

export default MarketingShell;
