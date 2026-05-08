import type { Express } from "express";
import { listProgramSignupOptions } from "../config/programSkuPresets";
import { defaultAccountId } from "../domain";
import type { AppContext } from "../appContext";
import { requireAdminAuth } from "../middleware/adminAuthMiddleware";
import { optionalBearerAuth, requireBearerAuth, type AuthedRequest } from "../middleware/authMiddleware";
import { computeTradingAccountSummary } from "../services/clientTradingSummary";
import { resetEvaluationForAccount } from "../services/propAccountLifecycle";
import { getTradingRulesPublicPayload } from "../services/tradingConductRules";

function routeId(raw: string | string[] | undefined): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw[0] ?? "";
  return "";
}

export function registerPropRoutes(app: Express, ctx: AppContext): void {
  app.get("/challenge/trading-rules", (_req, res) => {
    res.json(getTradingRulesPublicPayload());
  });

  app.get("/challenge/program-skus", (_req, res) => {
    res.json(listProgramSignupOptions());
  });

  app.get("/admin/overview", requireAdminAuth, (_req, res) => {
    const s = ctx.store.get();
    const active = s.traders.filter((t) => t.accountStatus === "ACTIVE").length;
    const locked = s.traders.filter((t) => t.accountStatus === "LOCKED").length;
    const breached = s.traders.filter((t) => t.accountStatus === "BREACHED").length;
    const pendingKyc = s.kycCases.filter((k) => k.status === "PENDING").length;
    const pendingPayouts = s.payouts.filter((p) => p.status === "REQUESTED" || p.status === "UNDER_REVIEW").length;
    const houseTraderAccounts = new Set(s.clientUsers.filter((u) => u.referredByHouseCommission).map((u) => u.accountId));
    res.json({
      totalTraders: s.traders.length,
      activeTraders: active,
      lockedTraders: locked,
      breachedTraders: breached,
      pendingKyc,
      pendingPayouts,
      todayViolations: s.violations.filter((v) => Date.now() - v.createdAt < 86_400_000).length,
      platformHouseCommissionAccruedUsd: s.platformHouseCommissionAccruedUsd,
      tradersOnHouseAttribution: houseTraderAccounts.size
    });
  });

  app.get("/admin/traders", requireAdminAuth, (_req, res) => {
    const s = ctx.store.get();
    const progressById = s.progressByAccountId;
    res.json(
      s.traders.map((t) => ({
        ...t,
        challengePhase: progressById[t.accountId]?.phase ?? "PHASE_1",
        challengeStatus: progressById[t.accountId]?.status ?? "ACTIVE"
      }))
    );
  });

  app.get("/admin/kyc-cases", requireAdminAuth, (_req, res) => {
    const s = ctx.store.get();
    res.json(s.kycCases.map((k) => ({
      ...k,
      trader: s.traders.find((t) => t.accountId === k.accountId)?.name ?? "Unknown"
    })));
  });

  app.get("/admin/payouts", requireAdminAuth, (_req, res) => {
    res.json(ctx.payoutService.list());
  });

  app.get("/admin/violations", requireAdminAuth, (_req, res) => {
    const s = ctx.store.get();
    res.json(s.violations.slice().reverse());
  });

  app.post("/admin/kyc-cases/:id/review", requireAdminAuth, (req, res) => {
    const action = String(req.body?.action ?? "");
    if (action !== "approve" && action !== "reject") return res.status(400).json({ error: "action must be approve or reject." });
    const caseId = routeId(req.params.id);
    let updated = false;
    ctx.store.update((s) => {
      const c = s.kycCases.find((x) => x.id === caseId);
      if (!c) return;
      c.status = action === "approve" ? "APPROVED" : "REJECTED";
      c.reviewedAt = Date.now();
      if (action === "reject") {
        c.rejectionReason = typeof req.body?.note === "string" ? req.body.note : "";
      } else {
        c.rejectionReason = undefined;
      }
      const trader = s.traders.find((t) => t.accountId === c.accountId);
      if (trader) trader.kycStatus = c.status;
      updated = true;
    });
    if (!updated) return res.status(404).json({ error: "KYC case not found." });
    ctx.auditService.log("admin.kyc.review", { caseId, action }, "risk_admin");
    return res.json({ ok: true });
  });

  app.get("/client/summary/:accountId", requireBearerAuth, (req, res) => {
    const a = req as AuthedRequest;
    const accountId = routeId(req.params.accountId) || defaultAccountId;
    const uid = a.actorUserId!;
    const state = ctx.store.get();
    const ownsViaPortal = accountId === a.actorAccountId;
    const ownsViaPackage = state.terminalAccounts.some((t) => t.ownerUserId === uid && t.accountId === accountId);
    if (!ownsViaPortal && !ownsViaPackage) {
      return res.status(403).json({ error: "You can only access your own account summary." });
    }
    const payload = computeTradingAccountSummary(state, accountId);
    if (!payload) return res.status(404).json({ error: "Account summary not found." });
    return res.json(payload);
  });

  app.get("/challenge/templates", (_req, res) => {
    res.json(ctx.store.get().challengeTemplates);
  });

  app.get("/challenge/progress", optionalBearerAuth, (req, res) => {
    const aid = (req as AuthedRequest).actorAccountId ?? defaultAccountId;
    const progress = ctx.challengeService.getProgress(aid);
    if (!progress) return res.status(404).json({ error: "Challenge progress not found." });
    return res.json(progress);
  });

  app.get("/violations", optionalBearerAuth, (req, res) => {
    const aid = (req as AuthedRequest).actorAccountId ?? defaultAccountId;
    res.json(ctx.store.get().violations.filter((v) => v.accountId === aid));
  });

  app.get("/audit-events", requireAdminAuth, (_req, res) => {
    res.json(ctx.store.get().auditEvents.slice().reverse().slice(0, 500));
  });

  app.get("/payouts", optionalBearerAuth, (req, res) => {
    const aid = (req as AuthedRequest).actorAccountId ?? defaultAccountId;
    res.json(ctx.payoutService.list().filter((p) => p.accountId === aid));
  });

  app.post("/payouts/request", optionalBearerAuth, (req, res) => {
    const aid = (req as AuthedRequest).actorAccountId ?? defaultAccountId;
    const { payout, reject } = ctx.payoutService.request(aid);
    if (reject?.code === "PAYOUT_CONSISTENCY_BLOCKED")
      return res.status(400).json({ error: reject.message, code: reject.code });
    if (!payout) return res.status(400).json({ error: "Payout not eligible yet." });
    ctx.auditService.log("payout.requested", { payoutId: payout.id }, aid, aid);
    return res.status(201).json(payout);
  });

  app.post("/admin/payouts/:id/review", requireAdminAuth, (req, res) => {
    const next = String(req.body?.action ?? "");
    if (next !== "approve" && next !== "reject") return res.status(400).json({ error: "action must be approve or reject." });
    const payout = ctx.payoutService.review(routeId(req.params.id), next, req.body?.note);
    if (!payout) return res.status(404).json({ error: "Payout not found." });
    ctx.auditService.log("payout.reviewed", { payoutId: payout.id, action: next }, "risk_admin", payout.accountId);
    return res.json(payout);
  });

  app.post("/admin/payouts/:id/pay", requireAdminAuth, (req, res) => {
    const payout = ctx.payoutService.markPaid(routeId(req.params.id));
    if (!payout) return res.status(404).json({ error: "Payout not found." });
    ctx.auditService.log("payout.paid", { payoutId: payout.id }, "finance_admin", payout.accountId);
    return res.json(payout);
  });

  app.post("/admin/accounts/:id/action", requireAdminAuth, (req, res) => {
    const accountId = routeId(req.params.id);
    const action = String(req.body?.action ?? "");
    if (!["lock", "unlock", "reset", "promote-funded"].includes(action)) return res.status(400).json({ error: "Unsupported action." });
    ctx.store.update((s) => {
      const progress = s.progressByAccountId[accountId];
      if (!progress) return;
      if (action === "lock") progress.status = "LOCKED";
      if (action === "unlock" && progress.status === "LOCKED") progress.status = "ACTIVE";
      if (action === "reset") {
        const ledger = s.ledgerByAccountId[accountId] ?? s.account;
        progress.status = "ACTIVE";
        progress.phase = "PHASE_1";
        progress.phaseStartBalance = ledger.balance;
        progress.currentDailyStartBalance = ledger.equity;
        progress.startedAt = Date.now();
        progress.passedAt = undefined;
        progress.fundedPhaseStartedAt = undefined;
        progress.qualifiedTradingDayKeys = [];
        progress.tradingDays = 0;
        progress.realizedPnLUsdByUtcDay = {};
        progress.lastTradeAtMs = undefined;
      }
      if (action === "promote-funded") {
        progress.phase = "FUNDED";
        progress.status = "ACTIVE";
      }
      const trader = s.traders.find((t) => t.accountId === accountId);
      if (trader) {
        if (action === "lock") trader.accountStatus = "LOCKED";
        if (action === "unlock") trader.accountStatus = "ACTIVE";
        if (action === "reset") trader.accountStatus = "ACTIVE";
      }
    });
    ctx.auditService.log("admin.account.action", { accountId, action }, "super_admin", accountId);
    return res.json({ ok: true });
  });

  app.get("/admin/support-tickets", requireAdminAuth, (_req, res) => {
    const s = ctx.store.get();
    res.json([...s.supportTickets].reverse());
  });

  app.post("/admin/support-tickets/:id/resolve", requireAdminAuth, (req, res) => {
    const ticketId = routeId(req.params.id);
    const decision = String(req.body?.decision ?? "");
    if (decision !== "approve" && decision !== "reject")
      return res.status(400).json({ error: "decision must be approve or reject." });
    const note = typeof req.body?.note === "string" ? req.body.note : undefined;
    let ok = false;
    ctx.store.update((s) => {
      const t = s.supportTickets.find((x) => x.id === ticketId);
      if (!t || t.status !== "OPEN") return;
      t.status = decision === "approve" ? "RESOLVED_APPROVE" : "RESOLVED_REJECT";
      t.resolvedAt = Date.now();
      t.resolutionNote = note;
      ok = true;
      if (decision === "approve" && t.type === "EVALUATION_RESET") {
        resetEvaluationForAccount(s, t.accountId);
      }
    });
    if (!ok) return res.status(404).json({ error: "Ticket not found or already resolved." });
    ctx.auditService.log("admin.support_ticket.resolved", { ticketId, decision }, "super_admin", undefined);
    return res.json({ ok: true });
  });
}
