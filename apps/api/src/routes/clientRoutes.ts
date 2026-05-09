import type { Express } from "express";
import crypto from "node:crypto";
import type { ClientDocumentKind, ClientProfile, KycDocumentType, SupportTicket } from "../domain";
import { emptyClientProfile } from "../domain";
import type { AppContext } from "../appContext";
import { requireBearerAuth, type AuthedRequest } from "../middleware/authMiddleware";
import { computeTradingAccountSummary } from "../services/clientTradingSummary";
import {
  buildStarterProgress,
  listProgramSignupOptions,
  PROGRAM_SIGNUP_PRESETS,
  resolveSignupProgramSlug
} from "../config/programSkuPresets";
import { getBankTransferCheckoutInfo } from "../config/bankTransferCheckout";

function parsePurchasePaymentMethod(raw: unknown): "SIMULATED_CARD" | "BANK_TRANSFER" {
  const s = typeof raw === "string" ? raw.trim().toUpperCase().replace(/-/g, "_") : "";
  if (s === "BANK_TRANSFER") return "BANK_TRANSFER";
  return "SIMULATED_CARD";
}

function parsePaymentReference(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim().slice(0, 96);
  return t.length ? t : undefined;
}

function mergeProfile(raw: ClientProfile | undefined): ClientProfile {
  const base = emptyClientProfile();
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    documents: Array.isArray(raw.documents) ? raw.documents : []
  };
}

