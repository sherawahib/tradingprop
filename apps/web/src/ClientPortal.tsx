import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Coins,
  Copy,
  Download,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Mail,
  MonitorDown,
  Package,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Terminal,
  TicketCheck,
  Trash2,
  User,
  Wallet,
  X
} from "lucide-react";
import type { PayoutRequest } from "@paper-trader/shared";
import {
  API_BASE,
  apiListPackageCatalog,
  apiListPackageDashboardSummaries,
  apiListTerminalAccounts,
  apiPurchasePackage,
  apiRegenerateTerminalPassword,
  apiSetTerminalPassword,
  bearerHeaders,
  jsonAuthHeaders,
  takeFreshTerminalCreds,
  type InitialTerminalCredentials,
  type PackageCatalogEntry,
  type PackageDashboardSummary,
  type PackageProgramFamily,
  type TerminalAccountSummary
} from "./clientAuth";
import CheckoutModal from "./CheckoutModal";
import { formatChallengeStatusLabel } from "./challengeUi";
import type { MarketingSubView } from "./marketingTypes";

interface ClientPortalProps {
  accountId: string;
  onBackHome: () => void;
  onOpenMarketingPage: (page: MarketingSubView) => void;
  onOpenTerminal: () => void;
  onLogout: () => void;
}

type Tab = "overview" | "trading-accounts" | "catalog" | "profile" | "payouts" | "support";

interface ProfilePayload {
  email: string;
  fullName: string;
  phone: string;
  dateOfBirth: string;
  street: string;
  city: string;
  stateRegion: string;
  postalCode: string;
  country: string;
  occupation: string;
  documents: Array<{ id: string; filename: string; kind: string; uploadedAt: number }>;
  kycStatus: "PENDING" | "APPROVED" | "REJECTED";
  profileCompletionPct: number;
}

interface SupportTicketRow {
  id: string;
  type: "RULE_APPEAL" | "EVALUATION_RESET";
  title: string;
  body: string;
  status: "OPEN" | "RESOLVED_APPROVE" | "RESOLVED_REJECT";
  createdAt: number;
  resolvedAt?: number;
  resolutionNote?: string;
}

/** Display order + labels for catalog families, mirroring `ProgramsPage`. */
const FAMILY_ORDER: PackageProgramFamily[] = [
  "ONE_PHASE",
  "TWO_PHASE",
  "THREE_PHASE",
  "INSTANT_FUNDING",
  "LIGHTNING",
  "HEURISTIC"
];

const FAMILY_LABEL: Record<PackageProgramFamily, string> = {
  ONE_PHASE: "One Phase",
  TWO_PHASE: "Two Phase",
  THREE_PHASE: "Three Phase",
  INSTANT_FUNDING: "Instant Funding",
  LIGHTNING: "Lightning",
  HEURISTIC: "Heuristic alternates"
};

const FAMILY_BLURB: Record<PackageProgramFamily, string> = {
  ONE_PHASE: "Single evaluation cycle. Faster path than multi-phase routes.",
  TWO_PHASE: "Two-step evaluation. The industry-standard path to a funded desk.",
  THREE_PHASE: "Progressive checkpoints across three milestones.",
  INSTANT_FUNDING: "Skip evaluation — start directly on a live-style desk.",
  LIGHTNING: "Low-fee, fast-turn challenges. Great for skill checks.",
  HEURISTIC: "FTMO / FXIFY-flavoured rule packs for comparison testing."
};

function groupCatalogByFamily(catalog: PackageCatalogEntry[]): Array<{
  family: PackageProgramFamily | "OTHER";
  label: string;
  blurb: string;
  items: PackageCatalogEntry[];
}> {
  const buckets = new Map<string, PackageCatalogEntry[]>();
  for (const c of catalog) {
    const k = c.family ?? "OTHER";
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(c);
  }
  const order: Array<PackageProgramFamily | "OTHER"> = [...FAMILY_ORDER, "OTHER"];
  return order
    .filter((f) => buckets.has(f))
    .map((f) => ({
      family: f,
      label: f === "OTHER" ? "Other" : FAMILY_LABEL[f],
      blurb: f === "OTHER" ? "" : FAMILY_BLURB[f],
      items: (buckets.get(f) ?? []).sort((a, b) => a.simulatedBalanceUsd - b.simulatedBalanceUsd)
    }));
}

function generatePassword(len = 14): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz!@#$%^&*";
  const arr = new Uint32Array(len);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  }
  let out = "";
  for (let i = 0; i < len; i++) {
    const v = arr[i] ?? Math.floor(Math.random() * 0xffffffff);
    out += chars[v % chars.length];
  }
  return out;
}

