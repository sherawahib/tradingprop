/**
 * Tradeable instrument symbols mirrored to the MT5 broker. Treated as plain
 * uppercase strings everywhere so the platform can carry the broker's full
 * tradable universe without compile-time bookkeeping for every single ticker.
 */
export type ForexSymbol = string;

export * from "./marketSession";

/** Sensible default fallback when the API hasn't replied yet. */
export const DEFAULT_SYMBOL = "EURUSD";

/**
 * Curated catalog of instruments the platform exposes by default. The MT5
 * bridge auto-discovers which of these the broker actually carries (with
 * common suffix variants like `.m`, `.raw`, `.pro`) and silently drops any
 * symbol the broker doesn't expose.
 */
export const TRADE_SYMBOLS: string[] = [
  // FX majors
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "AUDUSD",
  "USDCAD",
  "USDCHF",
  "NZDUSD",
  // FX crosses
  "EURGBP",
  "EURJPY",
  "EURAUD",
  "EURCHF",
  "EURCAD",
  "EURNZD",
  "GBPJPY",
  "GBPAUD",
  "GBPCHF",
  "GBPCAD",
  "GBPNZD",
  "AUDJPY",
  "AUDCAD",
  "AUDCHF",
  "AUDNZD",
  "NZDJPY",
  "CADJPY",
  "CHFJPY",
  // Metals
  "XAUUSD",
  "XAGUSD",
  "XPTUSD",
  "XPDUSD",
  // Energy
  "USOILUSD",
  "XNGUSD",
  // Indices
  "US30",
  "US500",
  "DE30",
  "UK100",
  "JP225",
  "AUS200",
  // Crypto
  "BTCUSD",
  "ETHUSD",
  "SOLUSD",
  "BNBUSD",
  "XRPUSD",
  "ADAUSD",
  "DOGEUSD",
  "AVAXUSD",
  "LTCUSD",
  "LINKUSD",
  "DOTUSD",
  "MATICUSD"
];

/** Quote-currency-aware decimal precision used for display + rounding. */
export function symbolDecimals(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s === "DOGEUSD") return 6;
  if (s === "XRPUSD" || s === "ADAUSD" || s === "MATICUSD" || s === "DOTUSD") return 5;
  if (s === "USDJPY" || s.endsWith("JPY")) return 3;
  if (s === "XAGUSD") return 3;
  if (
    s === "XAUUSD" ||
    s === "USOILUSD" ||
    s === "XPTUSD" ||
    s === "XPDUSD" ||
    s === "BTCUSD" ||
    s === "ETHUSD" ||
    s === "SOLUSD" ||
    s === "BNBUSD" ||
    s === "AVAXUSD" ||
    s === "LTCUSD" ||
    s === "LINKUSD" ||
    s === "US30" ||
    s === "US500" ||
    s === "DE30" ||
    s === "UK100" ||
    s === "JP225" ||
    s === "AUS200" ||
    s === "XNGUSD"
  ) {
    return 2;
  }
  return 5;
}

/** Minimum quantity step (price-level "pip"). */
export function symbolPipSize(symbol: string): number {
  const decimals = symbolDecimals(symbol);
  return Math.pow(10, -decimals);
}

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
  /** Realized USD P/L for the closing leg of a position (only set on
   *  auto-generated closing orders). Positive = winning trade, negative = loss. */
  realizedPnl?: number;
  /** Symbol-side originally opened by the trader, useful to render the close
   *  in the same direction as the position rather than as the reversed leg. */
  closingFor?: OrderSide;
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

export {
  estimateBracketExitPnlUsd,
  riskPipSizeForPnL,
  PROP_PNL_PIP_VALUE_PER_LOT_USD,
  type BracketEstimateSide
} from "./plEstimate";
