export type ForexSymbol = "EURUSD" | "GBPUSD" | "USDJPY" | "XAUUSD" | "XAGUSD" | "USOILUSD";

export type OrderType = "MARKET" | "LIMIT" | "STOP";
export type OrderSide = "BUY" | "SELL";
export type OrderStatus = "NEW" | "PENDING" | "FILLED" | "CANCELED" | "REJECTED";

export interface PriceTick {
  symbol: ForexSymbol;
  bid: number;
  ask: number;
  timestamp: number;
}

export interface Order {
  id: string;
  userId: string;
  symbol: ForexSymbol;
  type: OrderType;
  side: OrderSide;
  lotSize: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  status: OrderStatus;
  createdAt: number;
  filledPrice?: number;
  closedAt?: number;
  closePrice?: number;
  closeReason?: "MANUAL" | "STOP_LOSS" | "TAKE_PROFIT";
}

export interface Position {
  id: string;
  /** Trading account / challenge account id (defaults to legacy demo user if omitted). */
  ownerAccountId?: string;
  symbol: ForexSymbol;
  side: OrderSide;
  lotSize: number;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  openedAt: number;
  unrealizedPnl: number;
}

export interface AccountState {
  balance: number;
  equity: number;
  usedMargin: number;
  freeMargin: number;
  leverage: number;
}

export type ChallengePhase = "PHASE_1" | "PHASE_2" | "PHASE_3" | "FUNDED";
export type EvaluationStatus = "ACTIVE" | "PASSED" | "BREACHED" | "LOCKED";
/** HARD_BREACH fails the evaluation; RULE_FREEZE locks trading until operator unlocks. */
export type ViolationSeverity = "WARNING" | "HARD_BREACH" | "RULE_FREEZE";
export type ViolationCode =
  | "DAILY_DRAWDOWN_BREACH"
  | "MAX_DRAWDOWN_BREACH"
  | "MAX_POSITION_SIZE_BREACH"
  | "MAX_LOT_SIZE_BREACH"
  | "MAX_TOTAL_LOTS_BREACH"
  | "AUTOMATED_TRADING_PATTERN"
  | "FAST_SCALPING_PATTERN"
  | "EVALUATION_TIME_EXPIRED"
  | "PROHIBITED_OPPOSED_HEDGE"
  | "COPY_TRADING_MIRROR_PATTERN"
  | "MARTINGALE_GRID_PATTERN"
  | "PAYOUT_CONSISTENCY_BLOCKED"
  | "INACTIVITY_BREACH";

export interface ChallengeTemplate {
  id: string;
  name: string;
  phases: Array<{
    phase: Exclude<ChallengePhase, "FUNDED">;
    profitTargetPct: number;
    minTradingDays: number;
    maxTradingDays: number;
    dailyDrawdownPct: number;
    maxDrawdownPct: number;
    maxPositionLots: number;
    maxTotalLots: number;
  }>;
  payoutSplitPct: number;
  /** Sim funded account drawdown rails (evaluation uses phases). Defaults use phase-2-like limits server-side if omitted. */
  fundedDailyDrawdownPct?: number;
  fundedMaxDrawdownPct?: number;
  /** Minimum withdrawable simulated profit before split (USD). */
  payoutMinProfitUsd?: number;
  /**
   * Payout gated until max single-day simulated realized profit ≤ this % of cumulative gross realized profit since funded (e.g. 40 ⇒ best day ≤ 40%).
   */
  payoutConsistencyMaxSingleDayProfitPct?: number;
  /** ALLOWED keeps prior behavior; blackout blocks NEW risk during deterministic demo high-impact windows (UTC). */
  newsTradingPolicy?: "ALLOWED" | "SYNTH_HIGH_IMPACT_BLACKOUT";
  /**
   * Simulated conduct heuristics (not any firm’s official rulebook). When false, server skips that detector for this template.
   * Omitted fields default to strict (enforce) for backwards compatibility.
   */
  enforceMartingaleHeuristic?: boolean;
  enforceCopyMirrorHeuristic?: boolean;
  /**
   * HARD_BREACH if no trade activity for this many whole calendar days (eval + funded). Activity = open or close fill timestamp.
   * Omit or 0 to disable. Inspired by common prop “inactivity” clauses — tune per program.
   */
  inactivityMaxCalendarDaysWithoutTrade?: number;
  /** Optional label for UI/docs (e.g. FTMO_INSPIRED / FXIFY_INSPIRED). */
  ruleStyleNote?: string;
}

export interface ChallengeProgress {
  accountId: string;
  templateId: string;
  phase: ChallengePhase;
  status: EvaluationStatus;
  startedAt: number;
  /** Count of qualifying days (had at least one fill / opening trade that day UTC). Mirrors qualifiedTradingDayKeys.length when present. */
  tradingDays: number;
  highWatermarkBalance: number;
  phaseStartBalance: number;
  currentDailyStartBalance: number;
  violatedAt?: number;
  passedAt?: number;
  /** UTC calendar dates (YYYY-MM-DD) where the trader had qualifying activity toward min trading days. */
  qualifiedTradingDayKeys?: string[];
  /** When simulated funded phase began (risk clock for funded drawdown). */
  fundedPhaseStartedAt?: number;
  /** Cumulative simulated realized PnL (USD) keyed by UTC day YYYY-MM-DD for consistency / analytics. */
  realizedPnLUsdByUtcDay?: Record<string, number>;
  /** Last time a trade added or reduced risk (open fill or close); used for inactivity breach when template enables it. */
  lastTradeAtMs?: number;
}

export interface ViolationRecord {
  id: string;
  accountId: string;
  code: ViolationCode;
  severity: ViolationSeverity;
  message: string;
  evidence: Record<string, number | string | boolean | null>;
  createdAt: number;
}

export type PayoutStatus = "REQUESTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "PAID";

export interface PayoutRequest {
  id: string;
  accountId: string;
  amount: number;
  status: PayoutStatus;
  requestedAt: number;
  reviewedAt?: number;
  paidAt?: number;
  note?: string;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  accountId?: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: number;
}
