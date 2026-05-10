/**
 * Estimated USD P/L if a position is closed at a given exit price — mirrors
 * `@paper-trader/api` tradingService pip math (`getPipSize` × `pipValuePerLot`).
 */

export type BracketEstimateSide = "BUY" | "SELL";

export const PROP_PNL_PIP_VALUE_PER_LOT_USD = 10;

/** Pip increment for prop-style USD P/L (aligned with apps/api/src/services/utils.ts). */
export function riskPipSizeForPnL(symbol: string): number {
  const s = String(symbol).toUpperCase();
  if (s === "BTCUSD") return 10;
  if (s === "ETHUSD") return 1;
  if (s === "SOLUSD") return 0.05;
  if (s === "BNBUSD") return 0.5;
  if (s === "AVAXUSD") return 0.05;
  if (s === "LTCUSD") return 0.05;
  if (s === "LINKUSD") return 0.01;
  if (s === "DOTUSD") return 0.01;
  if (s === "MATICUSD") return 0.0001;
  if (s === "XRPUSD" || s === "ADAUSD") return 0.0001;
  if (s === "DOGEUSD") return 0.00001;
  if (s === "USDJPY" || s.endsWith("JPY")) return 0.01;
  if (s === "XAUUSD" || s === "USOILUSD" || s === "XPTUSD" || s === "XPDUSD") return 0.01;
  if (s === "XAGUSD") return 0.001;
  if (s === "XNGUSD") return 0.01;
  if (s === "US30" || s === "US500" || s === "DE30" || s === "UK100" || s === "JP225" || s === "AUS200") {
    return 1;
  }
  const decimals = (() => {
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
  })();
  return Math.pow(10, -decimals);
}

/**
 * If the position hypothetically exited at `exitPrice` (e.g. SL or TP line),
 * return estimated gross P/L in USD for the held `lotSize` (positive = profit).
 */
export function estimateBracketExitPnlUsd(
  symbol: string,
  side: BracketEstimateSide,
  lotSize: number,
  entryPrice: number,
  exitPrice: number
): number {
  const pip = riskPipSizeForPnL(symbol);
  if (!Number.isFinite(pip) || pip <= 0) return 0;
  const delta = side === "BUY" ? exitPrice - entryPrice : entryPrice - exitPrice;
  const pips = delta / pip;
  return Number((pips * PROP_PNL_PIP_VALUE_PER_LOT_USD * lotSize).toFixed(2));
}
