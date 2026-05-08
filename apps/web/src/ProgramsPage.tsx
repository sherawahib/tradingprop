import { useState } from "react";
import { ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";
import MarketingShell from "./MarketingShell";
import type { MarketingSubView } from "./marketingTypes";
import { programs, programTabLabel, programTabOrder, type ProgramKey, programAddons } from "./programCatalog";

interface ProgramsPageProps {
  onNavigate: (page: MarketingSubView) => void;
  onOpenPortal: () => void;
}

export default function ProgramsPage({ onNavigate, onOpenPortal }: ProgramsPageProps) {
  const [active, setActive] = useState<ProgramKey>("TWO_PHASE");
  const program = programs[active];

  return (
    <MarketingShell active="programs" onNavigate={onNavigate} onOpenPortal={onOpenPortal}>
      <section className="fxProgramsHero">
        <p className="fxEyebrow">Programs</p>
        <h1 className="fxSectionTitle">Five evaluation routes. One simulated desk.</h1>
        <p className="fxSectionLead">
          Each program runs against the same drawdown engine, audit log, and payout queue. Pick the structure that
          matches your trading style.
        </p>
      </section>

      <nav className="fxProgTabs" role="tablist" aria-label="Programs">
        {programTabOrder.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active === key}
            className={`fxProgTab${active === key ? " fxProgTabActive" : ""}`}
            onClick={() => setActive(key)}
          >
            {programTabLabel[key]}
          </button>
        ))}
      </nav>

      <section className="fxProgDetail">
        <header className="fxProgDetailHead">
          <p className="fxEyebrow fxEyebrowLight">{program.headline}</p>
          <h2 className="fxProgDetailTitle">{program.audience}</h2>
          <p className="fxProgDetailIntro">{program.intro}</p>
        </header>

        <div className="fxProgDetailGrid">
          <article className="fxProgPanel">
            <h3 className="fxProgPanelTitle">Account tiers</h3>
            <ul className="fxProgTierList">
              {program.accountTiers.map((tier) => (
                <li key={tier.sizeLabel}>
                  <strong>{tier.sizeLabel}</strong>
                  <span>{tier.feeLabel}</span>
                  {tier.note && <em>{tier.note}</em>}
                </li>
              ))}
            </ul>
            <button type="button" className="fxCtaFilled fxProgCta" onClick={onOpenPortal}>
              Continue in portal
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </article>

          <article className="fxProgPanel">
            <h3 className="fxProgPanelTitle">What's included</h3>
            <ul className="fxProgChecklist">
              {program.includes.map((line) => (
                <li key={line}>
                  <CheckCircle2 size={14} aria-hidden="true" />
                  {line}
                </li>
              ))}
            </ul>
          </article>

          <article className="fxProgPanel">
            <h3 className="fxProgPanelTitle">Rule highlights</h3>
            <ul className="fxProgRules">
              {program.ruleHighlights.map((line) => (
                <li key={line}>
                  <ShieldAlert size={14} aria-hidden="true" />
                  {line}
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="fxSection fxSectionMuted">
        <header className="fxSectionHeader">
          <p className="fxEyebrow">Optional addons</p>
          <h2 className="fxSectionTitle">Tune your evaluation at checkout</h2>
        </header>
        <div className="fxAddonGrid">
          {programAddons.map((a) => (
            <article key={a.title} className="fxAddonCard">
              <h3>{a.title}</h3>
              <p>{a.description}</p>
            </article>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}
