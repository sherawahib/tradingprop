import { useEffect, useRef, useState } from "react";
import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  LineSeries,
  createChart
} from "lightweight-charts";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import type { OrderSide } from "@paper-trader/shared";
import { symbolPipSize } from "@paper-trader/shared";
import { X as XIcon, ZoomIn, ZoomOut } from "lucide-react";

export type Candle = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type ChartType = "candles" | "bar" | "line";

/** Horizontal overlays (entry / SL / TP / pending triggers) — same semantics as web terminal. */
export type ChartPriceLine = {
  id: string;
  price: number;
  color: string;
  title: string;
  /** Set on Entry rows so drag-away toward profit vs loss side maps to TP vs SL. */
  positionSide?: OrderSide;
};

export type BracketDragPayload = {
  positionId: string;
  field: "sl" | "tp";
  price: number;
  done: boolean;
};

interface ChartPanelProps {
  symbol: string;
  data: Candle[];
  chartType: ChartType;
  /** Entry, SL/TP, and working order prices overlaid on the series. */
  lines?: ChartPriceLine[];
  /**
   * Drag SL/TP price lines, or grab the Entry line and drag toward the profit
   * side for TP / loss side for SL (release commits).
   */
  onBracketDrag?: (payload: BracketDragPayload) => void;
  /** Clear live bracket preview (e.g. entry grab released without committing). */
  onBracketDragCancel?: () => void;
  /** Fired when the user right-clicks the chart canvas. Provides the price
   *  under the cursor and the viewport coordinates so the host can render a
   *  context menu (e.g. for placing limit pending orders). */
  onChartContextMenu?: (price: number, clientX: number, clientY: number) => void;
  /** Hover over SL/TP lines: estimated USD P/L if exited at the line price. */
  estimateBracketExitPnl?: (args: {
    positionId: string;
    field: "sl" | "tp";
    linePrice: number;
  }) => number | null;
  /** Remove SL or TP for a position (e.g. from hover chip). */
  onClearPositionBracket?: (positionId: string, field: "sl" | "tp") => void;
}

function inferBracketFieldFromEntryDrag(
  side: OrderSide,
  entryPrice: number,
  price: number,
  symbolKey: string
): "sl" | "tp" | null {
  const pip = symbolPipSize(symbolKey);
  const dead = Math.max(pip * 0.5, pip * Math.abs(price) * 1e-9);
  if (Math.abs(price - entryPrice) <= dead) return null;
  if (side === "BUY") return price > entryPrice ? "tp" : "sl";
  return price < entryPrice ? "tp" : "sl";
}

function parseBracketLineTarget(line: ChartPriceLine): { positionId: string; mode: "entry" | "sl" | "tp" } | null {
  const m = line.id.match(/^(.*)-(entry|sl|tp)$/);
  if (!m) return null;
  const suf = m[2];
  const positionId = m[1];
  if (suf === "entry" && line.title === "Entry") return { positionId, mode: "entry" };
  if (suf === "sl" && line.title === "SL") return { positionId, mode: "sl" };
  if (suf === "tp" && line.title === "TP") return { positionId, mode: "tp" };
  return null;
}

/** Prefer TP / SL hits over Entry when several bracket lines overlap vertically. */
function bracketLineHitRank(title: string): number {
  if (title === "TP") return 0;
  if (title === "SL") return 1;
  if (title === "Entry") return 2;
  return 99;
}

/**
 * Desktop terminal chart — candles / bars / line, zoom, overlays, bracket drag,
 * optional right-click pending flow. No Fib/drawing primitives.
 */
type SlTpHoverState = {
  key: string;
  positionId: string;
  field: "sl" | "tp";
  linePrice: number;
  estimatedPnl: number;
  left: number;
  top: number;
};

