/**
 * MT5 bridge client — opens a persistent WebSocket connection to a local
 * FastAPI bridge (default ws://127.0.0.1:8000/ws/prices) that streams real
 * broker tick data via MetaTrader5.
 *
 * Inbound frame shape:
 *   {
 *     "EURUSD": { "bid": 1.17852, "ask": 1.17852, "time_msc": 1778273938737 },
 *     "BTCUSD": { "bid": 80413.82, "ask": 80413.82, "time_msc": 1778314544231 },
 *     ...
 *   }
 *
 * Symbol names coming from the bridge are matched directly to ForexSymbol.
 * Optional broker-specific suffixes ("EURUSD.s", "EURUSDm") are stripped.
 *
 * Connection is auto-reconnecting with bounded exponential backoff so the
 * platform stays healthy whether or not the bridge is running.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import WebSocket from "ws";
import type { ForexSymbol } from "@paper-trader/shared";
import { TRADE_SYMBOLS } from "@paper-trader/shared";

export interface BridgeQuote {
  symbol: ForexSymbol;
  bid: number;
  ask: number;
  updatedAt: number;
}

export type TickListener = (q: BridgeQuote) => void;
export type StatusListener = (status: { mt5Connected: boolean; reason?: string }) => void;

const KNOWN_SYMBOLS = new Set<string>(TRADE_SYMBOLS);

function normalizeSymbol(raw: string): ForexSymbol | undefined {
  const trimmed = raw.trim().toUpperCase();
  if (KNOWN_SYMBOLS.has(trimmed)) return trimmed as ForexSymbol;
  const stripped = trimmed.replace(/[^A-Z]/g, "");
  if (KNOWN_SYMBOLS.has(stripped)) return stripped as ForexSymbol;
  return undefined;
}

interface SpawnConfig {
  enabled: boolean;
  bridgeDir: string;
  pythonBinary: string;
  port: number;
  terminalPath: string;
  symbols?: string;
}

function readSpawnConfig(): SpawnConfig {
  const enabled = (process.env.MT5_BRIDGE_AUTOSTART ?? "true").toLowerCase() !== "false";
  const bridgeDir = process.env.MT5_BRIDGE_DIR ?? "F:\\algocheck";
  const pythonBinary = process.env.MT5_BRIDGE_PYTHON ?? "python";
  const port = Number(process.env.MT5_BRIDGE_PORT ?? "8000");
  const terminalPath = process.env.MT5_TERMINAL_PATH ?? join(bridgeDir, "terminal64.exe");
  const symbols = process.env.MT5_SYMBOLS;
  return { enabled, bridgeDir, pythonBinary, port, terminalPath, symbols };
}

export class Mt5BridgeService {
  private socket: WebSocket | null = null;
  private cache = new Map<ForexSymbol, BridgeQuote>();
  private readonly url: string;
  private readonly spawnConfig: SpawnConfig;
  private bridgeProcess: ChildProcess | null = null;
  private spawnedByUs = false;
  private connectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private connected = false;
  private lastError: string | undefined;
  private lastFrameAt = 0;
  private stopped = true;
  private bridgeReady = false;
  private spawnAttempts = 0;
  private mt5Connected: boolean | null = null;
  private mt5StatusReason: string | undefined;
  private tickListeners: TickListener[] = [];
  private statusListeners: StatusListener[] = [];

  constructor(url?: string, spawnConfig?: Partial<SpawnConfig>) {
    const cfg = readSpawnConfig();
    this.spawnConfig = { ...cfg, ...spawnConfig };
    const inferredPort = this.spawnConfig.port;
    this.url =
      url ??
      process.env.MT5_BRIDGE_WS_URL ??
      `ws://127.0.0.1:${inferredPort}/ws/prices`;
  }

  start(): void {
    this.stopped = false;
    void this.ensureBridgeAndConnect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.close();
      } catch {
        /* ignore */
      }
      this.socket = null;
    }
    if (this.bridgeProcess && this.spawnedByUs && !this.bridgeProcess.killed) {
      try {
        this.bridgeProcess.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
    this.bridgeProcess = null;
    this.spawnedByUs = false;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && Date.now() - this.lastFrameAt < 5_000;
  }

  isMt5Connected(): boolean {
    // Treat unknown as true once we've ever connected to the bridge — bridge will
    // demote it to false within a heartbeat if MT5 actually went away.
    if (this.mt5Connected === false) return false;
    return this.connected;
  }

  onTick(listener: TickListener): () => void {
    this.tickListeners.push(listener);
    return () => {
      this.tickListeners = this.tickListeners.filter((l) => l !== listener);
    };
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.push(listener);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== listener);
    };
  }

  getBidAsk(symbol: ForexSymbol): { bid: number; ask: number; updatedAt: number } | undefined {
    const q = this.cache.get(symbol);
    if (!q) return undefined;
    return { bid: q.bid, ask: q.ask, updatedAt: q.updatedAt };
  }

  hasFresh(symbol: ForexSymbol, ttlMs = 10_000): boolean {
    const q = this.cache.get(symbol);
    return !!q && Date.now() - q.updatedAt < ttlMs;
  }

  isSymbolCovered(symbol: ForexSymbol): boolean {
    return this.cache.has(symbol);
  }

  /**
   * Fetch historical OHLC candles from the MT5 terminal via the bridge HTTP API.
   * Returns [] when the bridge is unreachable or MT5 has no data for the symbol.
   */
  async getHistoricalCandles(
    symbol: ForexSymbol,
    timeframe: string,
    limit: number
  ): Promise<Array<{ time: number; open: number; high: number; low: number; close: number }>> {
    const baseUrl = this.healthUrl()?.replace(/\/health$/, "");
    if (!baseUrl) return [];
    const params = new URLSearchParams({
      symbol,
      timeframe,
      limit: String(Math.min(Math.max(limit, 10), 5000))
    });
    const url = `${baseUrl}/candles?${params.toString()}`;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return [];
      const data = (await res.json()) as Array<{
        time: number;
        open: number;
        high: number;
        low: number;
        close: number;
      }>;
      if (!Array.isArray(data)) return [];
      return data;
    } catch {
      return [];
    }
  }

  getStatus(): {
    url: string;
    connected: boolean;
    coveredSymbols: ForexSymbol[];
    lastFrameAt: number;
    lastError?: string;
    autoSpawn: boolean;
    bridgeDir: string;
    bridgePid?: number;
    bridgeReady: boolean;
    terminalPath: string;
    mt5Connected: boolean;
    mt5StatusReason?: string;
  } {
    return {
      url: this.url,
      connected: this.connected,
      coveredSymbols: [...this.cache.keys()],
      lastFrameAt: this.lastFrameAt,
      lastError: this.lastError,
      autoSpawn: this.spawnConfig.enabled,
      bridgeDir: this.spawnConfig.bridgeDir,
      bridgePid: this.bridgeProcess?.pid ?? undefined,
      bridgeReady: this.bridgeReady,
      terminalPath: this.spawnConfig.terminalPath,
      mt5Connected: this.mt5Connected !== false,
      mt5StatusReason: this.mt5StatusReason
    };
  }

  private async ensureBridgeAndConnect(): Promise<void> {
    if (this.stopped) return;

    if (this.spawnConfig.enabled) {
      const reachable = await this.probeBridgeHealth(500);
      if (!reachable) {
        await this.spawnBridge();
        await this.waitForBridge(20_000);
      } else {
        this.bridgeReady = true;
      }
    }

    this.connect();
  }

  private async probeBridgeHealth(timeoutMs: number): Promise<boolean> {
    const url = this.healthUrl();
    if (!url) return false;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      return res.ok;
    } catch {
      return false;
    }
  }

  private async waitForBridge(maxWaitMs: number): Promise<boolean> {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      if (await this.probeBridgeHealth(500)) {
        this.bridgeReady = true;
        return true;
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    return false;
  }

  private healthUrl(): string | null {
    try {
      const u = new URL(this.url);
      const protocol = u.protocol === "wss:" ? "https:" : "http:";
      return `${protocol}//${u.host}/health`;
    } catch {
      return null;
    }
  }

  private async spawnBridge(): Promise<void> {
    if (this.bridgeProcess) return;
    const { bridgeDir, pythonBinary, port, terminalPath, symbols } = this.spawnConfig;
    const scriptPath = join(bridgeDir, "api_bridge.py");
    if (!existsSync(scriptPath)) {
      this.lastError = `MT5 bridge script not found at ${scriptPath}`;
      console.warn(`[mt5-bridge] ${this.lastError}`);
      return;
    }

    this.spawnAttempts += 1;
    const args = [
      "-m",
      "uvicorn",
      "api_bridge:app",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--log-level",
      "warning"
    ];
    const env = {
      ...process.env,
      MT5_TERMINAL_PATH: terminalPath,
      ...(symbols ? { MT5_SYMBOLS: symbols } : {})
    };

    try {
      const child = spawn(pythonBinary, args, {
        cwd: bridgeDir,
        env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
      this.bridgeProcess = child;
      this.spawnedByUs = true;

      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        for (const line of chunk.split(/\r?\n/)) {
          if (line.trim()) console.log(`[mt5-bridge:py] ${line}`);
        }
      });
      child.stderr?.on("data", (chunk: string) => {
        for (const line of chunk.split(/\r?\n/)) {
          if (line.trim()) console.log(`[mt5-bridge:py] ${line}`);
        }
      });
      child.on("exit", (code, signal) => {
        console.warn(`[mt5-bridge] python process exited code=${code} signal=${signal ?? ""}`);
        this.bridgeProcess = null;
        this.spawnedByUs = false;
        this.bridgeReady = false;
        if (!this.stopped) {
          const backoff = Math.min(15_000, 2000 * Math.min(this.spawnAttempts, 5));
          setTimeout(() => {
            void this.ensureBridgeAndConnect();
          }, backoff).unref?.();
        }
      });
      console.log(`[mt5-bridge] spawned python pid=${child.pid} cwd=${bridgeDir} port=${port}`);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : "Failed to spawn bridge";
      console.warn(`[mt5-bridge] spawn failed: ${this.lastError}`);
      this.bridgeProcess = null;
    }
  }

  private connect(): void {
    if (this.stopped) return;
    this.clearTimers();

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url, { handshakeTimeout: 4000 });
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : "WS init failed";
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.on("open", () => {
      this.connected = true;
      this.connectAttempts = 0;
      this.lastError = undefined;
      console.log(`[mt5-bridge] connected -> ${this.url}`);
      this.armHeartbeat();
    });

    socket.on("message", (raw: WebSocket.RawData) => {
      this.handleFrame(raw);
    });

    socket.on("close", () => {
      this.connected = false;
      this.scheduleReconnect();
    });

    socket.on("unexpected-response", () => {
      this.connected = false;
    });

    socket.on("error", (err: Error) => {
      this.lastError = err.message;
      // close handler will fire next; nothing else to do here.
    });
  }

  private handleFrame(raw: WebSocket.RawData): void {
    let text: string;
    if (typeof raw === "string") {
      text = raw;
    } else if (Array.isArray(raw)) {
      text = Buffer.concat(raw.map((b) => Buffer.from(b))).toString("utf8");
    } else {
      text = Buffer.from(raw as ArrayBuffer).toString("utf8");
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return;
    }
    if (!payload || typeof payload !== "object") return;

    const now = Date.now();
    this.lastFrameAt = now;

    for (const [rawSymbol, value] of Object.entries(payload as Record<string, unknown>)) {
      if (rawSymbol === "_meta") {
        const meta = value as { mt5_connected?: unknown; reason?: unknown };
        if (typeof meta.mt5_connected === "boolean") {
          const next = meta.mt5_connected;
          const reason = typeof meta.reason === "string" ? meta.reason : undefined;
          if (this.mt5Connected !== next) {
            this.mt5Connected = next;
            this.mt5StatusReason = next ? undefined : reason;
            for (const cb of this.statusListeners) {
              try {
                cb({ mt5Connected: next, reason });
              } catch {
                /* ignore */
              }
            }
          } else if (!next) {
            this.mt5StatusReason = reason;
          }
        }
        continue;
      }
      const symbol = normalizeSymbol(rawSymbol);
      if (!symbol) continue;
      const v = value as { bid?: unknown; ask?: unknown; time_msc?: unknown };
      const bid = Number(v.bid);
      const ask = Number(v.ask);
      if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) continue;
      const tsMs = Number(v.time_msc);
      const updatedAt = Number.isFinite(tsMs) && tsMs > 0 ? tsMs : now;
      const quote: BridgeQuote = { symbol, bid, ask, updatedAt };
      this.cache.set(symbol, quote);
      for (const cb of this.tickListeners) {
        try {
          cb(quote);
        } catch {
          /* ignore listener errors */
        }
      }
    }
  }

  private armHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastFrameAt > 15_000 && this.socket) {
        try {
          this.socket.terminate();
        } catch {
          /* ignore */
        }
      }
    }, 5000);
    this.heartbeatTimer.unref?.();
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.connectAttempts += 1;
    const backoff = Math.min(10_000, 1000 * 2 ** Math.min(this.connectAttempts - 1, 4));
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      void this.ensureBridgeAndConnect();
    }, backoff);
    this.reconnectTimer.unref?.();
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
