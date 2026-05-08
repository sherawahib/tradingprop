import type { AccountState, ChallengeProgress, ChallengePhase, ChallengeTemplate, Position } from "@paper-trader/shared";
import { defaultAccountId } from "../domain";
import { StateStore } from "../db/stateStore";
import { ViolationService } from "./violationService";

function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function phaseOrdinal(p: Exclude<ChallengePhase, "FUNDED">): number {
  if (p === "PHASE_1") return 1;
  if (p === "PHASE_2") return 2;
  return 3;
}

export class ChallengeService {
  constructor(
    private readonly store: StateStore,
    private readonly violations: ViolationService
  ) {}

  getProgress(accountId = defaultAccountId): ChallengeProgress | null {
    return this.store.get().progressByAccountId[accountId] ?? null;
  }

  getTemplate(progress: ChallengeProgress): ChallengeTemplate | null {
    return this.store.get().challengeTemplates.find((t) => t.id === progress.templateId) ?? null;
  }

  appendRealizedPnlUtcDay(accountId: string, realizedUsd: number, atMs: number): void {
    const dk = utcDayKey(atMs);
    this.store.update((s) => {
      const p = s.progressByAccountId[accountId];
      if (!p || !Number.isFinite(realizedUsd) || realizedUsd === 0) return;
      const prev = { ...(p.realizedPnLUsdByUtcDay ?? {}) };
      prev[dk] = Number(((prev[dk] ?? 0) + realizedUsd).toFixed(2));
      p.realizedPnLUsdByUtcDay = prev;
    });
  }

  recordQualifyingTradingDay(accountId: string, atMs = Date.now()): void {
    const key = utcDayKey(atMs);
    this.store.update((s) => {
      const p = s.progressByAccountId[accountId];
      if (!p) return;
      if (p.status === "BREACHED" || p.status === "LOCKED") return;
      const prev = p.qualifiedTradingDayKeys ?? [];
      if (prev.includes(key)) {
        p.tradingDays = prev.length;
        return;
      }
      p.qualifiedTradingDayKeys = [...prev, key];
      p.tradingDays = p.qualifiedTradingDayKeys.length;
    });
  }

  private applyHighWatermark(accountId: string, accountBalance: number): void {
    this.store.update((s) => {
      const p = s.progressByAccountId[accountId];
      if (p && accountBalance > p.highWatermarkBalance) p.highWatermarkBalance = accountBalance;
    });
  }

  getPayoutSingleDayConsistency(
    template: ChallengeTemplate | null | undefined,
    progress: ChallengeProgress,
    grossProfitUsd: number
  ):
    | { active: false }
    | {
        active: true;
        passes: boolean;
        pct: number;
        maxSingleDayUsd: number;
        capUsd: number;
        grossProfitUsd: number;
        fundedPhaseStartMs: number;
      } {
    const pct = template?.payoutConsistencyMaxSingleDayProfitPct;
    if (pct === undefined) return { active: false };
    const gateFloor = Math.max(template?.payoutMinProfitUsd ?? 50, 250);
    if (grossProfitUsd < gateFloor) return { active: false };
    const fundedStart = progress.fundedPhaseStartedAt ?? progress.passedAt ?? progress.startedAt;
    const buckets = progress.realizedPnLUsdByUtcDay ?? {};
    let maxDay = 0;
    for (const [dayKey, raw] of Object.entries(buckets)) {
      const dayStartMs = Date.parse(`${dayKey}T00:00:00.000Z`);
      if (!Number.isFinite(dayStartMs) || dayStartMs < fundedStart) continue;
      if (typeof raw === "number" && raw > maxDay) maxDay = raw;
    }
    const cap = (grossProfitUsd * pct) / 100 + 1e-6;
    return {
      active: true,
      passes: maxDay <= cap,
      pct,
      maxSingleDayUsd: maxDay,
      capUsd: cap,
      grossProfitUsd,
      fundedPhaseStartMs: fundedStart
    };
  }

  payoutsConsistencyAllows(template: ChallengeTemplate | null | undefined, progress: ChallengeProgress, grossProfitUsd: number): boolean {
    const s = this.getPayoutSingleDayConsistency(template, progress, grossProfitUsd);
    if (!s.active) return true;
    return s.passes;
  }

