import { type ReactNode, useEffect, useState } from "react";
import type { MarketingSubView } from "./marketingTypes";
import SiteFooter from "./SiteFooter";
import { Menu, X } from "lucide-react";

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
  const [marketingMenuOpen, setMarketingMenuOpen] = useState(false);

  function goTo(id: MarketingSubView): void {
    onNavigate(id);
    setMarketingMenuOpen(false);
  }

  function navBtn(id: MarketingSubView, label: string) {
    return (
      <button
        key={id}
        type="button"
        className={`fxNavLink${active === id ? " fxNavLinkActive" : ""}`}
        onClick={() => goTo(id)}
        aria-current={active === id ? "page" : undefined}
      >
        {label}
      </button>
    );
  }

  useEffect(() => {
    setMarketingMenuOpen(false);
  }, [active]);

  useEffect(() => {
    if (!marketingMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [marketingMenuOpen]);

  useEffect(() => {
    if (!marketingMenuOpen) return;
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") setMarketingMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [marketingMenuOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 901px)");
    function onChange(): void {
      if (mq.matches) setMarketingMenuOpen(false);
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const rootClass =
    `fxRoot fxMarketingRoot${marketingMenuOpen ? " fxMarketingRoot--menuOpen" : ""}`.trim();

  return (
    <div className={rootClass}>
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
        <div className="fxShellNavInner fxMarketingShellInner">
          <button type="button" className="fxLogoBtn" onClick={() => goTo("home")} title="Home">
            <div className="fxLogoRow">
              <span className="fxLogoMark" aria-hidden="true" />
              <strong className="fxLogoWord">PropPrime</strong>
            </div>
          </button>

          <button
            type="button"
            className="fxMarketingBurger"
            aria-label={marketingMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={marketingMenuOpen}
            aria-controls="fx-marketing-nav"
            onClick={() => setMarketingMenuOpen((o) => !o)}
          >
            {marketingMenuOpen ? <X size={22} strokeWidth={2} aria-hidden /> : <Menu size={22} strokeWidth={2} aria-hidden />}
          </button>

          <nav className="fxNavCenter fxMarketingPrimaryNav" id="fx-marketing-nav" aria-label="Primary">
            {navBtn("home", "Home")}
            {navBtn("programs", "Programs")}
            {navBtn("how", "How It Works")}
            {navBtn("payouts", "Payouts")}
            {navBtn("resources", "Resources")}
            <button
              type="button"
              className="fxNavLink fxMarketingMobileOnlyNavCta"
              onClick={() => {
                onOpenPortal();
                setMarketingMenuOpen(false);
              }}
            >
              Login / Register
            </button>
          </nav>

          <div className="fxNavActions">
            <button type="button" className="fxLinkBtn fxMarketingDesktopOnlyLogin" onClick={() => onOpenPortal()}>
              Login / Register
            </button>
            <button type="button" className="fxCtaFilled" onClick={() => onOpenPortal()}>
              Get funded
            </button>
          </div>
        </div>
      </header>

      {marketingMenuOpen ? (
        <div
          className="fxMarketingNavScrim"
          aria-hidden="true"
          onClick={() => setMarketingMenuOpen(false)}
        />
      ) : null}

      <main className="fxSite">{children}</main>

      <SiteFooter onNavigate={onNavigate} onOpenPortal={onOpenPortal} variant="marketing" />
    </div>
  );
}

export default MarketingShell;
