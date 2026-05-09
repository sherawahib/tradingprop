import { API_BASE } from "./clientAuth";

/** Live quote board — matches GET /market/live-quotes */
export interface LiveQuoteRow {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  updatedAt: number;
  source?: "mt5" | "cache";
  stale?: boolean;
}

export interface LiveQuotesBoardPayload {
  configured: boolean;
  quoteCount: number;
  quotes: LiveQuoteRow[];
  source: "live" | "partial" | "unconfigured" | "error";
  errorMessage?: string;
  mt5Connected?: boolean;
  mt5StatusReason?: string;
  minRequestIntervalMs: number;
  historyCacheTtlMs: number;
}

export async function fetchLiveQuotesBoard(): Promise<LiveQuotesBoardPayload> {
  const r = await fetch(`${API_BASE}/market/live-quotes`);
  if (!r.ok) throw new Error(`Live quotes failed (${r.status}).`);
  return (await r.json()) as LiveQuotesBoardPayload;
}

/** Decimals each tradeable symbol should display to match broker precision. */
export function priceDecimalsFor(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s === "DOGEUSD") return 6;
  if (s === "XRPUSD" || s === "ADAUSD") return 5;
  if (s === "USDJPY" || s === "XAGUSD") return 3;
  if (
    s === "BTCUSD" ||
    s === "ETHUSD" ||
    s === "SOLUSD" ||
    s === "BNBUSD" ||
    s === "AVAXUSD" ||
    s === "XAUUSD" ||
    s === "USOILUSD"
  ) {
    return 2;
  }
  return 5; // FX majors: EURUSD / GBPUSD style (1.17852)
}

/** Format a quote value with correct broker-style precision for the symbol. */
export function formatLivePrice(symbol: string, value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  const decimals = priceDecimalsFor(symbol);
  const fixed = value.toFixed(decimals);
  // For values >= 1000, group thousands; smaller decimal-heavy values stay raw.
  if (value >= 1000) {
    const [whole, frac] = fixed.split(".");
    const grouped = Number(whole).toLocaleString();
    return frac ? `${grouped}.${frac}` : grouped;
  }
  return fixed;
}

/** @deprecated Use formatLivePrice(symbol, value) instead. */
export function formatUsdPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1000) return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (value >= 1) return value.toFixed(5);
  if (value >= 0.01) return value.toFixed(5);
  return value.toFixed(6);
}
