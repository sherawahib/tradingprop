import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { AppContext } from "./appContext";
import { registerAdminAuthRoutes } from "./routes/adminAuthRoutes";
import { registerManagerAuthRoutes } from "./routes/managerAuthRoutes";
import { registerAuthRoutes } from "./routes/authRoutes";
import { registerDownloadRoutes } from "./routes/downloadRoutes";
import { registerMarketRoutes } from "./routes/marketRoutes";
import { registerNewsRoutes } from "./routes/newsRoutes";
import { registerClientRoutes } from "./routes/clientRoutes";
import { registerPropRoutes } from "./routes/propRoutes";
import { registerSettingsRoutes } from "./routes/settingsRoutes";
import { registerTerminalAuthRoutes } from "./routes/terminalAuthRoutes";
import { registerTradingRoutes } from "./routes/tradingRoutes";

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });
const ctx = new AppContext(wss);

wss.on("connection", (socket) => {
  ctx.registerSocket(socket);
});

registerMarketRoutes(app, ctx);
registerTradingRoutes(app, ctx);
registerSettingsRoutes(app, ctx);
registerAdminAuthRoutes(app, ctx);
registerManagerAuthRoutes(app, ctx);
registerPropRoutes(app, ctx);
registerClientRoutes(app, ctx);
registerAuthRoutes(app, ctx.authService);
registerTerminalAuthRoutes(app, ctx);
registerDownloadRoutes(app);
registerNewsRoutes(app);

// Direct MT5 tick path — broadcasts each broker tick as soon as the bridge
// hands it to us so the terminal updates without "eye blink" delay.
ctx.mt5BridgeService.onTick((q) => {
  const tick = ctx.marketDataService.applyMt5Tick(q.symbol, q.bid, q.ask, q.updatedAt);
  if (tick) ctx.broadcast("price", tick);
  ctx.tradingService.processStopLossTakeProfit();
  ctx.tradingService.updatePositionPnl();
});

ctx.mt5BridgeService.onStatus((s) => {
  ctx.broadcast("mt5-status", s);
});

let lastLoopRunAt = 0;
let lastPersistAt = 0;
let lastDayKey = new Date().toISOString().slice(0, 10);
setInterval(() => {
  const now = Date.now();
  const settings = ctx.store.get().settings;
  if (now - lastLoopRunAt < settings.marketLoopMs) return;
  lastLoopRunAt = now;

  // Fallback / non-MT5 sources still go through the slow loop.
  void ctx.marketDataService.tickPrices().then((ticks) => {
    ticks.forEach((t) => ctx.broadcast("price", t));
  });

  const dayKey = new Date().toISOString().slice(0, 10);
  if (dayKey !== lastDayKey) {
    lastDayKey = dayKey;
    ctx.challengeService.rollDailyAll();
  }
  ctx.tradingService.processPendingOrders();
  ctx.tradingService.processStopLossTakeProfit();
  ctx.tradingService.updatePositionPnl();
  ctx.notifyState();

  if (now - lastPersistAt > 5_000) {
    lastPersistAt = now;
    ctx.store.persist();
  }
}, 100);

const port = 4000;

async function start(): Promise<void> {
  await ctx.adminAuthService.ensureBootstrap();
  await ctx.managerAuthService.ensureDemoManager();
  await ctx.authService.ensureSeededDemoUser();
  ctx.store.persist();
  ctx.mt5BridgeService.start();
  console.log("[market] live feed started (Exness MT5 bridge)");
  httpServer.listen(port, () => {
    console.log(`API running on http://localhost:${port}`);
    if (!process.env.JWT_SECRET) {
      console.warn("[auth] JWT_SECRET not set — using insecure dev default; set JWT_SECRET for production.");
    }
  });
}

void start();

let shuttingDown = false;
function gracefulShutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] received ${signal}, stopping market feed`);
  try {
    ctx.mt5BridgeService.stop();
  } catch {
    /* ignore */
  }
  setTimeout(() => process.exit(0), 250).unref?.();
}
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
