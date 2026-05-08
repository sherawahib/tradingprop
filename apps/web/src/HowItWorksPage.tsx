import { ArrowRight, CheckCircle2, Cog, Coins, ShieldCheck, TrendingUp } from "lucide-react";
import MarketingShell from "./MarketingShell";
import type { MarketingSubView } from "./marketingTypes";

interface HowItWorksPageProps {
  onNavigate: (page: MarketingSubView) => void;
  onOpenPortal: () => void;
}

const steps = [
  {
    icon: Cog,
    title: "Sign up & pick a program",
    body: "Create your client portal account, choose an evaluation route, and complete the simulated checkout."
  },
  {
    icon: TrendingUp,
    title: "Trade against rules",
    body: "Hit profit targets without breaching daily / max drawdown, news, or position-sizing rules."
  },
  {
    icon: ShieldCheck,
    title: "Get evaluated",
    body: "Pass each phase to advance. The risk engine flags violations live and locks accounts on breach."
  },
  {
    icon: Coins,
    title: "Withdraw simulated profits",
    body: "Once funded and eligible, request a payout. Operators review, approve, and settle through the dashboard."
  }
];

export default function HowItWorksPage({ onNavigate, onOpenPortal }: HowItWorksPageProps) {
  return (
    <MarketingShell active="how" onNavigate={onNavigate} onOpenPortal={onOpenPortal}>
      <section className="fxProgramsHero">
        <p className="fxEyebrow">How it works</p>
        <h1 className="fxSectionTitle">From sign-up to simulated payout</h1>
        <p className="fxSectionLead">
          Four explicit steps with the same dashboards, audit log, and risk engine across every program.
        </p>
      </section>

      <section className="fxSection">
        <ol className="fxHowSteps">
          {steps.map((s, idx) => (
            <li key={s.title} className="fxHowStep">
              <span className="fxHowStepIdx">{String(idx + 1).padStart(2, "0")}</span>
              <s.icon size={28} aria-hidden="true" className="fxHowStepIcon" />
              <h3 className="fxHowStepTitle">{s.title}</h3>
              <p className="fxHowStepBody">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="fxSection fxSectionMuted">
        <header className="fxSectionHeader">
          <p className="fxEyebrow">Rule engine</p>
          <h2 className="fxSectionTitle">What gets enforced live</h2>
        </header>
        <div className="fxFeatureGrid">
          {[
            "Daily drawdown — based on equity high since session reset.",
            "Max drawdown — based on phase start balance.",
            "Profit target — must reach to advance phase.",
            "Minimum trading days — counted on qualifying activity only.",
            "News blackout — when program enables synthetic high-impact filter.",
            "Position-size caps — per-position lots & total open lots."
          ].map((rule) => (
            <article key={rule} className="fxFeatureCard">
              <CheckCircle2 size={18} aria-hidden="true" className="fxFeatureIcon" />
              <p className="fxFeatureBody">{rule}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="fxCtaBlock">
        <div>
          <h2 className="fxCtaBlockTitle">Ready to walk through the flow?</h2>
          <p className="fxCtaBlockLead">Open the portal, buy a package, and use the demo terminal to feel the engine.</p>
        </div>
        <div className="fxCtaBlockBtns">
          <button type="button" className="fxCtaFilled" onClick={onOpenPortal}>
            Open portal
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button type="button" className="fxCtaOutline" onClick={() => onNavigate("programs")}>
            Compare programs
          </button>
        </div>
      </section>
    </MarketingShell>
  );
}
