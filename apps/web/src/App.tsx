import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AccountState, ChallengeProgress, ForexSymbol, Order, Position, PriceTick } from "@paper-trader/shared";
import { symbolPipSize, symbolRetailMarketSession } from "@paper-trader/shared";
import { formatChallengeStatusLabel } from "./challengeUi";
import type { UTCTimestamp } from "lightweight-charts";
import {
  BadgeDollarSign,
  BarChart3,
  CandlestickChart,
  ChartColumn,
  ChartLine,
  Crosshair,
  Layers,
  List,
  MoveHorizontal,
  MoveVertical,
  TrendingUp,
  Wallet
} from "lucide-react";
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

/** Keep in sync with `TRADE_SYMBOLS` in `@paper-trader/shared` / API `domain.symbols`. */
const symbols: ForexSymbol[] = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "XAUUSD",
  "XAGUSD",
  "USOILUSD",
  "BTCUSD",
  "ETHUSD",
  "SOLUSD",
  "BNBUSD",
  "XRPUSD",
  "ADAUSD",
  "DOGEUSD",
  "AVAXUSD"
];
type Timeframe = "1s" | "5s" | "15s" | "30s" | "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w" | "1mo";
type Candle = { time: UTCTimestamp; open: number; high: number; low: number; close: number };
type TerminalTab = "trade" | "ticket" | "history" | "news" | "alerts";
/** Bottom-dock sections when the web terminal is in narrow (phone) layout. */
type TerminalMobilePane = "chart" | "watch" | "trade" | "book" | "account";
type MobileBookSubTab = "pending" | "bulk";

const TERMINAL_TAB_LABELS: Record<TerminalTab, string> = {
  trade: "Trade",
  ticket: "Open ticket",
  history: "History",
  news: "News",
  alerts: "Alerts"
};
type TopMenu = "file" | "view" | null;
interface CalendarEvent {
  id: string;
  title: string;
  currency: string;
  impact: "high" | "medium" | "low" | "holiday";
  timestamp: number;
  forecast: string | null;
  previous: string | null;
}
type AppView = "website" | "login" | "client-portal" | "terminal" | "trader-dashboard";

const timeframeList: Timeframe[] = ["1s", "5s", "15s", "30s", "1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1mo"];
const timeframeSeconds: Record<Timeframe, number> = {
  "1s": 1, "5s": 5, "15s": 15, "30s": 30, "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400, "1w": 604800, "1mo": 2592000
};

function roundForSymbol(symbol: ForexSymbol, value: number): number {
  if (symbol === "BTCUSD" || symbol === "ETHUSD" || symbol === "SOLUSD" || symbol === "BNBUSD" || symbol === "AVAXUSD") {
    return Number(value.toFixed(2));
  }
  if (symbol === "XRPUSD" || symbol === "ADAUSD") return Number(value.toFixed(5));
  if (symbol === "DOGEUSD") return Number(value.toFixed(6));
  if (symbol === "USDJPY") return Number(value.toFixed(3));
  if (symbol === "XAUUSD" || symbol === "USOILUSD") return Number(value.toFixed(2));
  if (symbol === "XAGUSD") return Number(value.toFixed(3));
  return Number(value.toFixed(5));
}
function formatForSymbol(symbol: ForexSymbol, value: number | null | undefined): string {
  if (typeof value !== "number") return "-";
  if (symbol === "BTCUSD" || symbol === "ETHUSD" || symbol === "SOLUSD" || symbol === "BNBUSD" || symbol === "AVAXUSD") {
    return value.toFixed(2);
  }
  if (symbol === "XRPUSD" || symbol === "ADAUSD") return value.toFixed(5);
  if (symbol === "DOGEUSD") return value.toFixed(6);
  if (symbol === "USDJPY") return value.toFixed(3);
  if (symbol === "XAUUSD" || symbol === "USOILUSD") return value.toFixed(2);
  if (symbol === "XAGUSD") return value.toFixed(3);
  return value.toFixed(5);
}
function pipDistance(symbol: ForexSymbol, pips: number): number {
  const pip =
    symbol === "BTCUSD"
      ? 10
      : symbol === "ETHUSD"
        ? 1
        : symbol === "SOLUSD" || symbol === "AVAXUSD"
          ? 0.05
          : symbol === "BNBUSD"
            ? 0.5
            : symbol === "XRPUSD" || symbol === "ADAUSD"
              ? 0.0001
              : symbol === "DOGEUSD"
                ? 0.00001
                : symbol === "USDJPY"
                  ? 0.01
                  : symbol === "XAUUSD" || symbol === "USOILUSD"
                    ? 0.01
                    : symbol === "XAGUSD"
                      ? 0.001
                      : 0.0001;
  return pip * pips;
}

function stepForSymbol(symbol: ForexSymbol): number {
  if (symbol === "BTCUSD") return 1;
  if (symbol === "ETHUSD") return 0.1;
  if (symbol === "SOLUSD" || symbol === "AVAXUSD") return 0.01;
  if (symbol === "BNBUSD") return 0.1;
  if (symbol === "XRPUSD" || symbol === "ADAUSD") return 0.00001;
  if (symbol === "DOGEUSD") return 0.000001;
  if (symbol === "USDJPY") return 0.001;
  if (symbol === "XAUUSD" || symbol === "USOILUSD") return 0.01;
  if (symbol === "XAGUSD") return 0.001;
  return 0.00001;
}

function toTvcSymbol(symbol: ForexSymbol): string {
  if (symbol === "BTCUSD") return "BINANCE:BTCUSDT";
  if (symbol === "ETHUSD") return "BINANCE:ETHUSDT";
  if (symbol === "SOLUSD") return "BINANCE:SOLUSDT";
  if (symbol === "BNBUSD") return "BINANCE:BNBUSDT";
  if (symbol === "XRPUSD") return "BINANCE:XRPUSDT";
  if (symbol === "ADAUSD") return "BINANCE:ADAUSDT";
  if (symbol === "DOGEUSD") return "BINANCE:DOGEUSDT";
  if (symbol === "AVAXUSD") return "BINANCE:AVAXUSDT";
  if (symbol === "XAUUSD") return "TVC:GOLD";
  if (symbol === "XAGUSD") return "TVC:SILVER";
  if (symbol === "USOILUSD") return "TVC:USOIL";
  return `OANDA:${symbol}`;
}

interface PositionCardProps {
  position: Position;
  livePrice?: PriceTick;
  onClose: (id: string, lot: number) => void;
  onUpdate: (id: string, sl: string, tp: string) => Promise<void> | void;
}

