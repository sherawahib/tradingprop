import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AccountState,
  ChallengeProgress,
  ForexSymbol,
  Order,
  Position,
  PriceTick
} from "@paper-trader/shared";
import type { UTCTimestamp } from "lightweight-charts";
import ChartPanel, { type Candle, type ChartType } from "./ChartPanel";
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
  apiTerminalChangePassword,
  apiTerminalLogin,
  apiTerminalMe,
  clearAuth,
  persistToken,
  readToken,
  type TerminalAccountSummary
} from "./api";

const SYMBOLS: ForexSymbol[] = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "XAGUSD", "USOILUSD"];

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
  if (symbol === "USDJPY") return Math.round(value * 1000) / 1000;
  if (symbol === "XAUUSD" || symbol === "USOILUSD") return Math.round(value * 100) / 100;
  if (symbol === "XAGUSD") return Math.round(value * 1000) / 1000;
  return Math.round(value * 100000) / 100000;
}

function formatPrice(symbol: ForexSymbol, value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  if (symbol === "USDJPY") return value.toFixed(3);
  if (symbol === "XAUUSD" || symbol === "USOILUSD") return value.toFixed(2);
  if (symbol === "XAGUSD") return value.toFixed(3);
  return value.toFixed(5);
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

function ChangePasswordModal({
  onClose,
  onChanged,
  forced
}: {
  onClose: () => void;
  onChanged: (terminal: TerminalAccountSummary) => void;
  forced: boolean;
}) {
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
      onClose();
    } finally {
      setBusy(false);
    }
  }, [current, next, confirm, onChanged, onClose]);

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__card">
        <div className="modal__head">
          <h2>{forced ? "Set a new password" : "Change password"}</h2>
          {!forced && (
            <button className="btn btn--ghost btn--xs" onClick={onClose} aria-label="Close">
              <X size={12} />
            </button>
          )}
        </div>
        {forced && (
          <p className="alert alert--warn">
            <CircleAlert size={14} /> This trading account is still using its autogenerated password. Set your own
            before continuing.
          </p>
        )}
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
          {!forced && (
            <button className="btn btn--ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
          )}
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
  const [bookTab, setBookTab] = useState<"positions" | "orders">("positions");
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

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const activeSymbolRef = useRef<ForexSymbol>(activeSymbol);
  const timeframeRef = useRef<Timeframe>(timeframe);
  const version = useApiVersion();
  const [showChangePw, setShowChangePw] = useState<boolean>(terminal.mustChangePassword);

  useEffect(() => {
    activeSymbolRef.current = activeSymbol;
  }, [activeSymbol]);
  useEffect(() => {
    timeframeRef.current = timeframe;
  }, [timeframe]);

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
          const data = JSON.parse(String(evt.data)) as { type: string; payload: unknown };
          if (data.type === "price") {
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
          <button className="btn btn--ghost" onClick={() => setShowChangePw(true)} title="Change password">
            <Shield size={14} /> Change password
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
                    onClick={() => {
                      setActiveSymbol(sym);
                      setOrderForm((prev) => ({ ...prev, symbol: sym }));
                    }}
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
            <ChartPanel symbol={activeSymbol} data={candles} chartType={chartType} />
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
              disabled={busy}
              title="Sell"
            >
              <ArrowDownRight size={16} /> Sell
            </button>
            <button
              className="btn btn--buy"
              onClick={() => void placeOrder("BUY")}
              disabled={busy}
              title="Buy"
            >
              <ArrowUpRight size={16} /> Buy
            </button>
          </div>

          {progress && progress.status !== "ACTIVE" && progress.status !== "PASSED" && (
            <p className="alert alert--warn">
              <CircleAlert size={14} /> Trading restricted: {progress.status}
            </p>
          )}

          <div className="bookSection">
            <div className="bookTabs" role="tablist" aria-label="Open positions and orders">
              <button
                type="button"
                className={bookTab === "positions" ? "bookTab bookTab--active" : "bookTab"}
                onClick={() => setBookTab("positions")}
              >
                Positions ({positions.length})
              </button>
              <button
                type="button"
                className={bookTab === "orders" ? "bookTab bookTab--active" : "bookTab"}
                onClick={() => setBookTab("orders")}
              >
                Orders ({orders.length})
              </button>
            </div>

            {bookTab === "positions" ? (
              <PositionList positions={positions} prices={prices} onClose={closePosition} disabled={busy} />
            ) : (
              <OrderList orders={orders} onCancel={cancelOrder} disabled={busy} />
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

      {showChangePw && (
        <ChangePasswordModal
          forced={terminal.mustChangePassword}
          onClose={() => setShowChangePw(false)}
          onChanged={(t) => {
            onTerminalChanged(t);
            showFlash("ok", "Password updated.");
          }}
        />
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
  disabled
}: {
  positions: Position[];
  prices: PriceMap;
  onClose: (id: string) => void;
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
              <span className="bookRow__sym">{p.symbol}</span>
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
  disabled
}: {
  orders: Order[];
  onCancel: (id: string) => void;
  disabled: boolean;
}) {
  if (orders.length === 0) {
    return <p className="bookEmpty">No working orders.</p>;
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
