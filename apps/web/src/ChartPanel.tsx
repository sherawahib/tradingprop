import { useEffect, useRef, useState } from "react";
import { AreaSeries, BarSeries, CandlestickSeries, ColorType, LineSeries, createChart, createSeriesMarkers } from "lightweight-charts";
import type { IChartApi, ISeriesApi, MouseEventParams, Time, UTCTimestamp } from "lightweight-charts";
import { ZoomIn, ZoomOut } from "lucide-react";

type Candle = { time: UTCTimestamp; open: number; high: number; low: number; close: number };
type Marker = {
  time: UTCTimestamp;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle";
  text: string;
};
type PriceLineConfig = {
  id: string;
  price: number;
  color: string;
  title: string;
};

interface ChartPanelProps {
  symbol: string;
  data: Candle[];
  markers: Marker[];
  lines: PriceLineConfig[];
  chartType: "candles" | "bar" | "line";
  drawingTool: "none" | "hline" | "vline" | "trendline";
  onPricePick?: (price: number) => void;
  onHoverInfo?: (price: number, timestampSec: number | null) => void;
  onLineDrag?: (kind: "SL" | "TP", price: number, done: boolean) => void;
  onChartClick?: (price: number) => void;
  onLineClick?: (line: PriceLineConfig) => void;
}

