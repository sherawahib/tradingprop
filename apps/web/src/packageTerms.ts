import { API_BASE } from "./clientAuth";

/** Shape returned by `GET /challenge/templates` (subset used by UI). */
export interface ChallengePhaseJson {
  phase: "PHASE_1" | "PHASE_2" | "PHASE_3" | "FUNDED";
  profitTargetPct: number;
  minTradingDays: number;
  maxTradingDays: number;
  dailyDrawdownPct: number;
  maxDrawdownPct: number;
  maxPositionLots: number;
  maxTotalLots: number;
}

export interface ChallengeTemplateJson {
  id: string;
  name: string;
  phases: ChallengePhaseJson[];
  payoutSplitPct: number;
  fundedDailyDrawdownPct?: number;
  fundedMaxDrawdownPct?: number;
  payoutMinProfitUsd?: number;
  payoutConsistencyMaxSingleDayProfitPct?: number;
  newsTradingPolicy?: "ALLOWED" | "SYNTH_HIGH_IMPACT_BLACKOUT";
  inactivityMaxCalendarDaysWithoutTrade?: number;
  ruleStyleNote?: string;
}

export interface ProgramSkuJson {
  slug: string;
  templateId: string;
  simulatedBalanceUsd: number;
  priceUsd: number;
  packageTypeLabel: string;
  tagline?: string | null;
  instantFundedPassthrough?: boolean;
  family?: string | null;
}

export async function fetchChallengeTemplates(): Promise<ChallengeTemplateJson[]> {
  const r = await fetch(`${API_BASE}/challenge/templates`);
  if (!r.ok) throw new Error("Could not load challenge templates.");
  return (await r.json()) as ChallengeTemplateJson[];
}

export async function fetchProgramSkus(): Promise<ProgramSkuJson[]> {
  const r = await fetch(`${API_BASE}/challenge/program-skus`);
  if (!r.ok) throw new Error("Could not load program SKUs.");
  return (await r.json()) as ProgramSkuJson[];
}

export function findTemplate(templates: ChallengeTemplateJson[], id: string): ChallengeTemplateJson | null {
  return templates.find((t) => t.id === id) ?? null;
}

export function isInstantFundedPlaceholderTemplate(t: ChallengeTemplateJson): boolean {
  return (
    t.phases.length === 1 &&
    t.phases[0]!.profitTargetPct >= 90 &&
    t.phases[0]!.maxTradingDays >= 900
  );
}

export function profitTargetUsd(balanceUsd: number, profitTargetPct: number): number {
  return Math.round((balanceUsd * profitTargetPct) / 100);
}

export const DAILY_LOSS_HELP =
  "This is measured against the balance recorded at the end of the previous trading day (5PM EST reference). If equity falls below this floor intraday, the account is breached.";

export function formatMaxTradingDays(maxDays: number): string {
  if (maxDays >= 900) return "Unlimited";
  return `${maxDays} days`;
}

export interface PlanIncludeRow {
  label: string;
  value: string;
}

export function buildAllPlansIncludeRows(
  template: ChallengeTemplateJson,
  phase: ChallengePhaseJson | null,
  instantFunded: boolean,
  drawdownTypeLabel: string
): PlanIncludeRow[] {
  const p = phase ?? template.phases[0] ?? null;
  const news =
    template.newsTradingPolicy === "SYNTH_HIGH_IMPACT_BLACKOUT"
      ? "High-impact news blackout windows"
      : "Yes (simulated)";
  const inactivity =
    template.inactivityMaxCalendarDaysWithoutTrade && template.inactivityMaxCalendarDaysWithoutTrade > 0
      ? `Trade at least once every ${template.inactivityMaxCalendarDaysWithoutTrade} calendar days`
      : "No mandatory inactivity clock";

  const rows: PlanIncludeRow[] = [
    {
      label: "Minimum trading days",
      value: instantFunded ? "Funded desk — see payout rules" : p ? `${p.minTradingDays} days` : "—"
    },
    {
      label: "Maximum trading days",
      value: instantFunded ? "Unlimited" : p ? formatMaxTradingDays(p.maxTradingDays) : "—"
    },
    { label: "Performance split", value: `Up to ${template.payoutSplitPct}%` },
    { label: "Leverage", value: "Up to 30:1 (simulated)" },
    { label: "Drawdown type", value: drawdownTypeLabel },
    { label: "EAs allowed", value: "Yes (simulated)" },
    { label: "Hold over weekend", value: "Yes" },
    { label: "Trade through news", value: news },
    { label: "Platform", value: "Web terminal · TradingView embed (simulated)" },
    { label: "Drawdown lock upon payout", value: "No (demo)" },
    { label: "Payout on demand", value: "No — operator review (demo)" },
    {
      label: "Payout frequency",
      value: `Min profit $${template.payoutMinProfitUsd ?? 50} · typically 14–30 day cadence (simulated)`
    },
    { label: "Inactivity", value: inactivity }
  ];

  const pct = template.payoutConsistencyMaxSingleDayProfitPct;
  if (pct != null && pct > 0) {
    rows.splice(8, 0, {
      label: "Payout consistency (funded)",
      value: `Best single day ≤ ${pct}% of cumulative gross profit`
    });
  }

  return rows;
}

export type PhaseTabKind = "PHASE_1" | "PHASE_2" | "PHASE_3" | "FUNDED";

export function buildPhaseTabs(
  template: ChallengeTemplateJson,
  instantFunded: boolean
): Array<{ kind: PhaseTabKind; label: string }> {
  if (instantFunded || isInstantFundedPlaceholderTemplate(template)) {
    return [{ kind: "FUNDED", label: "Funded desk" }];
  }
  const tabs: Array<{ kind: PhaseTabKind; label: string }> = [];
  for (const ph of template.phases) {
    if (ph.phase === "PHASE_1") tabs.push({ kind: "PHASE_1", label: "Phase 1" });
    if (ph.phase === "PHASE_2") tabs.push({ kind: "PHASE_2", label: "Phase 2" });
    if (ph.phase === "PHASE_3") tabs.push({ kind: "PHASE_3", label: "Phase 3" });
  }
  tabs.push({ kind: "FUNDED", label: "Funded" });
  return tabs;
}

export function phaseJsonForTab(
  template: ChallengeTemplateJson,
  tab: PhaseTabKind
): ChallengePhaseJson | null {
  if (tab === "FUNDED") return null;
  return template.phases.find((p) => p.phase === tab) ?? null;
}
