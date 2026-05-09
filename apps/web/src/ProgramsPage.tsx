import { useEffect, useMemo, useState } from "react";
import MarketingShell from "./MarketingShell";
import type { MarketingSubView } from "./marketingTypes";
import { programs, programTabLabel, programTabOrder, type ProgramKey, programAddons } from "./programCatalog";
import PackageTermsExplorer from "./PackageTermsExplorer";
import {
  type ChallengeTemplateJson,
  type ProgramSkuJson,
  fetchChallengeTemplates,
  fetchProgramSkus,
  findTemplate
} from "./packageTerms";

interface ProgramsPageProps {
  onNavigate: (page: MarketingSubView) => void;
  onOpenPortal: () => void;
}

const TWO_PHASE_VARIANTS: Array<{ label: string; templateId: string; drawdownLabel: string }> = [
  { label: "Classic Static", templateId: "std-two-step", drawdownLabel: "Static" },
  { label: "Standard Trailing", templateId: "preset-fxify-two-phase", drawdownLabel: "Static (FXIFY-style rails)" },
  { label: "Pro Static", templateId: "preset-ftmo-two-phase", drawdownLabel: "Static (stricter conduct + news blackout)" }
];

function formatDeskSizeLabel(usd: number): string {
  if (usd >= 1000 && usd % 1000 === 0) return `$${usd / 1000}k`;
  return `$${usd.toLocaleString()}`;
}

export default function ProgramsPage({ onNavigate, onOpenPortal }: ProgramsPageProps) {
  const [active, setActive] = useState<ProgramKey>("TWO_PHASE");
  const [templates, setTemplates] = useState<ChallengeTemplateJson[]>([]);
  const [skus, setSkus] = useState<ProgramSkuJson[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [twoPhaseVariantIdx, setTwoPhaseVariantIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchChallengeTemplates(), fetchProgramSkus()])
      .then(([t, s]) => {
        if (!cancelled) {
          setTemplates(t);
          setSkus(s);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : "Failed to load programs.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const program = programs[active];

  const filteredSkus = useMemo(() => {
    const family = active;
    return skus.filter((row) => {
      if (row.family !== family) return false;
      if (family === "INSTANT_FUNDING") return !!row.instantFundedPassthrough;
      if (row.instantFundedPassthrough) return false;
      if (family === "TWO_PHASE") {
        const tid = TWO_PHASE_VARIANTS[twoPhaseVariantIdx]?.templateId;
        return row.templateId === tid;
      }
      return true;
    });
  }, [skus, active, twoPhaseVariantIdx]);

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  useEffect(() => {
    const first = filteredSkus[0]?.slug ?? null;
    setSelectedSlug(first);
  }, [filteredSkus]);

  const selectedSku = useMemo(
    () => filteredSkus.find((s) => s.slug === selectedSlug) ?? filteredSkus[0] ?? null,
    [filteredSkus, selectedSlug]
  );

  const variantMeta =
    active === "TWO_PHASE" ? TWO_PHASE_VARIANTS[twoPhaseVariantIdx] ?? TWO_PHASE_VARIANTS[0]! : null;

  const drawdownLabel =
    variantMeta?.drawdownLabel ??
    (active === "LIGHTNING" ? "Static (sprint)" : active === "INSTANT_FUNDING" ? "Funded-first" : "Static");

  const template = selectedSku ? findTemplate(templates, selectedSku.templateId) : null;

  const tabIndex = programTabOrder.indexOf(active);
  const numberedTitle = `${tabIndex + 1} ${programTabLabel[active]}`;

  const evalSteps =
    template && !selectedSku?.instantFundedPassthrough
      ? template.phases.filter((p) => p.phase !== "FUNDED").length
      : 0;
  const programSubtitle =
    selectedSku?.instantFundedPassthrough || active === "INSTANT_FUNDING"
      ? `${program.headline} — skip evaluation, funded-style desk`
      : `${program.headline}${variantMeta ? ` — ${variantMeta.label}` : ""}, ${evalSteps} step${evalSteps === 1 ? "" : "s"}`;

  return (
    <MarketingShell active="programs" onNavigate={onNavigate} onOpenPortal={onOpenPortal}>
      <section className="fxProgramsHero">
        <p className="fxEyebrow">Programs</p>
        <h1 className="fxSectionTitle">Five evaluation routes. One simulated desk.</h1>
        <p className="fxSectionLead">
          Every tier below mirrors the live rule engine: profit targets, daily loss, max drawdown, funded rails, and
          payout consistency — spelled out per phase exactly as enforced in the terminal.
        </p>
      </section>

      <nav className="fxProgTabs fxProgTabsNumbered" role="tablist" aria-label="Programs">
        {programTabOrder.map((key, i) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active === key}
            className={`fxProgTab${active === key ? " fxProgTabActive" : ""}`}
            onClick={() => {
              setActive(key);
              if (key !== "TWO_PHASE") setTwoPhaseVariantIdx(0);
            }}
          >
            <span className="fxProgTabNum">{i + 1}</span>
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

        {active === "TWO_PHASE" && (
          <div className="fxProgPickerRow">
            <div className="fxProgVariantGroup" role="group" aria-label="Drawdown profile">
              {TWO_PHASE_VARIANTS.map((v, idx) => (
                <button
                  key={v.templateId}
                  type="button"
                  className={`fxProgVariantChip${twoPhaseVariantIdx === idx ? " fxProgVariantChipActive" : ""}`}
                  onClick={() => setTwoPhaseVariantIdx(idx)}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <div className="fxProgPromoMini" aria-hidden="false">
              <strong>Anniversary-style promo</strong>
              <span>33% off illustrative · PROPPRIME3</span>
            </div>
          </div>
        )}

        <div className="fxProgBalanceRow" role="tablist" aria-label="Account size">
          {filteredSkus.length === 0 ? (
            <p className="fxPortalMuted">{loadErr ?? "No tiers loaded yet — start the API."}</p>
          ) : (
            filteredSkus
              .slice()
              .sort((a, b) => a.simulatedBalanceUsd - b.simulatedBalanceUsd)
              .map((row) => (
                <button
                  key={row.slug}
                  type="button"
                  role="tab"
                  aria-selected={selectedSku?.slug === row.slug}
                  className={`fxProgBalancePill${selectedSku?.slug === row.slug ? " fxProgBalancePillActive" : ""}`}
                  onClick={() => setSelectedSlug(row.slug)}
                >
                  {formatDeskSizeLabel(row.simulatedBalanceUsd)}
                </button>
              ))
          )}
        </div>

        {loadErr && filteredSkus.length > 0 && <p className="fxAuthError fxProgWarn">{loadErr}</p>}

        {selectedSku && (
          <PackageTermsExplorer
            template={template}
            balanceUsd={selectedSku.simulatedBalanceUsd}
            priceUsd={selectedSku.priceUsd}
            programTitle={numberedTitle}
            programSubtitle={programSubtitle}
            audienceBadge={program.audience.split(".")[0]?.slice(0, 42)}
            instantFunded={!!selectedSku.instantFundedPassthrough}
            drawdownTypeLabel={drawdownLabel}
            onPrimaryCta={onOpenPortal}
            primaryCtaLabel="Start trading — open portal"
            density="full"
          />
        )}
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
