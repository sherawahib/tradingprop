import type { Express } from "express";
import type { ForexSymbol, OrderType } from "@paper-trader/shared";
import { defaultAccountId } from "../domain";
import type { AppContext } from "../appContext";
import { optionalBearerAuth, type AuthedRequest } from "../middleware/authMiddleware";

function actorId(req: AuthedRequest): string {
  return req.actorAccountId ?? defaultAccountId;
}

export function registerTradingRoutes(app: Express, ctx: AppContext): void {
  app.get("/orders", optionalBearerAuth, (req, res) => {
    res.json(ctx.tradingService.getOrders(actorId(req as AuthedRequest)));
  });

  app.get("/positions", optionalBearerAuth, (req, res) => {
    res.json(ctx.tradingService.getPositions(actorId(req as AuthedRequest)));
  });

  app.get("/account", optionalBearerAuth, (req, res) => {
    const aid = actorId(req as AuthedRequest);
    res.json(ctx.tradingService.getAccount(aid));
  });

  app.post("/orders", optionalBearerAuth, (req, res) => {
    const aid = actorId(req as AuthedRequest);
    const out = ctx.tradingService.placeOrder(aid, req.body as {
      symbol: ForexSymbol;
      side: "BUY" | "SELL";
      type?: OrderType;
      lotSize?: number;
      price?: number;
      stopLoss?: number;
      takeProfit?: number;
    });
    ctx.notifyState();
    res.status(out.status).json(out.body);
  });

  app.post("/orders/:id/cancel", optionalBearerAuth, (req, res) => {
    const aid = actorId(req as AuthedRequest);
    const out = ctx.tradingService.cancelPending(aid, String(req.params.id));
    ctx.notifyState();
    res.status(out.status).json(out.body);
  });

  app.patch("/positions/:id", optionalBearerAuth, (req, res) => {
    const aid = actorId(req as AuthedRequest);
    const out = ctx.tradingService.updatePosition(aid, String(req.params.id), req.body?.stopLoss, req.body?.takeProfit);
    ctx.notifyState();
    res.status(out.status).json(out.body);
  });

  app.post("/positions/:id/close", optionalBearerAuth, (req, res) => {
    const aid = actorId(req as AuthedRequest);
    const out = ctx.tradingService.closePosition(aid, String(req.params.id), req.body?.lotSize);
    ctx.notifyState();
    res.status(out.status).json(out.body);
  });

  app.post("/bulk/positions/modify", optionalBearerAuth, (req, res) => {
    const aid = actorId(req as AuthedRequest);
    const modified = ctx.tradingService.bulkModify(aid, req.body?.scope ?? "all", req.body?.symbol, req.body?.stopLoss, req.body?.takeProfit);
    ctx.notifyState();
    res.json({ ok: true, modified });
  });

  app.post("/bulk/positions/close", optionalBearerAuth, (req, res) => {
    const aid = actorId(req as AuthedRequest);
    const closed = ctx.tradingService.bulkClose(aid, req.body?.mode ?? "all", req.body?.symbol);
    ctx.notifyState();
    res.json({ ok: true, closed });
  });

  app.post("/account/leverage", optionalBearerAuth, (req, res) => {
    const aid = actorId(req as AuthedRequest);
    const out = ctx.tradingService.setLeverage(aid, Number(req.body?.leverage));
    ctx.notifyState();
    res.status(out.status).json(out.body);
  });
}
