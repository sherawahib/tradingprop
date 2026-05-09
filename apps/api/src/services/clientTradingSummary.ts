import type { PlatformState } from "../domain";
import { defaultAccountId } from "../domain";

/** Latest enforcement event surfaced to the portal — one violation, summarised. */
export interface ClientBreachReasonJson {
  code: string;
  severity: "WARNING" | "HARD_BREACH" | "RULE_FREEZE";
  message: string;
  createdAt: number;
  evidence: Record<string, number | string | boolean | null>;
}

/** Mirrors `GET /client/summary/:accountId` JSON — shared so portal + routes stay aligned. */
export type ClientTradingSummaryJson = {
  accountId: string;
  balance: number;
  equity: number;
  freeMargin: number;
  leverage: number;
  openPositions: number;
  pendingOrders: number;
  phase: string;
  challengeStatus: string;
  tradingDays: number;
  qualifyingTradingDays: number;
  evaluationCalendarDaysElapsed: number;
  programName: string;
  payoutSplitPct: number;
  payoutMinProfitUsd: number;
  ledgerProfitUsd: number;
  payoutEligibleApprox: boolean;
  /** When the evaluation moved into BREACHED or LOCKED. */
  violatedAt?: number;
  /** Latest enforcement event for this account when status is BREACHED or LOCKED. */
  breachReason?: ClientBreachReasonJson;
};

export function computeTradingAccountSummary(state: PlatformState, accountId: string): ClientTradingSummaryJson | null {
  const progress = state.progressByAccountId[accountId];
  if (!progress) return null;
  const ledger = state.ledgerByAccountId[accountId] ?? state.account;
  const openPositions = state.positions.filter((p) => (p.ownerAccountId ?? defaultAccountId) === accountId).length;
  const pendingOrders = state.orders.filter((o) => o.userId === accountId && o.status === "PENDING").length;
  const template = state.challengeTemplates.find((t) => t.id === progress.templateId);
  const qKeys = progress.qualifiedTradingDayKeys ?? [];
  const calendarElapsed = Math.max(0, Math.floor((Date.now() - progress.startedAt) / 86400000));
  const ledgerProfitUsd = Number((ledger.balance - progress.phaseStartBalance).toFixed(2));
  const payoutMinProfit = template?.payoutMinProfitUsd ?? 50;
  const traderRow = state.traders.find((t) => t.accountId === accountId);
  const payoutEligibleApprox =
    progress.phase === "FUNDED" &&
    (progress.status === "ACTIVE" || progress.status === "PASSED") &&
    traderRow?.kycStatus === "APPROVED" &&
    ledgerProfitUsd >= payoutMinProfit;

  let breachReason: ClientBreachReasonJson | undefined;
  if (progress.status === "BREACHED" || progress.status === "LOCKED") {
    const targetSeverity = progress.status === "BREACHED" ? "HARD_BREACH" : "RULE_FREEZE";
    const match = state.violations.find(
      (v) => v.accountId === accountId && v.severity === targetSeverity
    );
    if (match) {
      breachReason = {
        code: match.code,
        severity: match.severity,
        message: match.message,
        createdAt: match.createdAt,
        evidence: match.evidence
      };
    }
  }

  return {
    accountId,
    balance: ledger.balance,
    equity: ledger.equity,
    freeMargin: ledger.freeMargin,
    leverage: ledger.leverage,
    openPositions,
    pendingOrders,
    phase: progress.phase,
    challengeStatus: progress.status,
    tradingDays: progress.tradingDays,
    qualifyingTradingDays: qKeys.length,
    evaluationCalendarDaysElapsed: calendarElapsed,
    programName: template?.name ?? "—",
    payoutSplitPct: template?.payoutSplitPct ?? 80,
    payoutMinProfitUsd: payoutMinProfit,
    ledgerProfitUsd,
    payoutEligibleApprox,
    ...(progress.violatedAt ? { violatedAt: progress.violatedAt } : {}),
    ...(breachReason ? { breachReason } : {})
  };
}
