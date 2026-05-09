import type { ForexSymbol } from "@paper-trader/shared";
import { symbolDecimals, symbolPipSize } from "@paper-trader/shared";

export const pipValuePerLot = 10;
export const marginPerLotAt100Leverage = 1000;

const CRYPTO_USD_SUFFIXES = new Set([
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

export function isCryptoUsdPair(symbol: ForexSymbol): boolean {
  return CRYPTO_USD_SUFFIXES.has(String(symbol).toUpperCase());
}

export function roundPrice(symbol: ForexSymbol, value: number): number {
  const decimals = symbolDecimals(symbol);
  return Number(value.toFixed(decimals));
}

/** Price increment used for P/L math (aligned with prop-style pip accounting). */
export function getPipSize(symbol: ForexSymbol): number {
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
  return symbolPipSize(symbol);
}

export function getPipValuePerLot(_symbol: ForexSymbol): number {
  return pipValuePerLot;
}

export function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}
