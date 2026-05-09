import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import {
  type ChallengeTemplateJson,
  type ChallengePhaseJson,
  type PhaseTabKind,
  buildAllPlansIncludeRows,
  buildPhaseTabs,
  DAILY_LOSS_HELP,
  phaseJsonForTab,
  profitTargetUsd
} from "./packageTerms";

export interface PackageTermsExplorerProps {
  template: ChallengeTemplateJson | null;
  balanceUsd: number;
  priceUsd: number;
  programTitle: string;
  programSubtitle: string;
  audienceBadge?: string;
  instantFunded: boolean;
  drawdownTypeLabel: string;
  onPrimaryCta: () => void;
  primaryCtaLabel: string;
  showPromoBanner?: boolean;
  density?: "full" | "compact";
}

export default function PackageTermsExplorer({
  template,
  balanceUsd,
  priceUsd,
  programTitle,
  programSubtitle,
  audienceBadge,
  instantFunded,
  drawdownTypeLabel,
  onPrimaryCta,
  primaryCtaLabel,
  showPromoBanner = true,
  density = "full"
}: PackageTermsExplorerProps): JSX.Element {
  const tabs = useMemo(() => (template ? buildPhaseTabs(template, instantFunded) : []), [template, instantFunded]);
  const [activeTab, setActiveTab] = useState<PhaseTabKind>("PHASE_1");

  useEffect(() => {
    const first = tabs[0]?.kind ?? "FUNDED";
    setActiveTab(first);
  }, [tabs]);

  const tabKind = tabs.some((t) => t.kind === activeTab) ? activeTab : tabs[0]?.kind ?? "FUNDED";
  const phaseRow = template ? phaseJsonForTab(template, tabKind) : null;

  const includeRows = useMemo(() => {
    if (!template) return [];
    const phaseForIncludes =
      tabKind === "FUNDED" ? template.phases[template.phases.length - 1] ?? null : phaseRow;
    return buildAllPlansIncludeRows(template, phaseForIncludes, instantFunded || tabKind === "FUNDED", drawdownTypeLabel);
  }, [template, tabKind, phaseRow, instantFunded, drawdownTypeLabel]);

  const middleTitle =
    template && !instantFunded
      ? `The $${balanceUsd.toLocaleString()} ${programTitle.replace(/^\d+\s*/, "").trim()} account includes:`
      : `Funded desk rules ($${balanceUsd.toLocaleString()} simulated):`;

  if (!template) {
    return (
      <div className="fxPkgExplorer fxPkgExplorerLoading">
        <p className="fxPortalMuted">Loading program rules…</p>
      </div>
    );
  }

  function renderPhaseDetails(p: ChallengePhaseJson): JSX.Element {
    const ptUsd = profitTargetUsd(balanceUsd, p.profitTargetPct);
    return (
      <dl className="fxPkgExplorerMetrics">
        <div className="fxPkgExplorerMetric">
          <dt>Profit target</dt>
          <dd>
            ${ptUsd.toLocaleString()} ({p.profitTargetPct}%)
          </dd>
        </div>
        <div className="fxPkgExplorerMetric fxPkgExplorerMetricWide">
          <dt>Daily loss limit</dt>
          <dd>
            <strong>{p.dailyDrawdownPct}%</strong>
            <p className="fxPkgExplorerMetricHelp">{DAILY_LOSS_HELP}</p>
          </dd>
        </div>
        <div className="fxPkgExplorerMetric">
          <dt>Max static drawdown</dt>
          <dd>{p.maxDrawdownPct}%</dd>
        </div>
        <div className="fxPkgExplorerMetric">
          <dt>Consistency rule</dt>
          <dd className="fxPkgExplorerMuted">N/A — evaluated on funded desk</dd>
        </div>
        <div className="fxPkgExplorerMetric">
          <dt>Max position (lots)</dt>
          <dd>{p.maxPositionLots}</dd>
        </div>
        <div className="fxPkgExplorerMetric">
          <dt>Max total lots</dt>
          <dd>{p.maxTotalLots}</dd>
        </div>
      </dl>
    );
  }

  function renderFundedDetails(t: ChallengeTemplateJson): JSX.Element {
    const cf =
      t.payoutConsistencyMaxSingleDayProfitPct != null && t.payoutConsistencyMaxSingleDayProfitPct > 0
        ? `Best single trading day may not exceed ${t.payoutConsistencyMaxSingleDayProfitPct}% of cumulative gross realized profit since funded.`
        : "N/A";
    const dd = t.fundedDailyDrawdownPct ?? "—";
    const md = t.fundedMaxDrawdownPct ?? "—";
    return (
      <dl className="fxPkgExplorerMetrics">
        <div className="fxPkgExplorerMetric">
          <dt>Profit target</dt>
          <dd>{instantFunded ? "No staged target — instant funded simulation" : "Maintain funded rails below"}</dd>
        </div>
        <div className="fxPkgExplorerMetric fxPkgExplorerMetricWide">
          <dt>Daily loss limit (funded)</dt>
          <dd>
            <strong>{dd}%</strong>
            <p className="fxPkgExplorerMetricHelp">{DAILY_LOSS_HELP}</p>
          </dd>
        </div>
        <div className="fxPkgExplorerMetric">
          <dt>Max drawdown (funded)</dt>
          <dd>{md}%</dd>
        </div>
        <div className="fxPkgExplorerMetric fxPkgExplorerMetricWide">
          <dt>Consistency rule</dt>
          <dd>{cf}</dd>
        </div>
        <div className="fxPkgExplorerMetric">
          <dt>Min profit for payout</dt>
          <dd>${(t.payoutMinProfitUsd ?? 0).toLocaleString()} simulated</dd>
        </div>
      </dl>
    );
  }

  const promoPrice = +(priceUsd * 0.67).toFixed(2);

  return (
    <div className={`fxPkgExplorer fxPkgExplorer--${density}`}>
      {density === "full" && showPromoBanner && (
        <div className="fxPkgExplorerPromo">
          <Sparkles size={16} aria-hidden="true" />
          <span>
            <strong>Promo</strong> — illustrative 33% off at checkout · code{" "}
            <code className="fxPkgExplorerCode">PROPPRIME3</code>
          </span>
        </div>
      )}

      <div className="fxPkgExplorerMain">
        <article className="fxPkgExplorerSummary">
          <div className="fxPkgExplorerSummaryTop">
            <h3 className="fxPkgExplorerSummaryTitle">{programTitle}</h3>
            {audienceBadge && <span className="fxPkgExplorerBadge">{audienceBadge}</span>}
          </div>
          <p className="fxPkgExplorerSummarySub">{programSubtitle}</p>
          <div className="fxPkgExplorerPriceRow">
            {density === "full" && <span className="fxPkgExplorerPriceStrike">${priceUsd.toFixed(2)}</span>}
            <span className="fxPkgExplorerPrice">{density === "full" ? `$${promoPrice}` : `$${priceUsd.toFixed(2)}`}</span>
            <span className="fxPkgExplorerPriceHint">${balanceUsd.toLocaleString()} desk</span>
          </div>
          <button type="button" className="fxCtaFilled fxPkgExplorerCta" onClick={onPrimaryCta}>
            {primaryCtaLabel}
          </button>
        </article>

        <article className="fxPkgExplorerMiddle">
          <h4 className="fxPkgExplorerMiddleTitle">{middleTitle}</h4>
          {tabs.length > 1 && (
            <div className="fxPkgExplorerPhaseTabs" role="tablist" aria-label="Evaluation phase">
              {tabs.map((t) => (
                <button
                  key={t.kind}
                  type="button"
                  role="tab"
                  aria-selected={tabKind === t.kind}
                  className={`fxPkgExplorerPhaseTab${tabKind === t.kind ? " fxPkgExplorerPhaseTabActive" : ""}`}
                  onClick={() => setActiveTab(t.kind)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <div className="fxPkgExplorerPhaseBody" role="tabpanel">
            {tabKind === "FUNDED"
              ? renderFundedDetails(template)
              : phaseRow
                ? renderPhaseDetails(phaseRow)
                : renderFundedDetails(template)}
          </div>
        </article>

        <article className="fxPkgExplorerIncludes">
          <h4 className="fxPkgExplorerIncludesTitle">All plans include:</h4>
          <ul className="fxPkgExplorerIncludesList">
            {includeRows.map((row) => (
              <li key={row.label}>
                <CheckCircle2 size={14} aria-hidden="true" />
                <div className="fxPkgExplorerIncludeBody">
                  <span className="fxPkgExplorerIncludeLabel">{row.label}:</span>{" "}
                  <span className="fxPkgExplorerIncludeValue">{row.value}</span>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </div>
  );
}
