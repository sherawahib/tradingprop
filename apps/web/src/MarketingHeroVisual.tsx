import { useEffect, useRef, useState } from "react";

/**
 * Rich marketing hero: fake trader dashboard (no image) — balances, phase,
 * a *live-feeling* candlestick strip that updates every tick, and a fake
 * open-positions table.
 */
const KPI_BASE = [
  { label: "Balance", value: 10247.32 },
  { label: "Equity", value: 10318.9 },
  { label: "Today's P&L", value: 71.58, pos: true },
  { label: "Phase", value: "Two-step · P1", isText: true }
] as const;

const POSITIONS = [
  { sym: "EURUSD", side: "Buy", lots: "0.40", entry: "1.08214", up: true },
  { sym: "XAUUSD", side: "Sell", lots: "0.10", entry: "4,684.20", up: true }
];

interface Candle {
  /** open / high / low / close, as percent of chart height (0..100). */
  o: number;
  h: number;
  l: number;
  c: number;
  /** Stable id for React reconciliation (so candles "scroll" left visually). */
  id: number;
}

/** Number of candles displayed end-to-end in the strip. */
const CANDLE_COUNT = 28;
/** Tick rate (ms) — also matches the CSS transition time on each candle. */
const TICK_MS = 750;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Seed a deterministic-looking candle series so the first paint isn't flat. */
function seedSeries(): Candle[] {
  const out: Candle[] = [];
  let prevClose = 50;
  for (let i = 0; i < CANDLE_COUNT; i++) {
    const open = prevClose;
    const drift = (Math.sin(i * 0.6) + Math.cos(i * 0.9)) * 6 + (Math.random() - 0.5) * 5;
    const close = clamp(open + drift, 18, 86);
    const wickUp = Math.random() * 5 + 2;
    const wickDn = Math.random() * 5 + 2;
    const high = clamp(Math.max(open, close) + wickUp, 0, 100);
    const low = clamp(Math.min(open, close) - wickDn, 0, 100);
    out.push({ o: open, h: high, l: low, c: close, id: i });
    prevClose = close;
  }
  return out;
}

/** Generate the next candle off the previous close — random walk with mean reversion. */
function nextCandle(prev: Candle, id: number): Candle {
  const open = prev.c;
  // Mean-reversion bias towards the middle of the chart so the line doesn't drift off.
  const meanPull = (50 - open) * 0.06;
  const drift = meanPull + (Math.random() - 0.5) * 9;
  const close = clamp(open + drift, 12, 90);
  const wickUp = Math.random() * 6 + 1.5;
  const wickDn = Math.random() * 6 + 1.5;
  const high = clamp(Math.max(open, close) + wickUp, 0, 100);
  const low = clamp(Math.min(open, close) - wickDn, 0, 100);
  return { o: open, h: high, l: low, c: close, id };
}

