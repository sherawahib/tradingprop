import { Activity, ArrowRight, BadgeDollarSign, BookOpen, Layers, ShieldCheck, Sparkles, Target, TrendingUp, Wallet } from "lucide-react";
import MarketingShell from "./MarketingShell";
import MarketingHeroVisual from "./MarketingHeroVisual";
import type { MarketingSubView } from "./marketingTypes";
import { brokerStyleFeatures, faqTopFive, programs, programTabOrder } from "./programCatalog";

interface WebsiteHomeProps {
  onNavigate: (page: MarketingSubView) => void;
  onOpenPortal: () => void;
}

export default function WebsiteHome({ onNavigate, onOpenPortal }: WebsiteHomeProps) {
  return (
    <MarketingShell active="home" onNavigate={onNavigate} onOpenPortal={onOpenPortal}>
      <section className="fxHero">
        <div className="fxHeroCopy">
          <p className="fxEyebrow">Educational simulation · prop firm style</p>
          <h1 className="fxHeroTitle">
            Get <span className="fxHeroAccent">funded-style</span> the disciplined way.
          </h1>
          <p className="fxHeroLead">
            PropPrime gives you a full proprietary trading-style stack: evaluations, drawdown-aware risk, payouts, dashboards,
            and a real web + desktop terminal. Every dollar is simulated — every workflow is real.
          </p>
          <div className="fxHeroCtaRow">
            <button type="button" className="fxCtaFilled" onClick={onOpenPortal}>
              Get started
              <ArrowRight size={16} aria-hidden="true" />
            </button>
            <button type="button" className="fxCtaOutline" onClick={() => onNavigate("programs")}>
              See programs
            </button>
          </div>
          <ul className="fxHeroProofs">
            <li><ShieldCheck size={14} aria-hidden="true" /> Drawdown engine enforced live</li>
            <li><Wallet size={14} aria-hidden="true" /> Payout simulation included</li>
            <li><Activity size={14} aria-hidden="true" /> Web + desktop terminals</li>
          </ul>
        </div>
        <MarketingHeroVisual />
      </section>

      <section className="fxStripDark">
        <div className="fxStripInner">
          {[
            { icon: Layers, label: "Programs", value: "5+" },
            { icon: Target, label: "Profit targets", value: "From 5%" },
            { icon: TrendingUp, label: "Splits up to", value: "90%" },
            { icon: BadgeDollarSign, label: "First payout", value: "On demand" }
          ].map((m) => (
            <div key={m.label} className="fxStripItem">
              <m.icon size={18} aria-hidden="true" />
              <strong>{m.value}</strong>
              <span>{m.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="fxSection">
        <header className="fxSectionHeader">
          <p className="fxEyebrow">Programs</p>
          <h2 className="fxSectionTitle">Pick the path that fits your edge</h2>
          <p className="fxSectionLead">
            Five distinct evaluation routes — from instant funding to multi-phase challenges — all wired to the same
            simulated risk engine, dashboards, and payout flow.
          </p>
        </header>
        <div className="fxProgGrid">
          {programTabOrder.map((key) => {
            const p = programs[key];
            return (
              <article key={key} className="fxProgCard">
                <p className="fxEyebrow fxEyebrowLight">{p.headline}</p>
                <h3 className="fxProgTitle">{p.audience}</h3>
                <p className="fxProgIntro">{p.intro}</p>
                <ul className="fxProgChecklist">
                  {p.includes.slice(0, 3).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <button type="button" className="fxLinkBtn" onClick={() => onNavigate("programs")}>
                  Compare tiers <ArrowRight size={13} aria-hidden="true" />
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="fxSection fxSectionMuted">
        <header className="fxSectionHeader">
          <p className="fxEyebrow">Inside the platform</p>
          <h2 className="fxSectionTitle">{brokerStyleFeatures.headline}</h2>
        </header>
        <div className="fxFeatureGrid">
          {brokerStyleFeatures.bullets.map((f) => (
            <article key={f.title} className="fxFeatureCard">
              <Sparkles size={18} aria-hidden="true" className="fxFeatureIcon" />
              <h3 className="fxFeatureTitle">{f.title}</h3>
              <p className="fxFeatureBody">{f.detail}</p>
            </article>
          ))}
        </div>
        <ul className="fxFeatureBadges">
          {brokerStyleFeatures.checklist.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>

      <section className="fxSection">
        <div className="fxTwoColPanel">
          <div>
            <p className="fxEyebrow">How it works</p>
            <h2 className="fxSectionTitle">Three steps from sign-up to simulated payout</h2>
            <ol className="fxStepList">
              <li>
                <strong>Pick a program.</strong>
                <span>Choose evaluation route, account size, and any addons. Pay once at simulated checkout.</span>
              </li>
              <li>
                <strong>Trade the rules.</strong>
                <span>Hit profit targets, respect daily and max drawdowns, and stay within trading-day windows.</span>
              </li>
              <li>
                <strong>Withdraw on demand.</strong>
                <span>Once eligible, request a payout. Operators approve and settle through the demo flow.</span>
              </li>
            </ol>
            <button type="button" className="fxCtaOutline" onClick={() => onNavigate("how")}>
              Read the full walkthrough
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
          <aside className="fxFaqPanel">
            <p className="fxEyebrow fxEyebrowLight">FAQ</p>
            <h3 className="fxFaqTitle">Top traders ask</h3>
            <ul className="fxFaqList">
              {faqTopFive.map((q) => (
                <li key={q.question}>
                  <BookOpen size={14} aria-hidden="true" />
                  <div>
                    <p className="fxFaqQ">{q.question}</p>
                    <p className="fxFaqA">{q.answer}</p>
                  </div>
                </li>
              ))}
            </ul>
            <button type="button" className="fxLinkBtn" onClick={() => onNavigate("resources")}>
              See all resources <ArrowRight size={13} aria-hidden="true" />
            </button>
          </aside>
        </div>
      </section>

      <section className="fxCtaBlock">
        <div>
          <h2 className="fxCtaBlockTitle">Ready to prove your edge?</h2>
          <p className="fxCtaBlockLead">Open the portal, pick a package, and start trading the simulated desk in minutes.</p>
        </div>
        <div className="fxCtaBlockBtns">
          <button type="button" className="fxCtaFilled" onClick={onOpenPortal}>
            Open portal
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button type="button" className="fxCtaOutline" onClick={() => onNavigate("payouts")}>
            See payout policy
          </button>
        </div>
      </section>
    </MarketingShell>
  );
}
