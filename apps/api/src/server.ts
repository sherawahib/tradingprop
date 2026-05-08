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

let lastLoopRunAt = 0;
let lastDayKey = new Date().toISOString().slice(0, 10);
setInterval(() => {
  const now = Date.now();
  const settings = ctx.store.get().settings;
  if (now - lastLoopRunAt < settings.marketLoopMs) return;
  lastLoopRunAt = now;
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
  ctx.store.persist();
}, 100);

const port = 4000;

async function start(): Promise<void> {
  await ctx.adminAuthService.ensureBootstrap();
  await ctx.managerAuthService.ensureDemoManager();
  await ctx.authService.ensureSeededDemoUser();
  ctx.store.persist();
  httpServer.listen(port, () => {
    console.log(`API running on http://localhost:${port}`);
    if (!process.env.JWT_SECRET) {
      console.warn("[auth] JWT_SECRET not set — using insecure dev default; set JWT_SECRET for production.");
    }
  });
}

void start();
