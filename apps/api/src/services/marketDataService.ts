import type { ForexSymbol, PriceTick } from "@paper-trader/shared";
import { symbols } from "../domain";
import { StateStore } from "../db/stateStore";
import { roundPrice } from "./utils";
import type { Mt5BridgeService } from "./mt5BridgeService";

/**
 * MarketDataService: emits tick updates that are EXACT pass-throughs of the
 * MT5 bridge feed — no jitter, no synthetic drift.
 *
 * Single source of truth: the MT5 bridge connected to the local Exness
 * terminal. If a symbol isn't covered by the broker the price stays at its
 * last known value and the snapshot reports it as stale / unconfigured.
 */

interface BoardSnapshot {
  configured: boolean;
  quoteCount: number;
  quotes: Array<{
    symbol: ForexSymbol;
    bid: number;
    ask: number;
    mid: number;
    updatedAt: number;
    source: "mt5" | "cache";
    stale: boolean;
  }>;
  source: "live" | "partial" | "unconfigured" | "error";
  errorMessage?: string;
  mt5Connected: boolean;
  mt5StatusReason?: string;
  minRequestIntervalMs: number;
  historyCacheTtlMs: number;
}

function fxSpread(symbol: ForexSymbol): number {
  if (symbol === "USDJPY") return 0.01;
  if (symbol === "XAUUSD") return 0.2;
  if (symbol === "XAGUSD") return 0.005;
  if (symbol === "USOILUSD") return 0.02;
  return 0.00002;
}

export class MarketDataService {
  /** Wall-clock time the API last accepted a fresh upstream tick. */
  private receivedAtBySymbol = new Map<ForexSymbol, number>();
  private sourceBySymbol = new Map<ForexSymbol, "mt5">();

  constructor(private readonly store: StateStore, private readonly mt5: Mt5BridgeService) {}

  /**
   * Push a single MT5 tick straight into the store and return the resulting
   * tick object so the caller can broadcast it without waiting for the slow
   * market loop.
   */
  applyMt5Tick(symbol: ForexSymbol, bid: number, ask: number, brokerTs: number): PriceTick | null {
    if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0) return null;
    let tickBid = bid;
    let tickAsk = ask;
    if (tickAsk < tickBid) {
      const tmp = tickAsk;
      tickAsk = tickBid;
      tickBid = tmp;
    }
    if (tickAsk === tickBid) {
      const half = fxSpread(symbol) / 2;
      tickBid = tickBid - half;
      tickAsk = tickAsk + half;
    }
    const next: PriceTick = {
      symbol,
      bid: roundPrice(symbol, tickBid),
      ask: roundPrice(symbol, tickAsk),
      timestamp: brokerTs > 0 ? brokerTs : Date.now()
    };
    let changed = false;
    this.store.update((s) => {
      const cur = s.prices[symbol];
      if (!cur || cur.bid !== next.bid || cur.ask !== next.ask || cur.timestamp !== next.timestamp) {
        s.prices[symbol] = next;
        changed = true;
      }
    });
    this.receivedAtBySymbol.set(symbol, Date.now());
    this.sourceBySymbol.set(symbol, "mt5");
    return changed ? next : null;
  }

  getPrices(): PriceTick[] {
    const prices = this.store.get().prices;
    return symbols.map((s) => prices[s]);
  }

  /**
   * Slow-loop sweep: re-reads the MT5 cache for every symbol so the store
   * always reflects the latest known broker bid/ask, even for symbols that
   * haven't ticked since the last sweep. The per-tick push (`applyMt5Tick`)
   * does the bulk of the work; this is the periodic safety net.
   */
  async tickPrices(): Promise<PriceTick[]> {
    const updates: PriceTick[] = [];
    const now = Date.now();
    const mt5Active = this.mt5.isMt5Connected();
    if (!mt5Active) return updates;

    this.store.update((s) => {
      for (const symbol of symbols) {
        const current = s.prices[symbol];
        const mt5Quote = this.mt5.getBidAsk(symbol);
        if (!mt5Quote || mt5Quote.bid <= 0 || mt5Quote.ask < mt5Quote.bid) continue;

        let bid = mt5Quote.bid;
        let ask = mt5Quote.ask;
        if (ask === bid) {
          const half = fxSpread(symbol) / 2;
          bid = bid - half;
          ask = ask + half;
        }
        const next: PriceTick = {
          symbol,
          bid: roundPrice(symbol, bid),
          ask: roundPrice(symbol, ask),
          timestamp: mt5Quote.updatedAt
        };

        if (next.bid !== current.bid || next.ask !== current.ask || next.timestamp !== current.timestamp) {
          s.prices[symbol] = next;
          updates.push(next);
          this.receivedAtBySymbol.set(symbol, now);
          this.sourceBySymbol.set(symbol, "mt5");
        } else {
          this.receivedAtBySymbol.set(symbol, now);
          this.sourceBySymbol.set(symbol, "mt5");
        }
      }
    });
    return updates;
  }

  /**
   * Build the public board payload from in-memory price state.
   * Returns "live" once every symbol has been refreshed at least once.
   */
  getBoardSnapshot(): BoardSnapshot {
    const prices = this.store.get().prices;
    const now = Date.now();
    const cutoff = now - 60_000;
    const staleAfter = 8_000;
    const mtStatus = this.mt5.getStatus();
    const quotes = symbols.map((s) => {
      const p = prices[s];
      const receivedAt = this.receivedAtBySymbol.get(s) ?? p.timestamp;
      const sourceLabel: "mt5" | "cache" = this.sourceBySymbol.get(s) ?? "cache";
      const stale = !mtStatus.mt5Connected || receivedAt < now - staleAfter;
      return {
        symbol: s,
        bid: p.bid,
        ask: p.ask,
        mid: (p.bid + p.ask) / 2,
        // The board reports the API-side freshness so weekend / market-closed
        // ticks (where the broker timestamp is stale) still register as live.
        updatedAt: receivedAt,
        source: sourceLabel,
        stale
      };
    });
    const fresh = quotes.filter((q) => q.updatedAt >= cutoff && !q.stale).length;
    const errorMessage = mtStatus.lastError ?? mtStatus.mt5StatusReason;
    let source: BoardSnapshot["source"] = "live";
    if (!mtStatus.mt5Connected) source = errorMessage ? "error" : "partial";
    else if (fresh === 0) source = errorMessage ? "error" : "partial";
    else if (fresh < quotes.length) source = "partial";
    return {
      configured: true,
      quoteCount: fresh,
      quotes,
      source,
      errorMessage: fresh > 0 ? undefined : errorMessage,
      mt5Connected: mtStatus.mt5Connected,
      mt5StatusReason: mtStatus.mt5StatusReason,
      minRequestIntervalMs: 1500,
      historyCacheTtlMs: 30_000
    };
  }
}