export default function ClientPortal({ accountId, onBackHome, onOpenMarketingPage, onOpenTerminal, onLogout }: ClientPortalProps) {
  const [tab, setTab] = useState<Tab>("overview");
  const [terminals, setTerminals] = useState<TerminalAccountSummary[]>([]);
  const [packageSummaries, setPackageSummaries] = useState<PackageDashboardSummary[]>([]);
  const [catalog, setCatalog] = useState<PackageCatalogEntry[]>([]);
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successBanner, setSuccessBanner] = useState("");
  const [pendingCheckoutPkg, setPendingCheckoutPkg] = useState<PackageCatalogEntry | null>(null);
  const [freshCreds, setFreshCreds] = useState<InitialTerminalCredentials | null>(null);
  const [revealedPasswordByTerminalId, setRevealedPasswordByTerminalId] = useState<Record<string, string>>({});
  const [resetDraftByTerminalId, setResetDraftByTerminalId] = useState<Record<string, { mode: "auto" | "custom"; custom: string; busy: boolean }>>({});
  const [profileDraft, setProfileDraft] = useState<Partial<ProfilePayload>>({});
  const [profileBusy, setProfileBusy] = useState(false);
  const [kycDocType, setKycDocType] = useState<"PASSPORT" | "NATIONAL_ID" | "DRIVERS_LICENSE">("PASSPORT");
  const [kycNotes, setKycNotes] = useState("");
  const [ticketType, setTicketType] = useState<"RULE_APPEAL" | "EVALUATION_RESET">("RULE_APPEAL");
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketBody, setTicketBody] = useState("");
  const [expandedSummaryId, setExpandedSummaryId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [t, ps, pkgs, p, pay, tk] = await Promise.all([
        apiListTerminalAccounts().catch(() => []),
        apiListPackageDashboardSummaries().catch(() => []),
        apiListPackageCatalog().catch(() => []),
        fetch(`${API_BASE}/client/profile`, { headers: bearerHeaders() }).then(async (r) => (r.ok ? (r.json() as Promise<ProfilePayload>) : null)),
        fetch(`${API_BASE}/payouts`, { headers: bearerHeaders() }).then(async (r) => (r.ok ? (r.json() as Promise<PayoutRequest[]>) : [])),
        fetch(`${API_BASE}/client/support-tickets`, { headers: bearerHeaders() }).then(async (r) => (r.ok ? (r.json() as Promise<SupportTicketRow[]>) : []))
      ]);
      setTerminals(t);
      setPackageSummaries(ps);
      setCatalog(pkgs);
      setProfile(p);
      setProfileDraft(p ?? {});
      setPayouts(pay);
      setTickets(tk);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not refresh portal data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const fresh = takeFreshTerminalCreds();
    if (fresh) setFreshCreds(fresh);
  }, [reload]);

  const ownPackageCount = packageSummaries.length;
  const totalEquity = useMemo(() => packageSummaries.reduce((s, p) => s + (p.equity || 0), 0), [packageSummaries]);
  const totalProfit = useMemo(() => packageSummaries.reduce((s, p) => s + (p.ledgerProfitUsd || 0), 0), [packageSummaries]);

  async function handlePurchase(slug: string): Promise<void> {
    const result = await apiPurchasePackage(slug);
    setFreshCreds(result.initialTerminal);
    setSuccessBanner(`Package activated. Trading login ${result.initialTerminal.login} ready to use.`);
    await reload();
    setTab("trading-accounts");
  }

  async function copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setSuccessBanner("Copied to clipboard.");
      setTimeout(() => setSuccessBanner((b) => (b === "Copied to clipboard." ? "" : b)), 1500);
    } catch {
      window.prompt("Copy:", text);
    }
  }

  async function applyTerminalPassword(terminalId: string): Promise<void> {
    const draft = resetDraftByTerminalId[terminalId];
    if (!draft) return;
    setResetDraftByTerminalId((p) => ({ ...p, [terminalId]: { ...draft, busy: true } }));
    try {
      if (draft.mode === "auto") {
        const { password, terminal } = await apiRegenerateTerminalPassword(terminalId);
        setRevealedPasswordByTerminalId((p) => ({ ...p, [terminalId]: password }));
        setTerminals((prev) => prev.map((t) => (t.id === terminal.id ? terminal : t)));
        setSuccessBanner(`New password ready for ${terminal.login}.`);
      } else {
        if (draft.custom.length < 8) {
          setError("Custom password must be at least 8 characters.");
          return;
        }
        const { terminal } = await apiSetTerminalPassword(terminalId, draft.custom);
        setRevealedPasswordByTerminalId((p) => ({ ...p, [terminalId]: draft.custom }));
        setTerminals((prev) => prev.map((t) => (t.id === terminal.id ? terminal : t)));
        setSuccessBanner(`Custom password applied for ${terminal.login}.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Password change failed.");
    } finally {
      setResetDraftByTerminalId((p) => ({ ...p, [terminalId]: { ...(p[terminalId] ?? { mode: "auto", custom: "" }), busy: false } }));
    }
  }

  function setDraft(terminalId: string, partial: Partial<{ mode: "auto" | "custom"; custom: string }>): void {
    setResetDraftByTerminalId((p) => {
      const cur = p[terminalId] ?? { mode: "auto", custom: "", busy: false };
      return { ...p, [terminalId]: { ...cur, ...partial } };
    });
  }

  async function saveProfile(): Promise<void> {
    setProfileBusy(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/client/profile`, {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(profileDraft)
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Update failed.");
      const next = (await res.json()) as ProfilePayload;
      setProfile(next);
      setProfileDraft(next);
      setSuccessBanner("Profile saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Profile update failed.");
    } finally {
      setProfileBusy(false);
    }
  }

  async function submitKyc(): Promise<void> {
    setError("");
    try {
      const res = await fetch(`${API_BASE}/client/kyc/submit`, {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ documentType: kycDocType, notes: kycNotes })
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Submission failed.");
      setSuccessBanner("KYC submitted.");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "KYC submit failed.");
    }
  }

  async function requestPayout(targetAccountId: string): Promise<void> {
    setError("");
    try {
      const res = await fetch(`${API_BASE}/payouts/request`, {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ accountId: targetAccountId })
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Payout request failed.");
      setSuccessBanner("Payout requested.");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payout request failed.");
    }
  }

  async function fileTicket(): Promise<void> {
    setError("");
    if (!ticketTitle.trim() || !ticketBody.trim()) {
      setError("Title and body are required.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/client/support-tickets`, {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ type: ticketType, title: ticketTitle, body: ticketBody })
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Could not file ticket.");
      setSuccessBanner("Support ticket filed.");
      setTicketTitle("");
      setTicketBody("");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ticket failed.");
    }
  }

  return (
    <div className="fxRoot fxPortalRoot">
      <div className="fxAnnBar">
        <div className="fxAnnInner">
          <span className="fxAnnTag">Portal</span>
          <span className="fxAnnText">
            Manage packages, terminal logins, payouts, KYC, and support — all in one dashboard.
          </span>
          <button type="button" className="fxAnnCta" onClick={() => void reload()} disabled={loading}>
            <RefreshCw size={14} aria-hidden="true" className={loading ? "fxPortalSpin" : undefined} />
            Refresh
          </button>
        </div>
      </div>

      <header className="fxShellNav">
        <div className="fxShellNavInner">
          <button type="button" className="fxLogoBtn" onClick={onBackHome}>
            <div className="fxLogoRow">
              <span className="fxLogoMark" aria-hidden="true" />
              <strong className="fxLogoWord">PropPrime</strong>
            </div>
          </button>
          <nav className="fxNavCenter" aria-label="Portal">
            <span className="fxNavLink fxNavLinkActive">Client portal</span>
          </nav>
          <div className="fxNavActions">
            <button type="button" className="fxLinkBtn" onClick={() => onOpenMarketingPage("programs")}>Programs</button>
            <button type="button" className="fxLinkBtn" onClick={() => onOpenMarketingPage("payouts")}>Payouts</button>
            <button type="button" className="fxCtaOutline" onClick={onOpenTerminal}>
              <Terminal size={14} aria-hidden="true" /> Open terminal
            </button>
            <button type="button" className="fxCtaFilled fxPortalLogout" onClick={onLogout}>
              <LogOut size={14} aria-hidden="true" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="fxSite fxPortalSite">
        {error && (
          <div className="fxPortalBanner fxPortalBannerErr" role="alert">
            <AlertTriangle size={16} aria-hidden="true" /> {error}
            <button type="button" className="fxPortalBannerClose" onClick={() => setError("")} aria-label="Dismiss">
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}
        {successBanner && (
          <div className="fxPortalBanner fxPortalBannerOk" role="status">
            <CheckCircle2 size={16} aria-hidden="true" /> {successBanner}
            <button type="button" className="fxPortalBannerClose" onClick={() => setSuccessBanner("")} aria-label="Dismiss">
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}
        {freshCreds && (
          <section className="fxPortalCredsBanner" role="region" aria-label="Fresh trading credentials">
            <div className="fxPortalCredsHeader">
              <Sparkles size={20} aria-hidden="true" />
              <div>
                <h3 className="fxPortalCredsTitle">New trading account ready</h3>
                <p className="fxPortalCredsSubtitle">{freshCreds.packageLabel}</p>
              </div>
              <button type="button" className="fxPortalBannerClose" onClick={() => setFreshCreds(null)} aria-label="Dismiss">
                <X size={14} aria-hidden="true" />
              </button>
            </div>
            <dl className="fxPortalCredsBody">
              <div>
                <dt>Numeric login</dt>
                <dd>
                  <code className="fxPortalCode">{freshCreds.login}</code>
                  <button type="button" className="fxIconBtn" title="Copy login" onClick={() => void copyText(freshCreds.login)}>
                    <ClipboardCopy size={14} aria-hidden="true" />
                  </button>
                </dd>
              </div>
              <div>
                <dt>Initial password</dt>
                <dd>
                  <code className="fxPortalCode">{freshCreds.initialPassword}</code>
                  <button type="button" className="fxIconBtn" title="Copy password" onClick={() => void copyText(freshCreds.initialPassword)}>
                    <ClipboardCopy size={14} aria-hidden="true" />
                  </button>
                </dd>
              </div>
            </dl>
            <p className="fxPortalCredsHint">
              Use these credentials in the trading terminal. Rotate the password from{" "}
              <button type="button" className="fxLinkBtn" onClick={() => setTab("trading-accounts")}>Trading accounts</button>
              .
            </p>
          </section>
        )}

        <nav className="fxPortalTabs" role="tablist">
          {([
            { id: "overview" as Tab, label: "Overview", icon: LayoutDashboard },
            { id: "trading-accounts" as Tab, label: "Trading accounts", icon: Terminal },
            { id: "catalog" as Tab, label: "Buy package", icon: Package },
            { id: "profile" as Tab, label: "Profile / KYC", icon: User },
            { id: "payouts" as Tab, label: "Payouts", icon: BadgeDollarSign },
            { id: "support" as Tab, label: "Support", icon: TicketCheck }
          ] as Array<{ id: Tab; label: string; icon: typeof LayoutDashboard }>).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`fxPortalTab${tab === t.id ? " fxPortalTabActive" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={14} aria-hidden="true" />
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "overview" && (
          <section className="fxPortalSection">
            <header className="fxSectionHeaderRow">
              <div>
                <p className="fxEyebrow">Overview</p>
                <h2 className="fxTitleContrast">Per-package performance</h2>
                <p className="fxPortalMuted">Each purchased package keeps its own ledger, challenge progress, and login.</p>
              </div>
              {ownPackageCount > 0 && (
                <button type="button" className="fxCtaOutline" onClick={() => setTab("catalog")}>
                  Buy another package <ArrowRight size={14} aria-hidden="true" />
                </button>
              )}
            </header>

            <div className="fxPortalKpiGrid">
              <article className="fxPortalStatCard">
                <Wallet size={20} aria-hidden="true" />
                <p className="fxPortalStatLabel">Combined equity</p>
                <p className="fxPortalStatValue">${totalEquity.toFixed(2)}</p>
                <p className="fxPortalStatHint">{ownPackageCount} package{ownPackageCount === 1 ? "" : "s"}</p>
              </article>
              <article className="fxPortalStatCard">
                <Coins size={20} aria-hidden="true" />
                <p className="fxPortalStatLabel">Combined profit</p>
                <p className={"fxPortalStatValue" + (totalProfit >= 0 ? " fxPortalStatPos" : " fxPortalStatNeg")}>
                  ${totalProfit.toFixed(2)}
                </p>
                <p className="fxPortalStatHint">Across all packages</p>
              </article>
              <article className="fxPortalStatCard">
                <ShieldCheck size={20} aria-hidden="true" />
                <p className="fxPortalStatLabel">KYC status</p>
                <p className="fxPortalStatValue">{profile?.kycStatus ?? "—"}</p>
                <p className="fxPortalStatHint">Profile {profile?.profileCompletionPct ?? 0}% complete</p>
              </article>
              <article className="fxPortalStatCard">
                <Activity size={20} aria-hidden="true" />
                <p className="fxPortalStatLabel">Open positions</p>
                <p className="fxPortalStatValue">{packageSummaries.reduce((s, p) => s + p.openPositions, 0)}</p>
                <p className="fxPortalStatHint">Across all packages</p>
              </article>
            </div>

            <DesktopAppDownloadCard />

            {ownPackageCount === 0 ? (
              <div className="fxPortalEmptyHero">
                <Package size={32} aria-hidden="true" />
                <h3>No packages yet</h3>
                <p>Purchase a trading package to receive a numeric terminal login and start trading.</p>
                <button type="button" className="fxCtaFilled" onClick={() => setTab("catalog")}>
                  Browse packages <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div className="fxPortalPkgGrid">
                {packageSummaries.map((p) => {
                  const expanded = expandedSummaryId === p.terminalAccountId;
                  return (
                    <article key={p.terminalAccountId} className="fxPortalPkgCard">
                      <header className="fxPortalPkgHead">
                        <div>
                          <p className="fxEyebrow fxEyebrowLight">{p.programSlug}</p>
                          <h3 className="fxPortalPkgTitle">{p.packageLabel}</h3>
                          <p className="fxPortalMuted">
                            Login <code className="fxPortalCode">{p.login}</code> · Account{" "}
                            <code className="fxPortalCode">{p.accountId}</code>
                          </p>
                        </div>
                        <span className={`fxPortalPhasePill fxPortalPhasePill--${p.phase.toLowerCase()}`}>
                          {p.phase} · {formatChallengeStatusLabel(p.phase, p.challengeStatus)}
                        </span>
                      </header>
                      <dl className="fxPortalPkgKpis">
                        <div>
                          <dt>Balance</dt>
                          <dd>${p.balance.toFixed(2)}</dd>
                        </div>
                        <div>
                          <dt>Equity</dt>
                          <dd>${p.equity.toFixed(2)}</dd>
                        </div>
                        <div>
                          <dt>Profit</dt>
                          <dd className={(p.ledgerProfitUsd ?? 0) >= 0 ? "fxPortalStatPos" : "fxPortalStatNeg"}>
                            ${(p.ledgerProfitUsd ?? 0).toFixed(2)}
                          </dd>
                        </div>
                        <div>
                          <dt>Trading days</dt>
                          <dd>{p.tradingDays}</dd>
                        </div>
                        <div>
                          <dt>Open positions</dt>
                          <dd>{p.openPositions}</dd>
                        </div>
                        <div>
                          <dt>Free margin</dt>
                          <dd>${p.freeMargin.toFixed(2)}</dd>
                        </div>
                      </dl>
                      <button
                        type="button"
                        className="fxLinkBtn fxPortalPkgExpand"
                        onClick={() => setExpandedSummaryId(expanded ? null : p.terminalAccountId)}
                      >
                        {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                        {expanded ? "Hide details" : "More details"}
                      </button>
                      {expanded && (
                        <dl className="fxPortalPkgKpis fxPortalPkgKpisExtra">
                          <div>
                            <dt>Program</dt>
                            <dd>{p.programName ?? "—"}</dd>
                          </div>
                          <div>
                            <dt>Payout split</dt>
                            <dd>{p.payoutSplitPct ?? "—"}%</dd>
                          </div>
                          <div>
                            <dt>Min profit for payout</dt>
                            <dd>${(p.payoutMinProfitUsd ?? 0).toFixed(2)}</dd>
                          </div>
                          <div>
                            <dt>Qualifying days</dt>
                            <dd>{p.qualifyingTradingDays ?? 0}</dd>
                          </div>
                          <div>
                            <dt>Calendar days elapsed</dt>
                            <dd>{p.evaluationCalendarDaysElapsed ?? 0}</dd>
                          </div>
                          <div>
                            <dt>Payout-eligible</dt>
                            <dd>{p.payoutEligibleApprox ? "Yes" : "Not yet"}</dd>
                          </div>
                        </dl>
                      )}
                      <div className="fxPortalPkgActions">
                        <button type="button" className="fxCtaOutline" onClick={onOpenTerminal}>
                          <Terminal size={14} aria-hidden="true" /> Open terminal
                        </button>
                        <button type="button" className="fxLinkBtn" onClick={() => setTab("trading-accounts")}>
                          Manage credentials <ArrowRight size={13} aria-hidden="true" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {tab === "trading-accounts" && (
          <section className="fxPortalSection">
            <header className="fxSectionHeaderRow">
              <div>
                <p className="fxEyebrow">Trading accounts</p>
                <h2 className="fxTitleContrast">Per-package terminal logins</h2>
                <p className="fxPortalMuted">
                  Each package has a numeric login and password — these are not your portal credentials.
                </p>
              </div>
              <button type="button" className="fxCtaFilled" onClick={() => setTab("catalog")}>
                <Package size={14} aria-hidden="true" /> Buy another package
              </button>
            </header>

            {terminals.length === 0 ? (
              <p className="fxPortalMuted">No trading accounts yet — buy a package to receive your first numeric login.</p>
            ) : (
              <div className="fxPortalTermList">
                {terminals.map((t) => {
                  const draft = resetDraftByTerminalId[t.id] ?? { mode: "auto" as const, custom: "", busy: false };
                  const revealed = revealedPasswordByTerminalId[t.id];
                  return (
                    <article key={t.id} className="fxPortalTermCard">
                      <header className="fxPortalTermHead">
                        <div>
                          <p className="fxEyebrow fxEyebrowLight">{t.programSlug}</p>
                          <h3 className="fxPortalTermTitle">{t.packageLabel}</h3>
                          <p className="fxPortalMuted">
                            Account <code className="fxPortalCode">{t.accountId}</code> · Status{" "}
                            <strong>{t.status}</strong>
                          </p>
                        </div>
                        <button type="button" className="fxCtaOutline" onClick={onOpenTerminal}>
                          <Terminal size={14} aria-hidden="true" /> Open terminal
                        </button>
                      </header>

                      <div className="fxPortalTermCreds">
                        <div>
                          <span className="fxFieldLabel">Numeric login</span>
                          <div className="fxPortalCredRow">
                            <code className="fxPortalCode fxPortalCodeLg">{t.login}</code>
                            <button type="button" className="fxIconBtn" title="Copy login" onClick={() => void copyText(t.login)}>
                              <Copy size={14} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        <div>
                          <span className="fxFieldLabel">Password</span>
                          <div className="fxPortalCredRow">
                            <code className="fxPortalCode fxPortalCodeLg">{revealed ?? "••••••••••"}</code>
                            {revealed && (
                              <button type="button" className="fxIconBtn" title="Copy password" onClick={() => void copyText(revealed)}>
                                <Copy size={14} aria-hidden="true" />
                              </button>
                            )}
                          </div>
                          {t.mustChangePassword && (
                            <p className="fxPortalHintWarn">First-time login — please rotate the password.</p>
                          )}
                        </div>
                      </div>

                      <div className="fxPortalTermResetCard">
                        <h4 className="fxPortalTermResetTitle">
                          <KeyRound size={14} aria-hidden="true" /> Reset password
                        </h4>
                        <div className="fxPortalTermResetTabs">
                          <button
                            type="button"
                            className={`fxPortalResetTab${draft.mode === "auto" ? " fxPortalResetTabActive" : ""}`}
                            onClick={() => setDraft(t.id, { mode: "auto" })}
                          >
                            Auto-generate
                          </button>
                          <button
                            type="button"
                            className={`fxPortalResetTab${draft.mode === "custom" ? " fxPortalResetTabActive" : ""}`}
                            onClick={() => setDraft(t.id, { mode: "custom" })}
                          >
                            Custom
                          </button>
                        </div>
                        {draft.mode === "auto" ? (
                          <p className="fxPortalMuted fxPortalSmall">
                            We'll roll a strong password and reveal it once on this screen.
                          </p>
                        ) : (
                          <div className="fxPortalCustomPwRow">
                            <input
                              type="text"
                              className="fxAuthInput"
                              value={draft.custom}
                              onChange={(e) => setDraft(t.id, { custom: e.target.value })}
                              placeholder="Min 8 characters"
                              autoComplete="new-password"
                            />
                            <button
                              type="button"
                              className="fxLinkBtn"
                              onClick={() => setDraft(t.id, { custom: generatePassword(14) })}
                            >
                              Suggest
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          className="fxCtaFilled fxPortalApplyBtn"
                          onClick={() => void applyTerminalPassword(t.id)}
                          disabled={draft.busy}
                        >
                          {draft.busy ? "Applying…" : "Apply new password"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {tab === "catalog" && (
          <section className="fxPortalSection">
            <header className="fxSectionHeaderRow">
              <div>
                <p className="fxEyebrow">Catalog</p>
                <h2 className="fxTitleContrast">Buy a trading package</h2>
                <p className="fxPortalMuted">
                  All public-site programs are available below. Each purchase issues its own numeric trading-account
                  login and password — buy as many as you like.
                </p>
              </div>
              <span className="fxPortalChip">{catalog.length} packages</span>
            </header>
            {catalog.length === 0 ? (
              <p className="fxPortalMuted">Catalog is empty — try refreshing.</p>
            ) : (
              <div className="fxPortalCatalogStack">
                {groupCatalogByFamily(catalog).map((group) => (
                  <div key={group.family} className="fxPortalCatalogGroup">
                    <header className="fxPortalCatalogGroupHead">
                      <div>
                        <p className="fxEyebrow fxEyebrowLight">{group.label}</p>
                        {group.blurb && <p className="fxPortalCatalogGroupBlurb">{group.blurb}</p>}
                      </div>
                      <span className="fxPortalCatalogGroupCount">{group.items.length} tiers</span>
                    </header>
                    <div className="fxPortalCatalogGrid">
                      {group.items.map((c) => (
                        <article key={c.slug} className="fxPortalCatalogCard">
                          <p className="fxPortalCatalogTier">${c.simulatedBalanceUsd.toLocaleString()} desk</p>
                          <h3 className="fxPortalCatalogTitle">{c.packageTypeLabel}</h3>
                          {c.tagline && <p className="fxPortalCatalogTagline">{c.tagline}</p>}
                          <ul className="fxPortalCatalogSpecs">
                            <li>
                              <span>Simulated balance</span>
                              <strong>${c.simulatedBalanceUsd.toLocaleString()}</strong>
                            </li>
                            <li>
                              <span>Type</span>
                              <strong>{c.instantFundedPassthrough ? "Instant funded" : "Evaluation"}</strong>
                            </li>
                            <li>
                              <span>Template</span>
                              <strong>
                                <code className="fxPortalCode">{c.templateId}</code>
                              </strong>
                            </li>
                          </ul>
                          <div className="fxPortalCatalogFoot">
                            <p className="fxPortalCatalogPrice">${c.priceUsd.toFixed(0)}</p>
                            <button type="button" className="fxCtaFilled" onClick={() => setPendingCheckoutPkg(c)}>
                              Buy now <ArrowRight size={14} aria-hidden="true" />
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "profile" && (
          <section className="fxPortalSection">
            <header className="fxSectionHeaderRow">
              <div>
                <p className="fxEyebrow">Profile</p>
                <h2 className="fxTitleContrast">Identity &amp; KYC</h2>
                <p className="fxPortalMuted">Keep your details current — required before payouts can settle.</p>
              </div>
            </header>
            {profile ? (
              <div className="fxPortalProfileGrid">
                <article className="fxPortalProfileCard">
                  <h3 className="fxPortalCardTitle">
                    <User size={16} aria-hidden="true" /> Profile
                  </h3>
                  <label className="fxField">
                    <span className="fxFieldLabel">Full name</span>
                    <input
                      className="fxAuthInput"
                      value={profileDraft.fullName ?? ""}
                      onChange={(e) => setProfileDraft((p) => ({ ...p, fullName: e.target.value }))}
                    />
                  </label>
                  <label className="fxField">
                    <span className="fxFieldLabel">Phone</span>
                    <input
                      className="fxAuthInput"
                      value={profileDraft.phone ?? ""}
                      onChange={(e) => setProfileDraft((p) => ({ ...p, phone: e.target.value }))}
                    />
                  </label>
                  <label className="fxField">
                    <span className="fxFieldLabel">Date of birth</span>
                    <input
                      type="date"
                      className="fxAuthInput"
                      value={profileDraft.dateOfBirth ?? ""}
                      onChange={(e) => setProfileDraft((p) => ({ ...p, dateOfBirth: e.target.value }))}
                    />
                  </label>
                  <div className="fxPortalRow2">
                    <label className="fxField">
                      <span className="fxFieldLabel">Country</span>
                      <input
                        className="fxAuthInput"
                        value={profileDraft.country ?? ""}
                        onChange={(e) => setProfileDraft((p) => ({ ...p, country: e.target.value }))}
                      />
                    </label>
                    <label className="fxField">
                      <span className="fxFieldLabel">Occupation</span>
                      <input
                        className="fxAuthInput"
                        value={profileDraft.occupation ?? ""}
                        onChange={(e) => setProfileDraft((p) => ({ ...p, occupation: e.target.value }))}
                      />
                    </label>
                  </div>
                  <label className="fxField">
                    <span className="fxFieldLabel">Street</span>
                    <input
                      className="fxAuthInput"
                      value={profileDraft.street ?? ""}
                      onChange={(e) => setProfileDraft((p) => ({ ...p, street: e.target.value }))}
                    />
                  </label>
                  <div className="fxPortalRow3">
                    <label className="fxField">
                      <span className="fxFieldLabel">City</span>
                      <input
                        className="fxAuthInput"
                        value={profileDraft.city ?? ""}
                        onChange={(e) => setProfileDraft((p) => ({ ...p, city: e.target.value }))}
                      />
                    </label>
                    <label className="fxField">
                      <span className="fxFieldLabel">State / region</span>
                      <input
                        className="fxAuthInput"
                        value={profileDraft.stateRegion ?? ""}
                        onChange={(e) => setProfileDraft((p) => ({ ...p, stateRegion: e.target.value }))}
                      />
                    </label>
                    <label className="fxField">
                      <span className="fxFieldLabel">Postal code</span>
                      <input
                        className="fxAuthInput"
                        value={profileDraft.postalCode ?? ""}
                        onChange={(e) => setProfileDraft((p) => ({ ...p, postalCode: e.target.value }))}
                      />
                    </label>
                  </div>
                  <button type="button" className="fxCtaFilled" onClick={() => void saveProfile()} disabled={profileBusy}>
                    {profileBusy ? "Saving…" : "Save profile"}
                  </button>
                </article>

                <article className="fxPortalProfileCard">
                  <h3 className="fxPortalCardTitle">
                    <ShieldCheck size={16} aria-hidden="true" /> KYC submission
                  </h3>
                  <p className="fxPortalMuted">
                    Current status: <strong>{profile.kycStatus}</strong> · Profile{" "}
                    <strong>{profile.profileCompletionPct}%</strong> complete
                  </p>
                  <label className="fxField">
                    <span className="fxFieldLabel">Document type</span>
                    <select
                      className="fxAuthInput"
                      value={kycDocType}
                      onChange={(e) => setKycDocType(e.target.value as typeof kycDocType)}
                    >
                      <option value="PASSPORT">Passport</option>
                      <option value="NATIONAL_ID">National ID</option>
                      <option value="DRIVERS_LICENSE">Driver's License</option>
                    </select>
                  </label>
                  <label className="fxField">
                    <span className="fxFieldLabel">Notes (optional)</span>
                    <textarea
                      className="fxAuthInput fxPortalTextarea"
                      value={kycNotes}
                      onChange={(e) => setKycNotes(e.target.value)}
                      placeholder="Anything the operator should know"
                    />
                  </label>
                  <button type="button" className="fxCtaOutline" onClick={() => void submitKyc()}>
                    Submit KYC for review
                  </button>
                </article>
              </div>
            ) : (
              <p className="fxPortalMuted">Loading profile…</p>
            )}
          </section>
        )}

        {tab === "payouts" && (
          <section className="fxPortalSection">
            <header className="fxSectionHeaderRow">
              <div>
                <p className="fxEyebrow">Payouts</p>
                <h2 className="fxTitleContrast">Request &amp; review</h2>
                <p className="fxPortalMuted">Payouts are simulated — operators approve in the admin console.</p>
              </div>
            </header>

            <div className="fxPortalPayoutGrid">
              {packageSummaries.map((p) => (
                <article key={p.terminalAccountId} className="fxPortalPayoutCard">
                  <h3 className="fxPortalCardTitle">
                    <BadgeDollarSign size={16} aria-hidden="true" /> {p.packageLabel}
                  </h3>
                  <p className="fxPortalMuted">
                    Account <code className="fxPortalCode">{p.accountId}</code>
                  </p>
                  <ul className="fxPortalCatalogSpecs">
                    <li>
                      <span>Profit</span>
                      <strong>${(p.ledgerProfitUsd ?? 0).toFixed(2)}</strong>
                    </li>
                    <li>
                      <span>Min profit</span>
                      <strong>${(p.payoutMinProfitUsd ?? 0).toFixed(2)}</strong>
                    </li>
                    <li>
                      <span>Eligible (approx)</span>
                      <strong>{p.payoutEligibleApprox ? "Yes" : "No"}</strong>
                    </li>
                  </ul>
                  <button
                    type="button"
                    className="fxCtaFilled"
                    onClick={() => void requestPayout(p.accountId)}
                    disabled={!p.payoutEligibleApprox}
                  >
                    Request payout
                  </button>
                </article>
              ))}
            </div>

            <article className="fxPortalProfileCard">
              <h3 className="fxPortalCardTitle">
                <Mail size={16} aria-hidden="true" /> Recent requests
              </h3>
              {payouts.length === 0 ? (
                <p className="fxPortalMuted">No payout history yet.</p>
              ) : (
                <ul className="fxPortalPayoutList">
                  {payouts.map((p) => (
                    <li key={p.id}>
                      <strong>${p.amount.toFixed(2)}</strong> · {p.status}
                      <span> · {new Date(p.requestedAt).toLocaleString()}</span>
                      <code className="fxPortalCode"> {p.accountId}</code>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        )}

        {tab === "support" && (
          <section className="fxPortalSection">
            <header className="fxSectionHeaderRow">
              <div>
                <p className="fxEyebrow">Support</p>
                <h2 className="fxTitleContrast">Open a ticket</h2>
                <p className="fxPortalMuted">Appeals and reset requests are reviewed by the operator team.</p>
              </div>
            </header>
            <div className="fxPortalSupportGrid">
              <article className="fxPortalProfileCard">
                <h3 className="fxPortalCardTitle">
                  <TicketCheck size={16} aria-hidden="true" /> File a new ticket
                </h3>
                <label className="fxField">
                  <span className="fxFieldLabel">Type</span>
                  <select
                    className="fxAuthInput"
                    value={ticketType}
                    onChange={(e) => setTicketType(e.target.value as typeof ticketType)}
                  >
                    <option value="RULE_APPEAL">Rule appeal</option>
                    <option value="EVALUATION_RESET">Evaluation reset</option>
                  </select>
                </label>
                <label className="fxField">
                  <span className="fxFieldLabel">Title</span>
                  <input className="fxAuthInput" value={ticketTitle} onChange={(e) => setTicketTitle(e.target.value)} />
                </label>
                <label className="fxField">
                  <span className="fxFieldLabel">Body</span>
                  <textarea
                    className="fxAuthInput fxPortalTextarea"
                    value={ticketBody}
                    onChange={(e) => setTicketBody(e.target.value)}
                    placeholder="Describe what happened, attach references where helpful"
                  />
                </label>
                <button type="button" className="fxCtaFilled" onClick={() => void fileTicket()}>
                  File ticket
                </button>
              </article>

              <article className="fxPortalProfileCard">
                <h3 className="fxPortalCardTitle">
                  <Trash2 size={16} aria-hidden="true" /> Existing tickets
                </h3>
                {tickets.length === 0 ? (
                  <p className="fxPortalMuted">No tickets yet.</p>
                ) : (
                  <ul className="fxPortalTicketList">
                    {tickets.map((t) => (
                      <li key={t.id}>
                        <strong>{t.title}</strong> <span className="fxPortalMuted">— {t.type}</span>
                        <p>{t.body}</p>
                        <p className="fxPortalSmall">
                          Status: {t.status}
                          {t.resolutionNote ? ` · note: ${t.resolutionNote}` : ""}
                        </p>
                        <p className="fxPortalSmall">{new Date(t.createdAt).toLocaleString()}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </div>
          </section>
        )}

        <footer className="fxFooterGrid fxFooterTight">
          <div>
            <strong className="fxFooterBrand">PropPrime Client Portal</strong>
            <p className="fxFooterMuted">
              Educational simulation — every dollar shown here is simulated. Trader account id{" "}
              <code className="fxPortalCode">{accountId}</code>.
            </p>
          </div>
          <div className="fxFooterCols fxFooterColsSingle">
            <button type="button" className="fxFooterLink fxFooterBtnAsLink" onClick={onBackHome}>Back to marketing site</button>
            <button type="button" className="fxFooterLink fxFooterBtnAsLink" onClick={onOpenTerminal}>Open trading terminal</button>
          </div>
        </footer>
      </main>

      {pendingCheckoutPkg && (
        <CheckoutModal
          pkg={pendingCheckoutPkg}
          onClose={() => setPendingCheckoutPkg(null)}
          onConfirm={async (slug) => {
            await handlePurchase(slug);
            setPendingCheckoutPkg(null);
          }}
        />
      )}
    </div>
  );
}

interface DesktopManifest {
  available: boolean;
  platform?: string;
  version?: string | null;
  fileName?: string;
  sizeBytes?: number;
  modifiedAt?: number;
  downloadUrl?: string;
  message?: string;
}

/**
 * Card on the portal Overview tab that surfaces the Windows desktop
 * installer. Reads `/downloads/desktop/manifest` for version + file size
 * and renders a download button that streams the .exe from
 * `/downloads/desktop/windows`. If the installer hasn't been built yet the
 * card shows a clear "build it first" message instead of a broken link.
 */
function DesktopAppDownloadCard() {
  const [manifest, setManifest] = useState<DesktopManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/downloads/desktop/manifest`)
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as DesktopManifest;
        if (cancelled) return;
        setManifest(data);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load installer info.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sizeMb = manifest?.sizeBytes ? (manifest.sizeBytes / (1024 * 1024)).toFixed(1) : null;
  const downloadHref = manifest?.available && manifest.downloadUrl
    ? `${API_BASE}${manifest.downloadUrl}`
    : null;

  return (
    <article className="fxPortalDownloadCard">
      <div className="fxPortalDownloadIcon">
        <MonitorDown size={28} aria-hidden="true" />
      </div>
      <div className="fxPortalDownloadBody">
        <p className="fxEyebrow fxEyebrowLight">Desktop terminal</p>
        <h3 className="fxPortalDownloadTitle">Download for Windows</h3>
        <p className="fxPortalDownloadLead">
          Install the <strong>PropPrime Terminal</strong> Windows app. After it's installed, sign in with the
          numeric trading-account login + password from any package below — each package has its own login.
        </p>
        <ul className="fxPortalDownloadMeta">
          <li>
            <span>Platform</span>
            <strong>Windows · NSIS installer (.exe)</strong>
          </li>
          {manifest?.version && (
            <li>
              <span>Version</span>
              <strong>{manifest.version}</strong>
            </li>
          )}
          {sizeMb && (
            <li>
              <span>Size</span>
              <strong>{sizeMb} MB</strong>
            </li>
          )}
          {manifest?.fileName && (
            <li>
              <span>File</span>
              <strong>
                <code className="fxPortalCode">{manifest.fileName}</code>
              </strong>
            </li>
          )}
        </ul>
      </div>
      <div className="fxPortalDownloadActions">
        {downloadHref ? (
          <a className="fxCtaFilled fxPortalDownloadBtn" href={downloadHref} download>
            <Download size={14} aria-hidden="true" /> Download installer
          </a>
        ) : (
          <button type="button" className="fxCtaFilled fxPortalDownloadBtn" disabled>
            <Download size={14} aria-hidden="true" /> Installer building…
          </button>
        )}
        {!manifest?.available && (
          <p className="fxPortalDownloadHint">
            {error ?? manifest?.message ?? "Installer is being prepared. Refresh in a minute."}
          </p>
        )}
      </div>
    </article>
  );
}
