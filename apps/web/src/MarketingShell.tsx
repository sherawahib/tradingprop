import type { ReactNode } from "react";
import { PARTNER_SIGN_IN_HASH } from "./partnerAuth";
import type { MarketingSubView } from "./marketingTypes";

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

      <footer className="fxFooterGrid">
        <div>
          <strong className="fxFooterBrand">PropPrime Markets</strong>
          <p className="fxFooterMuted">Educational prototype — not investment advice or a brokerage offer.</p>
        </div>
        <div className="fxFooterCols">
          <div>
            <h4 className="fxFooterHdr">Explore</h4>
            <button type="button" className="fxFooterLink fxFooterBtnAsLink" onClick={() => onNavigate("home")}>
              Home
            </button>
            <button type="button" className="fxFooterLink fxFooterBtnAsLink" onClick={() => onNavigate("programs")}>
              Programs
            </button>
            <button type="button" className="fxFooterLink fxFooterBtnAsLink" onClick={() => onNavigate("how")}>
              How it works
            </button>
            <button type="button" className="fxFooterLink fxFooterBtnAsLink" onClick={() => onNavigate("payouts")}>
              Payouts
            </button>
            <button type="button" className="fxFooterLink fxFooterBtnAsLink" onClick={() => onNavigate("resources")}>
              Resources
            </button>
          </div>
          <div>
            <h4 className="fxFooterHdr">Account</h4>
            <button type="button" className="fxFooterLink fxFooterBtnAsLink" onClick={onOpenPortal}>
              Client portal
            </button>
            <button
              type="button"
              className="fxFooterLink fxFooterBtnAsLink"
              onClick={() => {
                window.location.hash = PARTNER_SIGN_IN_HASH;
              }}
            >
              Partner program
            </button>
          </div>
          <div>
            <h4 className="fxFooterHdr">Documents</h4>
            <button type="button" className="fxFooterLink fxFooterBtnAsLink" onClick={() => onNavigate("terms")}>
              Terms of service
            </button>
            <button type="button" className="fxFooterLink fxFooterBtnAsLink" onClick={() => onNavigate("privacy")}>
              Privacy
            </button>
            <button type="button" className="fxFooterLink fxFooterBtnAsLink" onClick={() => onNavigate("cookies")}>
              Cookies
            </button>
            <button type="button" className="fxFooterLink fxFooterBtnAsLink" onClick={() => onNavigate("risk")}>
              Risk disclosure
            </button>
            <button type="button" className="fxFooterLink fxFooterBtnAsLink" onClick={() => onNavigate("support")}>
              Support
            </button>
            <button type="button" className="fxFooterLink fxFooterBtnAsLink" onClick={() => onNavigate("resources")}>
              FAQ and API refs
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default MarketingShell;