function PositionCard({ position, livePrice, onClose, onUpdate }: PositionCardProps) {
  const [editing, setEditing] = useState(false);
  const [slDraft, setSlDraft] = useState<string>(
    typeof position.stopLoss === "number" ? String(position.stopLoss) : ""
  );
  const [tpDraft, setTpDraft] = useState<string>(
    typeof position.takeProfit === "number" ? String(position.takeProfit) : ""
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) return;
    setSlDraft(typeof position.stopLoss === "number" ? String(position.stopLoss) : "");
    setTpDraft(typeof position.takeProfit === "number" ? String(position.takeProfit) : "");
  }, [position.stopLoss, position.takeProfit, editing]);

  const pnl = position.unrealizedPnl;
  const pnlTone = pnl > 0 ? "is-up" : pnl < 0 ? "is-down" : "is-flat";
  const sideClass = position.side === "BUY" ? "fxPosSide is-buy" : "fxPosSide is-sell";
  const live = livePrice
    ? position.side === "BUY"
      ? livePrice.bid
      : livePrice.ask
    : null;
  const closeLot = position.lotSize;
  const halfLot = Number((position.lotSize / 2).toFixed(2));
  const step = stepForSymbol(position.symbol);

  async function saveEdits() {
    setSaving(true);
    try {
      await onUpdate(position.id, slDraft, tpDraft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function clearField(target: "sl" | "tp") {
    if (target === "sl") setSlDraft("");
    else setTpDraft("");
  }

  return (
    <article className="fxPosCard">
      <header className="fxPosCard__head">
        <div className="fxPosCard__id">
          <span className={sideClass}>{position.side}</span>
          <span className="fxPosCard__sym">{position.symbol}</span>
          <span className="fxPosCard__lot">{position.lotSize.toFixed(2)} lot</span>
        </div>
        <div className={`fxPosCard__pnl ${pnlTone}`}>
          <span className="fxPosCard__pnlLabel">P/L</span>
          <span className="fxPosCard__pnlValue">
            {pnl >= 0 ? "+" : "−"}${Math.abs(pnl).toFixed(2)}
          </span>
        </div>
      </header>

      <dl className="fxPosCard__stats">
        <div>
          <dt>Entry</dt>
          <dd>{formatForSymbol(position.symbol, position.entryPrice)}</dd>
        </div>
        <div>
          <dt>Live</dt>
          <dd>{live !== null ? formatForSymbol(position.symbol, live) : "—"}</dd>
        </div>
        <div>
          <dt>Stop loss</dt>
          <dd className="fxPosCard__sl">
            {typeof position.stopLoss === "number"
              ? formatForSymbol(position.symbol, position.stopLoss)
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Take profit</dt>
          <dd className="fxPosCard__tp">
            {typeof position.takeProfit === "number"
              ? formatForSymbol(position.symbol, position.takeProfit)
              : "—"}
          </dd>
        </div>
      </dl>

      {editing && (
        <div className="fxPosCard__edit">
          <label className="fxPosCard__field">
            <span>Stop loss</span>
            <div className="fxPosCard__inputRow">
              <input
                type="number"
                value={slDraft}
                step={step}
                onChange={(e) => setSlDraft(e.target.value)}
                placeholder="—"
              />
              <button
                type="button"
                className="fxPosCard__clear"
                onClick={() => clearField("sl")}
                title="Remove stop loss"
              >
                Clear
              </button>
            </div>
          </label>
          <label className="fxPosCard__field">
            <span>Take profit</span>
            <div className="fxPosCard__inputRow">
              <input
                type="number"
                value={tpDraft}
                step={step}
                onChange={(e) => setTpDraft(e.target.value)}
                placeholder="—"
              />
              <button
                type="button"
                className="fxPosCard__clear"
                onClick={() => clearField("tp")}
                title="Remove take profit"
              >
                Clear
              </button>
            </div>
          </label>
        </div>
      )}

      <div className="fxPosCard__actions">
        {editing ? (
          <>
            <button
              type="button"
              className="fxPosBtn fxPosBtn--primary"
              onClick={() => void saveEdits()}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save SL/TP"}
            </button>
            <button
              type="button"
              className="fxPosBtn"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="fxPosBtn"
              onClick={() => setEditing(true)}
              title="Edit SL / TP"
            >
              Edit SL/TP
            </button>
            <button
              type="button"
              className="fxPosBtn fxPosBtn--ghost"
              onClick={() => onClose(position.id, halfLot)}
              disabled={halfLot <= 0}
              title="Close half of the position"
            >
              Close ½ ({halfLot.toFixed(2)})
            </button>
            <button
              type="button"
              className="fxPosBtn fxPosBtn--danger"
              onClick={() => onClose(position.id, closeLot)}
              title="Close full position"
            >
              Close
            </button>
          </>
        )}
      </div>
    </article>
  );
}

interface PendingOrderCardProps {
  order: Order;
  onCancel: (id: string) => void;
}

function PendingOrderCard({ order, onCancel }: PendingOrderCardProps) {
  const sideClass = order.side === "BUY" ? "fxPosSide is-buy" : "fxPosSide is-sell";
  return (
    <article className="fxPosCard fxPosCard--pending">
      <header className="fxPosCard__head">
        <div className="fxPosCard__id">
          <span className={sideClass}>{order.side}</span>
          <span className="fxPosCard__sym">{order.symbol}</span>
          <span className="fxPosCard__lot">{order.lotSize.toFixed(2)} lot</span>
        </div>
        <span className="fxPosCard__type">{order.type}</span>
      </header>
      <dl className="fxPosCard__stats">
        <div>
          <dt>Trigger</dt>
          <dd>{typeof order.price === "number" ? formatForSymbol(order.symbol, order.price) : "—"}</dd>
        </div>
        <div>
          <dt>Stop loss</dt>
          <dd className="fxPosCard__sl">
            {typeof order.stopLoss === "number" ? formatForSymbol(order.symbol, order.stopLoss) : "—"}
          </dd>
        </div>
        <div>
          <dt>Take profit</dt>
          <dd className="fxPosCard__tp">
            {typeof order.takeProfit === "number" ? formatForSymbol(order.symbol, order.takeProfit) : "—"}
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{order.status}</dd>
        </div>
      </dl>
      <div className="fxPosCard__actions">
        <button type="button" className="fxPosBtn fxPosBtn--danger" onClick={() => onCancel(order.id)}>
          Cancel order
        </button>
      </div>
    </article>
  );
}

interface NewsPanelProps {
  events: CalendarEvent[];
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
  impact: "high" | "high-medium";
  onChangeImpact: (next: "high" | "high-medium") => void;
  onRefresh: () => void;
  now: number;
}

function NewsPanel({
  events,
  loading,
  error,
  fetchedAt,
  impact,
  onChangeImpact,
  onRefresh,
  now
}: NewsPanelProps) {
  const visible = useMemo(() => {
    /** Show today's events first, then upcoming, then last few past entries. */
    const past: CalendarEvent[] = [];
    const upcoming: CalendarEvent[] = [];
    for (const evt of events) {
      if (evt.timestamp < now - 60 * 60_000) past.push(evt);
      else upcoming.push(evt);
    }
    return [...upcoming, ...past.slice(-8).reverse()];
  }, [events, now]);

  const counts = useMemo(() => {
    let high = 0;
    let medium = 0;
    for (const e of events) {
      if (e.impact === "high") high += 1;
      else if (e.impact === "medium") medium += 1;
    }
    return { high, medium, total: events.length };
  }, [events]);

  return (
    <article className="panel panelScroll resizablePanel fxPosPanel fxNewsPanel">
      <header className="fxPosPanel__head fxNewsPanel__head">
        <h3>News</h3>
        <div className="fxNewsPanel__headRight">
          <span className="fxNewsPanel__counts">
            <span className="fxNewsImpactPill fxNewsImpactPill--high">High {counts.high}</span>
            {impact === "high-medium" && (
              <span className="fxNewsImpactPill fxNewsImpactPill--medium">Med {counts.medium}</span>
            )}
          </span>
          <div className="fxNewsPanel__filter" role="tablist" aria-label="News impact filter">
            <button
              type="button"
              className={`fxNewsFilterBtn ${impact === "high-medium" ? "is-active" : ""}`}
              onClick={() => onChangeImpact("high-medium")}
            >
              High + Med
            </button>
            <button
              type="button"
              className={`fxNewsFilterBtn ${impact === "high" ? "is-active" : ""}`}
              onClick={() => onChangeImpact("high")}
            >
              High only
            </button>
          </div>
          <button
            type="button"
            className="fxNewsFilterBtn fxNewsFilterBtn--refresh"
            onClick={onRefresh}
            disabled={loading}
            title="Force refresh from ForexFactory"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </header>

      <p className="fxNewsPanel__source">
        ForexFactory economic calendar · High / Medium impact · {visible.length} shown
        {fetchedAt && (
          <>
            {" · updated "}
            <span className="fxNewsPanel__sourceTime">
              {new Date(fetchedAt).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit"
              })}
            </span>
          </>
        )}
      </p>

      {error && (
        <p className="alert alert--bad" style={{ margin: "0" }}>
          {error}
        </p>
      )}

      {loading && events.length === 0 && (
        <p className="fxPosEmpty">Loading economic calendar…</p>
      )}

      {!loading && !error && events.length === 0 && (
        <p className="fxPosEmpty">No high or medium impact events in the current window.</p>
      )}

      {visible.length > 0 && (
        <ul className="fxNewsList">
          {visible.map((evt) => {
            const past = evt.timestamp < now - 60 * 60_000;
            const live = Math.abs(evt.timestamp - now) <= 30 * 60_000;
            return (
              <li
                key={evt.id}
                className={`fxNewsRow fxNewsRow--${evt.impact} ${past ? "is-past" : ""} ${live ? "is-live" : ""}`}
              >
                <span className={`fxNewsRow__impact fxNewsRow__impact--${evt.impact}`} aria-hidden="true">
                  <span className="dot dot--1" />
                  <span className="dot dot--2" />
                  <span className="dot dot--3" />
                </span>
                <div className="fxNewsRow__main">
                  <div className="fxNewsRow__line1">
                    <span className="fxNewsRow__currency">{evt.currency}</span>
                    <span className="fxNewsRow__title">{evt.title}</span>
                    {live && <span className="fxNewsRow__livePill">Now</span>}
                  </div>
                  <div className="fxNewsRow__line2">
                    <span className="fxNewsRow__time">
                      {new Date(evt.timestamp).toLocaleString(undefined, {
                        weekday: "short",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </span>
                    <span className="fxNewsRow__rel">{relativeTime(evt.timestamp - now)}</span>
                    {evt.forecast && (
                      <span className="fxNewsRow__stat">
                        <em>F</em>
                        {evt.forecast}
                      </span>
                    )}
                    {evt.previous && (
                      <span className="fxNewsRow__stat">
                        <em>P</em>
                        {evt.previous}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

function relativeTime(diffMs: number): string {
  const abs = Math.abs(diffMs);
  const past = diffMs < 0;
  const minutes = Math.round(abs / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return past ? `${minutes}m ago` : `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return past ? `${hours}h ago` : `in ${hours}h`;
  const days = Math.round(hours / 24);
  return past ? `${days}d ago` : `in ${days}d`;
}

/** Maximum number of pairs the user can pin to the Market Watch list at once. */
const MAX_WATCH_SYMBOLS = 5;
/** Maximum number of chart tabs that can be opened simultaneously. */
const MAX_CHART_TABS = 8;
const WATCH_STORAGE_KEY = "fx-terminal:watched";
const TABS_STORAGE_KEY = "fx-terminal:chartTabs";
const DRAG_MIME = "application/x-fx-symbol";

function readPersistedSymbols(key: string, fallback: ForexSymbol[]): ForexSymbol[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      return parsed as ForexSymbol[];
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function persistSymbols(key: string, list: ForexSymbol[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* ignore quota */
  }
}

interface MarketWatchPanelProps {
  watched: ForexSymbol[];
  available: ForexSymbol[];
  prices: Record<string, PriceTick>;
  active: ForexSymbol;
  onActivate: (sym: ForexSymbol) => void;
  onAdd: (sym: ForexSymbol) => void;
  onRemove: (sym: ForexSymbol) => void;
}

function MarketWatchPanel({
  watched,
  available,
  prices,
  active,
  onActivate,
  onAdd,
  onRemove
}: MarketWatchPanelProps) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim().toUpperCase();
  const watchedSet = useMemo(() => new Set(watched.map((s) => s.toUpperCase())), [watched]);
  const matches = useMemo(() => {
    if (!trimmed) return [] as ForexSymbol[];
    return available
      .filter((s) => s.toUpperCase().includes(trimmed))
      .slice(0, 30);
  }, [available, trimmed]);
  const atCapacity = watched.length >= MAX_WATCH_SYMBOLS;

  function handleDragStart(e: React.DragEvent<HTMLDivElement>, sym: ForexSymbol): void {
    e.dataTransfer.effectAllowed = "copyMove";
    e.dataTransfer.setData(DRAG_MIME, sym);
    e.dataTransfer.setData("text/plain", sym);
  }

  return (
    <article className="panel resizablePanel mwPanel">
      <div className="mwHeader">
        <h3 style={{ margin: 0 }}>Market Watch</h3>
        <span className="mwCount" title="Open chart by drag-and-drop onto the chart area">
          {watched.length}/{MAX_WATCH_SYMBOLS}
        </span>
      </div>
      <div className="mwSearch">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search pairs to add…"
          aria-label="Search trading pairs"
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      {trimmed ? (
        <div className="mwResults" role="listbox" aria-label="Search results">
          {matches.length === 0 && <p className="mwEmpty">No matches.</p>}
          {matches.map((sym) => {
            const already = watchedSet.has(sym.toUpperCase());
            return (
              <div key={sym} className={`mwResultRow${already ? " is-added" : ""}`}>
                <span className="mwResultSym">{sym}</span>
                <span className="mwResultPx">
                  {prices[sym] ? `${prices[sym].bid} / ${prices[sym].ask}` : "—"}
                </span>
                {already ? (
                  <button
                    type="button"
                    className="mwAddBtn mwAddBtnRemove"
                    onClick={() => onRemove(sym)}
                    title="Remove from watch list"
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    type="button"
                    className="mwAddBtn"
                    disabled={atCapacity}
                    onClick={() => onAdd(sym)}
                    title={atCapacity ? `Watch list full (max ${MAX_WATCH_SYMBOLS})` : "Add to watch list"}
                  >
                    + Add
                  </button>
                )}
              </div>
            );
          })}
          {atCapacity && (
            <p className="mwHint">Watch list is full ({MAX_WATCH_SYMBOLS}). Remove one before adding more.</p>
          )}
        </div>
      ) : (
        <div className="mwList">
          {watched.length === 0 && (
            <p className="mwEmpty">Use the search box to add up to {MAX_WATCH_SYMBOLS} pairs.</p>
          )}
          {watched.map((sym) => {
            const px = prices[sym];
            return (
              <div
                key={sym}
                className={`symbol mwRow${active === sym ? " active" : ""}`}
                draggable
                onDragStart={(e) => handleDragStart(e, sym)}
                onClick={() => onActivate(sym)}
                title="Drag onto the chart to open in a new tab"
              >
                <strong>{sym}</strong>
                <span className="mwRowPx">{px ? `${px.bid} / ${px.ask}` : "--"}</span>
                <button
                  type="button"
                  className="mwRowClose"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(sym);
                  }}
                  aria-label={`Remove ${sym}`}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            );
          })}
          <p className="mwHintMuted">Tip: drag a pair onto the chart to open it in a new tab.</p>
        </div>
      )}
    </article>
  );
}

interface ChartTabsBarProps {
  tabs: ForexSymbol[];
  active: ForexSymbol;
  onSelect: (sym: ForexSymbol) => void;
  onClose: (sym: ForexSymbol) => void;
}

function ChartTabsBar({ tabs, active, onSelect, onClose }: ChartTabsBarProps) {
  return (
    <div className="chartTabsBar" role="tablist" aria-label="Open charts">
      {tabs.map((sym) => (
        <div
          key={sym}
          role="tab"
          aria-selected={active === sym}
          className={`chartTab${active === sym ? " is-active" : ""}`}
          onClick={() => onSelect(sym)}
          title={`Switch to ${sym}`}
        >
          <span className="chartTabSym">{sym}</span>
          {tabs.length > 1 && (
            <button
              type="button"
              className="chartTabClose"
              onClick={(e) => {
                e.stopPropagation();
                onClose(sym);
              }}
              aria-label={`Close ${sym} chart`}
              title="Close"
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Pulls the live broker symbol set from the API; falls back to the curated
 * catalog so the UI is usable even when the bridge hasn't reported in yet.
 */
function useLiveSymbols(initial: ForexSymbol[]): ForexSymbol[] {
  const [list, setList] = useState<ForexSymbol[]>(initial);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`${API_BASE}/market/bridge/status`);
        if (!r.ok) return;
        const data = (await r.json()) as { coveredSymbols?: string[] };
        if (cancelled) return;
        const live = Array.isArray(data.coveredSymbols) ? data.coveredSymbols : [];
        if (live.length === 0) return;
        const seen = new Set<string>();
        const merged: ForexSymbol[] = [];
        for (const s of initial) {
          if (live.includes(s) && !seen.has(s)) {
            merged.push(s as ForexSymbol);
            seen.add(s);
          }
        }
        for (const s of live) {
          if (!seen.has(s)) {
            merged.push(s as ForexSymbol);
            seen.add(s);
          }
        }
        setList(merged);
      } catch {
        /* keep fallback */
      }
    };
    void load();
    const id = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [initial]);
  return list;
}

const DEFAULT_WATCHED: ForexSymbol[] = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD"];

function App() {
  const [selected, setSelected] = useState<ForexSymbol>("EURUSD");
  const [watchedSymbols, setWatchedSymbols] = useState<ForexSymbol[]>(() =>
    readPersistedSymbols(WATCH_STORAGE_KEY, DEFAULT_WATCHED).slice(0, MAX_WATCH_SYMBOLS)
  );
  const [chartTabs, setChartTabs] = useState<ForexSymbol[]>(() => {
    const persisted = readPersistedSymbols(TABS_STORAGE_KEY, ["EURUSD"]).slice(0, MAX_CHART_TABS);
    return persisted.length > 0 ? persisted : ["EURUSD"];
  });
  const [chartDragOver, setChartDragOver] = useState(false);
  const availableSymbols = useLiveSymbols(symbols);

  useEffect(() => {
    persistSymbols(WATCH_STORAGE_KEY, watchedSymbols);
  }, [watchedSymbols]);
  useEffect(() => {
    persistSymbols(TABS_STORAGE_KEY, chartTabs);
  }, [chartTabs]);

  // Keep `selected` synced with the open tab list — if the active symbol gets
  // closed, switch to whichever tab is left.
  useEffect(() => {
    if (!chartTabs.includes(selected) && chartTabs.length > 0) {
      setSelected(chartTabs[0]);
    }
  }, [chartTabs, selected]);

  const addWatched = useCallback((sym: ForexSymbol) => {
    setWatchedSymbols((prev) => {
      if (prev.includes(sym)) return prev;
      if (prev.length >= MAX_WATCH_SYMBOLS) return prev;
      return [...prev, sym];
    });
  }, []);
  const removeWatched = useCallback((sym: ForexSymbol) => {
    setWatchedSymbols((prev) => prev.filter((s) => s !== sym));
  }, []);

  const openChartTab = useCallback((sym: ForexSymbol) => {
    setChartTabs((prev) => {
      if (prev.includes(sym)) return prev;
      if (prev.length >= MAX_CHART_TABS) {
        // Drop oldest non-active to make room.
        const [, ...rest] = prev;
        return [...rest, sym];
      }
      return [...prev, sym];
    });
    setSelected(sym);
  }, []);
  const closeChartTab = useCallback(
    (sym: ForexSymbol) => {
      setChartTabs((prev) => {
        if (prev.length <= 1) return prev; // keep at least one chart open
        const next = prev.filter((s) => s !== sym);
        if (sym === selected) {
          setSelected(next[0]);
        }
        return next;
      });
    },
    [selected]
  );

  const handleChartDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (
      e.dataTransfer.types.includes(DRAG_MIME) ||
      e.dataTransfer.types.includes("text/plain")
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      if (!chartDragOver) setChartDragOver(true);
    }
  }, [chartDragOver]);
  const handleChartDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Only flip off when leaving the pane (relatedTarget outside)
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setChartDragOver(false);
  }, []);
  const handleChartDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setChartDragOver(false);
      const sym =
        (e.dataTransfer.getData(DRAG_MIME) as ForexSymbol) ||
        (e.dataTransfer.getData("text/plain") as ForexSymbol);
      if (!sym) return;
      if (!availableSymbols.includes(sym)) return;
      openChartTab(sym);
    },
    [availableSymbols, openChartTab]
  );
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
  /** Quick limit form in Trade tab → Pending Orders panel */
  const [tradePanelLimitPrice, setTradePanelLimitPrice] = useState("");
  const [tradePanelLimitSl, setTradePanelLimitSl] = useState("");
  const [tradePanelLimitTp, setTradePanelLimitTp] = useState("");
  const [limitPanelBusy, setLimitPanelBusy] = useState(false);
  /** Right-click chart context menu state. */
  const [chartCtxMenu, setChartCtxMenu] = useState<{
    x: number;
    y: number;
    price: number;
    sides: ("BUY" | "SELL")[];
    refMid: number;
  } | null>(null);
  const [leverageInput, setLeverageInput] = useState<string>("100");
  const [terminalTab, setTerminalTab] = useState<TerminalTab>("trade");
  const [retailSessionClock, setRetailSessionClock] = useState(() => Date.now());
  const [news, setNews] = useState<CalendarEvent[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [newsFetchedAt, setNewsFetchedAt] = useState<number | null>(null);
  const [newsImpact, setNewsImpact] = useState<"high" | "high-medium">("high-medium");
  const [newsClock, setNewsClock] = useState(() => Date.now());
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

  const [terminalNarrow, setTerminalNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches
  );
  const [terminalMobilePane, setTerminalMobilePane] = useState<TerminalMobilePane>("chart");
  const [mobileBookSubTab, setMobileBookSubTab] = useState<MobileBookSubTab>("pending");

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    function apply(): void {
      setTerminalNarrow(mq.matches);
    }
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);


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

  useEffect(() => {
    setTradePanelLimitPrice("");
    setTradePanelLimitSl("");
    setTradePanelLimitTp("");
  }, [selected]);

  useEffect(() => {
    const t = prices[selected];
    if (!t || tradePanelLimitPrice !== "") return;
    setTradePanelLimitPrice(String(roundForSymbol(selected, (t.bid + t.ask) / 2)));
  }, [selected, prices, tradePanelLimitPrice]);

  const selectedPrice = prices[selected];
  const latestOrders = useMemo(() => orders.slice(0, 25), [orders]);
  const closedTrades = useMemo(
    () =>
      orders
        .filter((o) => typeof o.realizedPnl === "number" && o.status === "FILLED")
        .sort((a, b) => (b.closedAt ?? b.createdAt) - (a.closedAt ?? a.createdAt)),
    [orders]
  );
  const winTrades = useMemo(
    () => closedTrades.filter((o) => (o.realizedPnl ?? 0) > 0),
    [closedTrades]
  );
  const lossTrades = useMemo(
    () => closedTrades.filter((o) => (o.realizedPnl ?? 0) < 0),
    [closedTrades]
  );
  const tradeStats = useMemo(() => {
    let totalPnl = 0;
    let winPnl = 0;
    let lossPnl = 0;
    let bestTrade = -Infinity;
    let worstTrade = Infinity;
    for (const t of closedTrades) {
      const r = t.realizedPnl ?? 0;
      totalPnl += r;
      if (r > 0) {
        winPnl += r;
        if (r > bestTrade) bestTrade = r;
      } else if (r < 0) {
        lossPnl += r;
        if (r < worstTrade) worstTrade = r;
      }
    }
    const winRate =
      closedTrades.length > 0
        ? (winTrades.length / closedTrades.length) * 100
        : 0;
    return {
      totalPnl,
      winPnl,
      lossPnl,
      winRate,
      bestTrade: bestTrade === -Infinity ? 0 : bestTrade,
      worstTrade: worstTrade === Infinity ? 0 : worstTrade
    };
  }, [closedTrades, winTrades]);
  const [historyTab, setHistoryTab] = useState<"all" | "wins" | "losses">("all");
  const visibleHistory =
    historyTab === "wins" ? winTrades : historyTab === "losses" ? lossTrades : closedTrades;
  const formatUsdSigned = useCallback((n: number): string => {
    const sign = n > 0 ? "+" : n < 0 ? "−" : "";
    return `${sign}$${Math.abs(n).toFixed(2)}`;
  }, []);
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
    const sess = symbolRetailMarketSession(selected);
    if (!sess.tradeable) {
      setError(sess.reason);
      return;
    }
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

  function handleChartContextMenu(price: number, clientX: number, clientY: number): void {
    const tick = prices[selected];
    if (!tick) {
      setError("Live price unavailable for this symbol.");
      return;
    }
    const mid = (tick.bid + tick.ask) / 2;
    const pip = symbolPipSize(selected);
    const halfSpread = Math.max((tick.ask - tick.bid) / 2, 0);
    const epsilon = Math.max(pip * 0.08, halfSpread * 0.06, Number.EPSILON * 10 * (Math.abs(mid) || 1));
    /** Below bid/ask mid → Buy limit; above → Sell limit; on mid ±ε offer both. */
    let sides: ("BUY" | "SELL")[];
    if (mid - price > epsilon) sides = ["BUY"];
    else if (price - mid > epsilon) sides = ["SELL"];
    else sides = ["BUY", "SELL"];
    setChartCtxMenu({
      x: clientX,
      y: clientY,
      price: roundForSymbol(selected, price),
      sides,
      refMid: roundForSymbol(selected, mid)
    });
  }

  async function placeLimitFromChart(side: "BUY" | "SELL"): Promise<void> {
    if (!chartCtxMenu) return;
    setError("");
    const sess = symbolRetailMarketSession(selected);
    if (!sess.tradeable) {
      setError(sess.reason);
      setChartCtxMenu(null);
      return;
    }
    const lot = lotSize;
    if (!Number.isFinite(lot) || lot <= 0) {
      setError("Enter a positive lot size.");
      setChartCtxMenu(null);
      return;
    }
    const response = await fetch(`${API_BASE}/orders`, {
      method: "POST",
      headers: terminalJsonAuthHeaders(),
      body: JSON.stringify({
        symbol: selected,
        side,
        type: "LIMIT",
        lotSize: lot,
        price: chartCtxMenu.price
      })
    });
    if (!response.ok) setError((await response.json()).error ?? "Limit order failed");
    setChartCtxMenu(null);
  }

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

  /** Tick once a minute so the BUY/SELL gating reacts when a session window
   *  opens or closes while the trader is staring at the chart. */
  useEffect(() => {
    const id = window.setInterval(() => setRetailSessionClock(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const retailSessionSelected = useMemo(
    () => symbolRetailMarketSession(selected, new Date(retailSessionClock)),
    [selected, retailSessionClock]
  );

  const fetchNews = useCallback(
    async (impact: "high" | "high-medium", refresh = false) => {
      setNewsLoading(true);
      setNewsError(null);
      try {
        const impactQuery = impact === "high" ? "high" : "high,medium";
        const url = `${API_BASE}/news/calendar?impact=${impactQuery}&horizon=week${refresh ? "&refresh=1" : ""}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`Calendar feed error (${r.status})`);
        const data = (await r.json()) as { events: CalendarEvent[]; fetchedAt?: number };
        setNews(Array.isArray(data.events) ? data.events : []);
        setNewsFetchedAt(typeof data.fetchedAt === "number" ? data.fetchedAt : Date.now());
      } catch (e) {
        setNewsError(e instanceof Error ? e.message : "Failed to load economic calendar.");
      } finally {
        setNewsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (terminalTab !== "news") return;
    void fetchNews(newsImpact);
    const id = window.setInterval(() => void fetchNews(newsImpact), 5 * 60_000);
    return () => window.clearInterval(id);
  }, [terminalTab, newsImpact, fetchNews]);

  useEffect(() => {
    if (terminalTab !== "news") return;
    const id = window.setInterval(() => setNewsClock(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [terminalTab]);

  async function placeTradePanelLimit(side: "BUY" | "SELL"): Promise<void> {
    setError("");
    const sess = symbolRetailMarketSession(selected);
    if (!sess.tradeable) {
      setError(sess.reason);
      return;
    }
    const px = Number(tradePanelLimitPrice);
    if (!Number.isFinite(px) || px <= 0) {
      setError("Enter a valid limit price.");
      return;
    }
    if (!Number.isFinite(lotSize) || lotSize <= 0) {
      setError("Enter a positive lot size.");
      return;
    }
    const normalized = roundForSymbol(selected, px);
    setLimitPanelBusy(true);
    try {
      const response = await fetch(`${API_BASE}/orders`, {
        method: "POST",
        headers: terminalJsonAuthHeaders(),
        body: JSON.stringify({
          symbol: selected,
          side,
          type: "LIMIT",
          lotSize,
          price: normalized,
          stopLoss: tradePanelLimitSl.trim() ? Number(tradePanelLimitSl) : undefined,
          takeProfit: tradePanelLimitTp.trim() ? Number(tradePanelLimitTp) : undefined
        })
      });
      if (!response.ok) setError((await response.json()).error ?? "Limit order failed");
    } finally {
      setLimitPanelBusy(false);
    }
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
    const sess = symbolRetailMarketSession(selected);
    if (!sess.tradeable) {
      setError(sess.reason);
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
    const sess = symbolRetailMarketSession(selected);
    if (!sess.tradeable) {
      setError(sess.reason);
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
  const terminalTabs: TerminalTab[] = ["trade", "ticket", "history", "news", "alerts"];

  const terminalMobileDockClass = terminalNarrow
    ? `fxTerminalRoot--mobile fxTerminalRoot--pane-${terminalMobilePane}`
    : "";

  const terminalBodyGridStyle: React.CSSProperties | undefined = terminalNarrow
    ? undefined
    : showToolbox
      ? { gridTemplateRows: `${100 - terminalPct}% 6px ${terminalPct}%` }
      : { gridTemplateRows: "100%" };

  /** On phone layout, the bottom toolbox is only for Trade and Book panes (Watch stays list-only). Desktop follows View → Toolbox. */
  const showTerminalDockPanel = terminalNarrow
    ? terminalMobilePane === "trade" || terminalMobilePane === "book"
    : showToolbox;

  useEffect(() => {
    if (terminalTab !== "ticket") return;
    queueMicrotask(() =>
      document.getElementById("fx-order-ticket-anchor")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
      })
    );
  }, [terminalTab, terminalMobilePane, terminalNarrow]);

  const toolboxIsMobileBook = terminalNarrow && terminalMobilePane === "book";
  const toolboxIsMobileTrade = terminalNarrow && terminalMobilePane === "trade";

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
    <main className={`fxTerminalRoot ${terminalMobileDockClass}`.trim()}>
      <header className={`fxTerminalTopBar${terminalNarrow ? " fxTerminalTopBar--narrow" : ""}`} role="banner">
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
        {!terminalNarrow &&
          topTools.map((t) => (
            <button key={t} type="button" className="fxTermGhostBtn" onClick={() => placeholderFeature(t)}>
              {t}
            </button>
          ))}
        <nav
          className={`fxTermQuickNav${isClientAuthed ? " fxTermQuickNav--client" : ""}${terminalNarrow ? " fxTermQuickNav--narrow" : ""}`}
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

      <section className="bodyArea fxTerminalBody" ref={bodyRef} style={terminalBodyGridStyle}>
      <section className="workspaceRow" style={{ gridTemplateColumns: `${leftPanePct}% 6px ${100 - leftPanePct}%` }}>
        <aside className="leftPane">
          {showMarketWatch && (
            <MarketWatchPanel
              watched={watchedSymbols}
              available={availableSymbols}
              prices={prices}
              active={selected}
              onActivate={(sym) => openChartTab(sym)}
              onAdd={addWatched}
              onRemove={removeWatched}
            />
          )}
          <article className="panel resizablePanel fxOrderTicket" id="fx-order-ticket-anchor">
            <header className="fxPosPanel__head">
              <h3>Order Ticket</h3>
              <span className="fxOrderTicket__sym">{selected}</span>
            </header>
            <div className="fxOrderTicket__quote">
              <div className="fxOrderTicket__quoteCell">
                <span className="fxOrderTicket__quoteLabel">Bid</span>
                <span className="fxOrderTicket__quoteBid">
                  {selectedPrice ? formatForSymbol(selected, selectedPrice.bid) : "—"}
                </span>
              </div>
              <div className="fxOrderTicket__quoteCell">
                <span className="fxOrderTicket__quoteLabel">Ask</span>
                <span className="fxOrderTicket__quoteAsk">
                  {selectedPrice ? formatForSymbol(selected, selectedPrice.ask) : "—"}
                </span>
              </div>
              <div className="fxOrderTicket__quoteCell">
                <span className="fxOrderTicket__quoteLabel">Spread</span>
                <span className="fxOrderTicket__quoteSpread">
                  {selectedPrice
                    ? formatForSymbol(selected, selectedPrice.ask - selectedPrice.bid)
                    : "—"}
                </span>
              </div>
            </div>
            <label className="fxOrderTicket__field">
              <span>Order type</span>
              <select
                className="fxTerminalFieldInput"
                value={orderType}
                onChange={(e) => setOrderType(e.target.value as "MARKET" | "LIMIT" | "STOP")}
              >
                <option value="MARKET">Market</option>
                <option value="LIMIT">Limit</option>
                <option value="STOP">Stop</option>
              </select>
            </label>
            {orderType !== "MARKET" && (
              <label className="fxOrderTicket__field">
                <span>Trigger price</span>
                <input
                  type="number"
                  className="fxTerminalFieldInput"
                  step={stepForSymbol(selected)}
                  value={pendingPrice}
                  onChange={(e) => setPendingPrice(Number(e.target.value))}
                />
              </label>
            )}
            <label className="fxOrderTicket__field">
              <span>Lot size</span>
              <input
                type="number"
                className="fxTerminalFieldInput"
                min={0.01}
                step={0.01}
                value={lotSize}
                onChange={(e) => setLotSize(Number(e.target.value))}
              />
            </label>
            <div className="fxOrderTicket__actions">
              <button
                type="button"
                className="fxPosBtn fxPendingLimitForm__buy"
                onClick={() => placeOrder("BUY")}
                disabled={!retailSessionSelected.tradeable}
                title={retailSessionSelected.tradeable ? undefined : retailSessionSelected.reason}
              >
                Buy
              </button>
              <button
                type="button"
                className="fxPosBtn fxPendingLimitForm__sell"
                onClick={() => placeOrder("SELL")}
                disabled={!retailSessionSelected.tradeable}
                title={retailSessionSelected.tradeable ? undefined : retailSessionSelected.reason}
              >
                Sell
              </button>
            </div>
            {!retailSessionSelected.tradeable && (
              <p className="fxMarketClosedNotice" role="status">
                <span className="fxMarketClosedNotice__pill">Market closed</span>
                <span>{retailSessionSelected.reason}</span>
              </p>
            )}
          </article>

          <article className="panel resizablePanel fxAccountCard">
            <header className="fxPosPanel__head">
              <h3>Account</h3>
              {terminalSummary && (
                <span className="fxAccountCard__login">#{terminalSummary.login}</span>
              )}
            </header>

            <div className="fxAccountCard__idRow">
              <span className="fxAccountCard__idLabel">Trading account</span>
              <span className="fxAccountCard__idValue">{terminalSummary?.login ?? "—"}</span>
              <span className="fxAccountCard__idSub">{terminalSummary?.accountId ?? "—"}</span>
            </div>
            {terminalSummary && (
              <p className="fxAccountCard__pkg">{terminalSummary.packageLabel}</p>
            )}

            <dl className="fxAccountCard__stats">
              <div>
                <dt>Balance</dt>
                <dd>${account.balance.toFixed(2)}</dd>
              </div>
              <div>
                <dt>Equity</dt>
                <dd>${account.equity.toFixed(2)}</dd>
              </div>
              <div>
                <dt>Free margin</dt>
                <dd>${account.freeMargin.toFixed(2)}</dd>
              </div>
            </dl>

            <div className="fxAccountCard__challengeHead">Challenge status</div>
            <dl className="fxAccountCard__challenge">
              <div>
                <dt>Phase</dt>
                <dd>{challengeProgress?.phase ?? "—"}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd
                  className={`fxAccountCard__statusValue ${
                    challengeProgress
                      ? challengeProgress.status === "BREACHED" || challengeProgress.status === "LOCKED"
                        ? "is-bad"
                        : challengeProgress.status === "ACTIVE" || challengeProgress.status === "PASSED"
                          ? "is-ok"
                          : "is-warn"
                      : ""
                  }`}
                >
                  {challengeProgress
                    ? formatChallengeStatusLabel(challengeProgress.phase, challengeProgress.status)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Trading days</dt>
                <dd>{challengeProgress?.tradingDays ?? "—"}</dd>
              </div>
            </dl>

            {error && <p className="alert alert--bad fxAccountCard__err">{error}</p>}
          </article>
        </aside>

        <div className="splitter vertical" onMouseDown={() => setDragMode("left-pane")} />

        <section
          className={`chartPane${chartDragOver ? " is-dropTarget" : ""}`}
          onDragOver={handleChartDragOver}
          onDragLeave={handleChartDragLeave}
          onDrop={handleChartDrop}
        >
          <ChartTabsBar
            tabs={chartTabs}
            active={selected}
            onSelect={(sym) => setSelected(sym)}
            onClose={closeChartTab}
          />
          <article className="panel chartMainPanel resizablePanel">
            {chartDragOver && (
              <div className="chartDropOverlay" aria-hidden="true">
                <span>Drop to open new chart tab</span>
              </div>
            )}
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
                  title={
                    retailSessionSelected.tradeable
                      ? `Market BUY ${lotSize} lot of ${selected}`
                      : retailSessionSelected.reason
                  }
                  disabled={!retailSessionSelected.tradeable}
                >
                  One Click BUY
                </button>
                <button
                  className="sell miniBtn"
                  onClick={() => void placeMarketOrderQuick("SELL")}
                  title={
                    retailSessionSelected.tradeable
                      ? `Market SELL ${lotSize} lot of ${selected}`
                      : retailSessionSelected.reason
                  }
                  disabled={!retailSessionSelected.tradeable}
                >
                  One Click SELL
                </button>
              </div>
            </div>
            <div className="fxChartSubBar">
              {showChartsBar && (
                <div className="fxChartSubBar__tfs" role="tablist" aria-label="Timeframe">
                  {timeframeList.map((tf) => (
                    <button
                      key={tf}
                      className={timeframe === tf ? "tfBtn active" : "tfBtn"}
                      onClick={() => setTimeframe(tf)}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              )}
              <span className="fxChartSubBar__hint">
                <span><em>Time</em>{hoveredTimeLabel || "—"}</span>
                <span className="fxChartSubBar__sep" aria-hidden="true">·</span>
                <span><em>Hover</em>{formatForSymbol(selected, hoveredChartPrice)}</span>
                <span className="fxChartSubBar__sep" aria-hidden="true">·</span>
                <span><em>Clicked</em>{formatForSymbol(selected, clickedChartPrice)}</span>
              </span>
              <div className="fxChartSubBar__providers" role="tablist" aria-label="Chart provider">
                <button
                  className={chartProvider === "internal" ? "miniBtn activeMode" : "miniBtn"}
                  onClick={() => setChartProvider("internal")}
                >
                  Internal
                </button>
                <button
                  className={chartProvider === "tvc" ? "miniBtn activeMode" : "miniBtn"}
                  onClick={() => setChartProvider("tvc")}
                >
                  TVC
                </button>
              </div>
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
                onChartContextMenu={handleChartContextMenu}
              />
            ) : (
              <TradingViewEmbed symbol={toTvcSymbol(selected)} />
            )}
          </article>

        </section>
      </section>

      {showTerminalDockPanel && <div className="splitter horizontal" onMouseDown={() => setDragMode("terminal")} />}

      {showTerminalDockPanel && (
        <section className="terminalArea">
          {toolboxIsMobileBook ? (
            <div className="terminalTabs fxMobileBookTabs" role="tablist" aria-label="Order book">
              <button
                type="button"
                className={mobileBookSubTab === "pending" ? "tabBtn active" : "tabBtn"}
                onClick={() => setMobileBookSubTab("pending")}
              >
                Pending orders
              </button>
              <button
                type="button"
                className={mobileBookSubTab === "bulk" ? "tabBtn active" : "tabBtn"}
                onClick={() => setMobileBookSubTab("bulk")}
              >
                Bulk actions
              </button>
            </div>
          ) : (
            <div className="terminalTabs" role="tablist" aria-label="Trading toolbox">
              {terminalTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={terminalTab === tab ? "tabBtn active" : "tabBtn"}
                  onClick={() => setTerminalTab(tab)}
                >
                  {TERMINAL_TAB_LABELS[tab].toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {toolboxIsMobileBook && mobileBookSubTab === "pending" && (
            <div className="tradeGrid tradeGrid--bookSingle">
              <article className="panel panelScroll resizablePanel fxPosPanel">
                <header className="fxPosPanel__head">
                  <h3>Pending Orders</h3>
                  <span className="fxPosPanel__count">{pendingOrders.length}</span>
                </header>

                <div className="fxPendingLimitForm" aria-label="Place limit order">
                  <div className="fxPendingLimitForm__title">Place limit order</div>
                  <p className="fxPendingLimitForm__sym">
                    <strong>{selected}</strong>
                    {selectedPrice ? (
                      <>
                        {" "}
                        · Bid <span className="fxPendingLimitForm__bid">{formatForSymbol(selected, selectedPrice.bid)}</span> · Ask{" "}
                        <span className="fxPendingLimitForm__ask">{formatForSymbol(selected, selectedPrice.ask)}</span>
                      </>
                    ) : (
                      <span className="fxPendingLimitForm__muted"> · waiting for quote…</span>
                    )}
                  </p>
                  <div className="fxPendingLimitForm__row">
                    <label className="fxPendingLimitForm__field">
                      <span>Limit price</span>
                      <input
                        type="number"
                        className="fxTerminalFieldInput"
                        step={stepForSymbol(selected)}
                        value={tradePanelLimitPrice}
                        onChange={(e) => setTradePanelLimitPrice(e.target.value)}
                        placeholder="Price"
                      />
                    </label>
                    <label className="fxPendingLimitForm__field">
                      <span>Lot</span>
                      <input
                        type="number"
                        className="fxTerminalFieldInput"
                        min={0.01}
                        step={0.01}
                        value={lotSize}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setLotSize(Number.isFinite(v) && v > 0 ? v : 0.01);
                        }}
                      />
                    </label>
                  </div>
                  <div className="fxPendingLimitForm__row">
                    <label className="fxPendingLimitForm__field">
                      <span className="fxPendingLimitForm__slLabel">Stop loss</span>
                      <input
                        type="number"
                        className="fxTerminalFieldInput"
                        step={stepForSymbol(selected)}
                        value={tradePanelLimitSl}
                        onChange={(e) => setTradePanelLimitSl(e.target.value)}
                        placeholder="Optional"
                      />
                    </label>
                    <label className="fxPendingLimitForm__field">
                      <span className="fxPendingLimitForm__tpLabel">Take profit</span>
                      <input
                        type="number"
                        className="fxTerminalFieldInput"
                        step={stepForSymbol(selected)}
                        value={tradePanelLimitTp}
                        onChange={(e) => setTradePanelLimitTp(e.target.value)}
                        placeholder="Optional"
                      />
                    </label>
                  </div>
                  <div className="fxPendingLimitForm__actions">
                    <button
                      type="button"
                      className="fxPosBtn fxPendingLimitForm__buy"
                      disabled={limitPanelBusy || !retailSessionSelected.tradeable}
                      title={retailSessionSelected.tradeable ? undefined : retailSessionSelected.reason}
                      onClick={() => void placeTradePanelLimit("BUY")}
                    >
                      Buy limit
                    </button>
                    <button
                      type="button"
                      className="fxPosBtn fxPendingLimitForm__sell"
                      disabled={limitPanelBusy || !retailSessionSelected.tradeable}
                      title={retailSessionSelected.tradeable ? undefined : retailSessionSelected.reason}
                      onClick={() => void placeTradePanelLimit("SELL")}
                    >
                      Sell limit
                    </button>
                  </div>
                </div>

                {pendingOrders.length === 0 && (
                  <p className="fxPosEmpty">No pending orders.</p>
                )}
                <div className="fxPosList">
                  {pendingOrders.map((o) => (
                    <PendingOrderCard key={o.id} order={o} onCancel={(id) => void cancelPending(id)} />
                  ))}
                </div>
              </article>
            </div>
          )}

          {toolboxIsMobileBook && mobileBookSubTab === "bulk" && (
            <div className="tradeGrid tradeGrid--bookSingle">
              <article className="panel panelScroll resizablePanel fxPosPanel fxBulkPanel">
                <header className="fxPosPanel__head">
                  <h3>Bulk Actions</h3>
                </header>
                <div className="fxBulkPanel__inputs">
                  <label className="fxBulkPanel__field">
                    <span>Bulk SL</span>
                    <input
                      type="number"
                      className="fxTerminalFieldInput"
                      placeholder="Bulk SL"
                      value={bulkStopLoss}
                      onChange={(e) => setBulkStopLoss(e.target.value)}
                    />
                  </label>
                  <label className="fxBulkPanel__field">
                    <span>Bulk TP</span>
                    <input
                      type="number"
                      className="fxTerminalFieldInput"
                      placeholder="Bulk TP"
                      value={bulkTakeProfit}
                      onChange={(e) => setBulkTakeProfit(e.target.value)}
                    />
                  </label>
                </div>
                <div className="fxBulkPanel__actions">
                  <button type="button" className="fxPosBtn" onClick={() => void bulkModify("all")}>
                    Modify All
                  </button>
                  <button type="button" className="fxPosBtn" onClick={() => void bulkModify("selected-symbol")}>
                    Modify {selected}
                  </button>
                  <button type="button" className="fxPosBtn" onClick={() => void bulkClose("all")}>
                    Close All
                  </button>
                  <button type="button" className="fxPosBtn" onClick={() => void bulkClose("losing")}>
                    Close Losing
                  </button>
                  <button type="button" className="fxPosBtn" onClick={() => void bulkClose("profitable")}>
                    Close Winners
                  </button>
                </div>
              </article>
            </div>
          )}

          {!toolboxIsMobileBook && terminalTab === "trade" && (
            <div className={toolboxIsMobileTrade ? "tradeGrid tradeGrid--narrowTrade" : "tradeGrid"}>
              <article className="panel panelScroll resizablePanel fxPosPanel">
                <header className="fxPosPanel__head">
                  <h3>Open Positions</h3>
                  <span className="fxPosPanel__count">{positions.length}</span>
                </header>
                {positions.length === 0 && (
                  <p className="fxPosEmpty">No open positions.</p>
                )}
                <div className="fxPosList">
                  {positions.map((p) => (
                    <PositionCard
                      key={p.id}
                      position={p}
                      livePrice={prices[p.symbol]}
                      onClose={(id, lot) => void closePosition(id, lot)}
                      onUpdate={(id, sl, tp) => updatePosition(id, sl, tp)}
                    />
                  ))}
                </div>
              </article>
              {!toolboxIsMobileTrade && (
                <>
                  <article className="panel panelScroll resizablePanel fxPosPanel">
                    <header className="fxPosPanel__head">
                      <h3>Pending Orders</h3>
                      <span className="fxPosPanel__count">{pendingOrders.length}</span>
                    </header>

                    <div className="fxPendingLimitForm" aria-label="Place limit order">
                      <div className="fxPendingLimitForm__title">Place limit order</div>
                      <p className="fxPendingLimitForm__sym">
                        <strong>{selected}</strong>
                        {selectedPrice ? (
                          <>
                            {" "}
                            · Bid <span className="fxPendingLimitForm__bid">{formatForSymbol(selected, selectedPrice.bid)}</span> · Ask{" "}
                            <span className="fxPendingLimitForm__ask">{formatForSymbol(selected, selectedPrice.ask)}</span>
                          </>
                        ) : (
                          <span className="fxPendingLimitForm__muted"> · waiting for quote…</span>
                        )}
                      </p>
                      <div className="fxPendingLimitForm__row">
                        <label className="fxPendingLimitForm__field">
                          <span>Limit price</span>
                          <input
                            type="number"
                            className="fxTerminalFieldInput"
                            step={stepForSymbol(selected)}
                            value={tradePanelLimitPrice}
                            onChange={(e) => setTradePanelLimitPrice(e.target.value)}
                            placeholder="Price"
                          />
                        </label>
                        <label className="fxPendingLimitForm__field">
                          <span>Lot</span>
                          <input
                            type="number"
                            className="fxTerminalFieldInput"
                            min={0.01}
                            step={0.01}
                            value={lotSize}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setLotSize(Number.isFinite(v) && v > 0 ? v : 0.01);
                            }}
                          />
                        </label>
                      </div>
                      <div className="fxPendingLimitForm__row">
                        <label className="fxPendingLimitForm__field">
                          <span className="fxPendingLimitForm__slLabel">Stop loss</span>
                          <input
                            type="number"
                            className="fxTerminalFieldInput"
                            step={stepForSymbol(selected)}
                            value={tradePanelLimitSl}
                            onChange={(e) => setTradePanelLimitSl(e.target.value)}
                            placeholder="Optional"
                          />
                        </label>
                        <label className="fxPendingLimitForm__field">
                          <span className="fxPendingLimitForm__tpLabel">Take profit</span>
                          <input
                            type="number"
                            className="fxTerminalFieldInput"
                            step={stepForSymbol(selected)}
                            value={tradePanelLimitTp}
                            onChange={(e) => setTradePanelLimitTp(e.target.value)}
                            placeholder="Optional"
                          />
                        </label>
                      </div>
                      <div className="fxPendingLimitForm__actions">
                        <button
                          type="button"
                          className="fxPosBtn fxPendingLimitForm__buy"
                          disabled={limitPanelBusy || !retailSessionSelected.tradeable}
                          title={retailSessionSelected.tradeable ? undefined : retailSessionSelected.reason}
                          onClick={() => void placeTradePanelLimit("BUY")}
                        >
                          Buy limit
                        </button>
                        <button
                          type="button"
                          className="fxPosBtn fxPendingLimitForm__sell"
                          disabled={limitPanelBusy || !retailSessionSelected.tradeable}
                          title={retailSessionSelected.tradeable ? undefined : retailSessionSelected.reason}
                          onClick={() => void placeTradePanelLimit("SELL")}
                        >
                          Sell limit
                        </button>
                      </div>
                    </div>

                    {pendingOrders.length === 0 && (
                      <p className="fxPosEmpty">No pending orders.</p>
                    )}
                    <div className="fxPosList">
                      {pendingOrders.map((o) => (
                        <PendingOrderCard key={o.id} order={o} onCancel={(id) => void cancelPending(id)} />
                      ))}
                    </div>
                  </article>
                  <article className="panel panelScroll resizablePanel fxPosPanel fxBulkPanel">
                    <header className="fxPosPanel__head">
                      <h3>Bulk Actions</h3>
                    </header>
                    <div className="fxBulkPanel__inputs">
                      <label className="fxBulkPanel__field">
                        <span>Bulk SL</span>
                        <input
                          type="number"
                          className="fxTerminalFieldInput"
                          placeholder="Bulk SL"
                          value={bulkStopLoss}
                          onChange={(e) => setBulkStopLoss(e.target.value)}
                        />
                      </label>
                      <label className="fxBulkPanel__field">
                        <span>Bulk TP</span>
                        <input
                          type="number"
                          className="fxTerminalFieldInput"
                          placeholder="Bulk TP"
                          value={bulkTakeProfit}
                          onChange={(e) => setBulkTakeProfit(e.target.value)}
                        />
                      </label>
                    </div>
                    <div className="fxBulkPanel__actions">
                      <button type="button" className="fxPosBtn" onClick={() => void bulkModify("all")}>
                        Modify All
                      </button>
                      <button type="button" className="fxPosBtn" onClick={() => void bulkModify("selected-symbol")}>
                        Modify {selected}
                      </button>
                      <button type="button" className="fxPosBtn" onClick={() => void bulkClose("all")}>
                        Close All
                      </button>
                      <button type="button" className="fxPosBtn" onClick={() => void bulkClose("losing")}>
                        Close Losing
                      </button>
                      <button type="button" className="fxPosBtn" onClick={() => void bulkClose("profitable")}>
                        Close Winners
                      </button>
                    </div>
                  </article>
                </>
              )}
            </div>
          )}

          {!toolboxIsMobileBook && terminalTab === "ticket" && (
            <article className="panel panelScroll resizablePanel fxMobileTicketGuide">
              <header className="fxPosPanel__head">
                <h3>Order ticket</h3>
              </header>
              <p className="fxMobileTicketGuide__text">
                The order ticket is in the panel above. Use it to choose market, limit, or stop orders and submit buy or sell trades.
              </p>
            </article>
          )}

        {!toolboxIsMobileBook && terminalTab === "history" && (
          <article className="panel panelScroll resizablePanel fxPosPanel fxHistoryPanel">
            <header className="fxPosPanel__head">
              <h3>Trade History</h3>
              <span className="fxPosPanel__count">{closedTrades.length}</span>
            </header>

            <div
              className={`fxHistoryTotals ${
                tradeStats.totalPnl > 0
                  ? "is-up"
                  : tradeStats.totalPnl < 0
                    ? "is-down"
                    : "is-flat"
              }`}
            >
              <div className="fxHistoryTotals__main">
                <span className="fxHistoryTotals__label">Total realized P/L</span>
                <span className="fxHistoryTotals__value">
                  {formatUsdSigned(tradeStats.totalPnl)}
                </span>
              </div>
              <div className="fxHistoryTotals__grid">
                <div className="fxHistoryStat fxHistoryStat--win">
                  <span className="fxHistoryStat__label">Wins</span>
                  <span className="fxHistoryStat__count">{winTrades.length}</span>
                  <span className="fxHistoryStat__pnl">{formatUsdSigned(tradeStats.winPnl)}</span>
                </div>
                <div className="fxHistoryStat fxHistoryStat--loss">
                  <span className="fxHistoryStat__label">Losses</span>
                  <span className="fxHistoryStat__count">{lossTrades.length}</span>
                  <span className="fxHistoryStat__pnl">{formatUsdSigned(tradeStats.lossPnl)}</span>
                </div>
                <div className="fxHistoryStat">
                  <span className="fxHistoryStat__label">Win rate</span>
                  <span className="fxHistoryStat__count">
                    {tradeStats.winRate.toFixed(1)}%
                  </span>
                  <span className="fxHistoryStat__pnl fxHistoryStat__pnl--muted">
                    {closedTrades.length} trades
                  </span>
                </div>
                <div className="fxHistoryStat">
                  <span className="fxHistoryStat__label">Best / Worst</span>
                  <span className="fxHistoryStat__count fxHistoryStat__bestWorst">
                    <span className="is-up">{formatUsdSigned(tradeStats.bestTrade)}</span>
                    <span className="fxHistoryStat__sep">/</span>
                    <span className="is-down">{formatUsdSigned(tradeStats.worstTrade)}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="fxHistoryTabs" role="tablist" aria-label="History filter">
              <button
                type="button"
                className={`fxHistoryTab ${historyTab === "all" ? "is-active" : ""}`}
                onClick={() => setHistoryTab("all")}
              >
                All <span className="fxHistoryTab__count">{closedTrades.length}</span>
              </button>
              <button
                type="button"
                className={`fxHistoryTab fxHistoryTab--win ${historyTab === "wins" ? "is-active" : ""}`}
                onClick={() => setHistoryTab("wins")}
              >
                Wins <span className="fxHistoryTab__count">{winTrades.length}</span>
              </button>
              <button
                type="button"
                className={`fxHistoryTab fxHistoryTab--loss ${historyTab === "losses" ? "is-active" : ""}`}
                onClick={() => setHistoryTab("losses")}
              >
                Losses <span className="fxHistoryTab__count">{lossTrades.length}</span>
              </button>
            </div>

            {visibleHistory.length === 0 ? (
              <p className="fxPosEmpty">
                {closedTrades.length === 0
                  ? "No closed trades yet — fills will appear here once you close a position."
                  : historyTab === "wins"
                    ? "No winning trades in this window."
                    : "No losing trades — keep it up."}
              </p>
            ) : (
              <ul className="fxHistoryList">
                {visibleHistory.map((o) => {
                  const px = typeof o.closePrice === "number" ? o.closePrice : o.filledPrice;
                  const ts = o.closedAt ?? o.createdAt;
                  const pnl = o.realizedPnl ?? 0;
                  const isWin = pnl > 0;
                  const displaySide = o.closingFor ?? o.side;
                  return (
                    <li
                      key={o.id}
                      className={`fxHistoryRow fxHistoryRow--${displaySide === "BUY" ? "buy" : "sell"} ${
                        isWin ? "is-win" : "is-loss"
                      }`}
                    >
                      <div className="fxHistoryRow__main">
                        <span
                          className={`fxHistoryRow__side ${
                            displaySide === "BUY" ? "is-buy" : "is-sell"
                          }`}
                        >
                          {displaySide}
                        </span>
                        <span className="fxHistoryRow__sym">{o.symbol}</span>
                        <span className="fxHistoryRow__lot">{o.lotSize.toFixed(2)} lot</span>
                        {o.closeReason && (
                          <span
                            className={`fxHistoryRow__reason fxHistoryRow__reason--${o.closeReason
                              .toLowerCase()
                              .replace("_", "-")}`}
                          >
                            {o.closeReason === "STOP_LOSS"
                              ? "SL"
                              : o.closeReason === "TAKE_PROFIT"
                                ? "TP"
                                : "Manual"}
                          </span>
                        )}
                        <span className={`fxHistoryRow__pnl ${isWin ? "is-win" : "is-loss"}`}>
                          {formatUsdSigned(pnl)}
                        </span>
                      </div>
                      <div className="fxHistoryRow__meta">
                        <span className="fxHistoryRow__price">
                          <em>Close</em>
                          {typeof px === "number" ? formatForSymbol(o.symbol, px) : "—"}
                        </span>
                        <span className="fxHistoryRow__time">
                          {new Date(ts).toLocaleString(undefined, {
                            month: "short",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit"
                          })}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
          )}
          {!toolboxIsMobileBook && terminalTab === "news" && (
            <NewsPanel
              events={news}
              loading={newsLoading}
              error={newsError}
              fetchedAt={newsFetchedAt}
              impact={newsImpact}
              onChangeImpact={setNewsImpact}
              onRefresh={() => void fetchNews(newsImpact, true)}
              now={newsClock}
            />
          )}
          {!toolboxIsMobileBook && terminalTab === "alerts" && (
            <article className="panel panelScroll resizablePanel">
              <h3>Alerts</h3>
              <p>Alerts center placeholder.</p>
            </article>
          )}
        </section>
      )}

      </section>

      {chartCtxMenu && (
        <div
          className="fxChartCtxMenu"
          role="menu"
          style={{ left: chartCtxMenu.x, top: chartCtxMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="fxChartCtxMenu__head">
            <span className="fxChartCtxMenu__sym">{selected}</span>
            <span className="fxChartCtxMenu__price">{formatForSymbol(selected, chartCtxMenu.price)}</span>
          </div>
          <p className="fxChartCtxMenu__ref" title="Below mid → Buy limit; above mid → Sell limit.">
            vs mid <strong>{formatForSymbol(selected, chartCtxMenu.refMid)}</strong>
            {chartCtxMenu.sides.length > 1 ? " · pick side" : ""}
          </p>
          {chartCtxMenu.sides.map((side) => (
            <button
              key={side}
              type="button"
              className={`fxChartCtxMenu__action ${
                side === "BUY" ? "fxChartCtxMenu__action--buy" : "fxChartCtxMenu__action--sell"
              }`}
              onClick={() => void placeLimitFromChart(side)}
              disabled={!retailSessionSelected.tradeable}
              title={retailSessionSelected.tradeable ? undefined : retailSessionSelected.reason}
            >
              {side === "BUY" ? "Buy limit" : "Sell limit"}
              <span className="fxChartCtxMenu__lot">{lotSize.toFixed(2)} lot</span>
            </button>
          ))}
          {!retailSessionSelected.tradeable && (
            <div className="fxChartCtxMenu__notice">{retailSessionSelected.reason}</div>
          )}
          <button
            type="button"
            className="fxChartCtxMenu__cancel"
            onClick={() => setChartCtxMenu(null)}
          >
            Cancel
          </button>
        </div>
      )}

      {terminalNarrow && (
        <nav className="fxMobileDock" aria-label="Trading terminal sections">
          {(
            [
              { id: "chart" as const, label: "Chart", Icon: BarChart3 },
              { id: "watch" as const, label: "Watch", Icon: List },
              { id: "trade" as const, label: "Trade", Icon: BadgeDollarSign },
              { id: "book" as const, label: "Book", Icon: Layers },
              { id: "account" as const, label: "Account", Icon: Wallet }
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={`fxMobileDockBtn${terminalMobilePane === id ? " fxMobileDockBtn--active" : ""}`}
              onClick={() => {
                setOpenMenu(null);
                setChartCtxMenu(null);
                setTerminalMobilePane(id);
              }}
            >
              <Icon size={20} aria-hidden strokeWidth={2} />
              <span className="fxMobileDockBtn__lbl">{label}</span>
            </button>
          ))}
        </nav>
      )}
    </main>
  );
}

export default App;
