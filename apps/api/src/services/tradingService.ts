import crypto from "node:crypto";
import type {
  AccountState,
  ChallengeTemplate,
  ForexSymbol,
  Order,
  OrderSide,
  OrderType,
  Position,
  PriceTick
} from "@paper-trader/shared";
import { symbolRetailMarketSession } from "@paper-trader/shared";
import { isWithinSyntheticNewsBlackoutUtc } from "../config/economicNewsCalendar";
import { defaultAccountId, symbols, type AccountTradingConduct, type GlobalRiskEntryEcho, type PlatformState } from "../domain";
import { StateStore } from "../db/stateStore";
import { ChallengeService } from "./challengeService";
import { AuditService } from "./auditService";
import { BrokerDemoExecutionProvider, BrokerLiveExecutionProvider, ExecutionProvider, PaperExecutionProvider } from "./executionProviders";
import type { ViolationService } from "./violationService";
import {
  CONDUCT_BOT_BURST_MIN_ORDERS,
  CONDUCT_BOT_BURST_WINDOW_MS,
  CONDUCT_COPY_MIRROR_HITS_WINDOW_MS,
  CONDUCT_COPY_MIRROR_LOT_REL_TOLERANCE,
  CONDUCT_COPY_MIRROR_MIN_HITS,
  CONDUCT_COPY_MIRROR_PAIR_WINDOW_MS,
  CONDUCT_GLOBAL_ECHO_MAX_ROWS,
  CONDUCT_GLOBAL_ECHO_TRIM_MS,
  CONDUCT_MARTINGALE_LOT_MULTIPLIER,
  CONDUCT_MARTINGALE_MIN_LOSS_LEGS,
  CONDUCT_SCALP_MAX_HOLD_SEC,
  CONDUCT_SCALP_MIN_SHORT_HOLDS,
  CONDUCT_SCALP_WINDOW_MS
} from "./tradingConductRules";
import { getPipSize, marginPerLotAt100Leverage, roundPrice, seededRandom, getPipValuePerLot, isCryptoUsdPair } from "./utils";

function ensureConductLedger(s: PlatformState, accountId: string): AccountTradingConduct {
  let c = s.tradingConductByAccountId[accountId];
  if (!c) {
    c = { orderPlacedTimestampsMs: [], shortHoldCloses: [] };
    s.tradingConductByAccountId[accountId] = c;
  }
  return c;
}

const timeframeSeconds: Record<string, number> = {
  "1s": 1, "5s": 5, "15s": 15, "30s": 30, "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400, "1w": 604800, "1mo": 2592000
};

export function ownerOfPosition(p: Position): string {
  return p.ownerAccountId ?? defaultAccountId;
}

function ensureLedger(s: PlatformState, accountId: string): AccountState {
  const cur = s.ledgerByAccountId[accountId];
  if (cur) return cur;
  const starter: AccountState = {
    balance: 10000,
    equity: 10000,
    usedMargin: 0,
    freeMargin: 10000,
    leverage: 100
  };
  s.ledgerByAccountId[accountId] = starter;
  if (accountId === defaultAccountId) s.account = { ...starter };
  return starter;
}

export class TradingService {
  private readonly providers: Record<string, ExecutionProvider> = {
    paper: new PaperExecutionProvider(),
    "broker-demo": new BrokerDemoExecutionProvider(),
    "broker-live": new BrokerLiveExecutionProvider()
  };

  constructor(
    private readonly store: StateStore,
    private readonly challenge: ChallengeService,
    private readonly audit: AuditService,
    private readonly violations: ViolationService
  ) {}

  getTick(symbol: ForexSymbol): PriceTick {
    return this.store.get().prices[symbol];
  }

  getOrders(accountId: string): Order[] {
    return this.store.get().orders.filter((o) => o.userId === accountId).slice().reverse();
  }

  getPositions(accountId: string): Position[] {
    return this.store.get().positions.filter((p) => ownerOfPosition(p) === accountId);
  }

  getAccount(accountId: string): AccountState {
    const s = this.store.get();
    return s.ledgerByAccountId[accountId] ?? s.account;
  }

