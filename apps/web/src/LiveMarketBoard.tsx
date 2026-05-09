import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, RefreshCw, Search, X as XIcon } from "lucide-react";
import { fetchLiveQuotesBoard, formatLivePrice, type LiveQuotesBoardPayload } from "./liveMarket";

interface LiveMarketBoardProps {
  variant?: "marketing" | "portal";
  title?: string;
  eyebrow?: string;
  subtitle?: string;
  refreshOverrideMs?: number;
  /** CSS max-height for the inner scroll area. Defaults vary by variant. */
  scrollMaxHeight?: string;
}

const DEFAULT_POLL_MS = 3000;

export default function LiveMarketBoard({
  variant = "marketing",
  title = "Live markets",
  eyebrow = "Live market data",
  subtitle =
    "Realtime currency, crypto, spot metals, and crude — the same family of symbols available in the trading terminal.",
  refreshOverrideMs,
  scrollMaxHeight
}: LiveMarketBoardProps) {
  const [board, setBoard] = useState<LiveQuotesBoardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const timerRef = useRef<number | null>(null);

  const refreshMs = useMemo(() => {
    if (refreshOverrideMs && refreshOverrideMs >= 1500) return refreshOverrideMs;
    return DEFAULT_POLL_MS;
  }, [refreshOverrideMs]);

  async function load(initial = false) {
    if (!initial) setRefreshing(true);
    try {
      const next = await fetchLiveQuotesBoard();
      setBoard(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quotes.");
    } finally {
      if (initial) setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load(true);
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    timerRef.current = window.setInterval(() => {
      void load(false);
    }, refreshMs);
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshMs]);

  const filteredQuotes = useMemo(() => {
    if (!board) return [];
    const q = query.trim().toUpperCase();
    if (!q) return board.quotes;
    return board.quotes.filter((row) => row.symbol.toUpperCase().includes(q));
  }, [board, query]);

  const totalQuotes = board?.quotes.length ?? 0;
  const defaultScrollHeight = variant === "portal" ? "min(60vh, 520px)" : "min(70vh, 640px)";
  const scrollStyle = { maxHeight: scrollMaxHeight ?? defaultScrollHeight };

  const newestTs =
    board?.quotes?.reduce((m, q) => Math.max(m, q.updatedAt), 0) ?? 0;

  if (variant === "marketing") {
    if (loading) return null;
    if (board && !board.configured) return null;
  }

  const className =
    variant === "portal" ? "fxCryptoBoard fxCryptoBoardPortal" : "fxCryptoBoard fxCryptoBoardMarketing";

  return (
    <section className={className}>
      <header className="fxCryptoHeader">
        <div>
          <p className="fxEyebrow">{eyebrow}</p>
          <h2 className="fxCryptoTitle">{title}</h2>
          <p className="fxCryptoLead">{subtitle}</p>
        </div>
        <div className="fxCryptoMeta">
          <QuotesStatusBadge board={board} loading={loading} />
          <button
            type="button"
            className="fxCryptoRefreshBtn"
            disabled={loading || refreshing}
            onClick={() => void load(false)}
          >
            <RefreshCw size={14} aria-hidden="true" className={refreshing ? "spin" : undefined} />
            <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
          </button>
        </div>
      </header>

      {error ? <p className="fxCryptoError">{error}</p> : null}

      {!board?.configured ? (
        <div className="fxCryptoUnconfigured">
          <p>
            <strong>Connecting to live market feeds…</strong> If this persists, check that the API service is running.
          </p>
        </div>
      ) : null}

      {loading ? (
        <p className="fxCryptoLead">Loading quotes…</p>
      ) : board && board.quotes.length > 0 ? (
        <>
          <div className="fxCryptoToolbar">
            <div className="fxCryptoSearch">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${totalQuotes} pairs…`}
                aria-label="Filter pairs"
                spellCheck={false}
                autoComplete="off"
              />
              {query ? (
                <button
                  type="button"
                  className="fxCryptoSearchClear"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                >
                  <XIcon size={12} aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <span className="fxCryptoToolbarMeta">
              Showing <strong>{filteredQuotes.length}</strong> of <strong>{totalQuotes}</strong>
            </span>
          </div>

          <div className="fxCryptoScroll" style={scrollStyle}>
            {filteredQuotes.length > 0 ? (
              <div className="fxCryptoGrid">
                {filteredQuotes.map((q) => (
                  <article key={q.symbol} className="fxCryptoCard">
                    <div className="fxCryptoCardHead">
                      <div className="fxCryptoSymbol">
                        <span className="fxCryptoTicker">{q.symbol}</span>
                        <span className="fxCryptoName">Bid / Ask</span>
                      </div>
                    </div>
                    <div className="fxCryptoPrice">{formatLivePrice(q.symbol, q.mid)}</div>
                    <dl className="fxCryptoStats fxCryptoStatsBidAsk">
                      <div className="fxCryptoStatPair">
                        <dt>Bid</dt>
                        <dd>{formatLivePrice(q.symbol, q.bid)}</dd>
                      </div>
                      <div className="fxCryptoStatPair">
                        <dt>Ask</dt>
                        <dd>{formatLivePrice(q.symbol, q.ask)}</dd>
                      </div>
                      <div className="fxCryptoStatPair">
                        <dt>Spread</dt>
                        <dd>{formatLivePrice(q.symbol, q.ask - q.bid)}</dd>
                      </div>
                      <div className="fxCryptoStatPair">
                        <dt>Updated</dt>
                        <dd title={q.stale ? "Stale quote" : undefined}>
                          {q.stale ? "stale" : formatRelativeTime(q.updatedAt)}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            ) : (
              <p className="fxCryptoEmpty">No pairs match “{query}”.</p>
            )}
          </div>
        </>
      ) : board?.configured ? (
        <p className="fxCryptoLead">Connecting to live market feeds…</p>
      ) : null}

      {board?.configured && board.quotes.length > 0 ? (
        <p className="fxCryptoFooter">
          <Activity size={12} aria-hidden="true" />
          Newest row <strong>{newestTs ? formatRelativeTime(newestTs) : "—"}</strong> · Board polls every{" "}
          {Math.round(refreshMs / 1000)}s
        </p>
      ) : null}
    </section>
  );
}

function formatRelativeTime(ts: number): string {
  if (!ts) return "—";
  const delta = Date.now() - ts;
  if (delta < 5_000) return "just now";
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`;
  return new Date(ts).toLocaleString();
}

function QuotesStatusBadge({
  board,
  loading
}: {
  board: LiveQuotesBoardPayload | null;
  loading: boolean;
}) {
  if (loading) return <span className="fxCryptoBadge fxCryptoBadgeMuted">Loading</span>;
  if (!board) return <span className="fxCryptoBadge fxCryptoBadgeMuted">Offline</span>;
  if (!board.configured) {
    return <span className="fxCryptoBadge fxCryptoBadgeWarn">Connecting</span>;
  }
  if (board.mt5Connected === false) {
    return (
      <span className="fxCryptoBadge fxCryptoBadgeStale" title={board.mt5StatusReason ?? ""}>
        Broker terminal offline
      </span>
    );
  }
  if (board.source === "live") {
    return (
      <span className="fxCryptoBadge fxCryptoBadgeLive">
        <span className="fxCryptoDot" /> Live
      </span>
    );
  }
  if (board.source === "partial") {
    return (
      <span className="fxCryptoBadge fxCryptoBadgeLive">
        <span className="fxCryptoDot" /> Live
      </span>
    );
  }
  return <span className="fxCryptoBadge fxCryptoBadgeStale">Reconnecting</span>;
}