export default function MarketingHeroVisual(): JSX.Element {
  const [candles, setCandles] = useState<Candle[]>(() => seedSeries());
  const [equity, setEquity] = useState<number>(KPI_BASE[1].value as number);
  const [pnl, setPnl] = useState<number>(KPI_BASE[2].value as number);
  const idRef = useRef(CANDLE_COUNT);

  useEffect(() => {
    const id = window.setInterval(() => {
      setCandles((prev) => {
        const last = prev[prev.length - 1];
        const next = nextCandle(last, idRef.current++);
        // Drop the oldest candle and append the new one — gives the visual
        // sense of price scrolling to the left.
        return [...prev.slice(1), next];
      });
      // Wobble equity / today's P&L so the KPI cards feel alive too.
      setEquity((e) => {
        const delta = (Math.random() - 0.5) * 14;
        return Math.max(9800, Math.min(10800, e + delta));
      });
      setPnl((p) => {
        const delta = (Math.random() - 0.45) * 6;
        return Math.max(-120, Math.min(220, p + delta));
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const lastCandle = candles[candles.length - 1];
  const trendUp = lastCandle.c >= lastCandle.o;

  const kpis = [
    { label: "Balance", value: "$10,247.32" },
    { label: "Equity", value: `$${equity.toFixed(2)}`, pos: equity >= 10247.32 },
    { label: "Today's P&L", value: `${pnl >= 0 ? "+" : "-"}$${Math.abs(pnl).toFixed(2)}`, pos: pnl >= 0 },
    { label: "Phase", value: "Two-step · P1" }
  ];

  return (
    <div className="fxHeroAside" aria-label="Sample trader dashboard preview (illustration)">
      <div className="fxHeroGlow" aria-hidden="true" />
      <div className="fxDummyDash">
        <div className="fxDummyDash-chrome" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="fxDummyDash-body">
          <aside className="fxDummyDash-nav">
            <div className="fxDummyDash-brand">PropPrime</div>
            <nav className="fxDummyDash-navList">
              <span className="fxDummyDash-navItem fxDummyDash-navItem--active">Overview</span>
              <span className="fxDummyDash-navItem">Challenge</span>
              <span className="fxDummyDash-navItem">Payouts</span>
              <span className="fxDummyDash-navItem">Terminal</span>
            </nav>
            <div className="fxDummyDash-navFoot">
              <span className="fxDummyDash-pill">KYC · Approved</span>
            </div>
          </aside>
          <div className="fxDummyDash-main">
            <header className="fxDummyDash-topbar">
              <span className="fxDummyDash-title">Account overview</span>
              <span className="fxDummyDash-live">
                <span className="fxDummyDash-livePulse" aria-hidden="true" />
                Live · demo feed
              </span>
            </header>
            <div className="fxDummyDash-kpis">
              {kpis.map((k) => (
                <div key={k.label} className="fxDummyDash-kpi">
                  <span className="fxDummyDash-kpiLabel">{k.label}</span>
                  <strong className={k.pos ? "fxDummyDash-kpiUp" : ""}>{k.value}</strong>
                </div>
              ))}
            </div>
            <div className="fxDummyDash-chartPanel">
              <div className="fxDummyDash-chartHead">
                <span>EURUSD · M15</span>
                <span className={`fxDummyDash-chartTrend ${trendUp ? "fxDummyDash-chartTrend--up" : "fxDummyDash-chartTrend--down"}`}>
                  {trendUp ? "▲" : "▼"} {(48 + lastCandle.c * 0.025).toFixed(5)}
                </span>
              </div>
              <div className="fxDummyDash-chart" aria-hidden="true">
                {candles.map((cd) => {
                  const up = cd.c >= cd.o;
                  const bodyTop = Math.max(cd.o, cd.c);
                  const bodyBottom = Math.min(cd.o, cd.c);
                  const bodyHeight = Math.max(bodyTop - bodyBottom, 1.4);
                  const wickHeight = Math.max(cd.h - cd.l, 0.5);
                  return (
                    <div
                      key={cd.id}
                      className={`fxDummyDash-candle ${up ? "fxDummyDash-candle--up" : "fxDummyDash-candle--down"}`}
                    >
                      <span
                        className="fxDummyDash-candleWick"
                        style={{ bottom: `${cd.l}%`, height: `${wickHeight}%` }}
                      />
                      <span
                        className="fxDummyDash-candleBody"
                        style={{ bottom: `${bodyBottom}%`, height: `${bodyHeight}%` }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="fxDummyDash-pos">
              <p className="fxDummyDash-posTitle">Open positions</p>
              <table className="fxDummyDash-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>Lots</th>
                    <th>Entry</th>
                    <th>P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {POSITIONS.map((p, i) => {
                    const livePnl = (i === 0 ? pnl * 0.6 : pnl * 0.4) + 12.4 * (i + 1);
                    return (
                      <tr key={p.sym}>
                        <td>{p.sym}</td>
                        <td>{p.side}</td>
                        <td>{p.lots}</td>
                        <td>{p.entry}</td>
                        <td className={livePnl >= 0 ? "fxDummyDash-numUp" : "fxDummyDash-numDown"}>
                          {livePnl >= 0 ? "+" : "-"}${Math.abs(livePnl).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
