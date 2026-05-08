import crypto from "node:crypto";
import type { Order, Position } from "@paper-trader/shared";
import type { TradingService } from "./tradingService";

export interface ExecutionProvider {
  id: "paper" | "broker-demo" | "broker-live";
  executeMarketOrder(order: Order, service: TradingService): Position;
}

export class PaperExecutionProvider implements ExecutionProvider {
  id: "paper" | "broker-demo" | "broker-live" = "paper";

  executeMarketOrder(order: Order, service: TradingService): Position {
    const tick = service.getTick(order.symbol);
    const fillPrice = order.side === "BUY" ? tick.ask : tick.bid;
    return {
      id: crypto.randomUUID(),
      ownerAccountId: order.userId,
      symbol: order.symbol,
      side: order.side,
      lotSize: order.lotSize,
      entryPrice: fillPrice,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      openedAt: Date.now(),
      unrealizedPnl: 0
    };
  }
}

export class BrokerDemoExecutionProvider extends PaperExecutionProvider {
  id: "broker-demo" = "broker-demo";
}

export class BrokerLiveExecutionProvider extends PaperExecutionProvider {
  id: "broker-live" = "broker-live";
}