  recalcLedger(accountId: string): void {
    this.store.update((s) => {
      const ledger = ensureLedger(s, accountId);
      const myPositions = s.positions.filter((p) => ownerOfPosition(p) === accountId);
      const unrealized = myPositions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0);
      const marginPerLot = marginPerLotAt100Leverage * (100 / ledger.leverage);
      ledger.equity = Number((ledger.balance + unrealized).toFixed(2));
      ledger.usedMargin = Number((myPositions.reduce((sum, pos) => sum + pos.lotSize * marginPerLot, 0)).toFixed(2));
      ledger.freeMargin = Number((ledger.equity - ledger.usedMargin).toFixed(2));
      if (accountId === defaultAccountId) {
        s.account = { ...ledger };
      }
      this.challenge.evaluate(accountId, ledger, myPositions);
    });
  }

  recalcAllLedgers(): void {
    const snapshot = this.store.get();
    const ids = new Set<string>([...Object.keys(snapshot.ledgerByAccountId), ...snapshot.positions.map(ownerOfPosition)]);
    for (const id of ids) this.recalcLedger(id);
  }

  private challengeTemplateFor(accountId: string): ChallengeTemplate | null {
    const p = this.store.get().progressByAccountId[accountId];
    if (!p) return null;
    return this.store.get().challengeTemplates.find((t) => t.id === p.templateId) ?? null;
  }

  private bumpLastTradeActivity(accountId: string, atMs: number): void {
    this.store.update((s) => {
      const p = s.progressByAccountId[accountId];
      if (!p || p.status === "BREACHED" || p.status === "LOCKED") return;
      p.lastTradeAtMs = atMs;
    });
  }

  private tradingNewRiskFrozenMessage(accountId: string): string | null {
    const progress = this.store.get().progressByAccountId[accountId];
    if (progress?.status === "LOCKED") return "Account is frozen (conduct review) — new orders are disabled.";
    if (progress?.status === "BREACHED") return "Account failed evaluation — trading disabled.";
    return null;
  }

  private maybeFreezeBurst(accountId: string, nowMs: number): boolean {
    const st = this.store.get().progressByAccountId[accountId]?.status;
    if (st === "LOCKED" || st === "BREACHED") return false;
    let trigger = false;
    this.store.update((s) => {
      const c = ensureConductLedger(s, accountId);
      const windowStart = nowMs - CONDUCT_BOT_BURST_WINDOW_MS;
      const inWindow = c.orderPlacedTimestampsMs.filter((t) => t >= windowStart);
      if (inWindow.length + 1 >= CONDUCT_BOT_BURST_MIN_ORDERS) {
        trigger = true;
        return;
      }
      c.orderPlacedTimestampsMs.push(nowMs);
      c.orderPlacedTimestampsMs = c.orderPlacedTimestampsMs.filter((t) => t >= windowStart);
    });
    if (!trigger) return false;
    this.violations.add(accountId, "AUTOMATED_TRADING_PATTERN", "RULE_FREEZE", "Trading frozen: order cadence matches automated blasting.", {
      windowMs: CONDUCT_BOT_BURST_WINDOW_MS,
      minOrders: CONDUCT_BOT_BURST_MIN_ORDERS,
      evaluatedAt: nowMs
    });
    this.audit.log("conduct.burst.freeze", { accountId }, accountId, accountId);
    return true;
  }

  private maybeFreezeScalp(accountId: string, openedAtMs: number, closedAtMs: number): boolean {
    const st = this.store.get().progressByAccountId[accountId]?.status;
    if (st === "LOCKED" || st === "BREACHED") return false;
    const holdSec = (closedAtMs - openedAtMs) / 1000;
    if (holdSec >= CONDUCT_SCALP_MAX_HOLD_SEC) return false;
    let breach = false;
    this.store.update((s) => {
      const c = ensureConductLedger(s, accountId);
      c.shortHoldCloses.push({ atMs: closedAtMs, holdSec });
      const w = closedAtMs - CONDUCT_SCALP_WINDOW_MS;
      c.shortHoldCloses = c.shortHoldCloses.filter((x) => x.atMs >= w);
      if (c.shortHoldCloses.length >= CONDUCT_SCALP_MIN_SHORT_HOLDS) breach = true;
    });
    if (!breach) return false;
    this.violations.add(accountId, "FAST_SCALPING_PATTERN", "RULE_FREEZE", "Trading frozen: repeated ultra-short holds (fast scalping).", {
      maxHoldSec: CONDUCT_SCALP_MAX_HOLD_SEC,
      windowMs: CONDUCT_SCALP_WINDOW_MS,
      minEvents: CONDUCT_SCALP_MIN_SHORT_HOLDS,
      lastHoldSec: holdSec
    });
    this.audit.log("conduct.scalping.freeze", { accountId }, accountId, accountId);
    return true;
  }

  private newsBlackoutBlockedMessage(accountId: string): string | null {
    const st = this.store.get().progressByAccountId[accountId]?.status;
    if (st === "LOCKED" || st === "BREACHED") return null;
    const progress = this.store.get().progressByAccountId[accountId];
    if (!progress) return null;
    const template = this.store.get().challengeTemplates.find((t) => t.id === progress.templateId);
    if (template?.newsTradingPolicy !== "SYNTH_HIGH_IMPACT_BLACKOUT") return null;
    if (!isWithinSyntheticNewsBlackoutUtc()) return null;
    return "High-impact simulated news blackout (UTC) — opening new exposure is temporarily disabled.";
  }

  private pushGlobalEcho(s: PlatformState, row: Omit<GlobalRiskEntryEcho, "atMs"> & { atMs?: number }): void {
    const atMs = row.atMs ?? Date.now();
    s.globalRecentRiskEntries.push({
      atMs,
      accountId: row.accountId,
      symbol: row.symbol,
      side: row.side,
      lotSize: row.lotSize
    });
    const cut = atMs - CONDUCT_GLOBAL_ECHO_TRIM_MS;
    s.globalRecentRiskEntries = s.globalRecentRiskEntries
      .filter((e) => e.atMs >= cut)
      .slice(-CONDUCT_GLOBAL_ECHO_MAX_ROWS);
  }

  private recordEchoAndScanCopytrade(accountId: string, symbol: ForexSymbol, side: OrderSide, lotSize: number, nowMs: number): boolean {
    const st = this.store.get().progressByAccountId[accountId]?.status;
    if (st === "LOCKED" || st === "BREACHED") return false;
    const tpl = this.challengeTemplateFor(accountId);
    const enforceCopy = tpl?.enforceCopyMirrorHeuristic !== false;
    let triggerFreeze = false;
    this.store.update((s) => {
      this.pushGlobalEcho(s, { accountId, symbol, side, lotSize, atMs: nowMs });
      if (!enforceCopy) return;
      let pairHit = false;
      for (const echo of s.globalRecentRiskEntries) {
        if (echo.accountId === accountId) continue;
        if (echo.symbol !== symbol) continue;
        if (echo.side === side) continue;
        if (nowMs - echo.atMs > CONDUCT_COPY_MIRROR_PAIR_WINDOW_MS || echo.atMs > nowMs) continue;
        const denom = Math.max(echo.lotSize, lotSize, 0.01);
        if (Math.abs(echo.lotSize - lotSize) / denom > CONDUCT_COPY_MIRROR_LOT_REL_TOLERANCE) continue;
        pairHit = true;
        break;
      }
      const c = ensureConductLedger(s, accountId);
      let stamps = [...(c.copyMirrorHitTimestampsMs ?? [])];
      if (pairHit) stamps.push(nowMs);
      const wStart = nowMs - CONDUCT_COPY_MIRROR_HITS_WINDOW_MS;
      stamps = stamps.filter((t) => t >= wStart);
      c.copyMirrorHitTimestampsMs = stamps;
      if (stamps.length >= CONDUCT_COPY_MIRROR_MIN_HITS) triggerFreeze = true;
    });
    if (!triggerFreeze) return false;
    this.violations.add(
      accountId,
      "COPY_TRADING_MIRROR_PATTERN",
      "RULE_FREEZE",
      "Trading frozen: repeated cross-account mirrored fills detected (deterministic heuristic).",
      {
        evaluatedAt: nowMs,
        symbol,
        pairWindowMs: CONDUCT_COPY_MIRROR_PAIR_WINDOW_MS,
        hitsInWindow: CONDUCT_COPY_MIRROR_MIN_HITS
      }
    );
    this.audit.log("conduct.copy_mirror.freeze", { accountId }, accountId, accountId);
    return true;
  }

  private martingaleBlockMessage(accountId: string, symbol: ForexSymbol, lotSize: number): string | null {
    const st = this.store.get().progressByAccountId[accountId]?.status;
    if (st === "LOCKED" || st === "BREACHED") return null;
    if (this.challengeTemplateFor(accountId)?.enforceMartingaleHeuristic === false) return null;
    const c = this.store.get().tradingConductByAccountId[accountId];
    const m = c?.martingaleContext;
    if (
      !m ||
      m.symbol !== symbol ||
      m.consecutiveLossLegsOnSymbol < CONDUCT_MARTINGALE_MIN_LOSS_LEGS ||
      m.lastLossClosedLot <= 0
    )
      return null;
    const cap = m.lastLossClosedLot * CONDUCT_MARTINGALE_LOT_MULTIPLIER + 1e-8;
    if (lotSize <= cap) return null;
    this.violations.add(
      accountId,
      "MARTINGALE_GRID_PATTERN",
      "RULE_FREEZE",
      "Trading frozen: oversized re-entry after repeated losses exceeds allowed multiple.",
      {
        symbol,
        attemptedLot: lotSize,
        baselineLot: m.lastLossClosedLot,
        lotMultipleCap: CONDUCT_MARTINGALE_LOT_MULTIPLIER,
        lossStreakLegs: m.consecutiveLossLegsOnSymbol
      }
    );
    this.audit.log("conduct.martingale.freeze", { accountId }, accountId, accountId);
    return "Account frozen: martingale-style size escalation after sequential losses.";
  }

  calcUnrealizedPnl(pos: Position, tick: PriceTick): number {
    const delta = pos.side === "BUY" ? tick.bid - pos.entryPrice : pos.entryPrice - tick.ask;
    const pips = delta / getPipSize(pos.symbol);
    return Number((pips * getPipValuePerLot(pos.symbol) * pos.lotSize).toFixed(2));
  }

  updatePositionPnl(): void {
    this.store.update((s) => {
      s.positions.forEach((pos) => {
        pos.unrealizedPnl = this.calcUnrealizedPnl(pos, s.prices[pos.symbol]);
      });
    });
    this.recalcAllLedgers();
  }

  placeOrder(
    accountId: string,
    input: {
      symbol: ForexSymbol;
      side: "BUY" | "SELL";
      type?: OrderType;
      lotSize?: number;
      price?: number;
      stopLoss?: number;
      takeProfit?: number;
    }
  ): { status: number; body: Order | { error: string } } {
    const { symbol, side, type = "MARKET", lotSize = 0.01, price, stopLoss, takeProfit } = input;
    if (!symbols.includes(symbol)) return { status: 400, body: { error: "Unsupported symbol." } };
    if (!["BUY", "SELL"].includes(side)) return { status: 400, body: { error: "Invalid side." } };
    if (lotSize <= 0 || lotSize > 5) return { status: 400, body: { error: "Lot size must be between 0.01 and 5." } };
    if (!["MARKET", "LIMIT", "STOP"].includes(type)) return { status: 400, body: { error: "Invalid order type." } };
    if ((type === "LIMIT" || type === "STOP") && typeof price !== "number") return { status: 400, body: { error: "Price is required for pending orders." } };

    /** Forex / metals / energies / indices respect weekend + nightly maintenance.
     *  Crypto pairs are 24/7 — `symbolRetailMarketSession` handles that. */
    const session = symbolRetailMarketSession(symbol);
    if (!session.tradeable) {
      return { status: 403, body: { error: session.reason || "Market is closed for this instrument." } };
    }

    this.store.update((s) => {
      ensureLedger(s, accountId);
    });
    const ledger = this.store.get().ledgerByAccountId[accountId];
    if (!ledger) return { status: 400, body: { error: "Trading account not ready." } };
    const frozenNew = this.tradingNewRiskFrozenMessage(accountId);
    if (frozenNew) return { status: 403, body: { error: frozenNew } };

    const nowMs = Date.now();
    if (this.maybeFreezeBurst(accountId, nowMs))
      return { status: 403, body: { error: "Account frozen: automated-style order blasting detected." } };

    const blackoutMsg = this.newsBlackoutBlockedMessage(accountId);
    if (blackoutMsg) return { status: 403, body: { error: blackoutMsg } };

    const martingaleStop = this.martingaleBlockMessage(accountId, symbol, lotSize);
    if (martingaleStop) return { status: 403, body: { error: martingaleStop } };

    const normalizedPrice = typeof price === "number" ? roundPrice(symbol, price) : undefined;
    const normalizedSl = typeof stopLoss === "number" ? roundPrice(symbol, stopLoss) : undefined;
    const normalizedTp = typeof takeProfit === "number" ? roundPrice(symbol, takeProfit) : undefined;
    const marginPerLot = marginPerLotAt100Leverage * (100 / ledger.leverage);
    const requiredMargin = lotSize * marginPerLot;
    if (requiredMargin > ledger.freeMargin) return { status: 400, body: { error: "Insufficient free margin." } };

    const snapOp = this.store.get();
    if (
      type === "MARKET" &&
      snapOp.positions.some((p) => ownerOfPosition(p) === accountId && p.symbol === symbol && p.side !== side)
    ) {
      this.violations.add(accountId, "PROHIBITED_OPPOSED_HEDGE", "HARD_BREACH", "Opposing positions on the same symbol are prohibited.", {
        symbol,
        side
      });
      return { status: 403, body: { error: "Opposing hedge on this instrument is not permitted on prop accounts." } };
    }

    const order: Order = {
      id: crypto.randomUUID(),
      userId: accountId,
      symbol,
      type,
      side,
      lotSize,
      price: normalizedPrice,
      stopLoss: normalizedSl,
      takeProfit: normalizedTp,
      status: type === "MARKET" ? "FILLED" : "PENDING",
      createdAt: Date.now()
    };

    this.store.update((s) => {
      if (type === "MARKET") {
        const provider = this.providers[s.settings.executionProvider] ?? this.providers.paper;
        const position = provider.executeMarketOrder(order, this);
        order.filledPrice = position.entryPrice;
        s.positions.push(position);
      }
      s.orders.push(order);
    });
    if (type === "MARKET") {
      if (this.recordEchoAndScanCopytrade(accountId, symbol, side, lotSize, nowMs))
        return { status: 403, body: { error: "Account frozen: copy/mirror heuristic triggered on fill." } };
      this.bumpLastTradeActivity(accountId, nowMs);
      this.challenge.recordQualifyingTradingDay(accountId);
    }
    this.recalcLedger(accountId);
    this.audit.log("order.placed", { orderId: order.id, type: order.type, side: order.side }, accountId, accountId);
    return { status: 201, body: order };
  }

  cancelPending(accountId: string, orderId: string): { status: number; body: Order | { error: string } } {
    let result: Order | undefined;
    this.store.update((s) => {
      const order = s.orders.find((o) => o.id === orderId && o.status === "PENDING" && o.userId === accountId);
      if (!order) return;
      order.status = "CANCELED";
      result = order;
    });
    if (!result) return { status: 404, body: { error: "Pending order not found." } };
    this.audit.log("order.canceled", { orderId }, accountId, accountId);
    this.recalcLedger(accountId);
    return { status: 200, body: result };
  }

  updatePosition(
    accountId: string,
    positionId: string,
    stopLoss?: number,
    takeProfit?: number
  ): { status: number; body: Position | { error: string } } {
    const frozen = this.tradingNewRiskFrozenMessage(accountId);
    if (frozen) return { status: 403, body: { error: frozen } };
    let result: Position | undefined;
    this.store.update((s) => {
      const position = s.positions.find((p) => p.id === positionId && ownerOfPosition(p) === accountId);
      if (!position) return;
      position.stopLoss = typeof stopLoss === "number" ? stopLoss : undefined;
      position.takeProfit = typeof takeProfit === "number" ? takeProfit : undefined;
      result = position;
    });
    if (!result) return { status: 404, body: { error: "Position not found." } };
    this.audit.log("position.modified", { positionId }, accountId, accountId);
    return { status: 200, body: result };
  }

  closePosition(accountId: string, positionId: string, lotSize?: number): { status: number; body: { ok: true } | { error: string } } {
    const position = this.store.get().positions.find((p) => p.id === positionId && ownerOfPosition(p) === accountId);
    if (!position) return { status: 404, body: { error: "Position not found." } };
    const tick = this.getTick(position.symbol);
    const requestedLot = Number(lotSize ?? position.lotSize);
    if (!Number.isFinite(requestedLot) || requestedLot <= 0) return { status: 400, body: { error: "Invalid lot size to close." } };
    const closePrice = position.side === "BUY" ? tick.bid : tick.ask;
    this.closePositionById(positionId, requestedLot, closePrice, "MANUAL");
    this.recalcLedger(accountId);
    return { status: 200, body: { ok: true } };
  }

  closePositionById(positionId: string, lotToClose: number, closePrice: number, reason: "MANUAL" | "STOP_LOSS" | "TAKE_PROFIT"): void {
    if (!this.store.get().positions.some((p) => p.id === positionId)) return;
    let actor = defaultAccountId;
    let openedAtMs = 0;
    let closedRealized = 0;
    const closedAtMs = Date.now();
    this.store.update((s) => {
      const index = s.positions.findIndex((p) => p.id === positionId);
      if (index < 0) return;
      const position = s.positions[index];
      actor = ownerOfPosition(position);
      openedAtMs = position.openedAt;
      const closeLot = Math.min(position.lotSize, lotToClose);
      const signedDelta = position.side === "BUY" ? closePrice - position.entryPrice : position.entryPrice - closePrice;
      const pips = signedDelta / getPipSize(position.symbol);
      const realized = Number((pips * getPipValuePerLot(position.symbol) * closeLot).toFixed(2));
      closedRealized = realized;
      const ledger = ensureLedger(s, actor);
      ledger.balance = Number((ledger.balance + realized).toFixed(2));
      if (actor === defaultAccountId) s.account.balance = ledger.balance;

      const closingOrderId = crypto.randomUUID();
      s.orders.push({
        id: closingOrderId,
        userId: actor,
        symbol: position.symbol,
        type: "MARKET",
        side: position.side === "BUY" ? "SELL" : "BUY",
        lotSize: closeLot,
        status: "FILLED",
        createdAt: Date.now(),
        filledPrice: closePrice,
        closedAt: Date.now(),
        closePrice,
        closeReason: reason,
        realizedPnl: realized,
        closingFor: position.side
      });
      const conduct = ensureConductLedger(s, actor);
      const sym = position.symbol;
      const tpl = s.progressByAccountId[actor]
        ? s.challengeTemplates.find((t) => t.id === s.progressByAccountId[actor]!.templateId)
        : null;
      const enforceMg = tpl?.enforceMartingaleHeuristic !== false;
      if (enforceMg && Math.abs(realized) > 1e-9) {
        if (realized < 0) {
          if (conduct.martingaleContext?.symbol === sym)
            conduct.martingaleContext = {
              symbol: sym,
              consecutiveLossLegsOnSymbol: conduct.martingaleContext.consecutiveLossLegsOnSymbol + 1,
              lastLossClosedLot: closeLot
            };
          else
            conduct.martingaleContext = {
              symbol: sym,
              consecutiveLossLegsOnSymbol: 1,
              lastLossClosedLot: closeLot
            };
        } else {
          const mc = conduct.martingaleContext;
          if (mc?.symbol === sym)
            conduct.martingaleContext = {
              symbol: sym,
              consecutiveLossLegsOnSymbol: 0,
              lastLossClosedLot: mc.lastLossClosedLot
            };
        }
      }
      position.lotSize = Number((position.lotSize - closeLot).toFixed(2));
      if (position.lotSize <= 0) s.positions.splice(index, 1);
    });
    this.challenge.appendRealizedPnlUtcDay(actor, closedRealized, closedAtMs);
    this.bumpLastTradeActivity(actor, closedAtMs);
    this.audit.log("position.closed", { positionId, reason }, actor, actor);
    if (openedAtMs > 0) void this.maybeFreezeScalp(actor, openedAtMs, closedAtMs);
  }

  processPendingOrders(): void {
    const filledAccounts = new Set<string>();
    const echoes: Array<{ accountId: string; symbol: ForexSymbol; side: OrderSide; lotSize: number; atMs: number }> = [];
    this.store.update((s) => {
      for (const order of s.orders) {
        if (order.status !== "PENDING") continue;
        /** Don't fill pending orders for instruments outside their session
         *  window (weekend / nightly maintenance). They stay pending. */
        if (!symbolRetailMarketSession(order.symbol).tradeable) continue;
        const tick = s.prices[order.symbol];
        if (!this.shouldFillPending(order, tick)) continue;
        const conflict = s.positions.some(
          (p) => ownerOfPosition(p) === order.userId && p.symbol === order.symbol && p.side !== order.side
        );
        if (conflict) {
          order.status = "REJECTED";
          continue;
        }
        const blackout = this.newsBlackoutBlockedMessage(order.userId);
        if (blackout) {
          order.status = "REJECTED";
          continue;
        }
        const mg = this.martingaleBlockMessage(order.userId, order.symbol, order.lotSize);
        if (mg) {
          order.status = "REJECTED";
          continue;
        }
        const fillPrice = typeof order.price === "number" ? order.price : order.side === "BUY" ? tick.ask : tick.bid;
        const openedAtMs = Date.now();
        order.status = "FILLED";
        order.filledPrice = fillPrice;
        s.positions.push({
          id: crypto.randomUUID(),
          ownerAccountId: order.userId,
          symbol: order.symbol,
          side: order.side,
          lotSize: order.lotSize,
          entryPrice: fillPrice,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
          openedAt: openedAtMs,
          unrealizedPnl: 0
        });
        filledAccounts.add(order.userId);
        echoes.push({
          accountId: order.userId,
          symbol: order.symbol,
          side: order.side,
          lotSize: order.lotSize,
          atMs: openedAtMs
        });
      }
    });
    for (const row of echoes) {
      void this.recordEchoAndScanCopytrade(row.accountId, row.symbol, row.side, row.lotSize, row.atMs);
      this.bumpLastTradeActivity(row.accountId, row.atMs);
    }
    for (const aid of filledAccounts) {
      this.challenge.recordQualifyingTradingDay(aid);
      this.recalcLedger(aid);
    }
  }

  processStopLossTakeProfit(): void {
    const snapshot = [...this.store.get().positions];
    for (const position of snapshot) {
      const tick = this.getTick(position.symbol);
      if (position.side === "BUY") {
        if (typeof position.stopLoss === "number" && tick.bid <= position.stopLoss) {
          this.closePositionById(position.id, position.lotSize, tick.bid, "STOP_LOSS");
        } else if (typeof position.takeProfit === "number" && tick.bid >= position.takeProfit) {
          this.closePositionById(position.id, position.lotSize, tick.bid, "TAKE_PROFIT");
        }
      } else if (typeof position.stopLoss === "number" && tick.ask >= position.stopLoss) {
        this.closePositionById(position.id, position.lotSize, tick.ask, "STOP_LOSS");
      } else if (typeof position.takeProfit === "number" && tick.ask <= position.takeProfit) {
        this.closePositionById(position.id, position.lotSize, tick.ask, "TAKE_PROFIT");
      }
    }
  }

  bulkModify(
    accountId: string,
    scope: "all" | "selected-symbol",
    symbol: ForexSymbol | undefined,
    stopLoss?: number,
    takeProfit?: number
  ): number {
    if (this.tradingNewRiskFrozenMessage(accountId)) return 0;
    let modified = 0;
    this.store.update((s) => {
      const target = s.positions.filter(
        (p) =>
          ownerOfPosition(p) === accountId &&
          (scope === "selected-symbol" && symbol ? p.symbol === symbol : true)
      );
      target.forEach((p) => {
        p.stopLoss = typeof stopLoss === "number" ? stopLoss : p.stopLoss;
        p.takeProfit = typeof takeProfit === "number" ? takeProfit : p.takeProfit;
        modified += 1;
      });
    });
    return modified;
  }

  bulkClose(
    accountId: string,
    mode: "all" | "losing" | "profitable" | "selected-symbol",
    symbol?: ForexSymbol
  ): number {
    const state = this.store.get();
    const toClose = state.positions.filter((p) => {
      if (ownerOfPosition(p) !== accountId) return false;
      if (mode === "losing") return p.unrealizedPnl < 0;
      if (mode === "profitable") return p.unrealizedPnl > 0;
      if (mode === "selected-symbol" && symbol) return p.symbol === symbol;
      return true;
    });
    for (const p of [...toClose]) {
      const tick = this.getTick(p.symbol);
      const closePrice = p.side === "BUY" ? tick.bid : tick.ask;
      this.closePositionById(p.id, p.lotSize, closePrice, "MANUAL");
    }
    this.recalcLedger(accountId);
    return toClose.length;
  }

  setLeverage(accountId: string, leverage: number): { status: number; body: AccountState | { error: string } } {
    const frozen = this.tradingNewRiskFrozenMessage(accountId);
    if (frozen) return { status: 403, body: { error: frozen } };
    if (!Number.isFinite(leverage) || leverage < 1 || leverage > 1000) return { status: 400, body: { error: "Leverage must be between 1 and 1000." } };
    this.store.update((s) => {
      const ledger = ensureLedger(s, accountId);
      ledger.leverage = Math.round(leverage);
      if (accountId === defaultAccountId) s.account.leverage = ledger.leverage;
    });
    this.recalcLedger(accountId);
    return { status: 200, body: this.getAccount(accountId) };
  }

  generateHistoricalCandles(symbol: ForexSymbol, timeframe: string, limit: number): Array<{ time: number; open: number; high: number; low: number; close: number }> {
    const seconds = timeframeSeconds[timeframe] ?? 60;
    const safeLimit = Math.min(Math.max(limit, 50), 3000);
    const tick = this.getTick(symbol);
    const base = (tick.bid + tick.ask) / 2;
    const now = Math.floor(Date.now() / 1000);
    const start = now - safeLimit * seconds;
    const volatility = isCryptoUsdPair(symbol)
      ? Math.max(base * 0.0004, base * 0.00008)
      : symbol === "USDJPY"
        ? 0.08
        : symbol === "XAUUSD"
          ? 0.9
          : symbol === "XAGUSD"
            ? 0.07
            : symbol === "USOILUSD"
              ? 0.3
              : 0.0007;
    const candles: Array<{ time: number; open: number; high: number; low: number; close: number }> = [];
    let previousClose = base;
    for (let i = 0; i < safeLimit; i += 1) {
      const time = start + i * seconds;
      const drift = (seededRandom(time + i) - 0.5) * volatility;
      const open = previousClose;
      const close = open + drift;
      const wickUp = Math.abs((seededRandom(time + i * 3) - 0.5) * volatility * 0.6);
      const wickDown = Math.abs((seededRandom(time + i * 5) - 0.5) * volatility * 0.6);
      candles.push({
        time,
        open: roundPrice(symbol, open),
        high: roundPrice(symbol, Math.max(open, close) + wickUp),
        low: roundPrice(symbol, Math.min(open, close) - wickDown),
        close: roundPrice(symbol, close)
      });
      previousClose = close;
    }
    return candles;
  }

  private shouldFillPending(order: Order, tick: PriceTick): boolean {
    if (order.type === "LIMIT" && typeof order.price === "number") return order.side === "BUY" ? tick.ask <= order.price : tick.bid >= order.price;
    if (order.type === "STOP" && typeof order.price === "number") return order.side === "BUY" ? tick.ask >= order.price : tick.bid <= order.price;
    return false;
  }
}
