import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AccountState,
  ChallengeProgress,
  ForexSymbol,
  Order,
  Position,
  PriceTick
} from "@paper-trader/shared";
import {
  estimateBracketExitPnlUsd,
  symbolPipSize,
  symbolRetailMarketSession,
  TRADE_SYMBOLS,
  symbolDecimals
} from "@paper-trader/shared";
import type { UTCTimestamp } from "lightweight-charts";
import ChartPanel, {
  type BracketDragPayload,
  type Candle,
  type ChartPriceLine,
  type ChartType
} from "./ChartPanel";
import { formatChallengeStatusLabel } from "./challengeUi";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CandlestickChart,
  ChartColumn,
  ChartLine,
  CircleAlert,
  LogOut,
  Power,
  RefreshCw,
  Shield,
  TrendingUp,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import {
  API_BASE,
  WS_BASE,
  apiAccount,
  apiCancelOrder,
  apiChallengeProgress,
  apiClosePosition,
  apiHistoryCandles,
  apiOrders,
  apiPlaceOrder,
  apiPositions,
  apiPrices,
  apiUpdatePosition,
  apiTerminalChangePassword,
  apiTerminalLogin,
  apiTerminalMe,
  clearAuth,
  persistToken,
  readToken,
  type TerminalAccountSummary
} from "./api";

/** Full platform catalog — same source as API / web `TRADE_SYMBOLS`. */
const SYMBOLS: ForexSymbol[] = TRADE_SYMBOLS as ForexSymbol[];

type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

const TIMEFRAMES: Array<{ id: Timeframe; label: string; seconds: number }> = [
  { id: "1m", label: "1m", seconds: 60 },
  { id: "5m", label: "5m", seconds: 300 },
  { id: "15m", label: "15m", seconds: 900 },
  { id: "1h", label: "1h", seconds: 3600 },
  { id: "4h", label: "4h", seconds: 14400 },
  { id: "1d", label: "1d", seconds: 86400 }
];

function timeframeSeconds(tf: Timeframe): number {
  return TIMEFRAMES.find((t) => t.id === tf)?.seconds ?? 60;
}

/** Round a price tick to a sensible number of decimals for candle aggregation. */
function roundForSymbol(symbol: ForexSymbol, value: number): number {
  return Number(value.toFixed(symbolDecimals(symbol)));
}

function formatPrice(symbol: ForexSymbol, value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toFixed(symbolDecimals(symbol));
}

function formatUsd(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

interface PriceMap {
  [symbol: string]: PriceTick;
}

type WsStatus = "connecting" | "open" | "closed";

function useApiVersion(): string {
  const [v, setV] = useState<string>("dev");
  useEffect(() => {
    if (typeof window !== "undefined" && window.desktop?.getVersion) {
      void window.desktop.getVersion().then(setV).catch(() => undefined);
    }
  }, []);
  return v;
}

function LoginScreen({
  onAuthed,
  busy,
  onBusyChange
}: {
  onAuthed: (terminal: TerminalAccountSummary) => void;
  busy: boolean;
  onBusyChange: (b: boolean) => void;
}) {
  const [login, setLogin] = useState("100000");
  const [password, setPassword] = useState("terminal1234");
  const [error, setError] = useState<string | null>(null);
  const version = useApiVersion();

  const submit = useCallback(async () => {
    setError(null);
    onBusyChange(true);
    try {
      const r = await apiTerminalLogin(login, password);
      persistToken(r.token);
      onAuthed(r.terminal);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed.");
    } finally {
      onBusyChange(false);
    }
  }, [login, password, onAuthed, onBusyChange]);

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__brandRow">
          <span className="brandMark" aria-hidden="true" />
          <strong className="brandWord">PropPrime Terminal</strong>
        </div>
        <p className="login__lead">
          Sign in with your <strong>trading account credentials</strong> for this package — the numeric login + password
          you got after purchasing. Manage or rotate them in your portal at any time.
        </p>

        <label className="field">
          <span>Trading account number</span>
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoFocus
            autoComplete="username"
            inputMode="numeric"
            spellCheck={false}
            placeholder="e.g. 100001"
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            placeholder="Paste the password from your portal"
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
        </label>

        {error && <p className="alert alert--bad">{error}</p>}

        <button className="btn btn--primary btn--full" onClick={() => void submit()} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <div className="login__demo">
          <p className="login__demoTitle">Demo trading account</p>
          <ul>
            <li>
              Login <code>100000</code> · Password <code>terminal1234</code>
            </li>
          </ul>
          <p className="login__hint">
            Each package you buy on the portal gets its own numeric login. Multiple packages = multiple desktop logins.
          </p>
        </div>

        <p className="login__foot">Build {version} · API {API_BASE}</p>
      </div>
    </div>
  );
}

