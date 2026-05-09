import type { Express, Response } from "express";
import { listSyntheticNewsWindows } from "../config/economicNewsCalendar";
import { symbols } from "../domain";
import type { AppContext } from "../appContext";

function sendLiveQuotesBoard(ctx: AppContext, res: Response): void {
  res.set("Cache-Control", "public, max-age=2");
  res.json(ctx.marketDataService.getBoardSnapshot());
}

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

  app.get("/history-candles", async (req, res) => {
    const symbol = req.query.symbol as (typeof symbols)[number];
    const timeframe = String(req.query.timeframe ?? "1m");
    const limit = Math.min(Math.max(Number(req.query.limit ?? 500), 10), 5000);
    if (!symbols.includes(symbol)) return res.status(400).json({ error: "Unsupported symbol." });

    try {
      const mtCandles = await ctx.mt5BridgeService.getHistoricalCandles(symbol, timeframe, limit);
      if (mtCandles.length >= 5) return res.json(mtCandles);
    } catch {
      /* fall through to synthetic */
    }

    return res.json(ctx.tradingService.generateHistoricalCandles(symbol, timeframe, limit));
  });

  app.get("/market/live-quotes", (_req, res) => {
    sendLiveQuotesBoard(ctx, res);
  });

  app.get("/market/bridge/status", (_req, res) => {
    res.json(ctx.mt5BridgeService.getStatus());
  });

  /** @deprecated Kept for older clients */
  app.get("/market/crypto/quotes", (_req, res) => {
    sendLiveQuotesBoard(ctx, res);
  });

  app.post("/market/live-quotes/refresh", async (_req, res) => {
    sendLiveQuotesBoard(ctx, res);
  });

  /** @deprecated Kept for older clients */
  app.post("/market/crypto/refresh", async (_req, res) => {
    sendLiveQuotesBoard(ctx, res);
  });
}
