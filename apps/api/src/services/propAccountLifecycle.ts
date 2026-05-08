import type { ChallengeProgress } from "@paper-trader/shared";
import type { PlatformState } from "../domain";

/**
 * Restart evaluation ladder for `accountId` while keeping ledger balance and positions intact.
 * Clears HARD_BREACH / RULE_FREEZE violations linked to conduct for a clean retry.
 */
export function resetEvaluationForAccount(state: PlatformState, accountId: string): ChallengeProgress | null {
  const progress = state.progressByAccountId[accountId];
  if (!progress) return null;
  const ledger = state.ledgerByAccountId[accountId] ?? state.account;
  const now = Date.now();
  progress.phase = "PHASE_1";
  progress.status = "ACTIVE";
  progress.startedAt = now;
  progress.tradingDays = 0;
  progress.highWatermarkBalance = ledger.balance;
  progress.phaseStartBalance = ledger.balance;
  progress.currentDailyStartBalance = ledger.equity;
  progress.qualifiedTradingDayKeys = [];
  progress.realizedPnLUsdByUtcDay = {};
  progress.violatedAt = undefined;
  progress.passedAt = undefined;
  progress.fundedPhaseStartedAt = undefined;
  progress.lastTradeAtMs = undefined;

  state.violations = state.violations.filter(
    (v) =>
      v.accountId !== accountId ||
      (v.severity !== "HARD_BREACH" && v.severity !== "RULE_FREEZE")
  );

  const trader = state.traders.find((t) => t.accountId === accountId);
  if (trader) trader.accountStatus = "ACTIVE";

  return progress;
}
