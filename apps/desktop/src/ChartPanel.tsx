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
import { ZoomIn, ZoomOut } from "lucide-react";

export type Candle = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type ChartType = "candles" | "bar" | "line";

interface ChartPanelProps {
  symbol: string;
  data: Candle[];
  chartType: ChartType;
}

/**
 * Streamlined chart for the desktop terminal — candles / bars / line, with
 * crosshair, right-axis price labels, and zoom buttons. Fits its container,
 * resizes via ResizeObserver, and refits on symbol change. Drawing tools and
 * SL/TP drag are intentionally left out for the desktop build.
 */
function ChartPanel({ symbol, data, chartType }: ChartPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick" | "Bar" | "Line" | "Area"> | null>(null);
  const hasFittedRef = useRef(false);
  const [barSpacing, setBarSpacing] = useState(8);

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

    return () => {
      resizeObserver.disconnect();
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

  function zoomIn(): void {
    setBarSpacing((cur) => Math.min(cur + 2, 30));
  }

  function zoomOut(): void {
    setBarSpacing((cur) => Math.max(cur - 2, 2));
  }

  /** Mark `Area` import as used without changing runtime behaviour. */
  void AreaSeries;

  return (
    <div className="chartPanelWrap">
      <div className="chartActions">
        <button className="miniBtn iconBtn" title="Zoom Out" aria-label="Zoom Out" onClick={zoomOut}>
          <ZoomOut size={14} />
        </button>
        <button className="miniBtn iconBtn" title="Zoom In" aria-label="Zoom In" onClick={zoomIn}>
          <ZoomIn size={14} />
        </button>
      </div>
      <div ref={containerRef} className="chartContainer" />
    </div>
  );
}

export default ChartPanel;
