import type { ForexSymbol } from "@paper-trader/shared";

export const pipValuePerLot = 10;
export const marginPerLotAt100Leverage = 1000;

export function roundPrice(symbol: ForexSymbol, value: number): number {
  if (symbol === "USDJPY") return Number(value.toFixed(3));
  if (symbol === "XAUUSD" || symbol === "USOILUSD") return Number(value.toFixed(2));
  if (symbol === "XAGUSD") return Number(value.toFixed(3));
  return Number(value.toFixed(5));
}

export function getPipSize(symbol: ForexSymbol): number {
  if (symbol === "USDJPY") return 0.01;
  if (symbol === "XAUUSD" || symbol === "USOILUSD") return 0.01;
  if (symbol === "XAGUSD") return 0.001;
  return 0.0001;
}

export function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}
