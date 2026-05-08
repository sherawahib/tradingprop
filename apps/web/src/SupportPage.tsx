import { ArrowRight, Clock, LifeBuoy, Mail } from "lucide-react";
import MarketingShell from "./MarketingShell";
import type { MarketingSubView } from "./marketingTypes";

interface SupportPageProps {
  onNavigate: (page: MarketingSubView) => void;
  onOpenPortal: () => void;
}

export default function SupportPage({ onNavigate, onOpenPortal }: SupportPageProps) {
  return (
    <MarketingShell active="support" onNavigate={onNavigate} onOpenPortal={onOpenPortal}>
      <section className="fxProgramsHero">
        <p className="fxEyebrow">Support</p>
        <h1 className="fxSectionTitle">We're here when you hit a wall.</h1>
        <p className="fxSectionLead">
          Open a support ticket from your portal, escalate breaches via the appeal flow, or write to us.
        </p>
      </section>

      <section className="fxSection">
        <div className="fxResourceCards">
          <article className="fxResourceCard">
            <LifeBuoy size={18} aria-hidden="true" />
            <h3>Open a portal ticket</h3>
            <p>Rule appeals and evaluation-reset requests are filed from inside your client portal.</p>
            <button type="button" className="fxLinkBtn" onClick={onOpenPortal}>
              Open portal <ArrowRight size={13} aria-hidden="true" />
            </button>
          </article>
          <article className="fxResourceCard">
            <Mail size={18} aria-hidden="true" />
            <h3>Email</h3>
            <p>
              <code className="fxPortalCode">support@propprime.demo</code> · responses simulated for the demo.
            </p>
          </article>
          <article className="fxResourceCard">
            <Clock size={18} aria-hidden="true" />
            <h3>Response window</h3>
            <p>Demo SLA — most tickets resolved within one business day during the prototype window.</p>
          </article>
        </div>
      </section>

      <section className="fxSection fxSectionMuted">
        <header className="fxSectionHeader">
          <p className="fxEyebrow">Common requests</p>
          <h2 className="fxSectionTitle">What support can do</h2>
        </header>
        <ul className="fxFeatureBadges">
          <li>Appeal a breach</li>
          <li>Request an evaluation reset</li>
          <li>Recover a portal password</li>
          <li>Reset a terminal password</li>
          <li>Verify KYC documents</li>
          <li>Investigate payout status</li>
        </ul>
      </section>

      <section className="fxCtaBlock">
        <div>
          <h2 className="fxCtaBlockTitle">Need a hand right now?</h2>
          <p className="fxCtaBlockLead">Sign in, head to Support inside the portal, and file a ticket.</p>
        </div>
        <div className="fxCtaBlockBtns">
          <button type="button" className="fxCtaFilled" onClick={onOpenPortal}>
            Open portal
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button type="button" className="fxCtaOutline" onClick={() => onNavigate("resources")}>
            Browse resources
          </button>
        </div>
      </section>
    </MarketingShell>
  );
}