function formatEstPnlUsd(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function ChartPanel({
  symbol,
  data,
  chartType,
  lines = [],
  onBracketDrag,
  onBracketDragCancel,
  onChartContextMenu,
  estimateBracketExitPnl,
  onClearPositionBracket
}: ChartPanelProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick" | "Bar" | "Line" | "Area"> | null>(null);
  const hasFittedRef = useRef(false);
  const onChartContextMenuRef = useRef(onChartContextMenu);
  const onBracketDragRef = useRef(onBracketDrag);
  const directBracketDragRef = useRef<{ positionId: string; field: "sl" | "tp" } | null>(null);
  const entryDragRef = useRef<{
    positionId: string;
    side: OrderSide;
    entryPrice: number;
    startClientX: number;
    startClientY: number;
    /** True once pointer moves past a small radius (avoids “click” falsely setting TP/SL). */
    armed: boolean;
  } | null>(null);
  /** Overlay list updates every bracket preview tick — must NOT rebind pointer handlers (drops mid-drag state). */
  const linesHitTestRef = useRef(lines);
  linesHitTestRef.current = lines;
  const estimateBracketExitPnlRef = useRef(estimateBracketExitPnl);
  estimateBracketExitPnlRef.current = estimateBracketExitPnl;
  const onClearPositionBracketRef = useRef(onClearPositionBracket);
  onClearPositionBracketRef.current = onClearPositionBracket;
  const [barSpacing, setBarSpacing] = useState(8);
  const [slTpHover, setSlTpHover] = useState<SlTpHoverState | null>(null);

  useEffect(() => {
    onChartContextMenuRef.current = onChartContextMenu;
  }, [onChartContextMenu]);
  useEffect(() => {
    onBracketDragRef.current = onBracketDrag;
  }, [onBracketDrag]);

  const onBracketDragCancelRef = useRef(onBracketDragCancel);
  useEffect(() => {
    onBracketDragCancelRef.current = onBracketDragCancel;
  }, [onBracketDragCancel]);

  useEffect(() => {
    if (!containerRef.current) return;

    const initialWidth = containerRef.current.clientWidth || 600;
    const initialHeight = containerRef.current.clientHeight || 360;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#121d35" },
        textColor: "#dbe7ff",
        attributionLogo: false
      },
      grid: {
        vertLines: { color: "#253557" },
        horzLines: { color: "#253557" }
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 12,
        borderVisible: true,
        borderColor: "#2c3d63"
      },
      rightPriceScale: {
        visible: true,
        borderVisible: true,
        borderColor: "#2c3d63",
        scaleMargins: { top: 0.08, bottom: 0.08 }
      },
      crosshair: {
        vertLine: { color: "#3b507e", labelBackgroundColor: "#1b2a4a" },
        horzLine: { color: "#3b507e", labelBackgroundColor: "#1b2a4a" }
      },
      width: initialWidth,
      height: initialHeight
    });

    const series =
      chartType === "candles"
        ? chart.addSeries(CandlestickSeries, {
            upColor: "#1a8f56",
            downColor: "#bf3b3b",
            borderVisible: false,
            wickUpColor: "#1a8f56",
            wickDownColor: "#bf3b3b"
          })
        : chartType === "bar"
          ? chart.addSeries(BarSeries, {
              upColor: "#1a8f56",
              downColor: "#bf3b3b"
            })
          : chart.addSeries(LineSeries, {
              color: "#63b2ff",
              lineWidth: 2
            });

    chartRef.current = chart;
    seriesRef.current = series;
    chart.timeScale().applyOptions({ barSpacing });

    /** Keep the chart pinned to its flex container; tolerate 0×0 during transitions. */
    const resizeObserver = new ResizeObserver(() => {
      const el = containerRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        chart.applyOptions({ width: w, height: h });
      }
    });
    resizeObserver.observe(containerRef.current);

    const containerEl = containerRef.current;
    function onContextMenu(event: MouseEvent): void {
      if (!onChartContextMenuRef.current || !seriesRef.current || !containerEl) return;
      const rect = containerEl.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const price = seriesRef.current.coordinateToPrice(y);
      if (typeof price !== "number") return;
      event.preventDefault();
      onChartContextMenuRef.current(price, event.clientX, event.clientY);
    }
    containerEl?.addEventListener("contextmenu", onContextMenu);

    return () => {
      resizeObserver.disconnect();
      containerEl?.removeEventListener("contextmenu", onContextMenu);
      chartRef.current = null;
      seriesRef.current = null;
      try {
        chart.remove();
      } catch {
        /* already disposed */
      }
    };
    // We deliberately re-create the chart when chartType changes so the series
    // type (candle vs bar vs line) can switch cleanly. `barSpacing` is only
    // read on init; subsequent updates flow through a separate effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType]);

  useEffect(() => {
    chartRef.current?.timeScale().applyOptions({ barSpacing });
  }, [barSpacing]);

  useEffect(() => {
    if (!seriesRef.current) return;
    if (chartType === "line") {
      seriesRef.current.setData(data.map((c) => ({ time: c.time, value: c.close })));
    } else {
      seriesRef.current.setData(data);
    }
    if (!hasFittedRef.current && data.length > 0) {
      hasFittedRef.current = true;
      chartRef.current?.timeScale().fitContent();
    }
  }, [data, chartType]);

  useEffect(() => {
    hasFittedRef.current = false;
  }, [symbol]);

  useEffect(() => {
    const containerEl = containerRef.current;
    if (!containerEl) return;

    function detectNearbySlTpLine(event: PointerEvent): ChartPriceLine | null {
      if (!seriesRef.current) return null;
      const y = event.clientY - containerEl.getBoundingClientRect().top;
      const thresholdPx = 14;
      let best: { line: ChartPriceLine; distance: number } | null = null;
      for (const line of linesHitTestRef.current) {
        const parsed = parseBracketLineTarget(line);
        if (!parsed || (parsed.mode !== "sl" && parsed.mode !== "tp")) continue;
        const lineY = seriesRef.current.priceToCoordinate(line.price);
        if (typeof lineY !== "number") continue;
        const distance = Math.abs(y - lineY);
        if (distance <= thresholdPx && (!best || distance < best.distance)) {
          best = { line, distance };
        }
      }
      return best?.line ?? null;
    }

    function updateSlTpHoverFromEvent(ev: PointerEvent): void {
      const est = estimateBracketExitPnlRef.current;
      const wrap = wrapRef.current;
      if (!est || !seriesRef.current || !wrap) {
        setSlTpHover(null);
        return;
      }
      if (directBracketDragRef.current || entryDragRef.current) {
        setSlTpHover(null);
        return;
      }
      const line = detectNearbySlTpLine(ev);
      if (!line) {
        setSlTpHover(null);
        return;
      }
      const parsed = parseBracketLineTarget(line);
      if (!parsed || (parsed.mode !== "sl" && parsed.mode !== "tp")) {
        setSlTpHover(null);
        return;
      }
      const pnl = est({ positionId: parsed.positionId, field: parsed.mode, linePrice: line.price });
      if (pnl === null || pnl === undefined || !Number.isFinite(pnl)) {
        setSlTpHover(null);
        return;
      }
      const wrect = wrap.getBoundingClientRect();
      const tipW = 192;
      const tipH = 52;
      let left = ev.clientX - wrect.left + 12;
      let top = ev.clientY - wrect.top - tipH - 8;
      left = Math.max(6, Math.min(left, wrect.width - tipW - 6));
      top = Math.max(6, Math.min(top, wrect.height - tipH - 6));
      const key = `${parsed.positionId}-${parsed.mode}`;
      setSlTpHover((prev) => {
        const next: SlTpHoverState = {
          key,
          positionId: parsed.positionId,
          field: parsed.mode,
          linePrice: line.price,
          estimatedPnl: pnl,
          left,
          top
        };
        if (
          prev &&
          prev.key === next.key &&
          prev.estimatedPnl === next.estimatedPnl &&
          Math.abs(prev.left - next.left) < 3 &&
          Math.abs(prev.top - next.top) < 3
        ) {
          return prev;
        }
        return next;
      });
    }

    function getPriceFromPointer(event: PointerEvent): number | null {
      if (!seriesRef.current) return null;
      const rect = containerEl.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const raw = seriesRef.current.coordinateToPrice(y);
      return typeof raw === "number" ? raw : null;
    }

    function detectNearbyBracketLine(event: PointerEvent): ChartPriceLine | null {
      if (!seriesRef.current) return null;
      const y = event.clientY - containerEl.getBoundingClientRect().top;
      const thresholdPx = 8;
      const candidates: { line: ChartPriceLine; distance: number }[] = [];
      for (const line of linesHitTestRef.current) {
        const parsed = parseBracketLineTarget(line);
        if (!parsed) continue;
        const lineY = seriesRef.current.priceToCoordinate(line.price);
        if (typeof lineY !== "number") continue;
        const distance = Math.abs(y - lineY);
        if (distance <= thresholdPx) candidates.push({ line, distance });
      }
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => {
        const ra = bracketLineHitRank(a.line.title);
        const rb = bracketLineHitRank(b.line.title);
        if (ra !== rb) return ra - rb;
        return a.distance - b.distance;
      });
      return candidates[0].line;
    }

    function releasePointerIfNeeded(event: PointerEvent): void {
      if (containerEl.hasPointerCapture(event.pointerId)) {
        containerEl.releasePointerCapture(event.pointerId);
      }
    }

    function onPointerDown(event: PointerEvent): void {
      if (event.button !== 0 || !seriesRef.current || !onBracketDragRef.current) return;
      const near = detectNearbyBracketLine(event);
      if (!near) return;
      const parsed = parseBracketLineTarget(near);
      if (!parsed) return;

      if (parsed.mode === "sl" || parsed.mode === "tp") {
        directBracketDragRef.current = { positionId: parsed.positionId, field: parsed.mode };
        containerEl.setPointerCapture(event.pointerId);
        containerEl.style.cursor = "ns-resize";
        event.preventDefault();
        return;
      }

      if (parsed.mode === "entry" && near.positionSide) {
        entryDragRef.current = {
          positionId: parsed.positionId,
          side: near.positionSide,
          entryPrice: near.price,
          startClientX: event.clientX,
          startClientY: event.clientY,
          armed: false
        };
        containerEl.setPointerCapture(event.pointerId);
        event.preventDefault();
      }
    }

    function onPointerMove(event: PointerEvent): void {
      const dir = directBracketDragRef.current;
      if (dir && onBracketDragRef.current) {
        setSlTpHover(null);
        const px = getPriceFromPointer(event);
        if (px !== null) {
          onBracketDragRef.current({ positionId: dir.positionId, field: dir.field, price: px, done: false });
        }
        return;
      }

      const entry = entryDragRef.current;
      if (entry && onBracketDragRef.current) {
        setSlTpHover(null);
        const dx = event.clientX - entry.startClientX;
        const dy = event.clientY - entry.startClientY;
        /** Require deliberate movement before entry-line bracket drag (avoid accidental TP/SL with SL/TP lines). */
        if (!entry.armed && Math.hypot(dx, dy) >= 12) {
          entry.armed = true;
        }
        if (!entry.armed) return;
        const px = getPriceFromPointer(event);
        if (px === null) return;
        const field = inferBracketFieldFromEntryDrag(entry.side, entry.entryPrice, px, symbol);
        if (!field) return;
        containerEl.style.cursor = "ns-resize";
        onBracketDragRef.current({ positionId: entry.positionId, field, price: px, done: false });
        return;
      }

      const hover = detectNearbyBracketLine(event);
      containerEl.style.cursor = hover ? "ns-resize" : "default";
      updateSlTpHoverFromEvent(event);
    }

    function onPointerUp(event: PointerEvent): void {
      if (event.button !== 0) return;

      setSlTpHover(null);

      const dir = directBracketDragRef.current;
      if (dir && onBracketDragRef.current) {
        directBracketDragRef.current = null;
        const px = getPriceFromPointer(event);
        containerEl.style.cursor = "default";
        releasePointerIfNeeded(event);
        if (px !== null) {
          onBracketDragRef.current({ positionId: dir.positionId, field: dir.field, price: px, done: true });
        } else {
          onBracketDragCancelRef.current?.();
        }
        return;
      }

      const entry = entryDragRef.current;
      if (entry) {
        entryDragRef.current = null;
        const px = entry.armed ? getPriceFromPointer(event) : null;
        containerEl.style.cursor = "default";
        releasePointerIfNeeded(event);
        if (!entry.armed || !px || !onBracketDragRef.current) {
          onBracketDragCancelRef.current?.();
          return;
        }
        const field = inferBracketFieldFromEntryDrag(entry.side, entry.entryPrice, px, symbol);
        if (field) {
          onBracketDragRef.current({ positionId: entry.positionId, field, price: px, done: true });
        } else {
          onBracketDragCancelRef.current?.();
        }
      }
    }

    containerEl.addEventListener("pointerdown", onPointerDown);
    containerEl.addEventListener("pointermove", onPointerMove);
    containerEl.addEventListener("pointerup", onPointerUp);
    containerEl.addEventListener("pointercancel", onPointerUp);
    return () => {
      setSlTpHover(null);
      directBracketDragRef.current = null;
      entryDragRef.current = null;
      containerEl.style.cursor = "default";
      containerEl.removeEventListener("pointerdown", onPointerDown);
      containerEl.removeEventListener("pointermove", onPointerMove);
      containerEl.removeEventListener("pointerup", onPointerUp);
      containerEl.removeEventListener("pointercancel", onPointerUp);
    };
    /**
     * Intentionally omit `lines` from deps: overlays refresh every bracket preview frame and would
     * tear down listeners, clearing drag refs (`directBracketDragRef` / `entryDragRef`).
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType, symbol]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const leave = (): void => setSlTpHover(null);
    wrap.addEventListener("pointerleave", leave);
    return () => wrap.removeEventListener("pointerleave", leave);
  }, [chartType, symbol]);

  /** Price lines attach to the series; re-apply whenever overlays change or the chart is recreated (e.g. chart type). */
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    series.priceLines().forEach((line) => series.removePriceLine(line));
    for (const line of lines) {
      series.createPriceLine({
        price: line.price,
        color: line.color,
        lineWidth: 2,
        axisLabelVisible: true,
        title: line.title
      });
    }
  }, [lines, chartType]);

  function zoomIn(): void {
    setBarSpacing((cur) => Math.min(cur + 2, 30));
  }

  function zoomOut(): void {
    setBarSpacing((cur) => Math.max(cur - 2, 2));
  }

  /** Mark `Area` import as used without changing runtime behaviour. */
  void AreaSeries;

  return (
    <div ref={wrapRef} className="chartPanelWrap">
      <div className="chartActions">
        <button className="miniBtn iconBtn" title="Zoom Out" aria-label="Zoom Out" onClick={zoomOut}>
          <ZoomOut size={14} />
        </button>
        <button className="miniBtn iconBtn" title="Zoom In" aria-label="Zoom In" onClick={zoomIn}>
          <ZoomIn size={14} />
        </button>
      </div>
      <div ref={containerRef} className="chartContainer" />
      {slTpHover ? (
        <div
          className="bracketHoverTip"
          style={{ left: slTpHover.left, top: slTpHover.top }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="bracketHoverTip__head">
            <span className="bracketHoverTip__title">
              {slTpHover.field === "tp" ? "Take profit" : "Stop loss"}
            </span>
            {onClearPositionBracket ? (
              <button
                type="button"
                className="bracketHoverTip__clear"
                aria-label={slTpHover.field === "tp" ? "Remove take profit" : "Remove stop loss"}
                onClick={() => {
                  onClearPositionBracketRef.current?.(slTpHover.positionId, slTpHover.field);
                  setSlTpHover(null);
                }}
              >
                <XIcon size={12} strokeWidth={2.5} />
              </button>
            ) : null}
          </div>
          <div
            className={`bracketHoverTip__pnl ${
              slTpHover.estimatedPnl >= 0 ? "bracketHoverTip__pnl--ok" : "bracketHoverTip__pnl--bad"
            }`}
          >
            Est. exit P/L {formatEstPnlUsd(slTpHover.estimatedPnl)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ChartPanel;
