import type { Express } from "express";
import { listSyntheticNewsWindows } from "../config/economicNewsCalendar";
import { symbols } from "../domain";
import type { AppContext } from "../appContext";

export function registerMarketRoutes(app: Express, ctx: AppContext): void {
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/prices", (_req, res) => {
    res.json(ctx.marketDataService.getPrices());
  });

  app.get("/market/synthetic-news", (req, res) => {
    const lookaheadHours = Math.min(Math.max(Number(req.query.hours ?? 72), 1), 168);
    res.json(listSyntheticNewsWindows(Date.now(), lookaheadHours));
  });

  app.get("/history-candles", (req, res) => {
    const symbol = req.query.symbol as typeof symbols[number];
    const timeframe = String(req.query.timeframe ?? "1m");
    const limit = Number(req.query.limit ?? 1000);
    if (!symbols.includes(symbol)) return res.status(400).json({ error: "Unsupported symbol." });
    return res.json(ctx.tradingService.generateHistoricalCandles(symbol, timeframe, limit));
  });
}