/** Shown only when `terminal.mustChangePassword` — desktop does not expose voluntary password changes. */
function ChangePasswordModal({ onChanged }: { onChanged: (terminal: TerminalAccountSummary) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setError(null);
    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const out = await apiTerminalChangePassword(current, next);
      if (!out.ok) {
        setError(out.error ?? "Password change failed.");
        return;
      }
      if (out.terminal) onChanged(out.terminal);
    } finally {
      setBusy(false);
    }
  }, [current, next, confirm, onChanged]);

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__card">
        <div className="modal__head">
          <h2>Set a new password</h2>
        </div>
        <p className="alert alert--warn">
          <CircleAlert size={14} /> This trading account is still using its autogenerated password. Set your own before
          continuing.
        </p>
        <label className="field">
          <span>Current password</span>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <label className="field">
          <span>New password</span>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            placeholder="At least 8 characters"
          />
        </label>
        <label className="field">
          <span>Confirm new password</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        {error && <p className="alert alert--bad">{error}</p>}
        <div className="orderBtnRow">
          <button className="btn btn--primary" onClick={() => void submit()} disabled={busy}>
            {busy ? "Saving…" : "Update password"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface PlaceOrderState {
  symbol: ForexSymbol;
  lotSize: string;
  type: "MARKET" | "LIMIT" | "STOP";
  price: string;
  stopLoss: string;
  takeProfit: string;
}

function Terminal({
  terminal,
  onLogout,
  onTerminalChanged
}: {
  terminal: TerminalAccountSummary;
  onLogout: () => void;
  onTerminalChanged: (t: TerminalAccountSummary) => void;
}) {
  const [prices, setPrices] = useState<PriceMap>({});
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [bookTab, setBookTab] = useState<"positions" | "pending" | "orders">("positions");
  const [account, setAccount] = useState<AccountState | null>(null);
  const [progress, setProgress] = useState<ChallengeProgress | null>(null);
  const [activeSymbol, setActiveSymbol] = useState<ForexSymbol>("EURUSD");
  const [timeframe, setTimeframe] = useState<Timeframe>("1m");
  const [chartType, setChartType] = useState<ChartType>("candles");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting");
  const [flash, setFlash] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [orderForm, setOrderForm] = useState<PlaceOrderState>({
    symbol: "EURUSD",
    lotSize: "0.10",
    type: "MARKET",
    price: "",
    stopLoss: "",
    takeProfit: ""
  });
  const [chartCtxMenu, setChartCtxMenu] = useState<{
    x: number;
    y: number;
    price: number;
    /** Below reference → [`BUY`]; above → [`SELL`]; on reference (±ε) → both. */
    sides: ("BUY" | "SELL")[];
    symbol: ForexSymbol;
    refMid: number;
  } | null>(null);
  const [retailSessionClock, setRetailSessionClock] = useState(() => Date.now());

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const activeSymbolRef = useRef<ForexSymbol>(activeSymbol);
  const timeframeRef = useRef<Timeframe>(timeframe);
  const positionsRef = useRef<Position[]>(positions);
  positionsRef.current = positions;
  const version = useApiVersion();

  useEffect(() => {
    activeSymbolRef.current = activeSymbol;
  }, [activeSymbol]);

  /** Keep Place order symbol aligned with the chart (watch list, position row, etc.). */
  useEffect(() => {
    setOrderForm((prev) => (prev.symbol === activeSymbol ? prev : { ...prev, symbol: activeSymbol }));
  }, [activeSymbol]);
  useEffect(() => {
    timeframeRef.current = timeframe;
  }, [timeframe]);

  /** Live TP/SL under pointer while dragging brackets on the chart. */
  const [bracketPreview, setBracketPreview] = useState<{
    positionId: string;
    field: "sl" | "tp";
    price: number;
  } | null>(null);

  useEffect(() => {
    setBracketPreview(null);
  }, [activeSymbol]);

  /** Working limit/stop orders (shown on chart + Pending tab); matches rows that expose Cancel. */
  const workingOrders = useMemo(
    () => orders.filter((o) => o.status === "PENDING" || o.status === "NEW"),
    [orders]
  );
  const historyOrders = useMemo(
    () => orders.filter((o) => o.status !== "PENDING" && o.status !== "NEW"),
    [orders]
  );

  /** Entry / SL / TP / pending triggers on the chart (matches web terminal overlays). */
  const chartLines = useMemo(() => {
    const lines: ChartPriceLine[] = [];
    const symPositions = positions.filter((p) => p.symbol === activeSymbol);
    for (const p of symPositions) {
      lines.push({
        id: `${p.id}-entry`,
        price: p.entryPrice,
        color: "#63b2ff",
        /** Must stay exactly `Entry` for chart hit-testing (multiple positions distinguished by row id). */
        title: "Entry",
        positionSide: p.side
      });

      const slShown =
        bracketPreview?.positionId === p.id && bracketPreview.field === "sl"
          ? bracketPreview.price
          : p.stopLoss;
      const tpShown =
        bracketPreview?.positionId === p.id && bracketPreview.field === "tp"
          ? bracketPreview.price
          : p.takeProfit;

      if (typeof slShown === "number") {
        lines.push({ id: `${p.id}-sl`, price: slShown, color: "#bf3b3b", title: "SL" });
      }
      if (typeof tpShown === "number") {
        lines.push({ id: `${p.id}-tp`, price: tpShown, color: "#1a8f56", title: "TP" });
      }
    }
    workingOrders
      .filter((o) => o.symbol === activeSymbol && typeof o.price === "number")
      .forEach((o) => {
        lines.push({
          id: `pending-${o.id}`,
          price: o.price as number,
          color: "#f5b041",
          title: o.side === "BUY" ? "BUY PEND" : "SELL PEND"
        });
      });
    return lines;
  }, [positions, workingOrders, activeSymbol, bracketPreview]);

  const showFlash = useCallback((kind: "ok" | "bad", text: string) => {
    setFlash({ kind, text });
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlash(null), 4000);
  }, []);

  const reload = useCallback(async () => {
    try {
      const [pPrices, pPositions, pOrders, pAccount, pProgress] = await Promise.all([
        apiPrices(),
        apiPositions(),
        apiOrders(),
        apiAccount(),
        apiChallengeProgress()
      ]);
      const map: PriceMap = {};
      pPrices.forEach((t) => (map[t.symbol] = t));
      setPrices((prev) => ({ ...prev, ...map }));
      setPositions(pPositions);
      setOrders(pOrders);
      setAccount(pAccount);
      setProgress(pProgress);
    } catch (e) {
      showFlash("bad", e instanceof Error ? e.message : "Failed to load terminal data.");
    }
  }, [showFlash]);

  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const showFlashRef = useRef(showFlash);
  showFlashRef.current = showFlash;

  const clearBracketPreview = useCallback(() => setBracketPreview(null), []);

  /**
   * Keep a stable identity: `positions`/`reload` churn from WS polling would otherwise change this
   * callback every tick and rebind ChartPanel pointer listeners mid-drag — clearing bracket drag state.
   */
  const handleBracketDrag = useCallback(({ positionId, field, price, done }: BracketDragPayload) => {
    const sym = activeSymbolRef.current;
    const pos = positionsRef.current.find((p) => p.id === positionId && p.symbol === sym);
    if (!pos) return;
    const rounded = roundForSymbol(pos.symbol, price);
    if (!done) {
      setBracketPreview({ positionId, field, price: rounded });
      return;
    }
    setBracketPreview(null);
    void (async () => {
      const patch = field === "sl" ? { stopLoss: rounded } : { takeProfit: rounded };
      const out = await apiUpdatePosition(positionId, patch);
      if (!out.ok) {
        showFlashRef.current("bad", out.error ?? "Could not update SL/TP.");
        return;
      }
      await reloadRef.current();
    })();
  }, []);

  const estimateBracketExitPnl = useCallback(
    (args: { positionId: string; field: "sl" | "tp"; linePrice: number }): number | null => {
      const sym = activeSymbolRef.current;
      const pos = positionsRef.current.find((p) => p.id === args.positionId && p.symbol === sym);
      if (!pos) return null;
      return estimateBracketExitPnlUsd(pos.symbol, pos.side, pos.lotSize, pos.entryPrice, args.linePrice);
    },
    []
  );

  const handleClearPositionBracket = useCallback((positionId: string, field: "sl" | "tp") => {
    const sym = activeSymbolRef.current;
    const pos = positionsRef.current.find((p) => p.id === positionId && p.symbol === sym);
    if (!pos) return;
    void (async () => {
      const patch = field === "sl" ? { stopLoss: null as const } : { takeProfit: null as const };
      const out = await apiUpdatePosition(positionId, patch);
      if (!out.ok) {
        showFlashRef.current("bad", out.error ?? "Could not remove SL/TP.");
        return;
      }
      await reloadRef.current();
    })();
  }, []);

  useEffect(() => {
    void reload();
    const id = window.setInterval(() => {
      void apiAccount().then(setAccount).catch(() => undefined);
      void apiPositions().then(setPositions).catch(() => undefined);
      void apiOrders().then(setOrders).catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(id);
  }, [reload]);

  /** Pull historical candles whenever the user switches symbol or timeframe. */
  useEffect(() => {
    let cancelled = false;
    void apiHistoryCandles(activeSymbol, timeframe, 1000)
      .then((rows) => {
        if (cancelled) return;
        setCandles(
          rows.map((r) => ({
            time: r.time as UTCTimestamp,
            open: r.open,
            high: r.high,
            low: r.low,
            close: r.close
          }))
        );
      })
      .catch((e) => {
        if (cancelled) return;
        showFlash("bad", e instanceof Error ? e.message : "Failed to load chart data.");
      });
    return () => {
      cancelled = true;
    };
  }, [activeSymbol, timeframe, showFlash]);

  useEffect(() => {
    let cancelled = false;

    function connect(): void {
      if (cancelled) return;
      setWsStatus("connecting");
      const ws = new WebSocket(`${WS_BASE}/`);
      wsRef.current = ws;
      ws.addEventListener("open", () => {
        if (cancelled) return;
        setWsStatus("open");
        const tok = readToken();
        if (tok) {
          try {
            ws.send(JSON.stringify({ type: "auth", token: tok }));
          } catch {
            /* ignore */
          }
        }
      });
      ws.addEventListener("message", (evt) => {
        try {
          /** Server frames use `{ event, payload }`; tolerate `{ type, payload }`
           *  too in case anything ever flips back. */
          const data = JSON.parse(String(evt.data)) as {
            event?: string;
            type?: string;
            payload: unknown;
          };
          const kind = data.event ?? data.type;
          if (kind === "price") {
            const tick = data.payload as PriceTick;
            setPrices((prev) => ({ ...prev, [tick.symbol]: tick }));
            if (tick.symbol === activeSymbolRef.current) {
              const bucketSec = timeframeSeconds(timeframeRef.current);
              const mid = roundForSymbol(tick.symbol, (tick.bid + tick.ask) / 2);
              const bucketTime = (Math.floor(tick.timestamp / 1000 / bucketSec) * bucketSec) as UTCTimestamp;
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
                  next.push({
                    time: bucketTime,
                    open: last.close,
                    high: Math.max(last.close, mid),
                    low: Math.min(last.close, mid),
                    close: mid
                  });
                  return next.slice(-1800);
                }
                return next;
              });
            }
          } else if (kind === "positions") {
            setPositions(data.payload as Position[]);
          } else if (kind === "orders") {
            setOrders(data.payload as Order[]);
          } else if (kind === "account") {
            setAccount(data.payload as AccountState);
          }
        } catch {
          /* ignore malformed frames */
        }
      });
      ws.addEventListener("close", () => {
        if (cancelled) return;
        setWsStatus("closed");
        reconnectRef.current = window.setTimeout(connect, 2000);
      });
      ws.addEventListener("error", () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      });
    }

    connect();
    return () => {
      cancelled = true;
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      try {
        wsRef.current?.close();
      } catch {
        /* ignore */
      }
    };
    /** activeSymbol/timeframe deliberately excluded — we read them inside the
     *  handler at tick time to avoid tearing down the WS on every selection. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activePrice = prices[activeSymbol];

  const totalUnrealized = useMemo(
    () => positions.reduce((acc, p) => acc + (p.unrealizedPnl ?? 0), 0),
    [positions]
  );

  const placeOrder = useCallback(
    async (side: "BUY" | "SELL") => {
      const lot = Number(orderForm.lotSize);
      if (!Number.isFinite(lot) || lot <= 0) {
        showFlash("bad", "Enter a positive lot size.");
        return;
      }
      const sess = symbolRetailMarketSession(orderForm.symbol);
      if (!sess.tradeable) {
        showFlash("bad", sess.reason);
        return;
      }
      const payload = {
        symbol: orderForm.symbol,
        side,
        type: orderForm.type,
        lotSize: lot,
        price: orderForm.type === "MARKET" ? undefined : Number(orderForm.price) || undefined,
        stopLoss: orderForm.stopLoss ? Number(orderForm.stopLoss) : undefined,
        takeProfit: orderForm.takeProfit ? Number(orderForm.takeProfit) : undefined
      };
      setBusy(true);
      try {
        const out = await apiPlaceOrder(payload);
        if (!out.ok) {
          showFlash("bad", out.error ?? "Order rejected.");
        } else {
          showFlash("ok", `${side} ${lot.toFixed(2)} ${orderForm.symbol} placed.`);
          await reload();
        }
      } finally {
        setBusy(false);
      }
    },
    [orderForm, reload, showFlash]
  );

  const closePosition = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        const out = await apiClosePosition(id);
        if (!out.ok) showFlash("bad", out.error ?? "Close failed.");
        else {
          showFlash("ok", "Position closed.");
          await reload();
        }
      } finally {
        setBusy(false);
      }
    },
    [reload, showFlash]
  );

  const handleChartContextMenu = useCallback(
    (price: number, clientX: number, clientY: number) => {
      const tick = prices[activeSymbol];
      if (!tick) {
        showFlash("bad", "Live price unavailable for this symbol.");
        return;
      }
      const mid = (tick.bid + tick.ask) / 2;
      const pip = symbolPipSize(activeSymbol);
      const halfSpread = Math.max((tick.ask - tick.bid) / 2, 0);
      const epsilon = Math.max(pip * 0.08, halfSpread * 0.06, Number.EPSILON * 10 * (Math.abs(mid) || 1));
      /** Below reference mid → Buy limit only; above → Sell limit only; on top of mid ±ε → pick either. */
      let sides: ("BUY" | "SELL")[];
      if (mid - price > epsilon) sides = ["BUY"];
      else if (price - mid > epsilon) sides = ["SELL"];
      else sides = ["BUY", "SELL"];
      setChartCtxMenu({
        x: clientX,
        y: clientY,
        price: roundForSymbol(activeSymbol, price),
        sides,
        symbol: activeSymbol,
        refMid: roundForSymbol(activeSymbol, mid)
      });
    },
    [prices, activeSymbol, showFlash]
  );

  const placeLimitFromChart = useCallback(
    async (side: "BUY" | "SELL") => {
      if (!chartCtxMenu) return;
      const lot = Number(orderForm.lotSize);
      if (!Number.isFinite(lot) || lot <= 0) {
        showFlash("bad", "Enter a positive lot size.");
        setChartCtxMenu(null);
        return;
      }
      const sess = symbolRetailMarketSession(chartCtxMenu.symbol);
      if (!sess.tradeable) {
        showFlash("bad", sess.reason);
        setChartCtxMenu(null);
        return;
      }
      setBusy(true);
      try {
        const out = await apiPlaceOrder({
          symbol: chartCtxMenu.symbol,
          side,
          type: "LIMIT",
          lotSize: lot,
          price: chartCtxMenu.price
        });
        if (!out.ok) {
          showFlash("bad", out.error ?? "Limit order rejected.");
        } else {
          showFlash(
            "ok",
            `${side} LIMIT ${lot.toFixed(2)} ${chartCtxMenu.symbol} @ ${formatPrice(
              chartCtxMenu.symbol,
              chartCtxMenu.price
            )} placed.`
          );
          await reload();
        }
      } finally {
        setBusy(false);
        setChartCtxMenu(null);
      }
    },
    [chartCtxMenu, orderForm.lotSize, reload, showFlash]
  );

  useEffect(() => {
    if (!chartCtxMenu) return;
    function onDocClick(): void {
      setChartCtxMenu(null);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setChartCtxMenu(null);
    }
    window.addEventListener("mousedown", onDocClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [chartCtxMenu]);

  useEffect(() => {
    const id = window.setInterval(() => setRetailSessionClock(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const retailSessionActive = useMemo(
    () => symbolRetailMarketSession(activeSymbol, new Date(retailSessionClock)),
    [activeSymbol, retailSessionClock]
  );
  const retailSessionOrderForm = useMemo(
    () => symbolRetailMarketSession(orderForm.symbol, new Date(retailSessionClock)),
    [orderForm.symbol, retailSessionClock]
  );

  const cancelOrder = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        const out = await apiCancelOrder(id);
        if (!out.ok) showFlash("bad", out.error ?? "Cancel failed.");
        else {
          showFlash("ok", "Order canceled.");
          await reload();
        }
      } finally {
        setBusy(false);
      }
    },
    [reload, showFlash]
  );

  return (
    <div className="term">
      <header className="term__top">
        <div className="term__brand">
          <span className="brandMark" aria-hidden="true" />
          <strong className="brandWord">PropPrime Terminal</strong>
          <span className="term__chip" title={terminal.packageLabel}>
            #{terminal.login} · {terminal.packageLabel}
          </span>
        </div>
        <div className="term__topRight">
          <span className={`pill pill--${wsStatus === "open" ? "ok" : wsStatus === "connecting" ? "warn" : "bad"}`}>
            {wsStatus === "open" ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span>WS {wsStatus}</span>
          </span>
          <button className="btn btn--ghost" onClick={() => void reload()} title="Refresh">
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn btn--ghost" onClick={onLogout} title="Sign out">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </header>

      <section className="term__statBar">
        <Stat label="Balance" value={formatUsd(account?.balance)} icon={<TrendingUp size={14} />} />
        <Stat label="Equity" value={formatUsd(account?.equity)} icon={<Activity size={14} />} />
        <Stat label="Free margin" value={formatUsd(account?.freeMargin)} icon={<Shield size={14} />} />
        <Stat label="Used margin" value={formatUsd(account?.usedMargin)} />
        <Stat label="Leverage" value={account ? `${account.leverage}x` : "—"} />
        <Stat
          label="Open P/L"
          value={formatUsd(totalUnrealized)}
          tone={totalUnrealized > 0 ? "ok" : totalUnrealized < 0 ? "bad" : "neutral"}
        />
        {progress && (
          <Stat
            label="Phase · Status"
            value={`${progress.phase} · ${formatChallengeStatusLabel(progress.phase, progress.status)}`}
            tone={
              progress.status === "BREACHED" || progress.status === "LOCKED"
                ? "bad"
                : progress.status === "ACTIVE" || progress.status === "PASSED"
                  ? "ok"
                  : "warn"
            }
          />
        )}
      </section>

      <main className="term__body">
        <aside className="term__watch">
          <div className="panelHead">
            <span>Market watch</span>
            <span className="panelHead__sub">Live ticks</span>
          </div>
          <ul className="watch">
            {SYMBOLS.map((sym) => {
              const t = prices[sym];
              const active = sym === activeSymbol;
              return (
                <li key={sym}>
                  <button
                    type="button"
                    className={`watch__row ${active ? "watch__row--active" : ""}`}
                    onClick={() => setActiveSymbol(sym)}
                  >
                    <span className="watch__sym">{sym}</span>
                    <span className="watch__bid">{formatPrice(sym, t?.bid)}</span>
                    <span className="watch__ask">{formatPrice(sym, t?.ask)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="term__center">
          <div className="quote">
            <div className="quote__sym">{activeSymbol}</div>
            <div className="quote__row">
              <div className="quote__cell">
                <span className="quote__label">Bid</span>
                <span className="quote__bid">{formatPrice(activeSymbol, activePrice?.bid)}</span>
              </div>
              <div className="quote__cell">
                <span className="quote__label">Ask</span>
                <span className="quote__ask">{formatPrice(activeSymbol, activePrice?.ask)}</span>
              </div>
              <div className="quote__cell">
                <span className="quote__label">Spread</span>
                <span className="quote__spread">
                  {activePrice ? formatPrice(activeSymbol, activePrice.ask - activePrice.bid) : "—"}
                </span>
              </div>
              <div className="quote__cell">
                <span className="quote__label">Updated</span>
                <span className="quote__time">
                  {activePrice ? new Date(activePrice.timestamp).toLocaleTimeString() : "—"}
                </span>
              </div>
            </div>
          </div>

          <div className="chartToolbar">
            <div className="tfGroup" role="tablist" aria-label="Timeframe">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.id}
                  type="button"
                  className={timeframe === tf.id ? "tfBtn active" : "tfBtn"}
                  onClick={() => setTimeframe(tf.id)}
                >
                  {tf.label}
                </button>
              ))}
            </div>
            <div className="tfGroup" role="tablist" aria-label="Chart type">
              <button
                type="button"
                className={chartType === "candles" ? "tfBtn iconBtn active" : "tfBtn iconBtn"}
                onClick={() => setChartType("candles")}
                title="Candles"
                aria-label="Candles"
              >
                <CandlestickChart size={14} />
              </button>
              <button
                type="button"
                className={chartType === "bar" ? "tfBtn iconBtn active" : "tfBtn iconBtn"}
                onClick={() => setChartType("bar")}
                title="Bars"
                aria-label="Bars"
              >
                <ChartColumn size={14} />
              </button>
              <button
                type="button"
                className={chartType === "line" ? "tfBtn iconBtn active" : "tfBtn iconBtn"}
                onClick={() => setChartType("line")}
                title="Line"
                aria-label="Line"
              >
                <ChartLine size={14} />
              </button>
            </div>
          </div>

          <div className="term__chart">
            <ChartPanel
              symbol={activeSymbol}
              data={candles}
              chartType={chartType}
              lines={chartLines}
              onBracketDrag={handleBracketDrag}
              onBracketDragCancel={clearBracketPreview}
              onChartContextMenu={handleChartContextMenu}
              estimateBracketExitPnl={estimateBracketExitPnl}
              onClearPositionBracket={handleClearPositionBracket}
            />
          </div>
        </section>

        <aside className="term__order">
          <div className="panelHead">
            <span>Place order</span>
            <span className="panelHead__sub">{orderForm.symbol}</span>
          </div>

          <label className="field">
            <span>Symbol</span>
            <select
              value={orderForm.symbol}
              onChange={(e) =>
                setOrderForm((prev) => ({ ...prev, symbol: e.target.value as ForexSymbol }))
              }
            >
              {SYMBOLS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Order type</span>
            <select
              value={orderForm.type}
              onChange={(e) =>
                setOrderForm((prev) => ({ ...prev, type: e.target.value as PlaceOrderState["type"] }))
              }
            >
              <option value="MARKET">Market</option>
              <option value="LIMIT">Limit</option>
              <option value="STOP">Stop</option>
            </select>
          </label>

          <label className="field">
            <span>Lot size</span>
            <input
              value={orderForm.lotSize}
              inputMode="decimal"
              onChange={(e) => setOrderForm((prev) => ({ ...prev, lotSize: e.target.value }))}
            />
          </label>

          {orderForm.type !== "MARKET" && (
            <label className="field">
              <span>Trigger price</span>
              <input
                value={orderForm.price}
                inputMode="decimal"
                placeholder={formatPrice(orderForm.symbol, prices[orderForm.symbol]?.ask)}
                onChange={(e) => setOrderForm((prev) => ({ ...prev, price: e.target.value }))}
              />
            </label>
          )}

          <div className="fieldRow">
            <label className="field">
              <span>Stop loss</span>
              <input
                value={orderForm.stopLoss}
                inputMode="decimal"
                placeholder="optional"
                onChange={(e) => setOrderForm((prev) => ({ ...prev, stopLoss: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Take profit</span>
              <input
                value={orderForm.takeProfit}
                inputMode="decimal"
                placeholder="optional"
                onChange={(e) => setOrderForm((prev) => ({ ...prev, takeProfit: e.target.value }))}
              />
            </label>
          </div>

          <div className="orderBtnRow">
            <button
              className="btn btn--sell"
              onClick={() => void placeOrder("SELL")}
              disabled={busy || !retailSessionOrderForm.tradeable}
              title={retailSessionOrderForm.tradeable ? "Sell" : retailSessionOrderForm.reason}
            >
              <ArrowDownRight size={16} /> Sell
            </button>
            <button
              className="btn btn--buy"
              onClick={() => void placeOrder("BUY")}
              disabled={busy || !retailSessionOrderForm.tradeable}
              title={retailSessionOrderForm.tradeable ? "Buy" : retailSessionOrderForm.reason}
            >
              <ArrowUpRight size={16} /> Buy
            </button>
          </div>

          {!retailSessionOrderForm.tradeable && (
            <p className="alert alert--warn">
              <CircleAlert size={14} /> {retailSessionOrderForm.reason}
            </p>
          )}

          {progress && progress.status !== "ACTIVE" && progress.status !== "PASSED" && (
            <p className="alert alert--warn">
              <CircleAlert size={14} /> Trading restricted: {progress.status}
            </p>
          )}

          <div className="bookSection">
            <div className="bookTabs bookTabs--3" role="tablist" aria-label="Positions, pending orders, and history">
              <button
                type="button"
                role="tab"
                aria-selected={bookTab === "positions"}
                aria-label={`Positions, ${positions.length} open`}
                className={bookTab === "positions" ? "bookTab bookTab--active" : "bookTab"}
                onClick={() => setBookTab("positions")}
                title="Open positions"
              >
                Positions ({positions.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={bookTab === "pending"}
                aria-label={`Pending orders, ${workingOrders.length}`}
                className={bookTab === "pending" ? "bookTab bookTab--active" : "bookTab"}
                onClick={() => setBookTab("pending")}
                title={`Limit / stop orders awaiting fill (${workingOrders.length})`}
              >
                Pending ({workingOrders.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={bookTab === "orders"}
                aria-label={`Order history, ${historyOrders.length} recent`}
                className={bookTab === "orders" ? "bookTab bookTab--active" : "bookTab"}
                onClick={() => setBookTab("orders")}
                title={`Filled / canceled / other (${historyOrders.length})`}
              >
                History ({historyOrders.length})
              </button>
            </div>

            {bookTab === "positions" ? (
              <PositionList
                positions={positions}
                prices={prices}
                onClose={closePosition}
                onSelectSymbol={setActiveSymbol}
                disabled={busy}
              />
            ) : bookTab === "pending" ? (
              <OrderList
                orders={workingOrders}
                onCancel={cancelOrder}
                disabled={busy}
                emptyLabel="No pending orders."
              />
            ) : (
              <OrderList orders={historyOrders} onCancel={cancelOrder} disabled={busy} emptyLabel="No order history." />
            )}
          </div>
        </aside>
      </main>

      <footer className="term__foot">
        <span>API {API_BASE}</span>
        <span>·</span>
        <span>Build {version}</span>
        <span className="term__footRight">
          {flash && (
            <span className={`flash flash--${flash.kind}`}>
              <Power size={12} /> {flash.text}
            </span>
          )}
        </span>
      </footer>

      {terminal.mustChangePassword && (
        <ChangePasswordModal
          onChanged={(t) => {
            onTerminalChanged(t);
            showFlash("ok", "Password updated.");
          }}
        />
      )}

      {chartCtxMenu && (
        <div
          className="dtChartCtxMenu"
          role="menu"
          style={{ left: chartCtxMenu.x, top: chartCtxMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="dtChartCtxMenu__head">
            <span className="dtChartCtxMenu__sym">{chartCtxMenu.symbol}</span>
            <span className="dtChartCtxMenu__price">
              {formatPrice(chartCtxMenu.symbol, chartCtxMenu.price)}
            </span>
          </div>
          <p className="dtChartCtxMenu__ref" title="Click below this reference for Buy limit; above for Sell limit.">
            vs mid <strong>{formatPrice(chartCtxMenu.symbol, chartCtxMenu.refMid)}</strong>
            {chartCtxMenu.sides.length > 1 ? " · Pick side" : ""}
          </p>
          {chartCtxMenu.sides.map((side) => (
            <button
              key={side}
              type="button"
              className={`dtChartCtxMenu__action ${side === "BUY" ? "dtChartCtxMenu__action--buy" : "dtChartCtxMenu__action--sell"}`}
              disabled={busy || !retailSessionActive.tradeable}
              title={retailSessionActive.tradeable ? undefined : retailSessionActive.reason}
              onClick={() => void placeLimitFromChart(side)}
            >
              {side === "BUY" ? "Buy limit" : "Sell limit"}
              <span className="dtChartCtxMenu__lot">{Number(orderForm.lotSize).toFixed(2)} lot</span>
            </button>
          ))}
          {!retailSessionActive.tradeable && (
            <div className="dtChartCtxMenu__notice">{retailSessionActive.reason}</div>
          )}
          <button
            type="button"
            className="dtChartCtxMenu__cancel"
            onClick={() => setChartCtxMenu(null)}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  tone
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: "ok" | "bad" | "warn" | "neutral";
}) {
  return (
    <div className={`stat ${tone ? `stat--${tone}` : ""}`}>
      <span className="stat__label">
        {icon}
        {label}
      </span>
      <span className="stat__value">{value}</span>
    </div>
  );
}

/** Compact list of open positions, sized for the 280px right rail. */
function PositionList({
  positions,
  prices,
  onClose,
  onSelectSymbol,
  disabled
}: {
  positions: Position[];
  prices: PriceMap;
  onClose: (id: string) => void;
  /** Switch main chart / quote strip to this instrument. */
  onSelectSymbol?: (symbol: ForexSymbol) => void;
  disabled: boolean;
}) {
  if (positions.length === 0) {
    return <p className="bookEmpty">No open positions.</p>;
  }
  return (
    <ul className="bookList">
      {positions.map((p) => {
        const tick = prices[p.symbol];
        const live = p.side === "BUY" ? tick?.bid : tick?.ask;
        const pnlClass = p.unrealizedPnl >= 0 ? "ok" : "bad";
        return (
          <li key={p.id} className="bookRow">
            <div className="bookRow__head">
              {onSelectSymbol ? (
                <button
                  type="button"
                  className="bookRow__sym bookRow__symBtn"
                  onClick={() => onSelectSymbol(p.symbol)}
                  title={`Open ${p.symbol} chart`}
                  aria-label={`Open ${p.symbol} chart`}
                >
                  {p.symbol}
                </button>
              ) : (
                <span className="bookRow__sym">{p.symbol}</span>
              )}
              <span className={`bookRow__side bookRow__side--${p.side === "BUY" ? "buy" : "sell"}`}>
                {p.side} {p.lotSize.toFixed(2)}
              </span>
              <button
                type="button"
                className="bookRow__close"
                onClick={() => onClose(p.id)}
                disabled={disabled}
                title="Close position"
                aria-label="Close position"
              >
                <X size={11} />
              </button>
            </div>
            <div className="bookRow__meta">
              <span>
                <em>Entry</em> {formatPrice(p.symbol, p.entryPrice)}
              </span>
              <span>
                <em>Live</em> {formatPrice(p.symbol, live)}
              </span>
              <span className={pnlClass}>
                <em>P/L</em> {formatUsd(p.unrealizedPnl)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Compact list of working / recent orders, sized for the 280px right rail. */
function OrderList({
  orders,
  onCancel,
  disabled,
  emptyLabel = "No orders."
}: {
  orders: Order[];
  onCancel: (id: string) => void;
  disabled: boolean;
  emptyLabel?: string;
}) {
  if (orders.length === 0) {
    return <p className="bookEmpty">{emptyLabel}</p>;
  }
  const recent = [...orders].sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
  const cancelable = new Set(
    orders.filter((o) => o.status === "PENDING" || o.status === "NEW").map((o) => o.id)
  );
  return (
    <ul className="bookList">
      {recent.map((o) => {
        const px =
          typeof o.price === "number"
            ? o.price
            : typeof o.filledPrice === "number"
              ? o.filledPrice
              : null;
        return (
          <li key={o.id} className="bookRow">
            <div className="bookRow__head">
              <span className="bookRow__sym">{o.symbol}</span>
              <span className={`bookRow__side bookRow__side--${o.side === "BUY" ? "buy" : "sell"}`}>
                {o.side} {o.lotSize.toFixed(2)}
              </span>
              {cancelable.has(o.id) ? (
                <button
                  type="button"
                  className="bookRow__close"
                  onClick={() => onCancel(o.id)}
                  disabled={disabled}
                  title="Cancel order"
                  aria-label="Cancel order"
                >
                  <X size={11} />
                </button>
              ) : (
                <span className="bookRow__close bookRow__close--ghost" aria-hidden="true" />
              )}
            </div>
            <div className="bookRow__meta">
              <span>
                <em>{o.type}</em> {px !== null ? formatPrice(o.symbol, px) : "—"}
              </span>
              <span>{o.status}</span>
              <span>{new Date(o.createdAt).toLocaleTimeString()}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function App() {
  const [terminal, setTerminal] = useState<TerminalAccountSummary | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = readToken();
    if (!t) {
      setBootstrapping(false);
      return;
    }
    void apiTerminalMe()
      .then(setTerminal)
      .catch(() => {
        clearAuth();
      })
      .finally(() => setBootstrapping(false));
  }, []);

  const handleLogout = useCallback(() => {
    clearAuth();
    setTerminal(null);
  }, []);

  if (bootstrapping) {
    return (
      <div className="splash">
        <span className="brandMark" aria-hidden="true" />
        <p>Connecting to {API_BASE}…</p>
      </div>
    );
  }

  if (!terminal) {
    return <LoginScreen onAuthed={setTerminal} busy={busy} onBusyChange={setBusy} />;
  }

  return <Terminal terminal={terminal} onLogout={handleLogout} onTerminalChanged={setTerminal} />;
}
