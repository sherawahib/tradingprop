import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ClipboardCopy,
  Link2,
  Network,
  RefreshCw,
  Users
} from "lucide-react";
import type { PartnerDashboardPayload } from "./partnerAuth";
import { clearPartnerAuth, fetchPartnerDashboard, partnerJsonHeaders, PARTNER_SIGN_IN_HASH } from "./partnerAuth";
import { API_BASE } from "./clientAuth";

interface ManagerPortalProps {
  onBack: () => void;
}

function ManagerPortal({ onBack }: ManagerPortalProps) {
  const [dash, setDash] = useState<PartnerDashboardPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(spin = false): Promise<void> {
    if (spin) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const d = await fetchPartnerDashboard();
      setDash(d);
    } catch (e) {
      setDash(null);
      const msg = e instanceof Error ? e.message : "Load failed.";
      setError(msg);
      if (/session|401|403|Partner session/i.test(msg)) {
        clearPartnerAuth();
        window.location.hash = PARTNER_SIGN_IN_HASH;
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void fetch(`${API_BASE}/partner-auth/me`, { headers: partnerJsonHeaders() }).then(async (r) => {
      if (!r.ok) {
        clearPartnerAuth();
        window.location.hash = PARTNER_SIGN_IN_HASH;
        return;
      }
      void load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial mount bootstrap
  }, []);

  async function copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy:", text);
    }
  }

  return (
    <div className="fxRoot fxMgrRoot">
      <div className="fxAnnBar">
        <div className="fxAnnInner">
          <span className="fxAnnTag">Partners</span>
          <span className="fxAnnText">Referral IDs, attribution tree, and simulated revenue ledger — aligned with trader branding.</span>
          <button type="button" className="fxAnnCta" onClick={() => void load(true)} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? "fxPortalSpin" : undefined} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>
      <header className="fxShellNav">
        <div className="fxShellNavInner">
          <button type="button" className="fxLogoBtn" onClick={onBack}>
            <div className="fxLogoRow">
              <span className="fxLogoMark" aria-hidden="true" />
              <strong className="fxLogoWord">PropPrime</strong>
            </div>
          </button>
          <nav className="fxNavCenter">
            <span className="fxNavLink fxNavLinkActive">
              <Network size={14} aria-hidden="true" /> Partner hub
            </span>
          </nav>
          <div className="fxNavActions">
            <button
              type="button"
              className="fxCtaOutline"
              onClick={() => {
                clearPartnerAuth();
                window.location.hash = PARTNER_SIGN_IN_HASH;
              }}
            >
              Sign out partner
            </button>
          </div>
        </div>
      </header>

      <main className="fxSite fxMgrSite">
        {error && (
          <div className="fxPortalBanner fxPortalBannerErr fxMgrBanner" role="alert">
            {error}
          </div>
        )}

        {loading || !dash ? (
          <div className="fxMgrSkeleton">
            <span className="fxPortalSkeletonLine lg" />
            <span className="fxPortalSkeletonLine" />
          </div>
        ) : (
          <>
            <section className="fxMgrHero">
              <p className="fxEyebrow fxEyebrowLight">Partner identity</p>
              <h1 className="fxPortalHeroTitle" style={{ fontSize: "clamp(26px, 4vw, 38px)", marginTop: "6px" }}>
                Hey,{" "}
                <span className="fxHeroAccent">{dash.manager.fullName}</span>
              </h1>
              <p className="fxPortalHeroLead">Share your signup link — new traders who register attach to your tree automatically.</p>
              <dl className="fxMgrMeta">
                <div>
                  <dt>Referral code</dt>
                  <dd className="fxMgrCodeCell">
                    <code className="fxPortalCode">{dash.manager.referralCode}</code>
                    <button type="button" className="fxCtaOutline fxMgrCopyBtn" onClick={() => void copyText(dash.manager.referralCode)}>
                      <ClipboardCopy size={14} aria-hidden="true" /> Copy code
                    </button>
                  </dd>
                </div>
                <div>
                  <dt>Signup link</dt>
                  <dd className="fxMgrCodeCell">
                    <span className="fxMgrShrinkUrl">{dash.referralSignupUrl}</span>
                    <button type="button" className="fxCtaFilled fxMgrCopyBtn" onClick={() => void copyText(dash.referralSignupUrl)}>
                      <Link2 size={14} aria-hidden="true" /> Copy URL
                    </button>
                  </dd>
                </div>
              </dl>
            </section>

            <section className="fxMgrGrid">
              <article className="fxPortalStatCard fxMgrKpi">
                <Users size={20} aria-hidden="true" className="fxMgrKpiIcon" />
                <p className="fxPortalStatLabel">Referred traders</p>
                <p className="fxPortalStatValue">{dash.referrals.length}</p>
              </article>
              <article className="fxPortalStatCard fxMgrKpi">
                <Network size={20} aria-hidden="true" className="fxMgrKpiIcon" />
                <p className="fxPortalStatLabel">Partner tree depth</p>
                <p className="fxPortalStatValue">{dash.downlineManagers.length}</p>
                <p className="fxPortalStatHint">Sub-partners who used your code as upline</p>
              </article>
              <article className="fxPortalStatCard fxMgrKpi fxMgrKpiGold">
                <p className="fxPortalStatLabel">Accrued (simulated)</p>
                <p className="fxPortalStatValue">${dash.manager.accruedEarningsUsd.toFixed(2)}</p>
                <p className="fxPortalStatHint">Bonuses + 5% of referred traders’ settled payouts</p>
              </article>
            </section>

            <section className="fxPortalSection fxMgrSection">
              <h2 className="fxTitleContrast">Tree · upline</h2>
              {dash.upline ? (
                <p className="fxPortalMuted">
                  You roll up under{" "}
                  <strong>{dash.upline.fullName}</strong>
                  (<code className="fxPortalCode">{dash.upline.referralCode}</code>).
                </p>
              ) : (
                <p className="fxPortalMuted">You have no recorded upline (top-level partner in this sandbox).</p>
              )}
              {dash.downlineManagers.length > 0 ? (
                <ul className="fxMgrDownline">
                  {dash.downlineManagers.map((d) => (
                    <li key={d.referralCode}>
                      <strong>{d.fullName}</strong> · <code className="fxPortalCode">{d.referralCode}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="fxPortalMuted">No sub-partners yet — invite promoters with your code on the Join form.</p>
              )}
            </section>

            <section className="fxPortalSection">
              <h2 className="fxTitleContrast">Referred traders</h2>
              {dash.referrals.length === 0 ? (
                <p className="fxPortalMuted">No referrals yet — send your signup URL to traders.</p>
              ) : (
                <div className="fxMgrTableWrap">
                  <table className="fxClientTable fxMgrTable">
                    <thead>
                      <tr>
                        <th>Trader</th>
                        <th>Account</th>
                        <th>KYC</th>
                        <th>Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dash.referrals.map((r) => (
                        <tr key={r.userId}>
                          <td>
                            {r.fullName}
                            <br />
                            <span className="fxMgrEmail">{r.email}</span>
                          </td>
                          <td><code className="fxPortalCode">{r.accountId}</code></td>
                          <td>{r.kycStatus}</td>
                          <td>{new Date(r.joinedAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="fxPortalSection fxPortalSectionMuted">
              <h2 className="fxTitleContrast">Earnings ledger (simulated)</h2>
              {dash.ledger.length === 0 ? (
                <p className="fxPortalMuted">Credits appear when referrals sign up and when their payouts are marked paid.</p>
              ) : (
                <ul className="fxMgrLedger">
                  {dash.ledger.map((row) => (
                    <li key={row.id} className="fxMgrLedgerRow">
                      <div>
                        <strong>{row.type.replace(/_/g, " ")}</strong>
                        <p className="fxPortalMuted">{row.note}</p>
                        {row.clientAccountId && (
                          <p className="fxMgrAcct">
                            Account <code className="fxPortalCode">{row.clientAccountId}</code>
                          </p>
                        )}
                      </div>
                      <div className="fxMgrLedgerAmt">
                        <span>+${row.amountUsd.toFixed(2)}</span>
                        <time>{new Date(row.createdAt).toLocaleString()}</time>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        <footer className="fxFooterGrid fxFooterTight">
          <button type="button" className="fxFooterLink fxFooterBtnAsLink" onClick={onBack}>
            <ArrowLeft size={14} aria-hidden="true" /> Leave partner hub
          </button>
        </footer>
      </main>
    </div>
  );
}

export default ManagerPortal;
