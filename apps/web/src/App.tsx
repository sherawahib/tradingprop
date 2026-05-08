import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AccountState, ChallengeProgress, ForexSymbol, Order, Position, PriceTick } from "@paper-trader/shared";
import { formatChallengeStatusLabel } from "./challengeUi";
import type { UTCTimestamp } from "lightweight-charts";
import { CandlestickChart, ChartColumn, ChartLine, Crosshair, MoveHorizontal, MoveVertical, TrendingUp } from "lucide-react";
import ChartPanel from "./ChartPanel";
import TradingViewEmbed from "./TradingViewEmbed";
import TraderDashboard from "./TraderDashboard";
import AdminPortal from "./AdminPortal";
import AdminLoginPage from "./AdminLoginPage";
import AdminPasswordApprovePage from "./AdminPasswordApprovePage";
import AdminPasswordRequestPage from "./AdminPasswordRequestPage";
import AdminPasswordSetPage from "./AdminPasswordSetPage";
import WebsiteHome from "./WebsiteHome";
import ProgramsPage from "./ProgramsPage";
import HowItWorksPage from "./HowItWorksPage";
import PayoutsPage from "./PayoutsPage";
import ResourcesPage from "./ResourcesPage";
import TermsPage from "./TermsPage";
import PrivacyPage from "./PrivacyPage";
import CookiesPage from "./CookiesPage";
import RiskDisclosurePage from "./RiskDisclosurePage";
import SupportPage from "./SupportPage";
import type { MarketingSubView } from "./marketingTypes";
import ClientPortal from "./ClientPortal";
import LoginPage from "./LoginPage";
import TerminalLoginPage from "./TerminalLoginPage";
import {
  API_BASE,
  apiLogin,
  apiMe,
  apiRegister,
  apiTerminalLogin,
  apiTerminalMe,
  clearAuth,
  clearTerminalAuth,
  persistToken,
  persistTerminalToken,
  readToken,
  readTerminalToken,
  terminalBearerHeaders,
  terminalJsonAuthHeaders,
  type TerminalAccountSummary
} from "./clientAuth";
import {
  OPS_SIGN_IN_HASH,
  parseOpsHash,
  readAdminToken,
  clearAdminAuth,
  setOpsReturnView,
  takeOpsReturnView
} from "./adminAuth";
import ManagerLoginPage from "./ManagerLoginPage";
import ManagerPortal from "./ManagerPortal";
import {
  PARTNER_SIGN_IN_HASH,
  parsePartnerHash,
  readManagerToken,
  PENDING_REFERRAL_STORAGE_KEY
} from "./partnerAuth";

function RedirectHash({ to }: { to: string }): null {
  useLayoutEffect(() => {
    window.location.hash = to;
  }, [to]);
  return null;
}

const symbols: ForexSymbol[] = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "XAGUSD", "USOILUSD"];
type Timeframe = "1s" | "5s" | "15s" | "30s" | "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w" | "1mo";
type Candle = { time: UTCTimestamp; open: number; high: number; low: number; close: number };
type TerminalTab = "trade" | "history" | "news" | "alerts";
type TopMenu = "file" | "view" | null;
type AppView = "website" | "login" | "client-portal" | "terminal" | "trader-dashboard";

const timeframeList: Timeframe[] = ["1s", "5s", "15s", "30s", "1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1mo"];
const timeframeSeconds: Record<Timeframe, number> = {
  "1s": 1, "5s": 5, "15s": 15, "30s": 30, "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400, "1w": 604800, "1mo": 2592000
};

function roundForSymbol(symbol: ForexSymbol, value: number): number {
  if (symbol === "USDJPY") return Number(value.toFixed(3));
  if (symbol === "XAUUSD" || symbol === "USOILUSD") return Number(value.toFixed(2));
  if (symbol === "XAGUSD") return Number(value.toFixed(3));
  return Number(value.toFixed(5));
}
function formatForSymbol(symbol: ForexSymbol, value: number | null | undefined): string {
  if (typeof value !== "number") return "-";
  if (symbol === "USDJPY") return value.toFixed(3);
  if (symbol === "XAUUSD" || symbol === "USOILUSD") return value.toFixed(2);
  if (symbol === "XAGUSD") return value.toFixed(3);
  return value.toFixed(5);
}
function pipDistance(symbol: ForexSymbol, pips: number): number {
  const pip =
    symbol === "USDJPY" ? 0.01 :
    symbol === "XAUUSD" || symbol === "USOILUSD" ? 0.01 :
    symbol === "XAGUSD" ? 0.001 :
    0.0001;
  return pip * pips;
}

function stepForSymbol(symbol: ForexSymbol): number {
  if (symbol === "USDJPY") return 0.001;
  if (symbol === "XAUUSD" || symbol === "USOILUSD") return 0.01;
  if (symbol === "XAGUSD") return 0.001;
  return 0.00001;
}

function toTvcSymbol(symbol: ForexSymbol): string {
  if (symbol === "XAUUSD") return "TVC:GOLD";
  if (symbol === "XAGUSD") return "TVC:SILVER";
  if (symbol === "USOILUSD") return "TVC:USOIL";
  return `OANDA:${symbol}`;
}