function profileCompletionPct(profile: ClientProfile, fullName: string, email: string, kycApproved: boolean): number {
  const checks = [
    !!(fullName && fullName.trim()),
    !!(email && email.trim()),
    !!(profile.phone && profile.phone.trim()),
    !!(profile.dateOfBirth && profile.dateOfBirth.trim()),
    !!(profile.street && profile.street.trim()),
    !!(profile.city && profile.city.trim()),
    !!(profile.stateRegion && profile.stateRegion.trim()),
    !!(profile.postalCode && profile.postalCode.trim()),
    !!(profile.country && profile.country.trim()),
    !!(profile.occupation && profile.occupation.trim()),
    profile.documents.length >= 2,
    kycApproved
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

const ALLOWED_KYC_DOC: readonly KycDocumentType[] = ["PASSPORT", "NATIONAL_ID", "DRIVERS_LICENSE"];

const ALLOWED_FILE_KINDS: ClientDocumentKind[] = ["GOVT_ID", "PROOF_OF_ADDRESS", "SELFIE", "OTHER"];

function readProfilePayload(ctx: AppContext, userId: string | undefined, accountId: string | undefined) {
  if (!userId || !accountId) return null;
  const s = ctx.store.get();
  const user = s.clientUsers.find((u) => u.id === userId);
  if (!user || user.accountId !== accountId) return null;
  const trader = s.traders.find((t) => t.accountId === accountId);
  const merged = mergeProfile(s.clientProfilesByAccountId[accountId]);
  const kycApproved = trader?.kycStatus === "APPROVED";
  return {
    email: user.email,
    fullName: user.fullName,
    phone: merged.phone,
    dateOfBirth: merged.dateOfBirth,
    street: merged.street,
    city: merged.city,
    stateRegion: merged.stateRegion,
    postalCode: merged.postalCode,
    country: merged.country,
    occupation: merged.occupation,
    documents: merged.documents,
    kycStatus: trader?.kycStatus ?? "PENDING",
    profileCompletionPct: profileCompletionPct(merged, user.fullName, user.email, !!kycApproved)
  };
}

export function registerClientRoutes(app: Express, ctx: AppContext): void {
  app.get("/client/profile", requireBearerAuth, (req, res) => {
    const a = req as AuthedRequest;
    const payload = readProfilePayload(ctx, a.actorUserId, a.actorAccountId);
    if (!payload) return res.status(403).json({ error: "Forbidden." });
    return res.json(payload);
  });

  app.patch("/client/profile", requireBearerAuth, (req, res) => {
    const a = req as AuthedRequest;
    const uid = a.actorUserId!;
    const aid = a.actorAccountId!;
    const s0 = ctx.store.get();
    const user0 = s0.clientUsers.find((u) => u.id === uid);
    if (!user0 || user0.accountId !== aid) return res.status(403).json({ error: "Forbidden." });

    const b = req.body ?? {};
    ctx.store.update((s) => {
      const user = s.clientUsers.find((u) => u.id === uid);
      if (!user) return;
      if (typeof b.fullName === "string") {
        const n = b.fullName.trim();
        if (n) user.fullName = n;
      }
      const prof = mergeProfile(s.clientProfilesByAccountId[aid]);
      if (typeof b.phone === "string") prof.phone = String(b.phone).trim();
      if (typeof b.dateOfBirth === "string") prof.dateOfBirth = String(b.dateOfBirth).trim();
      if (typeof b.street === "string") prof.street = String(b.street).trim();
      if (typeof b.city === "string") prof.city = String(b.city).trim();
      if (typeof b.stateRegion === "string") prof.stateRegion = String(b.stateRegion).trim();
      if (typeof b.postalCode === "string") prof.postalCode = String(b.postalCode).trim();
      if (typeof b.country === "string") prof.country = String(b.country).trim().slice(0, 96);
      if (typeof b.occupation === "string") prof.occupation = String(b.occupation).trim();
      s.clientProfilesByAccountId[aid] = prof;

      const trader = s.traders.find((t) => t.accountId === aid);
      if (trader) {
        trader.name = user.fullName;
        trader.email = user.email;
        if (prof.country) trader.country = prof.country.slice(0, 96);
      }
    });

    ctx.auditService.log("client.profile.updated", { accountId: aid }, uid, aid);
    const payload = readProfilePayload(ctx, uid, aid);
    if (!payload) return res.status(500).json({ error: "Update failed." });
    return res.json(payload);
  });

  app.get("/client/kyc", requireBearerAuth, (req, res) => {
    const a = req as AuthedRequest;
    const aid = a.actorAccountId!;
    const user = ctx.store.get().clientUsers.find((u) => u.id === a.actorUserId);
    if (!user || user.accountId !== aid) return res.status(403).json({ error: "Forbidden." });
    const s = ctx.store.get();
    const cases = s.kycCases.filter((k) => k.accountId === aid).sort((x, y) => y.submittedAt - x.submittedAt);
    const trader = s.traders.find((t) => t.accountId === aid);
    return res.json({
      kycStatus: trader?.kycStatus ?? "PENDING",
      cases
    });
  });

  app.post("/client/kyc/submit", requireBearerAuth, (req, res) => {
    const a = req as AuthedRequest;
    const aid = a.actorAccountId!;
    const user = ctx.store.get().clientUsers.find((u) => u.id === a.actorUserId);
    if (!user || user.accountId !== aid) return res.status(403).json({ error: "Forbidden." });

    const docType = String(req.body?.documentType ?? "");
    if (!ALLOWED_KYC_DOC.includes(docType as KycDocumentType))
      return res.status(400).json({ error: "documentType must be PASSPORT, NATIONAL_ID, or DRIVERS_LICENSE." });

    const pre = ctx.store.get().traders.find((t) => t.accountId === aid);
    if (pre?.kycStatus === "APPROVED")
      return res.status(400).json({ error: "KYC is already approved for this account." });

    const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() : "";
    let wasNew = false;
    ctx.store.update((s) => {
      const pending = s.kycCases.filter((c) => c.accountId === aid && c.status === "PENDING").sort((x, y) => y.submittedAt - x.submittedAt)[0];
      if (pending) {
        pending.documentType = docType as KycDocumentType;
        pending.notes = notes;
        pending.submittedAt = Date.now();
      } else {
        wasNew = true;
        s.kycCases.push({
          id: `kyc-${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`,
          accountId: aid,
          submittedAt: Date.now(),
          status: "PENDING",
          documentType: docType as KycDocumentType,
          notes
        });
      }
      const trader = s.traders.find((t) => t.accountId === aid);
      if (trader && trader.kycStatus !== "APPROVED") trader.kycStatus = "PENDING";
    });

    ctx.auditService.log("client.kyc.submitted", { documentType: docType }, a.actorUserId!, aid);
    return res.status(wasNew ? 201 : 200).json({ ok: true });
  });

  app.post("/client/documents/demo-upload", requireBearerAuth, (req, res) => {
    const a = req as AuthedRequest;
    const aid = a.actorAccountId!;
    const user = ctx.store.get().clientUsers.find((u) => u.id === a.actorUserId);
    if (!user || user.accountId !== aid) return res.status(403).json({ error: "Forbidden." });

    const kindRaw = String(req.body?.kind ?? "OTHER");
    if (!ALLOWED_FILE_KINDS.includes(kindRaw as ClientDocumentKind))
      return res.status(400).json({ error: "kind must be GOVT_ID, PROOF_OF_ADDRESS, SELFIE, or OTHER." });
    const filename =
      typeof req.body?.filename === "string" && req.body.filename.trim()
        ? req.body.filename.trim().slice(0, 240)
        : `document-${Date.now()}.pdf`;

    ctx.store.update((s) => {
      const prof = mergeProfile(s.clientProfilesByAccountId[aid]);
      prof.documents.push({
        id: crypto.randomUUID(),
        filename,
        kind: kindRaw as ClientDocumentKind,
        uploadedAt: Date.now()
      });
      s.clientProfilesByAccountId[aid] = prof;
    });

    ctx.auditService.log("client.document.demo_upload", { filename, kind: kindRaw }, a.actorUserId!, aid);
    const payload = readProfilePayload(ctx, a.actorUserId, aid);
    return res.status(201).json(payload ?? { ok: true });
  });

  app.get("/client/checkout/bank-transfer-info", requireBearerAuth, (_req, res) => {
    return res.json(getBankTransferCheckoutInfo());
  });

  app.get("/client/packages/catalog", requireBearerAuth, (_req, res) => {
    const presets = listProgramSignupOptions();
    return res.json(
      presets.map((p) => ({
        slug: p.slug,
        templateId: p.templateId,
        simulatedBalanceUsd: p.simulatedBalanceUsd,
        packageTypeLabel: p.packageTypeLabel,
        priceUsd: p.priceUsd,
        tagline: p.tagline ?? null,
        instantFundedPassthrough: !!p.instantFundedPassthrough,
        family: p.family ?? null
      }))
    );
  });

  app.get("/client/packages/dashboard-summaries", requireBearerAuth, (req, res) => {
    const a = req as AuthedRequest;
    const uid = a.actorUserId!;
    const terminals = ctx.terminalAccountService.listForUser(uid);
    const state = ctx.store.get();
    const rows = terminals
      .map((t) => {
        const summary = computeTradingAccountSummary(state, t.accountId);
        if (!summary) return null;
        return {
          terminalAccountId: t.id,
          login: t.login,
          packageLabel: t.packageLabel,
          programSlug: t.programSlug,
          ...summary
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
    return res.json(rows);
  });

  app.post("/client/packages/purchase", requireBearerAuth, async (req, res) => {
    const a = req as AuthedRequest;
    const uid = a.actorUserId!;
    const slugRaw = typeof req.body?.programSlug === "string" ? req.body.programSlug : "";
    const slugUpper = slugRaw.trim().toUpperCase();
    if (!slugUpper || !PROGRAM_SIGNUP_PRESETS[slugUpper.split(":")[0] ?? ""]) {
      return res.status(400).json({ error: "programSlug is required and must be a known SKU." });
    }
    const preset = resolveSignupProgramSlug(slugUpper);
    const paymentMethod = parsePurchasePaymentMethod(req.body?.paymentMethod);
    const paymentReference = parsePaymentReference(req.body?.paymentReference);

    const s0 = ctx.store.get();
    const owner = s0.clientUsers.find((u) => u.id === uid);
    if (!owner) return res.status(403).json({ error: "Forbidden." });
    const traderRow = s0.traders.find((t) => t.accountId === owner.accountId);

    const newAccountId = `acct-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
    const now = Date.now();
    const balance = preset.simulatedBalanceUsd;
    const progress = buildStarterProgress({
      accountId: newAccountId,
      templateId: preset.templateId,
      balance,
      nowMs: now,
      instantFundedPassthrough: preset.instantFundedPassthrough
    });

    ctx.store.update((s) => {
      s.ledgerByAccountId[newAccountId] = {
        balance,
        equity: balance,
        usedMargin: 0,
        freeMargin: balance,
        leverage: 100
      };
      s.progressByAccountId[newAccountId] = progress;
      s.clientProfilesByAccountId[newAccountId] = emptyClientProfile();
      s.traders.push({
        accountId: newAccountId,
        name: owner.fullName,
        email: owner.email,
        country: traderRow?.country ?? "—",
        packageType: preset.packageTypeLabel,
        kycStatus: traderRow?.kycStatus ?? "PENDING",
        accountStatus: "ACTIVE"
      });
    });

    const { summary, initialPassword } = await ctx.terminalAccountService.createForClient({
      ownerUserId: uid,
      accountId: newAccountId,
      programSlug: slugUpper,
      packageLabel: preset.packageTypeLabel
    });

    ctx.auditService.log(
      "client.package.purchased",
      {
        programSlug: slugUpper,
        newAccountId,
        terminalAccountId: summary.id,
        paymentMethod,
        ...(paymentReference ? { paymentReference } : {})
      },
      uid,
      newAccountId
    );

    return res.status(201).json({
      ok: true,
      paymentMethod,
      accountId: newAccountId,
      terminal: summary,
      initialTerminal: {
        login: summary.login,
        initialPassword,
        terminalAccountId: summary.id,
        packageLabel: summary.packageLabel
      }
    });
  });

  app.get("/client/support-tickets", requireBearerAuth, (req, res) => {
    const a = req as AuthedRequest;
    const aid = a.actorAccountId!;
    const uid = a.actorUserId!;
    const s = ctx.store.get();
    const rows = s.supportTickets.filter((t) => t.accountId === aid && t.clientUserId === uid).sort((x, y) => y.createdAt - x.createdAt);
    res.json(rows);
  });

  app.post("/client/support-tickets", requireBearerAuth, (req, res) => {
    const a = req as AuthedRequest;
    const aid = a.actorAccountId!;
    const uid = a.actorUserId!;
    const typ = String(req.body?.type ?? "");
    if (typ !== "RULE_APPEAL" && typ !== "EVALUATION_RESET")
      return res.status(400).json({ error: "type must be RULE_APPEAL or EVALUATION_RESET." });
    const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 240) : "";
    const body = typeof req.body?.body === "string" ? req.body.body.trim().slice(0, 8000) : "";
    if (!title || !body) return res.status(400).json({ error: "title and body are required." });

    let created: SupportTicket | null = null;
    ctx.store.update((s) => {
      const dup = s.supportTickets.some(
        (t) => t.accountId === aid && t.clientUserId === uid && t.status === "OPEN" && t.type === typ
      );
      if (dup) return;
      const ticket: SupportTicket = {
        id: crypto.randomUUID(),
        accountId: aid,
        clientUserId: uid,
        type: typ as SupportTicket["type"],
        title,
        body,
        status: "OPEN",
        createdAt: Date.now()
      };
      created = ticket;
      s.supportTickets.push(ticket);
    });
    if (!created) return res.status(409).json({ error: "You already have an open ticket of this type." });
    ctx.auditService.log("client.support_ticket.created", { type: typ }, uid, aid);
    return res.status(201).json(created);
  });
}
