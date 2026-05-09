import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import { verifyClientToken, verifyTerminalToken } from "./auth/tokens";
import { defaultAccountId } from "./domain";
import { StateStore } from "./db/stateStore";
import { AdminAuthService } from "./services/adminAuthService";
import { ManagerAuthService } from "./services/managerAuthService";
import { AuditService } from "./services/auditService";
import { MailService } from "./services/mailService";
import { ChallengeService } from "./services/challengeService";
import { AuthService } from "./services/authService";
import { Mt5BridgeService } from "./services/mt5BridgeService";
import { MarketDataService } from "./services/marketDataService";
import { PayoutService } from "./services/payoutService";
import { TerminalAccountService } from "./services/terminalAccountService";
import { TradingService } from "./services/tradingService";
import { ViolationService } from "./services/violationService";

export class AppContext {
  readonly store = new StateStore();
  readonly auditService = new AuditService(this.store);
  readonly mailService = new MailService(this.auditService);
  readonly adminAuthService = new AdminAuthService(this.store, this.auditService, this.mailService);
  readonly managerAuthService = new ManagerAuthService(this.store);
  readonly violationService = new ViolationService(this.store);
  readonly challengeService = new ChallengeService(this.store, this.violationService);
  readonly payoutService = new PayoutService(this.store, this.challengeService, this.violationService);
  readonly mt5BridgeService = new Mt5BridgeService();
  readonly marketDataService = new MarketDataService(this.store, this.mt5BridgeService);
  readonly tradingService = new TradingService(this.store, this.challengeService, this.auditService, this.violationService);
  readonly terminalAccountService = new TerminalAccountService(this.store);
  readonly authService = new AuthService(this.store, this.terminalAccountService);

  private readonly wsAccount = new WeakMap<WebSocket, string>();

  constructor(public readonly wss: WebSocketServer) {}

  registerSocket(ws: WebSocket): void {
    this.wsAccount.set(ws, defaultAccountId);
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as { type?: string; token?: string };
        if (msg?.type === "auth" && typeof msg.token === "string") {
          const v = verifyClientToken(msg.token);
          if (v?.accountId) {
            this.wsAccount.set(ws, v.accountId);
          } else {
            const t = verifyTerminalToken(msg.token);
            if (t?.accountId) this.wsAccount.set(ws, t.accountId);
          }
        }
      } catch {
        /* ignore malformed */
      }
    });
  }

  resolveWsAccount(ws: WebSocket): string {
    return this.wsAccount.get(ws) ?? defaultAccountId;
  }

  broadcast(event: string, payload: unknown): void {
    const message = JSON.stringify({ event, payload });
    for (const client of this.wss.clients) {
      if (client.readyState === 1) client.send(message);
    }
  }

  notifyState(): void {
    const s = this.store.get();
    for (const client of this.wss.clients) {
      if (client.readyState !== 1) continue;
      const aid = this.resolveWsAccount(client as WebSocket);
      const orders = this.tradingService.getOrders(aid);
      const positions = this.tradingService.getPositions(aid);
      const account = s.ledgerByAccountId[aid] ?? s.account;
      client.send(JSON.stringify({ event: "orders", payload: orders }));
      client.send(JSON.stringify({ event: "positions", payload: positions }));
      client.send(JSON.stringify({ event: "account", payload: account }));
    }
  }
}
