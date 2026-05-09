import type { Express, Request, Response } from "express";

/**
 * Free Forex calendar feed mirrored by FairEconomy / Forex Factory.
 * Updated weekly; we cache aggressively to avoid hammering the upstream
 * (the file is ~30 KB and rarely changes within a 15-minute window).
 */
const FF_CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const CACHE_TTL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

type Impact = "High" | "Medium" | "Low" | "Holiday";

interface RawCalendarEntry {
  title: string;
  country: string;
  date: string;
  impact: Impact;
  forecast: string;
  previous: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  currency: string;
  impact: "high" | "medium" | "low" | "holiday";
  /** Epoch milliseconds (UTC). */
  timestamp: number;
  forecast: string | null;
  previous: string | null;
}

interface CacheEntry {
  fetchedAt: number;
  events: CalendarEvent[];
}

let cache: CacheEntry | null = null;
let inflight: Promise<CalendarEvent[]> | null = null;

function normalizeImpact(raw: string): CalendarEvent["impact"] {
  const lc = (raw || "").trim().toLowerCase();
  if (lc === "high") return "high";
  if (lc === "medium") return "medium";
  if (lc === "low") return "low";
  return "holiday";
}

function makeId(entry: RawCalendarEntry, ts: number): string {
  /** A stable id derived from the event coordinates so the UI can dedupe. */
  return [entry.country, entry.title, ts].join("|").replace(/\s+/g, "_");
}

async function fetchCalendar(): Promise<CalendarEvent[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(FF_CALENDAR_URL, {
      signal: controller.signal,
      headers: { "user-agent": "PropPrime-Terminal/1.0 (+news)" }
    });
    if (!res.ok) {
      throw new Error(`Calendar feed responded ${res.status}`);
    }
    const raw = (await res.json()) as RawCalendarEntry[];
    if (!Array.isArray(raw)) {
      throw new Error("Calendar feed returned non-array payload");
    }
    return raw
      .map((entry) => {
        const ts = Date.parse(entry.date);
        if (!Number.isFinite(ts)) return null;
        return {
          id: makeId(entry, ts),
          title: entry.title,
          currency: entry.country,
          impact: normalizeImpact(entry.impact),
          timestamp: ts,
          forecast: entry.forecast?.trim() ? entry.forecast.trim() : null,
          previous: entry.previous?.trim() ? entry.previous.trim() : null
        } satisfies CalendarEvent;
      })
      .filter((x): x is CalendarEvent => x !== null)
      .sort((a, b) => a.timestamp - b.timestamp);
  } finally {
    clearTimeout(timer);
  }
}

async function getCachedCalendar(forceRefresh: boolean): Promise<CalendarEvent[]> {
  const now = Date.now();
  if (!forceRefresh && cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.events;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const events = await fetchCalendar();
      cache = { fetchedAt: Date.now(), events };
      return events;
    } catch (err) {
      /** If we have stale data we still serve it so the UI never goes empty. */
      if (cache) return cache.events;
      throw err;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function registerNewsRoutes(app: Express): void {
  /**
   * GET /news/calendar?impact=high,medium&currency=USD,EUR&horizon=week
   * Returns the curated economic calendar. Defaults to High + Medium impact
   * (which is what traders actually act on). Stale-on-error keeps the
   * terminal usable when the upstream blips.
   */
  app.get("/news/calendar", async (req: Request, res: Response) => {
    try {
      const force = String(req.query.refresh ?? "") === "1";
      const all = await getCachedCalendar(force);

      const impactsRaw = String(req.query.impact ?? "high,medium")
        .toLowerCase()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const impactSet = new Set(impactsRaw.length ? impactsRaw : ["high", "medium"]);

      const currenciesRaw = String(req.query.currency ?? "")
        .toUpperCase()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const currencySet = currenciesRaw.length ? new Set(currenciesRaw) : null;

      const horizon = String(req.query.horizon ?? "week").toLowerCase();
      const now = Date.now();
      const horizonStart = horizon === "today" || horizon === "next24h" ? now - 6 * 3600_000 : 0;
      const horizonEnd =
        horizon === "today"
          ? endOfTodayUtc()
          : horizon === "next24h"
            ? now + 24 * 3600_000
            : Number.POSITIVE_INFINITY;

      const filtered = all.filter((evt) => {
        if (!impactSet.has(evt.impact)) return false;
        if (currencySet && !currencySet.has(evt.currency)) return false;
        if (evt.timestamp < horizonStart) return false;
        if (evt.timestamp > horizonEnd) return false;
        return true;
      });

      res.json({
        source: "forexfactory",
        fetchedAt: cache?.fetchedAt ?? Date.now(),
        cacheTtlMs: CACHE_TTL_MS,
        impactFilter: Array.from(impactSet),
        currencyFilter: currencySet ? Array.from(currencySet) : null,
        horizon,
        count: filtered.length,
        events: filtered
      });
    } catch (err) {
      res.status(502).json({
        error: "Calendar feed unavailable",
        detail: err instanceof Error ? err.message : String(err)
      });
    }
  });
}

function endOfTodayUtc(): number {
  const d = new Date();
  d.setUTCHours(23, 59, 59, 999);
  return d.getTime();
}
