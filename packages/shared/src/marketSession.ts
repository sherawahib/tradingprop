/**
 * Retail-FX market session rules used by both the API (server-side
 * enforcement) and the web/desktop clients (UI feedback). The rules mirror
 * how MetaTrader brokers expose retail FX / metals / energies / indices:
 *
 * - Crypto pairs (anything ending in USD that we treat as crypto) trade 24/7.
 * - Everything else (forex, metals, energies, indices) trades:
 *     - Sunday open: 22:00 UTC Sunday (Sydney open)
 *     - Friday close: 22:00 UTC Friday (NY close)
 *     - Daily nightly maintenance window: 22:00–23:00 UTC Mon–Thu
 *
 * The maintenance window collapses Friday's close into the weekend and avoids
 * a separate Sunday-night gap because the week roll is at the same hour.
 *
 * All comparisons use UTC so the client/server agree regardless of the
 * trader's local timezone.
 */

const CRYPTO_USD_SYMBOLS = new Set<string>([
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
]);

/** Daily nightly maintenance window (Mon–Thu) in UTC hours: [start, end). */
export const RETAIL_FX_DAILY_MAINTENANCE_START_HOUR_UTC = 22;
export const RETAIL_FX_DAILY_MAINTENANCE_END_HOUR_UTC = 23;
/** Friday close hour (UTC). */
export const RETAIL_FX_FRIDAY_CLOSE_HOUR_UTC = 22;
/** Sunday open hour (UTC). */
export const RETAIL_FX_SUNDAY_OPEN_HOUR_UTC = 22;

export interface RetailMarketSession {
  /** True when this instrument can be traded right now. */
  tradeable: boolean;
  /** Human-readable reason when not tradeable (empty when tradeable). */
  reason: string;
  /** Epoch ms when the next open occurs (only set when not tradeable). */
  nextOpenAt?: number;
}

/** Strip common broker suffixes (e.g. EURUSD.m, XAUUSD.raw) before lookup. */
export function normalizeBrokerSymbol(symbol: string): string {
  if (!symbol) return symbol;
  const upper = symbol.toUpperCase();
  const dotIdx = upper.indexOf(".");
  return (dotIdx >= 0 ? upper.slice(0, dotIdx) : upper).trim();
}

export function isCryptoUsdSymbol(symbol: string): boolean {
  return CRYPTO_USD_SYMBOLS.has(normalizeBrokerSymbol(symbol));
}

/**
 * Compute the retail-FX market session for `now` (defaults to current time).
 * This is the policy that applies to forex / metals / energies / indices —
 * crypto callers should bypass this with `isCryptoUsdSymbol`.
 */
export function retailFxMarketSession(now: Date = new Date()): RetailMarketSession {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();

  if (day === 6) {
    /** Saturday — closed all day. */
    return {
      tradeable: false,
      reason: "Forex/commodities markets are closed on Saturday.",
      nextOpenAt: nextSundayOpenMs(now)
    };
  }

  if (day === 0) {
    /** Sunday — closed until 22:00 UTC. */
    if (hour < RETAIL_FX_SUNDAY_OPEN_HOUR_UTC) {
      return {
        tradeable: false,
        reason: "Forex/commodities markets re-open at 22:00 UTC Sunday.",
        nextOpenAt: nextSundayOpenMs(now)
      };
    }
    return { tradeable: true, reason: "" };
  }

  if (day === 5) {
    /** Friday — closes at 22:00 UTC. */
    if (hour >= RETAIL_FX_FRIDAY_CLOSE_HOUR_UTC) {
      return {
        tradeable: false,
        reason: "Forex/commodities markets are closed for the weekend.",
        nextOpenAt: nextSundayOpenMs(now)
      };
    }
    return { tradeable: true, reason: "" };
  }

  /** Mon–Thu — closed during the nightly maintenance window. */
  if (
    hour >= RETAIL_FX_DAILY_MAINTENANCE_START_HOUR_UTC &&
    hour < RETAIL_FX_DAILY_MAINTENANCE_END_HOUR_UTC
  ) {
    return {
      tradeable: false,
      reason: "Forex/commodities are in the nightly maintenance window (22:00–23:00 UTC).",
      nextOpenAt: nextHourBoundaryMs(now, RETAIL_FX_DAILY_MAINTENANCE_END_HOUR_UTC)
    };
  }

  return { tradeable: true, reason: "" };
}

export function symbolRetailMarketSession(
  symbol: string,
  now: Date = new Date()
): RetailMarketSession {
  if (isCryptoUsdSymbol(symbol)) {
    return { tradeable: true, reason: "" };
  }
  return retailFxMarketSession(now);
}

export function isSymbolTradeableByRetailSession(
  symbol: string,
  now: Date = new Date()
): boolean {
  return symbolRetailMarketSession(symbol, now).tradeable;
}

function nextSundayOpenMs(now: Date): number {
  const d = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      RETAIL_FX_SUNDAY_OPEN_HOUR_UTC,
      0,
      0,
      0
    )
  );
  /** Advance until the date represents the next Sunday at 22:00 UTC. */
  while (d.getUTCDay() !== 0 || d.getTime() <= now.getTime()) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.getTime();
}

function nextHourBoundaryMs(now: Date, hourUtc: number): number {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, 0, 0, 0)
  );
  if (d.getTime() <= now.getTime()) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.getTime();
}
