import { useState } from "react";
import { ArrowLeft, Network, UserPlus } from "lucide-react";
import { API_BASE } from "./clientAuth";
import {
  DEMO_ADMIN_PASSWORD,
  DEMO_ADMIN_USERNAME,
  DEMO_PARTNER_EMAIL,
  DEMO_PARTNER_PASSWORD,
  DEMO_TRADER_LOGIN,
  DEMO_TRADER_PASSWORD,
  DEMO_URL_OPS_CONSOLE,
  DEMO_URL_PARTNER_HUB
} from "./demoCredentials";
import {
  PARTNER_DASHBOARD_HASH,
  PARTNER_REGISTER_HASH,
  PARTNER_SIGN_IN_HASH,
  persistManagerToken
} from "./partnerAuth";

type Mode = "signin" | "register";

interface ManagerLoginPageProps {
  onBack: () => void;
  initialMode?: Mode;
}

function ManagerLoginPage({ onBack, initialMode = "signin" }: ManagerLoginPageProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  /**
   * Prefill with the demo partner credentials documented at the bottom of
   * this card so testers can sign in with one click. The Join tab keeps its
   * own clean state — we only auto-fill the sign-in flow.
   */
  const [email, setEmail] = useState(initialMode === "signin" ? DEMO_PARTNER_EMAIL : "");
  const [password, setPassword] = useState(initialMode === "signin" ? DEMO_PARTNER_PASSWORD : "");
  const [fullName, setFullName] = useState("");
  const [uplineCode, setUplineCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submitSignIn(ev: React.FormEvent): Promise<void> {
    ev.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/partner-auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = (await r.json()) as { token?: string; error?: string };
      if (!r.ok) throw new Error(data.error ?? "Sign in failed.");
      if (!data.token) throw new Error("Unexpected response.");
      persistManagerToken(data.token);
      window.location.hash = PARTNER_DASHBOARD_HASH;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitRegister(ev: React.FormEvent): Promise<void> {
    ev.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/partner-auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          fullName,
          uplineReferralCode: uplineCode.trim() || undefined
        })
      });
      const data = (await r.json()) as { token?: string; error?: string };
      if (!r.ok) throw new Error(data.error ?? "Registration failed.");
      if (!data.token) throw new Error("Unexpected response.");
      persistManagerToken(data.token);
      window.location.hash = PARTNER_DASHBOARD_HASH;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fxRoot">
      <div className="fxAnnBar">
        <div className="fxAnnInner">
          <span className="fxAnnTag">Partners</span>
          <span className="fxAnnText">Refer traders with your code — separate account from the trading portal.</span>
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
          <span className="fxNavLink fxOpsNavMuted">Partner program</span>
        </div>
      </header>

      <main className="fxSite">
        <section className="fxAuthSection fxOpsAuthSection">
          <div className="fxAuthCardWrap fxAuthWide">
            <div className="fxAuthCard fxMgrLoginCard">
              <div className="fxOpsLoginHead">
                <Network size={22} aria-hidden="true" className="fxMgrLoginIcon" />
                <div>
                  <p className="fxEyebrow fxEyebrowLight">Growth partners</p>
                  <h1 className="fxAuthBrandTitle" style={{ fontSize: "clamp(22px, 3.5vw, 32px)", marginTop: "4px" }}>
                    Partner access
                  </h1>
                  <p className="fxAuthLead">Earn simulated bonuses on referrals and pass-through shares when referred traders receive payouts.</p>
                </div>
              </div>

              <div className="fxAuthTabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "signin"}
                  className={"fxAuthTab" + (mode === "signin" ? " fxAuthTabActive" : "")}
                  onClick={() => {
                    setMode("signin");
                    setError("");
                    setEmail(DEMO_PARTNER_EMAIL);
                    setPassword(DEMO_PARTNER_PASSWORD);
                    window.location.hash = PARTNER_SIGN_IN_HASH;
                  }}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "register"}
                  className={"fxAuthTab" + (mode === "register" ? " fxAuthTabActive" : "")}
                  onClick={() => {
                    setMode("register");
                    setError("");
                    if (email === DEMO_PARTNER_EMAIL) setEmail("");
                    if (password === DEMO_PARTNER_PASSWORD) setPassword("");
                    window.location.hash = PARTNER_REGISTER_HASH;
                  }}
                >
                  <UserPlus size={14} aria-hidden="true" /> Join
                </button>
              </div>

              {mode === "signin" ? (
                <form className="fxClientForm fxOpsAdminForm" onSubmit={submitSignIn}>
                  <label className="fxField">
                    <span className="fxFieldLabel">Email</span>
                    <span className="fxInputShell">
                      <input className="fxAuthInput" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </span>
                  </label>
                  <label className="fxField">
                    <span className="fxFieldLabel">Password</span>
                    <span className="fxInputShell">
                      <input className="fxAuthInput" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </span>
                  </label>
                  {error && <p className="fxAuthError">{error}</p>}
                  <button type="submit" className="fxCtaFilled fxAuthSubmit" disabled={busy}>
                    {busy ? "Signing in…" : "Partner sign in"}
                  </button>
                </form>
              ) : (
                <form className="fxClientForm fxOpsAdminForm" onSubmit={submitRegister}>
                  <label className="fxField">
                    <span className="fxFieldLabel">Full name</span>
                    <span className="fxInputShell">
                      <input className="fxAuthInput" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                    </span>
                  </label>
                  <label className="fxField">
                    <span className="fxFieldLabel">Email</span>
                    <span className="fxInputShell">
                      <input className="fxAuthInput" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </span>
                  </label>
                  <label className="fxField">
                    <span className="fxFieldLabel">Password (8+)</span>
                    <span className="fxInputShell">
                      <input className="fxAuthInput" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </span>
                  </label>
                  <label className="fxField">
                    <span className="fxFieldLabel">Upline partner code (optional)</span>
                    <span className="fxInputShell">
                      <input
                        className="fxAuthInput"
                        placeholder="PP-XXXXXXXX"
                        value={uplineCode}
                        onChange={(e) => setUplineCode(e.target.value)}
                      />
                    </span>
                  </label>
                  <p className="fxMgrHint">If you were invited by another partner, enter their referral code to sit in their tree.</p>
                  {error && <p className="fxAuthError">{error}</p>}
                  <button type="submit" className="fxCtaFilled fxAuthSubmit" disabled={busy}>
                    {busy ? "Creating…" : "Create partner account"}
                  </button>
                </form>
              )}

              <button type="button" className="fxCtaOutline fxAuthBackGhost" onClick={onBack}>
                <ArrowLeft size={14} aria-hidden="true" />
                Back
              </button>

              <div className="fxMgrDemoCreds fxAuthDemoCreds" role="note">
                <p className="fxAuthDemoCredsTitle">Other demo roles</p>
                <ul className="fxAuthDemoCredsList">
                  <li>
                    <strong>Trader portal</strong> — <kbd className="fxKbd">{DEMO_TRADER_LOGIN}</kbd> /{" "}
                    <kbd className="fxKbd">{DEMO_TRADER_PASSWORD}</kbd>
                  </li>
                  <li>
                    <strong>This partner demo</strong> — <kbd className="fxKbd">{DEMO_PARTNER_EMAIL}</kbd> /{" "}
                    <kbd className="fxKbd">{DEMO_PARTNER_PASSWORD}</kbd>
                  </li>
                  <li>
                    <strong>Operator</strong> — <kbd className="fxKbd">{DEMO_ADMIN_USERNAME}</kbd> /{" "}
                    <kbd className="fxKbd">{DEMO_ADMIN_PASSWORD}</kbd> ({DEMO_URL_OPS_CONSOLE})
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default ManagerLoginPage;
