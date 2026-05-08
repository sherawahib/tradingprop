import { ArrowRight, BadgeDollarSign, CalendarRange, CheckCircle2, ShieldCheck } from "lucide-react";
import MarketingShell from "./MarketingShell";
import type { MarketingSubView } from "./marketingTypes";
import { payoutPolicy } from "./programCatalog";

interface PayoutsPageProps {
  onNavigate: (page: MarketingSubView) => void;
  onOpenPortal: () => void;
}

export default function PayoutsPage({ onNavigate, onOpenPortal }: PayoutsPageProps) {
  return (
    <MarketingShell active="payouts" onNavigate={onNavigate} onOpenPortal={onOpenPortal}>
      <section className="fxProgramsHero">
        <p className="fxEyebrow">Payouts</p>
        <h1 className="fxSectionTitle">{payoutPolicy.splitHeading}</h1>
        <p className="fxSectionLead">{payoutPolicy.splitBody}</p>
      </section>

      <section className="fxSection">
        <div className="fxPayoutCards">
          {[
            { icon: BadgeDollarSign, title: "Generous splits", body: "Standard splits start at 80% across most simulated programs. Optional addons can lift you toward 90%." },
            { icon: CalendarRange, title: "Flexible scheduling", body: "Pick on-demand or scheduled bi-weekly cycles depending on your program selection." },
            { icon: ShieldCheck, title: "Compliance gates", body: "KYC must be approved and challenge progress must be ACTIVE in funded phase before withdrawals." }
          ].map((c) => (
            <article key={c.title} className="fxPayoutCard">
              <c.icon size={22} aria-hidden="true" className="fxPayoutCardIcon" />
              <h3 className="fxPayoutCardTitle">{c.title}</h3>
              <p className="fxPayoutCardBody">{c.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="fxSection fxSectionMuted">
        <header className="fxSectionHeader">
          <p className="fxEyebrow">Policy summary</p>
          <h2 className="fxSectionTitle">First withdrawal</h2>
        </header>
        <p className="fxSectionLead">{payoutPolicy.firstWithdrawalSummary}</p>
        <p className="fxPortalMuted" style={{ marginTop: 12 }}>{payoutPolicy.firstPayoutTradingDaysHint}</p>
      </section>

      <section className="fxSection">
        <header className="fxSectionHeader">
          <p className="fxEyebrow">Principles</p>
          <h2 className="fxSectionTitle">How we think about payouts</h2>
        </header>
        <ul className="fxPayoutPrinciples">
          {payoutPolicy.principles.map((p) => (
            <li key={p}>
              <CheckCircle2 size={16} aria-hidden="true" />
              {p}
            </li>
          ))}
        </ul>
      </section>

      <section className="fxCtaBlock">
        <div>
          <h2 className="fxCtaBlockTitle">Earn your first simulated payout</h2>
          <p className="fxCtaBlockLead">Sign up, pass the evaluation phases, and request your first withdrawal.</p>
        </div>
        <div className="fxCtaBlockBtns">
          <button type="button" className="fxCtaFilled" onClick={onOpenPortal}>
            Get started
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button type="button" className="fxCtaOutline" onClick={() => onNavigate("how")}>
            See the flow
          </button>
        </div>
      </section>
    </MarketingShell>
  );
}
