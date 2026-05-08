import type { Express } from "express";
import type { AppContext } from "../appContext";

export function registerSettingsRoutes(app: Express, ctx: AppContext): void {
  app.get("/settings", (_req, res) => {
    res.json(ctx.store.get().settings);
  });

  app.post("/settings/update-speed", (req, res) => {
    const nextMs = Number(req.body?.marketLoopMs);
    if (![250, 500, 1000].includes(nextMs)) return res.status(400).json({ error: "marketLoopMs must be one of: 250, 500, 1000." });
    ctx.store.update((s) => {
      s.settings.marketLoopMs = nextMs;
    });
    return res.json({ ok: true, ...ctx.store.get().settings });
  });

  app.post("/settings/price-source", (req, res) => {
    const mode = String(req.body?.priceSourceMode ?? "");
    if (mode !== "demo" && mode !== "tvc-reference") return res.status(400).json({ error: "priceSourceMode must be 'demo' or 'tvc-reference'." });
    ctx.store.update((s) => {
      s.settings.priceSourceMode = mode;
    });
    return res.json({ ok: true, ...ctx.store.get().settings });
  });

  app.post("/settings/execution-provider", (req, res) => {
    const next = String(req.body?.executionProvider ?? "");
    if (next !== "paper" && next !== "broker-demo" && next !== "broker-live") {
      return res.status(400).json({ error: "executionProvider must be paper, broker-demo, or broker-live." });
    }
    ctx.store.update((s) => {
      s.settings.executionProvider = next;
    });
    return res.json({ ok: true, ...ctx.store.get().settings });
  });
}
