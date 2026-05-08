import type { ForexSymbol, PriceTick } from "@paper-trader/shared";
import { symbols } from "../domain";
import { StateStore } from "../db/stateStore";
import { roundPrice } from "./utils";

function tvcTicker(symbol: ForexSymbol): string | null {
  if (symbol === "XAUUSD") return "TVC:GOLD";
  if (symbol === "XAGUSD") return "TVC:SILVER";
  if (symbol === "USOILUSD") return "TVC:USOIL";
  return null;
}

function yahooTicker(symbol: ForexSymbol): string {
  if (symbol === "EURUSD") return "EURUSD=X";
  if (symbol === "GBPUSD") return "GBPUSD=X";
  if (symbol === "USDJPY") return "USDJPY=X";
  if (symbol === "XAUUSD") return "XAUUSD=X";
  if (symbol === "XAGUSD") return "XAGUSD=X";
  return "CL=F";
}

export class MarketDataService {
  private liveCacheAt = 0;
  private liveCache = new Map<ForexSymbol, number>();

  constructor(private readonly store: StateStore) {}

  getPrices(): PriceTick[] {
    const prices = this.store.get().prices;
    return symbols.map((s) => prices[s]);
  }

  private async fetchYahooMidPrices(): Promise<Map<ForexSymbol, number>> {
    const now = Date.now();
    if (now - this.liveCacheAt < 1000 && this.liveCache.size > 0) return this.liveCache;
    const result = new Map<ForexSymbol, number>();
    try {
      const tickers = symbols.map((s) => yahooTicker(s)).join(",");
      const response = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(tickers)}`);
      if (!response.ok) return this.liveCache;
      const payload = await response.json() as {
        quoteResponse?: { result?: Array<{ symbol?: string; bid?: number; ask?: number; regularMarketPrice?: number }> };
      };
      const byTicker = new Map<string, number>();
      for (const row of payload.quoteResponse?.result ?? []) {
        if (!row.symbol) continue;
        const mid = typeof row.bid === "number" && typeof row.ask === "number" && row.bid > 0 && row.ask > 0
          ? (row.bid + row.ask) / 2
          : row.regularMarketPrice;
        if (typeof mid === "number" && mid > 0) byTicker.set(row.symbol, mid);
      }
      for (const symbol of symbols) {
        const live = byTicker.get(yahooTicker(symbol));
        if (typeof live === "number") result.set(symbol, live);
      }
      if (result.size > 0) {
        this.liveCache = result;
        this.liveCacheAt = now;
      }
    } catch {
      // keep cache
    }
    return result.size > 0 ? result : this.liveCache;
  }

  private async fetchTvcMidPrices(): Promise<Map<ForexSymbol, number>> {
    const result = new Map<ForexSymbol, number>();
    const tracked = symbols.filter((s) => tvcTicker(s));
    if (tracked.length === 0) return result;
    try {
      const response = await fetch("https://scanner.tradingview.com/global/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols: { tickers: tracked.map((s) => tvcTicker(s) as string), query: { types: [] } },
          columns: ["close"]
        })
      });
      if (!response.ok) return result;
      const payload = await response.json() as { data?: Array<{ s: string; d?: number[] }> };
      for (const row of payload.data ?? []) {
        const close = row.d?.[0];
        if (typeof close !== "number") continue;
        const symbol = tracked.find((s) => tvcTicker(s) === row.s);
        if (symbol) result.set(symbol, close);
      }
    } catch {
      // no-op
    }
    return result;
  }

  async tickPrices(): Promise<PriceTick[]> {
    const state = this.store.get();
    const live = state.settings.priceSourceMode === "demo" ? await this.fetchYahooMidPrices() : new Map<ForexSymbol, number>();
    const tvc = state.settings.priceSourceMode === "tvc-reference" ? await this.fetchTvcMidPrices() : new Map<ForexSymbol, number>();
    const updates: PriceTick[] = [];
    this.store.update((s) => {
      for (const symbol of symbols) {
        const current = s.prices[symbol];
        const drift = (Math.random() - 0.5) * 0.0006;
        const simulatedMid =
          symbol === "USDJPY" ? current.bid + drift * 100 :
          symbol === "XAUUSD" ? current.bid + drift * 120 :
          symbol === "XAGUSD" ? current.bid + drift * 8 :
          symbol === "USOILUSD" ? current.bid + drift * 40 :
          current.bid + drift;
        const nextMid = live.get(symbol) ?? tvc.get(symbol) ?? simulatedMid;
        const spread =
          symbol === "USDJPY" ? 0.02 :
          symbol === "XAUUSD" ? 0.2 :
          symbol === "XAGUSD" ? 0.02 :
          symbol === "USOILUSD" ? 0.03 :
          0.0002;
        const next: PriceTick = {
          symbol,
          bid: roundPrice(symbol, nextMid),
          ask: roundPrice(symbol, nextMid + spread),
          timestamp: Date.now()
        };
        s.prices[symbol] = next;
        updates.push(next);
      }
    });
    return updates;
  }
}
