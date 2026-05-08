import { useEffect, useState } from "react";
import type { AuditEvent, PayoutRequest, ViolationRecord } from "@paper-trader/shared";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  ClipboardList,
  FileCheck2,
  History,
  Lock,
  PiggyBank,
  RefreshCw,
  ScrollText,
  Shield,
  Unlock,
  Users
} from "lucide-react";
import { API_BASE } from "./clientAuth";
import { adminBearerHeaders, adminJsonHeaders, clearAdminAuth, OPS_SIGN_IN_HASH } from "./adminAuth";

const DEMO_ACCOUNT_ID = "demo-user";

interface AdminPortalProps {
  onBackToTerminal: () => void;
  onOperatorLogout: () => void;
}

function AdminPortal({ onBackToTerminal, onOperatorLogout }: AdminPortalProps) {
  const [violations, setViolations] = useState<ViolationRecord[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [audits, setAudits] = useState<AuditEvent[]>([]);
  const [overview, setOverview] = useState<Record<string, number | string>>({});
  const [traders, setTraders] = useState<Array<Record<string, string>>>([]);
  const [kycCases, setKycCases] = useState<Array<Record<string, string | number>>>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(DEMO_ACCOUNT_ID);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(initial = false): Promise<void> {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      async function guardedJson<T>(path: string): Promise<T | null> {
        const res = await fetch(`${API_BASE}${path}`, { headers: adminBearerHeaders() });
        if (res.status === 401 || res.status === 403) {
          clearAdminAuth();
          window.location.hash = OPS_SIGN_IN_HASH;
          return null;
        }
        if (!res.ok) throw new Error("Request rejected.");
        return res.json() as Promise<T>;
      }
      const [v, p, a, o, t, k] = await Promise.all([
        guardedJson<ViolationRecord[]>("/admin/violations"),
        guardedJson<PayoutRequest[]>("/admin/payouts"),
        guardedJson<AuditEvent[]>("/audit-events"),
        guardedJson<Record<string, number | string>>("/admin/overview"),
        guardedJson<Array<Record<string, string>>>("/admin/traders"),
        guardedJson<Array<Record<string, string | number>>>("/admin/kyc-cases")
      ]);
      if (v === null || p === null || a === null || o === null || t === null || k === null) {
        throw new Error("Operator session expired. Sign in again.");
      }
      setViolations(Array.isArray(v) ? v : []);
      setPayouts(Array.isArray(p) ? p : []);
      setAudits(Array.isArray(a) ? a : []);
      setOverview(o && typeof o === "object" ? o : {});
      setTraders(Array.isArray(t) ? t : []);
      setKycCases(Array.isArray(k) ? k : []);
    } catch {
      setError("Could not reach the API. Ensure `apps/api` is running.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load(true);
  }, []);

  async function accountAction(action: "lock" | "unlock" | "reset" | "promote-funded"): Promise<void> {
    const response = await fetch(`${API_BASE}/admin/accounts/${encodeURIComponent(selectedAccountId)}/action`, {
      method: "POST",
      headers: adminJsonHeaders(),
      body: JSON.stringify({ action })
    });
    if (response.status === 401 || response.status === 403) {
      clearAdminAuth();
      window.location.hash = OPS_SIGN_IN_HASH;
      return;
    }
    if (!response.ok) {
      setError((await response.json()).error ?? "Action failed");
      return;
    }
    setError("");
    await load();
  }

  async function reviewPayout(id: string, action: "approve" | "reject"): Promise<void> {
    const response = await fetch(`${API_BASE}/admin/payouts/${encodeURIComponent(id)}/review`, {
      method: "POST",
      headers: adminJsonHeaders(),
      body: JSON.stringify({ action })
    });
    if (response.status === 401 || response.status === 403) {
      clearAdminAuth();
      window.location.hash = OPS_SIGN_IN_HASH;
      return;
    }
    if (!response.ok) {
      setError((await response.json()).error ?? "Review failed");
      return;
    }
    setError("");
    await load();
  }

  async function payPayout(id: string): Promise<void> {
    const response = await fetch(`${API_BASE}/admin/payouts/${encodeURIComponent(id)}/pay`, {
      method: "POST",
      headers: adminBearerHeaders()
    });
    if (response.status === 401 || response.status === 403) {
      clearAdminAuth();
      window.location.hash = OPS_SIGN_IN_HASH;
      return;
    }
    if (!response.ok) {
      setError((await response.json()).error ?? "Pay action failed");
      return;
    }
    setError("");
    await load();
  }

  async function reviewKyc(id: string, action: "approve" | "reject"): Promise<void> {
    const response = await fetch(`${API_BASE}/admin/kyc-cases/${encodeURIComponent(id)}/review`, {
      method: "POST",
      headers: adminJsonHeaders(),
      body: JSON.stringify({ action })
    });
    if (response.status === 401 || response.status === 403) {
      clearAdminAuth();
      window.location.hash = OPS_SIGN_IN_HASH;
      return;
    }
    if (!response.ok) {
      setError((await response.json()).error ?? "KYC review failed");
      return;
    }
    await load();
  }

  const houseUsd = Number(overview.platformHouseCommissionAccruedUsd) || 0;
  const houseTraders = Number(overview.tradersOnHouseAttribution) || 0;

  const kpis: Array<{ icon: typeof Users; label: string; value: string | number; hint: string }> = [
    { icon: Users, label: "Traders", value: Number(overview.totalTraders) || 0, hint: "In directory" },
    { icon: Shield, label: "Active accounts", value: Number(overview.activeTraders) || 0, hint: `${Number(overview.lockedTraders) || 0} locked · ${Number(overview.breachedTraders) || 0} breached` },
    { icon: FileCheck2, label: "KYC pending", value: Number(overview.pendingKyc) || 0, hint: "Queue depth" },
    { icon: Banknote, label: "Payouts pending", value: Number(overview.pendingPayouts) || 0, hint: "Reviews + processing" },
    { icon: PiggyBank, label: "Platform referral pool", value: `$${houseUsd.toFixed(2)}`, hint: `${houseTraders} traders with no / invalid partner code` },
    { icon: AlertTriangle, label: "Violations (24h)", value: Number(overview.todayViolations) || 0, hint: "Rule engine signals" },
    { icon: ClipboardList, label: "Payout rows", value: payouts.length, hint: "All statuses in snapshot" }
  ];

  return (
    <div className="fxRoot fxAdminRoot">
      <div className="fxAnnBar">
        <div className="fxAnnInner">
          <span className="fxAnnTag">Operations</span>
          <span className="fxAnnText">
            PropPrime risk desk — KPIs, lifecycle controls, payouts, KYC, and immutable audit replay. Local prototype; wire RBAC before production.
          </span>
          <button type="button" className="fxAnnCta" onClick={() => void load()} disabled={refreshing}>
            <RefreshCw size={14} aria-hidden="true" className={refreshing ? "fxAdminSpin" : undefined} />
            Refresh
          </button>
        </div>
      </div>

      <header className="fxShellNav">
        <div className="fxShellNavInner">
          <button type="button" className="fxLogoBtn fxAdminLogoTap" onClick={onBackToTerminal}>
            <div className="fxLogoRow">
              <span className="fxLogoMark" aria-hidden="true" />
              <strong className="fxLogoWord">PropPrime</strong>
            </div>
          </button>

          <nav className="fxNavCenter" aria-label="Admin">
            <button type="button" className="fxNavLink fxAdminNavBtn" onClick={onBackToTerminal}>
              <ArrowLeft size={14} aria-hidden="true" />
              Terminal
            </button>
            <button type="button" className="fxNavLink fxNavLinkActive">Admin console</button>
          </nav>

          <div className="fxNavActions">
            <span className="fxAdminEnvPill">Local · authenticated operator</span>
            <button type="button" className="fxCtaOutline" onClick={() => void load()} disabled={refreshing}>
              Sync hub
            </button>
            <button type="button" className="fxCtaFilled fxOpsLogoutBtn" onClick={onOperatorLogout}>
              Sign out operator
            </button>
          </div>
        </div>
      </header>

      <main className="fxSite fxAdminSite">
        <section className="fxAdminHero">
          <p className="fxEyebrow fxEyebrowLight">Backoffice overview</p>
          <h1 className="fxAdminHeroTitle">Risk &amp; <span className="fxHeroAccent">revenue ops</span></h1>
          <p className="fxAdminHeroLead">
            Monitor trader health, move accounts through lifecycle states, approve payouts with evidence trails, and triage violations from one surface that matches your public branding.
          </p>
          {error && (
            <div className="fxPortalBanner fxPortalBannerErr" role="alert">
              {error}
            </div>
          )}
        </section>

        <section className="fxAdminSection">
          <div className="fxAdminKpiGrid">
            {loading
              ? [...Array(7)].map((_, i) => (
                  <article key={`sk-${String(i)}`} className="fxAdminKpiCard">
                    <span className="fxPortalSkeletonIcon" />
                    <span className="fxPortalSkeletonLine lg" />
                    <span className="fxPortalSkeletonLine sm" />
                  </article>
                ))
              : kpis.map((item) => (
                  <article key={item.label} className="fxAdminKpiCard">
                    <div className="fxAdminKpiIcon" aria-hidden="true">
                      <item.icon size={20} />
                    </div>
                    <p className="fxAdminKpiLabel">{item.label}</p>
                    <p className="fxAdminKpiValue">
                      {typeof item.value === "number" ? item.value.toLocaleString() : item.value}
                    </p>
                    <p className="fxAdminKpiHint">{item.hint}</p>
                  </article>
                ))}
          </div>
        </section>

        <section className="fxAdminSection fxAdminSectionMuted">
          <div className="fxAdminTwoCol">
            <article className="fxAdminPanel fxAdminPanelTall">
              <div className="fxAdminPanelHead">
                <Users size={18} aria-hidden="true" />
                <div>
                  <h2>Traders &amp; accounts</h2>
                  <p className="fxAdminPanelSub">Select an account for lifecycle tooling</p>
                </div>
              </div>
              <div className="fxAdminScroll">
                {traders.map((t) => {
                  const aid = String(t.accountId);
                  const selected = aid === selectedAccountId;
                  return (
                    <div key={aid} className={"fxAdminListRow" + (selected ? " fxAdminListRowSel" : "")}>
                      <div>
                        <p className="fxAdminListTitle">{String(t.name)}</p>
                        <p className="fxAdminListMeta">
                          <code className="fxPortalCode">{aid}</code>
                          {' · '}{String(t.packageType)}
                        </p>
                        <p className="fxAdminListMeta">
                          Phase {String(t.challengePhase)} · {String(t.challengeStatus)} · KYC {String(t.kycStatus)}
                        </p>
                      </div>
                      <button type="button" className={selected ? "fxAdminChipBtn fxAdminChipBtnActive" : "fxAdminChipBtn"} onClick={() => setSelectedAccountId(aid)}>
                        Manage
                      </button>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="fxAdminPanel">
              <div className="fxAdminPanelHead">
                <Shield size={18} aria-hidden="true" />
                <div>
                  <h2>Account lifecycle</h2>
                  <p className="fxAdminPanelSub">Applies to the selected trader account</p>
                </div>
              </div>
              <dl className="fxAdminDl">
                <div>
                  <dt>Selected ID</dt>
                  <dd><code className="fxPortalCode">{selectedAccountId}</code></dd>
                </div>
              </dl>
              <div className="fxAdminActionGrid">
                <button type="button" className="fxAdminDangerBtn" onClick={() => void accountAction("lock")}>
                  <Lock size={16} aria-hidden="true" />
                  Lock account
                </button>
                <button type="button" className="fxAdminNeutralBtn" onClick={() => void accountAction("unlock")}>
                  <Unlock size={16} aria-hidden="true" />
                  Unlock
                </button>
                <button type="button" className="fxAdminNeutralBtn" onClick={() => void accountAction("reset")}>
                  <RefreshCw size={16} aria-hidden="true" />
                  Reset challenge
                </button>
                <button type="button" className="fxCtaFilled fxAdminStretch" onClick={() => void accountAction("promote-funded")}>
                  Promote to funded
                </button>
              </div>
            </article>
          </div>
        </section>

        <section className="fxAdminSection">
          <div className="fxAdminThreeCol">
            <article className="fxAdminPanel fxAdminPanelTall">
              <div className="fxAdminPanelHead">
                <FileCheck2 size={18} aria-hidden="true" />
                <div>
                  <h2>KYC queue</h2>
                  <p className="fxAdminPanelSub">Identity &amp; compliance reviews</p>
                </div>
              </div>
              <div className="fxAdminScroll">
                {kycCases.length === 0 && <p className="fxAdminEmpty">No KYC submissions.</p>}
                {kycCases.map((k) => (
                  <div key={String(k.id)} className="fxAdminMiniCard">
                    <p className="fxAdminListTitle">{String(k.trader)}</p>
                    <p className="fxAdminListMeta">{String(k.id)} · <code className="fxPortalCode">{String(k.accountId)}</code></p>
                    <p className="fxAdminBadge fxAdminBadgeNeutral">{String(k.status)}</p>
                    <div className="fxAdminRowBtns">
                      <button type="button" className="fxAdminOkBtn" onClick={() => void reviewKyc(String(k.id), "approve")}>Approve</button>
                      <button type="button" className="fxAdminDangerGhost" onClick={() => void reviewKyc(String(k.id), "reject")}>Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="fxAdminPanel fxAdminPanelTall">
              <div className="fxAdminPanelHead">
                <Banknote size={18} aria-hidden="true" />
                <div>
                  <h2>Payout desk</h2>
                  <p className="fxAdminPanelSub">Approve, reject, settle</p>
                </div>
              </div>
              <div className="fxAdminScroll">
                {payouts.length === 0 && <p className="fxAdminEmpty">No payouts in ledger.</p>}
                {payouts.map((p) => (
                  <div key={p.id} className="fxAdminMiniCard">
                    <div className="fxAdminMiniHead">
                      <span className={`fxAdminStatusDot fxAdminStatusDot--${p.status === "REQUESTED" || p.status === "UNDER_REVIEW" ? "warn" : p.status === "PAID" ? "ok" : "neutral"}`} aria-hidden="true" />
                      <strong className="fxAdminAmt">${p.amount.toFixed(2)}</strong>
                    </div>
                    <p className="fxAdminListMeta">{p.status}</p>
                    <p className="fxAdminListMeta"><code className="fxPortalCode">{p.accountId}</code></p>
                    <div className="fxAdminRowBtns">
                      <button type="button" className="fxAdminOkBtn" onClick={() => void reviewPayout(p.id, "approve")}>Approve</button>
                      <button type="button" className="fxAdminDangerGhost" onClick={() => void reviewPayout(p.id, "reject")}>Reject</button>
                      <button type="button" className="fxAdminNeutralMini" onClick={() => void payPayout(p.id)}>Paid</button>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="fxAdminPanel fxAdminPanelTall">
              <div className="fxAdminPanelHead">
                <AlertTriangle size={18} aria-hidden="true" />
                <div>
                  <h2>Risk &amp; violations</h2>
                  <p className="fxAdminPanelSub">Engine output</p>
                </div>
              </div>
              <div className="fxAdminScroll">
                {violations.length === 0 && <p className="fxAdminEmpty">Clean slate — no violations.</p>}
                {violations.slice(-40).reverse().map((v) => (
                  <div key={v.id} className="fxAdminMiniCard">
                    <p className="fxAdminListTitle">{v.code}</p>
                    <p className="fxAdminListMeta">{v.severity} · <code className="fxPortalCode">{v.accountId}</code></p>
                    <p className="fxAdminListBody">{v.message}</p>
                    <p className="fxAdminListMeta">{new Date(v.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className="fxAdminSection fxAdminSectionMuted">
          <article className="fxAdminPanel fxAdminPanelWide">
            <div className="fxAdminPanelHead">
              <ScrollText size={18} aria-hidden="true" />
              <div>
                <h2>Audit log</h2>
                <p className="fxAdminPanelSub">Last 100 events · immutable trail</p>
              </div>
            </div>
            <div className="fxAdminAudit">
              {audits.slice(0, 100).map((a) => (
                <div key={a.id} className="fxAdminAuditRow">
                  <History size={14} className="fxAdminAuditIcon" aria-hidden="true" />
                  <span className="fxAdminAuditAction">{a.action}</span>
                  <span className="fxAdminAuditActor">{a.actorId}</span>
                  <time className="fxAdminAuditTime" dateTime={new Date(a.createdAt).toISOString()}>
                    {new Date(a.createdAt).toLocaleString()}
                  </time>
                </div>
              ))}
            </div>
          </article>
        </section>

        <footer className="fxFooterGrid fxFooterTight">
          <div>
            <strong className="fxFooterBrand">PropPrime Operations</strong>
            <p className="fxFooterMuted">
              Restricted tooling — parity styling with trader-facing surfaces does not imply production hardening (auth / RBAC / separation of duties required).
            </p>
          </div>
          <div className="fxFooterCols fxFooterColsSingle">
            <button type="button" className="fxFooterLink fxFooterBtnAsLink" onClick={onBackToTerminal}>Return to terminal</button>
            <button type="button" className="fxFooterLink fxFooterBtnAsLink" onClick={() => void load()}>Refresh data</button>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default AdminPortal;
