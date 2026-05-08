import { useEffect, useState } from "react";
import { ArrowLeft, KeyRound, Mail, ShieldCheck, User } from "lucide-react";
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
import { PENDING_REFERRAL_STORAGE_KEY } from "./partnerAuth";
import type { MarketingSubView } from "./marketingTypes";

type Mode = "signin" | "register";

interface LoginPageProps {
  onBackHome: () => void;
  onOpenMarketingPage: (page: MarketingSubView) => void;
  onLogin: (login: string, password: string, options?: { rememberDevice?: boolean }) => Promise<void>;
  onRegister: (params: {
    email: string;
    password: string;
    fullName: string;
    referralCode?: string;
  }) => Promise<void>;
}

export default function LoginPage({ onBackHome, onOpenMarketingPage, onLogin, onRegister }: LoginPageProps) {
  const [mode, setMode] = useState<Mode>("signin");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const pending = sessionStorage.getItem(PENDING_REFERRAL_STORAGE_KEY);
      if (pending && !referralCode) setReferralCode(pending);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(ev: React.FormEvent): Promise<void> {
    ev.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signin") {
        if (!login.trim() || !password) {
          setError("Enter your email or login and password.");
          return;
        }
        await onLogin(login.trim(), password, { rememberDevice: remember });
      } else {
        if (!login.trim() || !password || !fullName.trim()) {
          setError("Email, password, and full name are required.");
          return;
        }
        if (password.length < 8) {
          setError("Password must be at least 8 characters.");
          return;
        }
        await onRegister({
          email: login.trim(),
          password,
          fullName: fullName.trim(),
          referralCode: referralCode.trim() || undefined
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fxRoot">
      <div className="fxAnnBar">
        <div className="fxAnnInner">
          <span className="fxAnnTag">Portal</span>
          <span className="fxAnnText">
            Sign into your client portal — separate from per-package terminal logins. Free demo trader available.
          </span>
          <button type="button" className="fxAnnCta" onClick={onBackHome}>← Back to site</button>
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
          <nav className="fxNavCenter" aria-label="Auth">
            <span className="fxNavLink fxOpsNavMuted">Client portal</span>
          </nav>
          <div className="fxNavActions">
            <button type="button" className="fxLinkBtn" onClick={() => onOpenMarketingPage("programs")}>
              Programs
            </button>
            <button type="button" className="fxLinkBtn" onClick={() => onOpenMarketingPage("payouts")}>
              Payouts
            </button>
          </div>
        </div>
      </header>

      <main className="fxSite">
        <section className="fxAuthSection">
          <div className="fxAuthGrid">
            <div className="fxAuthBrand">
              <p className="fxEyebrow">Client portal</p>
              <h1 className="fxAuthBrandTitle">
                Run your simulated <span className="fxHeroAccent">trading desk</span> from one place.
              </h1>
              <p className="fxAuthBrandLead">
                Sign in to view your packages, request payouts, and manage your terminal logins. Don't have an
                account yet? Register in seconds.
              </p>
              <ul className="fxAuthBrandList">
                <li>One portal — many trading-account logins (one per package).</li>
                <li>Numeric terminal logins. Reset / rotate from your dashboard.</li>
                <li>KYC, support, payout requests in one screen.</li>
              </ul>
              <button type="button" className="fxCtaOutline fxAuthBackLink" onClick={onBackHome}>
                <ArrowLeft size={16} aria-hidden="true" />
                Back to marketing site
              </button>
            </div>

            <div className="fxAuthCardWrap">
              <div className="fxAuthCard">
                <div className="fxAuthTabs" role="tablist" aria-label="Authenticate">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "signin"}
                    className={"fxAuthTab" + (mode === "signin" ? " fxAuthTabActive" : "")}
                    onClick={() => {
                      setMode("signin");
                      setError("");
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
                    }}
                  >
                    Register
                  </button>
                </div>

                {mode === "signin" ? (
                  <>
                    <p className="fxAuthLead">Use the email or local login + password you registered with.</p>
                    <form className="fxClientForm" onSubmit={submit}>
                      <label className="fxField">
                        <span className="fxFieldLabel">Email or login</span>
                        <span className="fxInputShell">
                          <Mail className="fxInputIcon" size={18} aria-hidden="true" />
                          <input
                            className="fxAuthInput"
                            autoComplete="username"
                            value={login}
                            onChange={(e) => setLogin(e.target.value)}
                            placeholder="you@example.com or client1"
                          />
                        </span>
                      </label>
                      <label className="fxField">
                        <span className="fxFieldLabel">Password</span>
                        <span className="fxInputShell">
                          <KeyRound className="fxInputIcon" size={18} aria-hidden="true" />
                          <input
                            type="password"
                            className="fxAuthInput"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                          />
                        </span>
                      </label>
                      <div className="fxAuthRowBetween">
                        <label className="fxCheckboxRow">
                          <input
                            type="checkbox"
                            checked={remember}
                            onChange={(e) => setRemember(e.target.checked)}
                          />
                          <span>Remember this device</span>
                        </label>
                      </div>
                      {error && <p className="fxAuthError" role="alert">{error}</p>}
                      <button type="submit" className="fxCtaFilled fxAuthSubmit" disabled={busy}>
                        {busy ? "Signing in…" : "Sign in"}
                      </button>
                    </form>
                  </>
                ) : (
                  <>
                    <p className="fxAuthLead">
                      Registration creates the portal account only — you choose and purchase your trading package
                      after sign-up.
                    </p>
                    <form className="fxClientForm" onSubmit={submit}>
                      <label className="fxField">
                        <span className="fxFieldLabel">Full name</span>
                        <span className="fxInputShell">
                          <User className="fxInputIcon" size={18} aria-hidden="true" />
                          <input
                            className="fxAuthInput"
                            autoComplete="name"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                          />
                        </span>
                      </label>
                      <label className="fxField">
                        <span className="fxFieldLabel">Email</span>
                        <span className="fxInputShell">
                          <Mail className="fxInputIcon" size={18} aria-hidden="true" />
                          <input
                            type="email"
                            className="fxAuthInput"
                            autoComplete="email"
                            value={login}
                            onChange={(e) => setLogin(e.target.value)}
                          />
                        </span>
                      </label>
                      <label className="fxField">
                        <span className="fxFieldLabel">Password (8+)</span>
                        <span className="fxInputShell">
                          <KeyRound className="fxInputIcon" size={18} aria-hidden="true" />
                          <input
                            type="password"
                            className="fxAuthInput"
                            autoComplete="new-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                          />
                        </span>
                      </label>
                      <label className="fxField">
                        <span className="fxFieldLabel">Partner referral (optional)</span>
                        <span className="fxInputShell">
                          <ShieldCheck className="fxInputIcon" size={18} aria-hidden="true" />
                          <input
                            className="fxAuthInput"
                            value={referralCode}
                            onChange={(e) => setReferralCode(e.target.value)}
                            placeholder="PP-XXXXXXXX"
                          />
                        </span>
                      </label>
                      {error && <p className="fxAuthError" role="alert">{error}</p>}
                      <button type="submit" className="fxCtaFilled fxAuthSubmit" disabled={busy}>
                        {busy ? "Creating account…" : "Create account"}
                      </button>
                    </form>
                  </>
                )}

                <div className="fxAuthDemoCreds" role="note">
                  <p className="fxAuthDemoCredsTitle">Quick demo logins</p>
                  <ul className="fxAuthDemoCredsList">
                    <li>
                      <strong>Trader portal</strong> — <kbd className="fxKbd">{DEMO_TRADER_LOGIN}</kbd> /{" "}
                      <kbd className="fxKbd">{DEMO_TRADER_PASSWORD}</kbd>
                    </li>
                    <li>
                      <strong>Partner hub</strong> — <kbd className="fxKbd">{DEMO_PARTNER_EMAIL}</kbd> /{" "}
                      <kbd className="fxKbd">{DEMO_PARTNER_PASSWORD}</kbd> ({DEMO_URL_PARTNER_HUB})
                    </li>
                    <li>
                      <strong>Operator</strong> — <kbd className="fxKbd">{DEMO_ADMIN_USERNAME}</kbd> /{" "}
                      <kbd className="fxKbd">{DEMO_ADMIN_PASSWORD}</kbd> ({DEMO_URL_OPS_CONSOLE})
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