function App() {
  const [selected, setSelected] = useState<ForexSymbol>("EURUSD");
  const [prices, setPrices] = useState<Record<string, PriceTick>>({});
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [account, setAccount] = useState<AccountState>({ balance: 10000, equity: 10000, usedMargin: 0, freeMargin: 10000, leverage: 100 });
  const [lotSize, setLotSize] = useState(0.1);
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT" | "STOP">("MARKET");
  const [pendingPrice, setPendingPrice] = useState<number>(0);
  const [stopLoss, setStopLoss] = useState<number | "">("");
  const [takeProfit, setTakeProfit] = useState<number | "">("");
  const [error, setError] = useState("");
  const [timeframe, setTimeframe] = useState<Timeframe>("1m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [hoveredChartPrice, setHoveredChartPrice] = useState<number | null>(null);
  const [hoveredChartTime, setHoveredChartTime] = useState<number | null>(null);
  const [clickedChartPrice, setClickedChartPrice] = useState<number | null>(null);
  const [chartPositionId, setChartPositionId] = useState<string>("");
  const [dragSl, setDragSl] = useState<number | null>(null);
  const [dragTp, setDragTp] = useState<number | null>(null);
  const [chartType, setChartType] = useState<"candles" | "bar" | "line">("candles");
  const [drawingTool, setDrawingTool] = useState<"none" | "hline" | "vline" | "trendline">("none");
  const [chartProvider, setChartProvider] = useState<"internal" | "tvc">("internal");
  const [bulkStopLoss, setBulkStopLoss] = useState<string>("");
  const [bulkTakeProfit, setBulkTakeProfit] = useState<string>("");
  const [leverageInput, setLeverageInput] = useState<string>("100");
  const [terminalTab, setTerminalTab] = useState<TerminalTab>("trade");
  const [marketLoopMs, setMarketLoopMs] = useState<number>(250);
  const [priceSourceMode, setPriceSourceMode] = useState<"demo" | "tvc-reference">("demo");
  const [challengeProgress, setChallengeProgress] = useState<ChallengeProgress | null>(null);
  const [openMenu, setOpenMenu] = useState<TopMenu>(null);
  const [showToolbars, setShowToolbars] = useState(true);
  const [showStatusBar, setShowStatusBar] = useState(false);
  const [showChartsBar, setShowChartsBar] = useState(true);
  const [showMarketWatch, setShowMarketWatch] = useState(true);
  const [showToolbox, setShowToolbox] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [appView, setAppView] = useState<AppView>("website");
  const [marketingPage, setMarketingPage] = useState<MarketingSubView>("home");
  const [connectedAccountId, setConnectedAccountId] = useState<string>("demo-user");
  const [isClientAuthed, setIsClientAuthed] = useState<boolean>(() => !!readToken());
  /** Per-package terminal session — entirely separate from the portal session. */
  const [terminalSummary, setTerminalSummary] = useState<TerminalAccountSummary | null>(null);
  const [hasTerminalToken, setHasTerminalToken] = useState<boolean>(() => !!readTerminalToken());
  /** Bumps websocket + REST terminal snapshot reload when JWT / account acting context changes */
  const [terminalStreamEpoch, setTerminalStreamEpoch] = useState(0);
  const [leftPanePct, setLeftPanePct] = useState(23);
  const [terminalPct, setTerminalPct] = useState(34);
  const [dragMode, setDragMode] = useState<null | "left-pane" | "terminal">(null);
  const bodyRef = useRef<HTMLElement | null>(null);
  /** Re-render when SPA hash routes change (operator URLs). */
  const [hashEpoch, setHashEpoch] = useState(0);

  const hoveredTimeLabel = useMemo(() => (hoveredChartTime ? new Date(hoveredChartTime * 1000).toLocaleString() : "-"), [hoveredChartTime]);

  const opsRoute = useMemo(() => {
    void hashEpoch;
    return parseOpsHash();
  }, [hashEpoch]);

  const partnerRoute = useMemo(() => {
    void hashEpoch;
    return parsePartnerHash();
  }, [hashEpoch]);

  useEffect(() => {
    function bumpHashEpoch(): void {
      setHashEpoch((n) => n + 1);
    }
    window.addEventListener("hashchange", bumpHashEpoch);
    return () => window.removeEventListener("hashchange", bumpHashEpoch);
  }, []);

  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref")?.trim();
      if (!ref) return;
      sessionStorage.setItem(PENDING_REFERRAL_STORAGE_KEY, ref);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const t = readToken();
    if (!t) {
      setIsClientAuthed(false);
      setConnectedAccountId("demo-user");
      return;
    }
    void apiMe()
      .then((user) => {
        setConnectedAccountId(user.accountId);
        setIsClientAuthed(true);
        setTerminalStreamEpoch((x) => x + 1);
      })
      .catch(() => {
        clearAuth();
        setIsClientAuthed(false);
        setConnectedAccountId("demo-user");
      });
  }, []);

  // Validate any persisted terminal token at boot. If invalid, drop it so the
  // user is forced through the terminal sign-in screen again. Note: the
  // terminal accountId is NEVER mirrored into `connectedAccountId` — that
  // state belongs to the portal session and would corrupt
  // /client/summary requests if overwritten.
  useEffect(() => {
    if (!readTerminalToken()) return;
    void apiTerminalMe()
      .then((summary) => {
        setTerminalSummary(summary);
        setHasTerminalToken(true);
        setTerminalStreamEpoch((x) => x + 1);
      })
      .catch(() => {
        clearTerminalAuth();
        setTerminalSummary(null);
        setHasTerminalToken(false);
      });
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/prices`).then((r) => r.json()).then((data: PriceTick[]) => {
      const next: Record<string, PriceTick> = {};
      data.forEach((tick) => (next[tick.symbol] = tick));
      setPrices(next);
    });
    fetch(`${API_BASE}/settings`).then((r) => r.json()).then((data: { marketLoopMs: number; priceSourceMode?: "demo" | "tvc-reference" }) => {
      setMarketLoopMs(data.marketLoopMs);
      if (data.priceSourceMode === "demo" || data.priceSourceMode === "tvc-reference") {
        setPriceSourceMode(data.priceSourceMode);
      }
    });
  }, []);

  useEffect(() => {
    // Trading data is fetched ONLY with the terminal token; portal-only sessions
    // see no live trading state until they sign into a package's terminal.
    if (!readTerminalToken()) {
      setPositions([]);
      setOrders([]);
      setChallengeProgress(null);
      return;
    }
    fetch(`${API_BASE}/positions`, { headers: terminalBearerHeaders() }).then((r) => r.json()).then(setPositions).catch(() => undefined);
    fetch(`${API_BASE}/orders`, { headers: terminalBearerHeaders() }).then((r) => r.json()).then(setOrders).catch(() => undefined);
    fetch(`${API_BASE}/account`, { headers: terminalBearerHeaders() })
      .then((r) => r.json())
      .then((data: AccountState) => {
        setAccount(data);
        setLeverageInput(String(data.leverage));
      })
      .catch(() => undefined);
    fetch(`${API_BASE}/challenge/progress`, { headers: terminalBearerHeaders() }).then((r) => r.json()).then(setChallengeProgress).catch(() => undefined);
  }, [terminalStreamEpoch]);

  useEffect(() => {
    fetch(`${API_BASE}/history-candles?symbol=${selected}&timeframe=${timeframe}&limit=1200`).then((r) => r.json()).then((data: Candle[]) => setCandles(data));
  }, [selected, timeframe]);

  useEffect(() => {
    const ws = new WebSocket(`${API_BASE.replace(/^http/, "ws")}`);
    ws.onopen = () => {
      const tok = readTerminalToken();
      if (tok) ws.send(JSON.stringify({ type: "auth", token: tok }));
    };
    ws.onmessage = (event) => {
      const parsed = JSON.parse(event.data) as { event: string; payload: unknown };
      if (parsed.event === "price") {
        const payload = parsed.payload as PriceTick;
        setPrices((prev) => ({ ...prev, [payload.symbol]: payload }));
        if (payload.symbol === selected) {
          const bucketSeconds = timeframeSeconds[timeframe];
          const mid = roundForSymbol(payload.symbol, (payload.bid + payload.ask) / 2);
          const bucketTime = (Math.floor(payload.timestamp / 1000 / bucketSeconds) * bucketSeconds) as UTCTimestamp;
          setCandles((prev) => {
            if (prev.length === 0) return prev;
            const next = [...prev];
            const last = next[next.length - 1];
            if (last.time === bucketTime) {
              last.high = Math.max(last.high, mid);
              last.low = Math.min(last.low, mid);
              last.close = mid;
              return next;
            }
            if (last.time < bucketTime) {
              next.push({ time: bucketTime, open: last.close, high: Math.max(last.close, mid), low: Math.min(last.close, mid), close: mid });
              return next.slice(-1800);
            }
            return next;
          });
        }
      }
      if (parsed.event === "positions") setPositions(parsed.payload as Position[]);
      if (parsed.event === "orders") setOrders(parsed.payload as Order[]);
      if (parsed.event === "account") setAccount(parsed.payload as AccountState);
    };
    return () => ws.close();
  }, [selected, timeframe, terminalStreamEpoch]);

  useEffect(() => {
    // Exact mode should default to internal chart to avoid source mismatch.
    if (priceSourceMode === "demo") {
      setChartProvider("internal");
    }
  }, [selected, priceSourceMode]);

  const selectedPrice = prices[selected];
  const latestOrders = useMemo(() => orders.slice(0, 25), [orders]);
  const pendingOrders = useMemo(() => orders.filter((o) => o.status === "PENDING"), [orders]);
  const chartPositions = useMemo(() => positions.filter((p) => p.symbol === selected), [positions, selected]);
  const chartPosition = useMemo(() => chartPositions.find((p) => p.id === chartPositionId) ?? chartPositions[0], [chartPositionId, chartPositions]);
  const chartMarkers: Array<{ time: UTCTimestamp; position: "aboveBar" | "belowBar"; color: string; shape: "arrowUp" | "arrowDown" | "circle"; text: string }> = [];
  const chartLines = useMemo(() => {
    const lines: { id: string; price: number; color: string; title: string }[] = [];
    if (chartPosition) {
      lines.push({ id: `${chartPosition.id}-entry`, price: chartPosition.entryPrice, color: "#63b2ff", title: "Entry" });
      const effectiveSl = dragSl ?? chartPosition.stopLoss;
      const effectiveTp = dragTp ?? chartPosition.takeProfit;
      if (typeof effectiveSl === "number") lines.push({ id: `${chartPosition.id}-sl`, price: effectiveSl, color: "#bf3b3b", title: "SL" });
      if (typeof effectiveTp === "number") lines.push({ id: `${chartPosition.id}-tp`, price: effectiveTp, color: "#1a8f56", title: "TP" });
    }
    pendingOrders.filter((o) => o.symbol === selected && typeof o.price === "number").forEach((o) => {
      lines.push({ id: `pending-${o.id}`, price: o.price as number, color: "#f5b041", title: o.side === "BUY" ? "BUY PEND" : "SELL PEND" });
    });
    return lines;
  }, [chartPosition, dragSl, dragTp, pendingOrders, selected]);

  async function placeOrder(side: "BUY" | "SELL"): Promise<void> {
    setError("");
    const response = await fetch(`${API_BASE}/orders`, {
      method: "POST",
      headers: terminalJsonAuthHeaders(),
      body: JSON.stringify({ symbol: selected, side, type: orderType, lotSize, price: orderType === "MARKET" ? undefined : pendingPrice, stopLoss: stopLoss === "" ? undefined : stopLoss, takeProfit: takeProfit === "" ? undefined : takeProfit })
    });
    if (!response.ok) setError((await response.json()).error ?? "Order failed");
  }
  async function closePosition(positionId: string, closeLotSize: number): Promise<void> {
    const response = await fetch(`${API_BASE}/positions/${positionId}/close`, { method: "POST", headers: terminalJsonAuthHeaders(), body: JSON.stringify({ lotSize: closeLotSize }) });
    if (!response.ok) setError((await response.json()).error ?? "Close failed");
  }
  async function updatePosition(positionId: string, newSl: string, newTp: string): Promise<void> {
    const response = await fetch(`${API_BASE}/positions/${positionId}`, { method: "PATCH", headers: terminalJsonAuthHeaders(), body: JSON.stringify({ stopLoss: newSl.trim() ? Number(newSl) : undefined, takeProfit: newTp.trim() ? Number(newTp) : undefined }) });
    if (!response.ok) setError((await response.json()).error ?? "Modify failed");
  }
  async function cancelPending(orderId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/orders/${orderId}/cancel`, { method: "POST", headers: terminalJsonAuthHeaders() });
    if (!response.ok) setError((await response.json()).error ?? "Cancel failed");
  }
  async function bulkClose(mode: "all" | "losing" | "profitable" | "selected-symbol"): Promise<void> {
    const response = await fetch(`${API_BASE}/bulk/positions/close`, { method: "POST", headers: terminalJsonAuthHeaders(), body: JSON.stringify({ mode, symbol: selected }) });
    if (!response.ok) setError((await response.json()).error ?? "Bulk close failed");
  }
  async function bulkModify(scope: "all" | "selected-symbol"): Promise<void> {
    if (!bulkStopLoss.trim() && !bulkTakeProfit.trim()) {
      setError("Enter bulk SL and/or TP value first.");
      return;
    }
    const response = await fetch(`${API_BASE}/bulk/positions/modify`, {
      method: "POST",
      headers: terminalJsonAuthHeaders(),
      body: JSON.stringify({ scope, symbol: selected, stopLoss: bulkStopLoss.trim() ? Number(bulkStopLoss) : undefined, takeProfit: bulkTakeProfit.trim() ? Number(bulkTakeProfit) : undefined })
    });
    if (!response.ok) setError((await response.json()).error ?? "Bulk modify failed");
  }
  async function handleLineDrag(kind: "SL" | "TP", price: number, done: boolean): Promise<void> {
    if (!chartPosition) return;
    const normalized = roundForSymbol(chartPosition.symbol, price);
    if (kind === "SL") setDragSl(normalized); else setDragTp(normalized);
    if (!done) return;
    const nextSl = kind === "SL" ? normalized : dragSl ?? chartPosition.stopLoss;
    const nextTp = kind === "TP" ? normalized : dragTp ?? chartPosition.takeProfit;
    await updatePosition(chartPosition.id, typeof nextSl === "number" ? String(nextSl) : "", typeof nextTp === "number" ? String(nextTp) : "");
    setDragSl(null); setDragTp(null);
  }
  async function placeOrderAtChartPrice(side: "BUY" | "SELL"): Promise<void> {
    if (clickedChartPrice === null || !selectedPrice) {
      setError("Click the chart price first.");
      return;
    }
    const normalized = roundForSymbol(selected, clickedChartPrice);
    const type = side === "BUY" ? (normalized <= selectedPrice.ask ? "LIMIT" : "STOP") : (normalized >= selectedPrice.bid ? "LIMIT" : "STOP");
    setOrderType(type);
    setPendingPrice(normalized);
    const response = await fetch(`${API_BASE}/orders`, {
      method: "POST",
      headers: terminalJsonAuthHeaders(),
      body: JSON.stringify({ symbol: selected, side, type, lotSize, price: normalized, stopLoss: stopLoss === "" ? undefined : stopLoss, takeProfit: takeProfit === "" ? undefined : takeProfit })
    });
    if (!response.ok) setError((await response.json()).error ?? "Order failed");
  }

  /**
   * One-click market order from the chart toolbar. Always sends a MARKET
   * order using the current `lotSize` field — independent of whether the
   * trader has clicked a price on the chart. Validates the lot size and
   * surfaces server errors back into `error` so the user actually sees why
   * the order failed (previous behavior was a no-op when chartPrice was null).
   */
  async function placeMarketOrderQuick(side: "BUY" | "SELL"): Promise<void> {
    setError("");
    if (!hasTerminalToken) {
      setError("Sign into a trading account first.");
      return;
    }
    if (!Number.isFinite(lotSize) || lotSize <= 0) {
      setError("Lot size must be greater than 0.");
      return;
    }
    const response = await fetch(`${API_BASE}/orders`, {
      method: "POST",
      headers: terminalJsonAuthHeaders(),
      body: JSON.stringify({
        symbol: selected,
        side,
        type: "MARKET",
        lotSize,
        stopLoss: stopLoss === "" ? undefined : stopLoss,
        takeProfit: takeProfit === "" ? undefined : takeProfit
      })
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Order failed.");
    }
  }

  function bumpLotSize(delta: number): void {
    setLotSize((prev) => {
      const next = Number((prev + delta).toFixed(2));
      if (!Number.isFinite(next) || next <= 0) return 0.01;
      return next;
    });
  }
  async function handleLineClick(line: { id: string; title: string; price: number }): Promise<void> {
    if (line.title !== "Entry") return;
    const positionId = line.id.replace(/-entry$/, "");
    setChartPositionId(positionId);
    const position = positions.find((p) => p.id === positionId);
    if (!position) return;
    if (typeof position.stopLoss === "number" && typeof position.takeProfit === "number") return;
    const distance = pipDistance(position.symbol, 20);
    const autoSl = position.side === "BUY" ? position.entryPrice - distance : position.entryPrice + distance;
    const autoTp = position.side === "BUY" ? position.entryPrice + distance : position.entryPrice - distance;
    await updatePosition(position.id, String(roundForSymbol(position.symbol, position.stopLoss ?? autoSl)), String(roundForSymbol(position.symbol, position.takeProfit ?? autoTp)));
  }
  async function updateLeverage(): Promise<void> {
    const leverage = Number(leverageInput);
    if (!Number.isFinite(leverage) || leverage < 1 || leverage > 1000) {
      setError("Leverage must be between 1 and 1000.");
      return;
    }
    const response = await fetch(`${API_BASE}/account/leverage`, { method: "POST", headers: terminalJsonAuthHeaders(), body: JSON.stringify({ leverage }) });
    if (!response.ok) setError((await response.json()).error ?? "Failed to update leverage");
  }

  async function updateSpeed(next: number): Promise<void> {
    const response = await fetch(`${API_BASE}/settings/update-speed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketLoopMs: next })
    });
    if (!response.ok) {
      setError((await response.json()).error ?? "Failed to update speed");
      return;
    }
    setMarketLoopMs(next);
    setError("");
  }

  async function updatePriceSource(next: "demo" | "tvc-reference"): Promise<void> {
    const response = await fetch(`${API_BASE}/settings/price-source`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceSourceMode: next })
    });
    if (!response.ok) {
      setError((await response.json()).error ?? "Failed to update price source");
      return;
    }
    setPriceSourceMode(next);
    if (next === "demo") setChartProvider("internal");
    setError("");
  }

  async function updateExecutionProvider(next: "paper" | "broker-demo" | "broker-live"): Promise<void> {
    const response = await fetch(`${API_BASE}/settings/execution-provider`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ executionProvider: next })
    });
    if (!response.ok) {
      setError((await response.json()).error ?? "Failed to update execution provider");
      return;
    }
    setError("");
  }

  function placeholderFeature(name: string): void {
    setError(`${name} will be added in next step.`);
    setOpenMenu(null);
  }

  function toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      void document.exitFullscreen();
      setIsFullscreen(false);
    }
    setOpenMenu(null);
  }

  useEffect(() => {
    function onMouseMove(event: MouseEvent): void {
      if (!dragMode || !bodyRef.current) return;
      const rect = bodyRef.current.getBoundingClientRect();
      if (dragMode === "left-pane") {
        const pct = ((event.clientX - rect.left) / rect.width) * 100;
        setLeftPanePct(Math.max(16, Math.min(45, pct)));
      } else if (dragMode === "terminal") {
        const pct = ((rect.bottom - event.clientY) / rect.height) * 100;
        setTerminalPct(Math.max(18, Math.min(50, pct)));
      }
    }
    function onMouseUp(): void {
      setDragMode(null);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragMode]);

  const topTools = ["Insert", "Charts", "Tools", "Window", "Help"];
  const terminalTabs: TerminalTab[] = ["trade", "history", "news", "alerts"];

  const handlePortalLogin = useCallback(async (username: string, password: string, options?: { rememberDevice?: boolean }) => {
    const { token, user } = await apiLogin(username, password);
    persistToken(token, options?.rememberDevice !== false);
    setConnectedAccountId(user.accountId);
    setIsClientAuthed(true);
    setTerminalStreamEpoch((x) => x + 1);
    setAppView("client-portal");
  }, []);

  const handlePortalRegister = useCallback(async (params: {
    email: string;
    password: string;
    fullName: string;
    referralCode?: string;
  }) => {
    let ref = params.referralCode?.trim();
    if (!ref) {
      try {
        ref = sessionStorage.getItem(PENDING_REFERRAL_STORAGE_KEY)?.trim() ?? undefined;
      } catch {
        ref = undefined;
      }
    }
    const { token, user } = await apiRegister(
      params.email,
      params.password,
      params.fullName,
      ref
    );
    if (ref) {
      try {
        sessionStorage.removeItem(PENDING_REFERRAL_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
    persistToken(token, true);
    setConnectedAccountId(user.accountId);
    setIsClientAuthed(true);
    setTerminalStreamEpoch((x) => x + 1);
    setAppView("client-portal");
  }, []);

  const handleClientLogout = useCallback(() => {
    clearAuth();
    clearTerminalAuth();
    setConnectedAccountId("demo-user");
    setIsClientAuthed(false);
    setTerminalSummary(null);
    setHasTerminalToken(false);
    setTerminalStreamEpoch((x) => x + 1);
    setAppView("login");
  }, []);

  const handleTerminalSignIn = useCallback(
    async (login: string, password: string, rememberDevice: boolean): Promise<void> => {
      const { token, terminal } = await apiTerminalLogin(login, password);
      persistTerminalToken(token, rememberDevice);
      setTerminalSummary(terminal);
      setHasTerminalToken(true);
      // Intentionally NOT mirroring terminal.accountId into connectedAccountId
      // — that state is owned by the portal session and would corrupt
      // /client/summary requests if overwritten.
      setTerminalStreamEpoch((x) => x + 1);
    },
    []
  );

  const handleTerminalSignOut = useCallback(() => {
    clearTerminalAuth();
    setTerminalSummary(null);
    setHasTerminalToken(false);
    setTerminalStreamEpoch((x) => x + 1);
    setAppView(isClientAuthed ? "client-portal" : "website");
  }, [isClientAuthed]);

  const marketingOpenPortal = useCallback(() => {
    setAppView(isClientAuthed ? "client-portal" : "login");
  }, [isClientAuthed]);

  const openMarketingHome = useCallback(() => {
    setMarketingPage("home");
    setAppView("website");
  }, []);

  const openMarketingSubpage = useCallback((page: MarketingSubView) => {
    setMarketingPage(page);
    setAppView("website");
  }, []);

  if ((opsRoute || partnerRoute) && isClientAuthed) {
    return (
      <div className="fxRoot fxOpsClientBlockRoot">
        <header className="fxShellNav">
          <div className="fxShellNavInner">
            <button type="button" className="fxLogoBtn" onClick={() => setAppView("client-portal")}>
              <div className="fxLogoRow">
                <span className="fxLogoMark" aria-hidden="true" />
                <strong className="fxLogoWord">PropPrime</strong>
              </div>
            </button>
            <span className="fxOpsClientBlockNav">Trader session active</span>
          </div>
        </header>
        <main className="fxSite fxOpsClientBlockMain">
          <p className="fxOpsClientBlockTitle">Operator or partner URLs cannot be used during a trader session.</p>
          <p className="fxPortalMuted">Sign out as a trader first, or return to your dashboard.</p>
          <div className="fxOpsClientBlockActions">
            <button
              type="button"
              className="fxCtaFilled"
              onClick={() => {
                window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
                window.location.hash = "";
                setHashEpoch((n) => n + 1);
              }}
            >
              Clear fragment URL
            </button>
            <button type="button" className="fxCtaOutline" onClick={() => setAppView("client-portal")}>
              Back to dashboard
            </button>
            <button type="button" className="fxCtaOutline" onClick={handleClientLogout}>
              Sign out trader
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (opsRoute?.surface === "sign-in") {
    return (
      <AdminLoginPage
        onBack={() => {
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
          window.location.hash = "";
          setHashEpoch((n) => n + 1);
          setAppView(takeOpsReturnView());
        }}
        onSignedIn={() => setHashEpoch((n) => n + 1)}
      />
    );
  }

  if (opsRoute?.surface === "pw-request") {
    return <AdminPasswordRequestPage onBack={() => { window.location.hash = OPS_SIGN_IN_HASH; }} />;
  }

  if (opsRoute?.surface === "pw-approve") {
    return (
      <AdminPasswordApprovePage
        approvalToken={opsRoute.approvalToken}
        onDone={() => {
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
          window.location.hash = "";
          setHashEpoch((n) => n + 1);
        }}
      />
    );
  }

  if (opsRoute?.surface === "pw-set") {
    return <AdminPasswordSetPage resetToken={opsRoute.resetToken} onCompleted={() => setHashEpoch((n) => n + 1)} />;
  }

  if (opsRoute?.surface === "console") {
    if (!readAdminToken()) {
      return (
        <>
          <RedirectHash to={OPS_SIGN_IN_HASH} />
          <div className="fxRoot fxSite fxOpsRedirectWait">
            <p className="fxPortalMuted">Opening operator sign-in…</p>
          </div>
        </>
      );
    }
    return (
      <AdminPortal
        onBackToTerminal={() => {
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
          window.location.hash = "";
          setHashEpoch((n) => n + 1);
          setAppView(takeOpsReturnView());
        }}
        onOperatorLogout={() => {
          clearAdminAuth();
          window.location.hash = OPS_SIGN_IN_HASH;
          setHashEpoch((n) => n + 1);
        }}
      />
    );
  }

  if (partnerRoute?.surface === "sign-in") {
    return (
      <ManagerLoginPage
        key="partner-sign-in"
        onBack={() => {
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
          window.location.hash = "";
          setHashEpoch((n) => n + 1);
          setAppView(takeOpsReturnView());
        }}
        initialMode="signin"
      />
    );
  }

  if (partnerRoute?.surface === "register") {
    return (
      <ManagerLoginPage
        key="partner-register"
        onBack={() => {
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
          window.location.hash = "";
          setHashEpoch((n) => n + 1);
          setAppView(takeOpsReturnView());
        }}
        initialMode="register"
      />
    );
  }

  if (partnerRoute?.surface === "dashboard") {
    if (!readManagerToken()) {
      return (
        <>
          <RedirectHash to={PARTNER_SIGN_IN_HASH} />
          <div className="fxRoot fxSite fxOpsRedirectWait">
            <p className="fxPortalMuted">Opening partner sign-in…</p>
          </div>
        </>
      );
    }
    return (
      <ManagerPortal
        onBack={() => {
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
          window.location.hash = "";
          setHashEpoch((n) => n + 1);
          setAppView(takeOpsReturnView());
        }}
      />
    );
  }

  if (appView === "trader-dashboard") {
    return <TraderDashboard onBackToTerminal={() => setAppView("terminal")} />;
  }

  if (appView === "website") {
    switch (marketingPage) {
      case "programs":
        return <ProgramsPage onNavigate={setMarketingPage} onOpenPortal={marketingOpenPortal} />;
      case "how":
        return <HowItWorksPage onNavigate={setMarketingPage} onOpenPortal={marketingOpenPortal} />;
      case "payouts":
        return <PayoutsPage onNavigate={setMarketingPage} onOpenPortal={marketingOpenPortal} />;
      case "resources":
        return <ResourcesPage onNavigate={setMarketingPage} onOpenPortal={marketingOpenPortal} />;
      case "terms":
        return <TermsPage onNavigate={setMarketingPage} onOpenPortal={marketingOpenPortal} />;
      case "privacy":
        return <PrivacyPage onNavigate={setMarketingPage} onOpenPortal={marketingOpenPortal} />;
      case "cookies":
        return <CookiesPage onNavigate={setMarketingPage} onOpenPortal={marketingOpenPortal} />;
      case "risk":
        return <RiskDisclosurePage onNavigate={setMarketingPage} onOpenPortal={marketingOpenPortal} />;
      case "support":
        return <SupportPage onNavigate={setMarketingPage} onOpenPortal={marketingOpenPortal} />;
      default:
        return <WebsiteHome onNavigate={setMarketingPage} onOpenPortal={marketingOpenPortal} />;
    }
  }
  if (appView === "login") {
    return (
      <LoginPage
        onBackHome={openMarketingHome}
        onOpenMarketingPage={openMarketingSubpage}
        onLogin={handlePortalLogin}
        onRegister={handlePortalRegister}
      />
    );
  }
  if (appView === "client-portal") {
    if (!isClientAuthed) {
      return (
        <LoginPage
          onBackHome={openMarketingHome}
          onOpenMarketingPage={openMarketingSubpage}
          onLogin={handlePortalLogin}
          onRegister={handlePortalRegister}
        />
      );
    }
    return (
      <ClientPortal
        accountId={connectedAccountId}
        onBackHome={openMarketingHome}
        onOpenMarketingPage={openMarketingSubpage}
        onOpenTerminal={() => {
          // Always route through the terminal sign-in screen — the terminal
          // refuses portal credentials by design. The user must enter the
          // numeric login + password issued for that specific package.
          setAppView("terminal");
        }}
        onLogout={handleClientLogout}
      />
    );
  }

  if (appView === "terminal" && !hasTerminalToken) {
    return (
      <TerminalLoginPage
        onSignIn={handleTerminalSignIn}
        onBack={() => setAppView(isClientAuthed ? "client-portal" : "website")}
        hasPortalSession={isClientAuthed}
      />
    );
  }

  return (
    <main className="fxTerminalRoot">
      <header className="fxTerminalTopBar" role="banner">
        <button type="button" className="fxTermLogoBtn" onClick={openMarketingHome} title="Back to marketing site">
          <span className="fxLogoMark fxTermLogoMark" aria-hidden="true" />
          <span className="fxTermLogoTxt">PropPrime</span>
        </button>
        <span className="fxTermChromeDivider" aria-hidden="true" />
        <div className="menuWrap">
          <button type="button" className={openMenu === "file" ? "menuBtn fxTermMenuBtn menuBtnActive" : "menuBtn fxTermMenuBtn"} onClick={() => setOpenMenu(openMenu === "file" ? null : "file")}>File</button>
          {openMenu === "file" && (
            <div className="menuDropdown">
              <button className="menuItem" onClick={() => placeholderFeature("New Chart")}>New Chart<span>▶</span></button>
              <button className="menuItem muted" onClick={() => placeholderFeature("Open Deleted")}>Open Deleted<span>▶</span></button>
              <button className="menuItem" onClick={() => placeholderFeature("Profiles")}>Profiles<span>▶</span></button>
              <button className="menuItem" onClick={() => placeholderFeature("Close")}>Close<span>Ctrl+F4</span></button>
              <button className="menuItem" onClick={() => placeholderFeature("Save")}>Save<span>Ctrl+S</span></button>
              <button className="menuItem" onClick={() => placeholderFeature("Save as Picture")}>Save as Picture</button>
              <button className="menuItem" onClick={() => placeholderFeature("Open Data Folder")}>Open Data Folder<span>Ctrl+Shift+D</span></button>
              <button className="menuItem" onClick={() => placeholderFeature("Print")}>Print<span>Ctrl+P</span></button>
              <button className="menuItem" onClick={() => placeholderFeature("Print Preview")}>Print Preview</button>
              <button className="menuItem" onClick={() => placeholderFeature("Print Setup")}>Print Setup</button>
              <button className="menuItem" onClick={() => placeholderFeature("Open an Account")}>Open an Account</button>
              <button className="menuItem" onClick={() => placeholderFeature("Deposit")}>Deposit</button>
              <button className="menuItem" onClick={() => placeholderFeature("Withdraw")}>Withdraw</button>
              <button className="menuItem" onClick={() => placeholderFeature("Login to Trade Account")}>Login to Trade Account</button>
              <button className="menuItem" onClick={() => placeholderFeature("Login to Web Trader")}>Login to Web Trader</button>
              <button className="menuItem" onClick={() => placeholderFeature("Login to MQL5.community")}>Login to MQL5.community</button>
              <button className="menuItem" onClick={() => placeholderFeature("Exit")}>Exit</button>
            </div>
          )}
        </div>

        <div className="menuWrap">
          <button type="button" className={openMenu === "view" ? "menuBtn fxTermMenuBtn menuBtnActive" : "menuBtn fxTermMenuBtn"} onClick={() => setOpenMenu(openMenu === "view" ? null : "view")}>View</button>
          {openMenu === "view" && (
            <div className="menuDropdown">
              <button className="menuItem" onClick={() => placeholderFeature("Languages")}>Languages<span>▶</span></button>
              <button className="menuItem" onClick={() => placeholderFeature("Color Themes")}>Color Themes<span>▶</span></button>
              <button className="menuItem" onClick={() => setShowToolbars((v) => !v)}>{showToolbars ? "✓ " : ""}Toolbars<span>▶</span></button>
              <button className="menuItem" onClick={() => setShowStatusBar((v) => !v)}>{showStatusBar ? "✓ " : ""}Status Bar</button>
              <button className="menuItem" onClick={() => setShowChartsBar((v) => !v)}>{showChartsBar ? "✓ " : ""}Charts Bar</button>
              <button className="menuItem" onClick={() => placeholderFeature("Symbols")}>Symbols<span>Ctrl+U</span></button>
              <button className="menuItem" onClick={() => placeholderFeature("Depth Of Market")}>Depth Of Market<span>▶</span></button>
              <button className="menuItem" onClick={() => setShowMarketWatch((v) => !v)}>{showMarketWatch ? "✓ " : ""}Market Watch<span>Ctrl+M</span></button>
              <button className="menuItem" onClick={() => placeholderFeature("Data Window")}>Data Window<span>Ctrl+D</span></button>
              <button className="menuItem" onClick={() => placeholderFeature("Navigator")}>Navigator<span>Ctrl+N</span></button>
              <button className="menuItem" onClick={() => setShowToolbox((v) => !v)}>{showToolbox ? "✓ " : ""}Toolbox<span>Ctrl+T</span></button>
              <button className="menuItem" onClick={() => placeholderFeature("Strategy Tester")}>Strategy Tester<span>Ctrl+R</span></button>
              <button className="menuItem" onClick={() => placeholderFeature("Chats")}>Chats<span>Alt+M</span></button>
              <button className="menuItem" onClick={() => placeholderFeature("Reports")}>Reports<span>Alt+F</span></button>
              <button className="menuItem" onClick={toggleFullscreen}>{isFullscreen ? "✓ " : ""}Fullscreen<span>F11</span></button>
            </div>
          )}
        </div>

        <span className="fxTermTopSpacer" aria-hidden="true" />
        {topTools.map((t) => (
          <button key={t} type="button" className="fxTermGhostBtn" onClick={() => placeholderFeature(t)}>{t}</button>
        ))}
        <nav
          className={`fxTermQuickNav${isClientAuthed ? " fxTermQuickNav--client" : ""}`}
          aria-label={isClientAuthed ? "Workspace" : "Developer & workspace"}
        >
          <button type="button" className="fxTermPill fxTermPillMuted" onClick={openMarketingHome}>
            Website
          </button>
          <button type="button" className="fxTermPill fxTermPillMuted" onClick={() => setAppView(isClientAuthed ? "client-portal" : "login")}>
            {isClientAuthed ? "Dashboard" : "Sign in"}
          </button>
          {!isClientAuthed && (
            <button type="button" className="fxTermPill fxTermPillMuted" onClick={() => setAppView("trader-dashboard")}>
              Trader tools
            </button>
          )}
          {!isClientAuthed && (
            <button
              type="button"
              className="fxTermPill fxTermPillOps"
              onClick={() => {
                setOpsReturnView("terminal");
                window.location.hash = OPS_SIGN_IN_HASH;
              }}
              title="Opens separate operator sign-in (hidden URL)."
            >
              Ops console
            </button>
          )}
          {!isClientAuthed && (
            <button
              type="button"
              className="fxTermPill fxTermPillPartner"
              onClick={() => {
                setOpsReturnView("terminal");
                window.location.hash = PARTNER_SIGN_IN_HASH;
              }}
              title="Partner login — referrals and simulated earnings."
            >
              Partner hub
            </button>
          )}
          {terminalSummary && (
            <span
              className="fxTermAcctTag"
              title={`Trading account ${terminalSummary.login} · ${terminalSummary.packageLabel}`}
            >
              <span className="fxTermAcctLabel">Login</span>
              {terminalSummary.login}
            </span>
          )}
          {hasTerminalToken && (
            <button type="button" className="fxTermPill fxTermPillGhost" onClick={handleTerminalSignOut}>
              Sign out of terminal
            </button>
          )}
          {isClientAuthed && !hasTerminalToken && (
            <button type="button" className="fxTermPill fxTermPillGhost" onClick={handleClientLogout}>
              Sign out of portal
            </button>
          )}
        </nav>
      </header>

      <section
        className="bodyArea fxTerminalBody"
        ref={bodyRef}
        style={showToolbox ? { gridTemplateRows: `${100 - terminalPct}% 6px ${terminalPct}%` } : { gridTemplateRows: "100%" }}
      >
      <section className="workspaceRow" style={{ gridTemplateColumns: `${leftPanePct}% 6px ${100 - leftPanePct}%` }}>
        <aside className="leftPane">
          {showMarketWatch && <article className="panel resizablePanel"><h3>Market Watch</h3>{symbols.map((s) => <button key={s} className={selected === s ? "symbol active" : "symbol"} onClick={() => setSelected(s)}><strong>{s}</strong><span>{prices[s] ? `${prices[s].bid} / ${prices[s].ask}` : "--"}</span></button>)}</article>}
          <article className="panel resizablePanel"><h3>Order Ticket</h3><p>{selected} {selectedPrice ? `${selectedPrice.bid}/${selectedPrice.ask}` : "--"}</p><label>Type<select value={orderType} onChange={(e) => setOrderType(e.target.value as "MARKET" | "LIMIT" | "STOP")}><option value="MARKET">Market</option><option value="LIMIT">Limit</option><option value="STOP">Stop</option></select></label>{orderType !== "MARKET" && <label>Price<input type="number" step={stepForSymbol(selected)} value={pendingPrice} onChange={(e) => setPendingPrice(Number(e.target.value))} /></label>}<label>Lot<input type="number" value={lotSize} onChange={(e) => setLotSize(Number(e.target.value))} /></label><div className="actions"><button className="buy" onClick={() => placeOrder("BUY")}>BUY</button><button className="sell" onClick={() => placeOrder("SELL")}>SELL</button></div></article>
          <article className="panel resizablePanel"><h3>Account</h3><p>Trading account: {terminalSummary?.login ?? "—"} <span style={{opacity:0.7}}>({terminalSummary?.accountId ?? "—"})</span></p>{terminalSummary && <p style={{margin:"2px 0 8px",opacity:0.75,fontSize:"0.85em"}}>{terminalSummary.packageLabel}</p>}<p>Balance: ${account.balance.toFixed(2)}</p><p>Equity: ${account.equity.toFixed(2)}</p><p>Free Margin: ${account.freeMargin.toFixed(2)}</p><p>Leverage: 1:{account.leverage}</p><div className="inlineActions"><input type="number" value={leverageInput} onChange={(e) => setLeverageInput(e.target.value)} /><button className="miniBtn" onClick={() => void updateLeverage()}>Set</button></div><p>Update Speed: {marketLoopMs}ms</p><div className="inlineActions"><button className={marketLoopMs === 250 ? "miniBtn activeMode" : "miniBtn"} onClick={() => void updateSpeed(250)}>250ms</button><button className={marketLoopMs === 500 ? "miniBtn activeMode" : "miniBtn"} onClick={() => void updateSpeed(500)}>500ms</button><button className={marketLoopMs === 1000 ? "miniBtn activeMode" : "miniBtn"} onClick={() => void updateSpeed(1000)}>1000ms</button></div><p>Price Source: {priceSourceMode}</p><div className="inlineActions"><button className={priceSourceMode === "demo" ? "miniBtn activeMode" : "miniBtn"} onClick={() => void updatePriceSource("demo")}>Free Live</button><button className={priceSourceMode === "tvc-reference" ? "miniBtn activeMode" : "miniBtn"} onClick={() => void updatePriceSource("tvc-reference")}>TVC Ref</button></div><p>Execution Provider</p><div className="inlineActions"><button className="miniBtn" onClick={() => void updateExecutionProvider("paper")}>Paper</button><button className="miniBtn" onClick={() => void updateExecutionProvider("broker-demo")}>Broker Demo</button><button className="miniBtn" onClick={() => void updateExecutionProvider("broker-live")}>Broker Live</button></div><h3>Challenge Status</h3><p>Phase: {challengeProgress?.phase ?? "-"}</p><p>Status: {challengeProgress ? formatChallengeStatusLabel(challengeProgress.phase, challengeProgress.status) : "-"}</p><p>Trading Days: {challengeProgress?.tradingDays ?? "-"}</p>{error && <p className="error">{error}</p>}</article>
        </aside>

        <div className="splitter vertical" onMouseDown={() => setDragMode("left-pane")} />

        <section className="chartPane">
          <article className="panel chartMainPanel resizablePanel">
            <div className="chartTopRow">
              {showToolbars && <div className="inlineActions">
                <button className={chartType === "candles" ? "tfBtn active iconBtn" : "tfBtn iconBtn"} onClick={() => setChartType("candles")}><CandlestickChart size={15} /></button>
                <button className={chartType === "bar" ? "tfBtn active iconBtn" : "tfBtn iconBtn"} onClick={() => setChartType("bar")}><ChartColumn size={15} /></button>
                <button className={chartType === "line" ? "tfBtn active iconBtn" : "tfBtn iconBtn"} onClick={() => setChartType("line")}><ChartLine size={15} /></button>
                <button className={drawingTool === "none" ? "tfBtn active iconBtn" : "tfBtn iconBtn"} onClick={() => setDrawingTool("none")}><Crosshair size={15} /></button>
                <button className={drawingTool === "hline" ? "tfBtn active iconBtn" : "tfBtn iconBtn"} onClick={() => setDrawingTool("hline")}><MoveHorizontal size={15} /></button>
                <button className={drawingTool === "vline" ? "tfBtn active iconBtn" : "tfBtn iconBtn"} onClick={() => setDrawingTool("vline")}><MoveVertical size={15} /></button>
                <button className={drawingTool === "trendline" ? "tfBtn active iconBtn" : "tfBtn iconBtn"} onClick={() => setDrawingTool("trendline")}><TrendingUp size={15} /></button>
              </div>}
              <div className="inlineActions fxQuickTradeBar">
                <div className="fxLotPicker" title="Lot size used by One Click BUY / SELL">
                  <button
                    type="button"
                    className="fxLotStep"
                    onClick={() => bumpLotSize(-0.01)}
                    aria-label="Decrease lot size"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    className="fxLotInput"
                    min={0.01}
                    step={0.01}
                    value={lotSize}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setLotSize(Number.isFinite(v) && v > 0 ? v : 0.01);
                    }}
                  />
                  <button
                    type="button"
                    className="fxLotStep"
                    onClick={() => bumpLotSize(0.01)}
                    aria-label="Increase lot size"
                  >
                    +
                  </button>
                  <span className="fxLotUnit">lot</span>
                </div>
                <button
                  className="buy miniBtn"
                  onClick={() => void placeMarketOrderQuick("BUY")}
                  title={`Market BUY ${lotSize} lot of ${selected}`}
                >
                  One Click BUY
                </button>
                <button
                  className="sell miniBtn"
                  onClick={() => void placeMarketOrderQuick("SELL")}
                  title={`Market SELL ${lotSize} lot of ${selected}`}
                >
                  One Click SELL
                </button>
              </div>
            </div>
            {showChartsBar && <div className="timeframeRow">{timeframeList.map((tf) => <button key={tf} className={timeframe === tf ? "tfBtn active" : "tfBtn"} onClick={() => setTimeframe(tf)}>{tf}</button>)}</div>}
            <p className="hint">Time: {hoveredTimeLabel} | Hover: {formatForSymbol(selected, hoveredChartPrice)} | Clicked: {formatForSymbol(selected, clickedChartPrice)}</p>
            <div className="inlineActions">
              <button className={chartProvider === "internal" ? "miniBtn activeMode" : "miniBtn"} onClick={() => setChartProvider("internal")}>Internal</button>
              <button className={chartProvider === "tvc" ? "miniBtn activeMode" : "miniBtn"} onClick={() => setChartProvider("tvc")}>TVC</button>
            </div>
            {chartProvider === "internal" ? (
              <ChartPanel
                symbol={selected}
                data={candles}
                markers={chartMarkers}
                lines={chartLines}
                chartType={chartType}
                drawingTool={drawingTool}
                onPricePick={setHoveredChartPrice}
                onHoverInfo={(price, ts) => {
                  setHoveredChartPrice(price);
                  setHoveredChartTime(ts);
                }}
                onChartClick={(price) => setClickedChartPrice(roundForSymbol(selected, price))}
                onLineDrag={(kind, price, done) => void handleLineDrag(kind, price, done)}
                onLineClick={(line) => void handleLineClick(line)}
              />
            ) : (
              <TradingViewEmbed symbol={toTvcSymbol(selected)} />
            )}
          </article>

        </section>
      </section>

      {showToolbox && <div className="splitter horizontal" onMouseDown={() => setDragMode("terminal")} />}

      {showToolbox && <section className="terminalArea">
        <div className="terminalTabs">
          {terminalTabs.map((tab) => (
            <button key={tab} className={terminalTab === tab ? "tabBtn active" : "tabBtn"} onClick={() => setTerminalTab(tab)}>
              {tab.toUpperCase()}
            </button>
          ))}
        </div>

        {terminalTab === "trade" && (
          <div className="tradeGrid">
            <article className="panel panelScroll resizablePanel">
              <h3>Open Positions</h3>
              {positions.length === 0 && <p>No open positions.</p>}
              {positions.map((p) => (
                <div key={p.id} className="positionRow">
                  <p>{p.side} {p.symbol} {p.lotSize} @ {p.entryPrice} | PnL: ${p.unrealizedPnl.toFixed(2)}</p>
                  <p>SL: {p.stopLoss ?? "-"} | TP: {p.takeProfit ?? "-"}</p>
                  <div className="inlineActions">
                    <button className="miniBtn" onClick={() => closePosition(p.id, p.lotSize)}>Close</button>
                    <button className="miniBtn" onClick={() => closePosition(p.id, Number((p.lotSize / 2).toFixed(2)))}>Half</button>
                  </div>
                </div>
              ))}
            </article>
            <article className="panel panelScroll resizablePanel">
              <h3>Pending Orders</h3>
              {pendingOrders.length === 0 && <p>No pending orders.</p>}
              {pendingOrders.map((o) => (
                <div key={o.id} className="positionRow">
                  <p>{o.side} {o.symbol} {o.type} {o.lotSize} @ {o.price}</p>
                  <button className="miniBtn" onClick={() => cancelPending(o.id)}>Cancel</button>
                </div>
              ))}
            </article>
            <article className="panel panelScroll resizablePanel">
              <h3>Bulk Actions</h3>
              <div className="inlineActions">
                <input type="number" placeholder="Bulk SL" value={bulkStopLoss} onChange={(e) => setBulkStopLoss(e.target.value)} />
                <input type="number" placeholder="Bulk TP" value={bulkTakeProfit} onChange={(e) => setBulkTakeProfit(e.target.value)} />
              </div>
              <div className="inlineActions">
                <button className="miniBtn" onClick={() => void bulkModify("all")}>Modify All</button>
                <button className="miniBtn" onClick={() => void bulkModify("selected-symbol")}>Modify {selected}</button>
                <button className="miniBtn" onClick={() => void bulkClose("all")}>Close All</button>
                <button className="miniBtn" onClick={() => void bulkClose("losing")}>Close Losing</button>
                <button className="miniBtn" onClick={() => void bulkClose("profitable")}>Close Winners</button>
              </div>
            </article>
          </div>
        )}

        {terminalTab === "history" && (
          <article className="panel panelScroll resizablePanel">
            <h3>Order History</h3>
            {latestOrders.map((o) => <p key={o.id}>{o.side} {o.symbol} {o.lotSize} | {o.status} @ {o.filledPrice}</p>)}
          </article>
        )}
        {terminalTab === "news" && <article className="panel panelScroll resizablePanel"><h3>News</h3><p>News feed placeholder (will connect later).</p></article>}
        {terminalTab === "alerts" && <article className="panel panelScroll resizablePanel"><h3>Alerts</h3><p>Alerts center placeholder.</p></article>}
      </section>}
      </section>

    </main>
  );
}

export default App;