function ChartPanel({
  symbol,
  data,
  markers,
  lines,
  chartType,
  drawingTool,
  onPricePick,
  onHoverInfo,
  onLineDrag,
  onChartClick,
  onLineClick
}: ChartPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick" | "Bar" | "Line" | "Area"> | null>(null);
  const markerPrimitiveRef = useRef<{ setMarkers: (markers: Marker[]) => void } | null>(null);
  const hasFittedRef = useRef(false);
  const dragKindRef = useRef<"SL" | "TP" | null>(null);
  const trendFirstPointRef = useRef<{ time: UTCTimestamp; value: number } | null>(null);
  const trendSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const onPricePickRef = useRef(onPricePick);
  const onHoverInfoRef = useRef(onHoverInfo);
  const onChartClickRef = useRef(onChartClick);
  const onLineClickRef = useRef(onLineClick);
  const onLineDragRef = useRef(onLineDrag);
  const [customLines, setCustomLines] = useState<PriceLineConfig[]>([]);
  const [customMarkers, setCustomMarkers] = useState<Marker[]>([]);
  const [barSpacing, setBarSpacing] = useState(6);

  function toLineData() {
    return data.map((c) => ({ time: c.time, value: c.close }));
  }

  useEffect(() => {
    onPricePickRef.current = onPricePick;
    onHoverInfoRef.current = onHoverInfo;
    onChartClickRef.current = onChartClick;
    onLineClickRef.current = onLineClick;
    onLineDragRef.current = onLineDrag;
  }, [onPricePick, onHoverInfo, onChartClick, onLineClick, onLineDrag]);

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
    markerPrimitiveRef.current = createSeriesMarkers(series, []) as { setMarkers: (markers: Marker[]) => void };

    chart.timeScale().applyOptions({ barSpacing });
    chart.subscribeCrosshairMove((param: MouseEventParams<Time>) => {
      if (!onPricePickRef.current || !param.point) return;
      const price = series.coordinateToPrice(param.point.y);
      if (typeof price === "number") {
        onPricePickRef.current(price);
        if (onHoverInfoRef.current) {
          const ts = typeof param.time === "number" ? param.time : null;
          onHoverInfoRef.current(price, ts);
        }
      }
    });
    chart.subscribeClick((param: MouseEventParams<Time>) => {
      if (!onChartClickRef.current || !param.point) return;
      const price = series.coordinateToPrice(param.point.y);
      if (typeof price === "number") {
        onChartClickRef.current(price);
      }
    });

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

    return () => {
      resizeObserver.disconnect();
      chartRef.current = null;
      seriesRef.current = null;
      markerPrimitiveRef.current = null;
      chart.remove();
    };
  }, [symbol, chartType]);

  useEffect(() => {
    chartRef.current?.timeScale().applyOptions({ barSpacing });
  }, [barSpacing]);

  useEffect(() => {
    if (!seriesRef.current) return;
    if (chartType === "candles" || chartType === "bar") {
      seriesRef.current.setData(data);
    } else {
      seriesRef.current.setData(toLineData());
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
    markerPrimitiveRef.current?.setMarkers([...markers, ...customMarkers]);
  }, [markers, customMarkers]);

  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.priceLines().forEach((line) => seriesRef.current?.removePriceLine(line));
    [...lines, ...customLines].forEach((line) => {
      seriesRef.current?.createPriceLine({
        price: line.price,
        color: line.color,
        lineWidth: 2,
        axisLabelVisible: true,
        title: line.title
      });
    });
  }, [lines, customLines]);

  useEffect(() => {
    if (!containerRef.current) return;
    const containerEl = containerRef.current as HTMLDivElement;

    function getPriceFromPointer(event: PointerEvent): number | null {
      if (!seriesRef.current) return null;
      const rect = containerEl.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const rawPrice = seriesRef.current.coordinateToPrice(y);
      return typeof rawPrice === "number" ? rawPrice : null;
    }

    function detectNearbyLine(event: PointerEvent): PriceLineConfig | null {
      if (!seriesRef.current) return null;
      const rect = containerEl.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const thresholdPx = 8;
      let bestMatch: { line: PriceLineConfig; distance: number } | null = null;
      for (const line of lines) {
        const lineY = seriesRef.current.priceToCoordinate(line.price);
        if (typeof lineY !== "number") continue;
        const distance = Math.abs(y - lineY);
        if (distance <= thresholdPx && (!bestMatch || distance < bestMatch.distance)) {
          bestMatch = { line, distance };
        }
      }
      return bestMatch?.line ?? null;
    }

    function onPointerDown(event: PointerEvent): void {
      const targetLine = detectNearbyLine(event);
      if (targetLine && onLineClickRef.current) {
        onLineClickRef.current(targetLine);
      }
      if (!targetLine && drawingTool !== "none") {
        const price = getPriceFromPointer(event);
        if (price !== null && seriesRef.current) {
          const rect = containerEl.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const time = chartRef.current?.timeScale().coordinateToTime(x);
          if (drawingTool === "hline") {
            setCustomLines((prev) => [...prev, { id: `hline-${Date.now()}`, price, color: "#f5b041", title: "HLine" }]);
          } else if (drawingTool === "vline" && typeof time === "number") {
            setCustomMarkers((prev) => [
              ...prev,
              { time: time as UTCTimestamp, position: "aboveBar", color: "#f5b041", shape: "circle", text: "VLine" }
            ]);
          } else if (drawingTool === "trendline" && typeof time === "number") {
            if (!trendFirstPointRef.current) {
              trendFirstPointRef.current = { time: time as UTCTimestamp, value: price };
            } else {
              if (!chartRef.current) return;
              const start = trendFirstPointRef.current;
              const end = { time: time as UTCTimestamp, value: price };
              const trend = chartRef.current.addSeries(LineSeries, { color: "#f5b041", lineWidth: 1 });
              trend.setData([
                { time: start.time, value: start.value },
                { time: end.time, value: end.value }
              ]);
              trendSeriesRef.current.push(trend);
              trendFirstPointRef.current = null;
            }
          }
        }
      }
      if (!targetLine || (targetLine.title !== "SL" && targetLine.title !== "TP")) return;
      dragKindRef.current = targetLine.title;
      containerEl.setPointerCapture(event.pointerId);
      containerEl.style.cursor = "ns-resize";
      event.preventDefault();
    }

    function onPointerMove(event: PointerEvent): void {
      if (dragKindRef.current) {
        const nextPrice = getPriceFromPointer(event);
        if (nextPrice !== null && onLineDragRef.current) {
          onLineDragRef.current(dragKindRef.current, nextPrice, false);
        }
        return;
      }
      const hoverLine = detectNearbyLine(event);
      containerEl.style.cursor = hoverLine ? "ns-resize" : "default";
    }

    function onPointerUp(event: PointerEvent): void {
      if (!dragKindRef.current) return;
      const nextPrice = getPriceFromPointer(event);
      if (nextPrice !== null && onLineDragRef.current) {
        onLineDragRef.current(dragKindRef.current, nextPrice, true);
      }
      dragKindRef.current = null;
      containerEl.style.cursor = "default";
      if (containerEl.hasPointerCapture(event.pointerId)) {
        containerEl.releasePointerCapture(event.pointerId);
      }
    }

    containerEl.addEventListener("pointerdown", onPointerDown);
    containerEl.addEventListener("pointermove", onPointerMove);
    containerEl.addEventListener("pointerup", onPointerUp);
    containerEl.addEventListener("pointercancel", onPointerUp);
    return () => {
      containerEl.removeEventListener("pointerdown", onPointerDown);
      containerEl.removeEventListener("pointermove", onPointerMove);
      containerEl.removeEventListener("pointerup", onPointerUp);
      containerEl.removeEventListener("pointercancel", onPointerUp);
    };
  }, [lines, drawingTool]);

  useEffect(() => {
    return () => {
      trendSeriesRef.current.forEach((s) => {
        chartRef.current?.removeSeries(s);
      });
      trendSeriesRef.current = [];
    };
  }, [symbol, chartType]);

  function zoomIn(): void {
    const next = Math.min(barSpacing + 2, 25);
    setBarSpacing(next);
    chartRef.current?.timeScale().applyOptions({ barSpacing: next });
  }

  function zoomOut(): void {
    const next = Math.max(barSpacing - 2, 2);
    setBarSpacing(next);
    chartRef.current?.timeScale().applyOptions({ barSpacing: next });
  }

  return (
    <div className="chartPanelWrap">
      <div className="chartActions">
        <button className="miniBtn iconBtn" title="Zoom Out" aria-label="Zoom Out" onClick={zoomOut}><ZoomOut size={14} /></button>
        <button className="miniBtn iconBtn" title="Zoom In" aria-label="Zoom In" onClick={zoomIn}><ZoomIn size={14} /></button>
      </div>
      <div ref={containerRef} className="chartContainer" />
    </div>
  );
}

export default ChartPanel;
