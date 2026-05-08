import type { Express } from "express";
import type { AppContext } from "../appContext";
import { requireBearerAuth, requireTerminalAuth, type AuthedRequest } from "../middleware/authMiddleware";

/**
 * Per-package "terminal account" auth — separate from the portal email/password
 * flow. Each package the client purchases has its own numeric `login` and a
 * password the trader can rotate from the portal or directly from the desktop
 * client. These credentials are what the user types into the desktop app and
 * (later) into the web "terminal" surface.
 */
export function registerTerminalAuthRoutes(app: Express, ctx: AppContext): void {
  app.post("/terminal/auth/login", async (req, res) => {
    const login = typeof req.body?.login === "string" ? req.body.login : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!login.trim() || !password) {
      return res.status(400).json({ error: "login and password are required." });
    }
    const out = await ctx.terminalAccountService.login(login, password);
    if (!out.ok) return res.status(401).json({ error: out.error });
    return res.json({ token: out.token, terminal: out.terminal });
  });

  app.get("/terminal/auth/me", requireTerminalAuth, (req, res) => {
    const a = req as AuthedRequest;
    const rec = ctx.terminalAccountService.getById(a.actorTerminalAccountId!);
    if (!rec) return res.status(401).json({ error: "Terminal account no longer exists." });
    return res.json({ terminal: ctx.terminalAccountService.toSummary(rec) });
  });

  app.post("/terminal/auth/change-password", requireTerminalAuth, async (req, res) => {
    const a = req as AuthedRequest;
    const current = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
    const next = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    if (!current || !next) {
      return res.status(400).json({ error: "currentPassword and newPassword are required." });
    }
    const out = await ctx.terminalAccountService.changeOwnPassword(a.actorTerminalAccountId!, current, next);
    if (!out.ok) return res.status(out.status).json({ error: out.error });
    return res.json({ ok: true, terminal: out.terminal });
  });

  app.get("/client/terminal-accounts", requireBearerAuth, (req, res) => {
    const a = req as AuthedRequest;
    const list = ctx.terminalAccountService.listForUser(a.actorUserId!);
    return res.json(list);
  });

  app.post("/client/terminal-accounts/:id/regenerate-password", requireBearerAuth, async (req, res) => {
    const a = req as AuthedRequest;
    const id = String(req.params.id);
    const out = await ctx.terminalAccountService.regeneratePassword(a.actorUserId!, id);
    if (!out.ok) return res.status(out.status).json({ error: out.error });
    ctx.auditService.log("client.terminal_account.regenerate_password", { terminalAccountId: id }, a.actorUserId!, a.actorAccountId);
    return res.json({ ok: true, password: out.password, terminal: out.terminal });
  });

  app.post("/client/terminal-accounts/:id/set-password", requireBearerAuth, async (req, res) => {
    const a = req as AuthedRequest;
    const id = String(req.params.id);
    const next = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    if (!next) return res.status(400).json({ error: "newPassword is required." });
    const out = await ctx.terminalAccountService.setPassword(a.actorUserId!, id, next);
    if (!out.ok) return res.status(out.status).json({ error: out.error });
    ctx.auditService.log("client.terminal_account.set_password", { terminalAccountId: id }, a.actorUserId!, a.actorAccountId);
    return res.json({ ok: true, terminal: out.terminal });
  });
}