  private fundedRiskLimits(template: ChallengeTemplate): { maxPositionLots: number; maxTotalLots: number; daily: number; max: number } {
    const rows = [...template.phases].sort((a, b) => phaseOrdinal(a.phase) - phaseOrdinal(b.phase));
    const pLast = rows[rows.length - 1]!;
    return {
      maxPositionLots: pLast.maxPositionLots,
      maxTotalLots: pLast.maxTotalLots,
      daily: template.fundedDailyDrawdownPct ?? pLast.dailyDrawdownPct,
      max: template.fundedMaxDrawdownPct ?? pLast.maxDrawdownPct
    };
  }

  private evaluateFunded(
    accountId: string,
    account: AccountState,
    positions: Position[],
    progress: ChallengeProgress,
    template: ChallengeTemplate
  ): void {
    const { maxPositionLots, maxTotalLots, daily, max } = this.fundedRiskLimits(template);
    const totalLots = positions.reduce((sum, p) => sum + p.lotSize, 0);
    const maxLot = Math.max(0, ...positions.map((p) => p.lotSize));
    const equityDrop =
      progress.currentDailyStartBalance > 0
        ? ((progress.currentDailyStartBalance - account.equity) / progress.currentDailyStartBalance) * 100
        : 0;
    const maxDrop =
      progress.highWatermarkBalance > 0
        ? ((progress.highWatermarkBalance - account.equity) / progress.highWatermarkBalance) * 100
        : 0;

    this.applyHighWatermark(accountId, account.balance);

    if (equityDrop > daily) {
      this.violations.add(accountId, "DAILY_DRAWDOWN_BREACH", "HARD_BREACH", "Funded account: daily drawdown breached.", {
        equityDrop,
        limit: daily
      });
      return;
    }
    if (maxDrop > max) {
      this.violations.add(accountId, "MAX_DRAWDOWN_BREACH", "HARD_BREACH", "Funded account: maximum drawdown breached.", {
        maxDrop,
        limit: max
      });
      return;
    }
    if (maxLot > maxPositionLots) {
      this.violations.add(accountId, "MAX_POSITION_SIZE_BREACH", "HARD_BREACH", "Funded account: position lot limit breached.", {
        maxLot,
        limit: maxPositionLots
      });
      return;
    }
    if (totalLots > maxTotalLots) {
      this.violations.add(accountId, "MAX_TOTAL_LOTS_BREACH", "HARD_BREACH", "Funded account: total exposure limit breached.", {
        totalLots,
        limit: maxTotalLots
      });
      return;
    }
  }

  private maybeInactivityBreach(accountId: string, template: ChallengeTemplate, nowMs: number): void {
    const days = template.inactivityMaxCalendarDaysWithoutTrade;
    if (typeof days !== "number" || days <= 0) return;
    const progress = this.getProgress(accountId);
    if (!progress) return;
    if (progress.status === "BREACHED" || progress.status === "LOCKED") return;
    const eligible =
      progress.status === "ACTIVE" ||
      (progress.phase === "FUNDED" && progress.status === "PASSED");
    if (!eligible) return;
    const anchor = progress.lastTradeAtMs ?? progress.startedAt;
    if (nowMs - anchor <= days * 86_400_000) return;
    this.violations.add(
      accountId,
      "INACTIVITY_BREACH",
      "HARD_BREACH",
      "Account breached: no simulated trade activity within the program inactivity window.",
      {
        limitCalendarDays: days,
        anchorMs: anchor,
        evaluatedAt: nowMs,
        templateId: template.id
      }
    );
  }

  evaluate(accountId: string, account: AccountState, positions: Position[]): void {
    let progress = this.getProgress(accountId);
    if (!progress || progress.status === "BREACHED" || progress.status === "LOCKED") return;
    const template = this.getTemplate(progress);
    if (!template) return;

    const now = Date.now();
    this.maybeInactivityBreach(accountId, template, now);
    progress = this.getProgress(accountId);
    if (!progress || progress.status === "BREACHED" || progress.status === "LOCKED") return;

    if (progress.phase === "FUNDED" && (progress.status === "ACTIVE" || progress.status === "PASSED")) {
      this.evaluateFunded(accountId, account, positions, progress, template);
      return;
    }

    if (progress.status !== "ACTIVE") return;
    if (progress.phase === "FUNDED") return;

    const phasesSorted = [...template.phases].sort((a, b) => phaseOrdinal(a.phase) - phaseOrdinal(b.phase));
    const phaseRules = phasesSorted.find((p) => p.phase === progress.phase);
    if (!phaseRules) return;

    const totalLots = positions.reduce((sum, p) => sum + p.lotSize, 0);
    const maxLot = Math.max(0, ...positions.map((p) => p.lotSize));
    const equityDrop =
      progress.currentDailyStartBalance > 0
        ? ((progress.currentDailyStartBalance - account.equity) / progress.currentDailyStartBalance) * 100
        : 0;
    const maxDrop =
      progress.highWatermarkBalance > 0
        ? ((progress.highWatermarkBalance - account.equity) / progress.highWatermarkBalance) * 100
        : 0;

    this.applyHighWatermark(accountId, account.balance);

    if (equityDrop > phaseRules.dailyDrawdownPct) {
      this.violations.add(accountId, "DAILY_DRAWDOWN_BREACH", "HARD_BREACH", "Daily drawdown breached.", {
        equityDrop,
        limit: phaseRules.dailyDrawdownPct
      });
      return;
    }
    if (maxDrop > phaseRules.maxDrawdownPct) {
      this.violations.add(accountId, "MAX_DRAWDOWN_BREACH", "HARD_BREACH", "Maximum drawdown breached.", {
        maxDrop,
        limit: phaseRules.maxDrawdownPct
      });
      return;
    }
    if (maxLot > phaseRules.maxPositionLots) {
      this.violations.add(accountId, "MAX_POSITION_SIZE_BREACH", "HARD_BREACH", "Position lot limit breached.", {
        maxLot,
        limit: phaseRules.maxPositionLots
      });
      return;
    }
    if (totalLots > phaseRules.maxTotalLots) {
      this.violations.add(accountId, "MAX_TOTAL_LOTS_BREACH", "HARD_BREACH", "Total exposure lot limit breached.", {
        totalLots,
        limit: phaseRules.maxTotalLots
      });
      return;
    }

    const calendarElapsedDays = Math.floor((now - progress.startedAt) / 86400000);
    if (calendarElapsedDays > phaseRules.maxTradingDays) {
      this.violations.add(accountId, "EVALUATION_TIME_EXPIRED", "HARD_BREACH", "Maximum calendar days for this evaluation phase were exceeded.", {
        calendarElapsedDays,
        limit: phaseRules.maxTradingDays,
        phase: progress.phase
      });
      return;
    }

    const pnlPct =
      progress.phaseStartBalance > 0 ? ((account.balance - progress.phaseStartBalance) / progress.phaseStartBalance) * 100 : 0;
    const qualifiedDays = progress.qualifiedTradingDayKeys?.length ?? 0;

    this.store.update((s) => {
      const p = s.progressByAccountId[accountId];
      if (!p) return;
      p.tradingDays = qualifiedDays;
      const metProfit = pnlPct >= phaseRules.profitTargetPct && qualifiedDays >= phaseRules.minTradingDays;
      if (!metProfit) return;

      const idx = phasesSorted.findIndex((ph) => ph.phase === p.phase);
      if (idx >= 0 && idx < phasesSorted.length - 1) {
        p.phase = phasesSorted[idx + 1]!.phase;
        p.phaseStartBalance = account.balance;
        p.currentDailyStartBalance = account.equity;
        p.startedAt = now;
        p.highWatermarkBalance = Math.max(account.balance, p.highWatermarkBalance);
        return;
      }

      p.phase = "FUNDED";
      p.status = "ACTIVE";
      p.passedAt = now;
      p.phaseStartBalance = account.balance;
      p.currentDailyStartBalance = account.equity;
      p.fundedPhaseStartedAt = now;
      p.startedAt = now;
      p.highWatermarkBalance = Math.max(account.balance, p.highWatermarkBalance);
    });
  }

  rollDaily(accountId = defaultAccountId): void {
    this.store.update((s) => {
      const p = s.progressByAccountId[accountId];
      const ledger = s.ledgerByAccountId[accountId] ?? s.account;
      if (p) p.currentDailyStartBalance = ledger.equity;
    });
  }

  rollDailyAll(): void {
    this.store.update((s) => {
      for (const accountId of Object.keys(s.progressByAccountId)) {
        const p = s.progressByAccountId[accountId];
        const ledger = s.ledgerByAccountId[accountId] ?? s.account;
        if (p) p.currentDailyStartBalance = ledger.equity;
      }
    });
  }
}
