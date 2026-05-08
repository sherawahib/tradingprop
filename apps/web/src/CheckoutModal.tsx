import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CreditCard, Lock, ShieldCheck, X } from "lucide-react";
import type { PackageCatalogEntry } from "./clientAuth";

export interface CheckoutModalProps {
  pkg: PackageCatalogEntry;
  /** Closes the modal without buying. Should be safe to call any time. */
  onClose: () => void;
  /** Resolves once the actual API purchase succeeds. Throws on error. */
  onConfirm: (slug: string) => Promise<void>;
}

interface FormState {
  cardholder: string;
  cardNumber: string;
  expiry: string;
  cvc: string;
  country: string;
  postcode: string;
  acceptedTerms: boolean;
}

const TAX_RATE = 0.05;

function formatCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 19);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function detectCardBrand(numberDigits: string): string {
  if (/^4/.test(numberDigits)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(numberDigits)) return "Mastercard";
  if (/^(34|37)/.test(numberDigits)) return "Amex";
  if (/^(6011|65)/.test(numberDigits)) return "Discover";
  return "Card";
}

export default function CheckoutModal({ pkg, onClose, onConfirm }: CheckoutModalProps): JSX.Element {
  const [form, setForm] = useState<FormState>({
    cardholder: "",
    cardNumber: "",
    expiry: "",
    cvc: "",
    country: "",
    postcode: "",
    acceptedTerms: false
  });
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"form" | "processing" | "success">("form");
  const [error, setError] = useState("");

  // Esc to close.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const cardDigits = useMemo(() => form.cardNumber.replace(/\s/g, ""), [form.cardNumber]);
  const cardBrand = useMemo(() => detectCardBrand(cardDigits), [cardDigits]);

  const subtotal = pkg.priceUsd;
  const tax = +(subtotal * TAX_RATE).toFixed(2);
  const total = +(subtotal + tax).toFixed(2);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function validate(): string | null {
    if (form.cardholder.trim().length < 2) return "Cardholder name is required.";
    if (cardDigits.length < 12) return "Enter a valid card number.";
    if (!/^\d{2}\/\d{2}$/.test(form.expiry)) return "Expiry must be MM/YY.";
    const [mmStr, yyStr] = form.expiry.split("/");
    const mm = Number(mmStr);
    const yy = Number(yyStr);
    if (!Number.isFinite(mm) || mm < 1 || mm > 12) return "Expiry month is invalid.";
    if (!Number.isFinite(yy)) return "Expiry year is invalid.";
    if (form.cvc.length < 3) return "CVC must be 3–4 digits.";
    if (form.country.trim().length < 2) return "Billing country is required.";
    if (form.postcode.trim().length < 2) return "Billing postal code is required.";
    if (!form.acceptedTerms) return "You must agree to the simulated terms before paying.";
    return null;
  }

  async function submit(): Promise<void> {
    setError("");
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setBusy(true);
    setStage("processing");
    try {
      // Simulate a brief payment-processing delay so the spinner feels real.
      await new Promise((r) => setTimeout(r, 900));
      await onConfirm(pkg.slug);
      setStage("success");
      setTimeout(() => onClose(), 1100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed. Please try again.");
      setStage("form");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fxCheckoutBackdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Checkout"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="fxCheckoutShell">
        <header className="fxCheckoutHead">
          <div>
            <p className="fxEyebrow fxEyebrowLight">Checkout</p>
            <h2 className="fxCheckoutTitle">Confirm and pay</h2>
          </div>
          <button
            type="button"
            className="fxCheckoutClose"
            onClick={onClose}
            disabled={busy}
            aria-label="Close checkout"
          >
            <X size={18} />
          </button>
        </header>

        <div className="fxCheckoutGrid">
          <section className="fxCheckoutCol fxCheckoutColForm">
            {stage === "success" ? (
              <div className="fxCheckoutSuccess">
                <CheckCircle2 size={56} aria-hidden="true" />
                <h3>Payment successful</h3>
                <p>Provisioning your trading account…</p>
              </div>
            ) : (
              <>
                <h3 className="fxCheckoutSectionTitle">
                  <CreditCard size={16} aria-hidden="true" />
                  Payment details
                </h3>
                <p className="fxCheckoutDemoNote">
                  Demo billing — no real charge is made. Any 12+ digit number is accepted (we recommend the test card{" "}
                  <code>4242 4242 4242 4242</code>).
                </p>

                <label className="fxField">
                  <span className="fxFieldLabel">Cardholder name</span>
                  <input
                    className="fxAuthInput"
                    autoComplete="cc-name"
                    value={form.cardholder}
                    onChange={(e) => setField("cardholder", e.target.value)}
                    placeholder="Jordan Lee"
                    disabled={busy}
                  />
                </label>

                <label className="fxField">
                  <span className="fxFieldLabel">Card number</span>
                  <span className="fxInputShell">
                    <CreditCard className="fxInputIcon" size={18} aria-hidden="true" />
                    <input
                      className="fxAuthInput"
                      autoComplete="cc-number"
                      inputMode="numeric"
                      value={form.cardNumber}
                      onChange={(e) => setField("cardNumber", formatCardNumber(e.target.value))}
                      placeholder="4242 4242 4242 4242"
                      disabled={busy}
                    />
                    <span className="fxCheckoutBrand">{cardDigits.length >= 4 ? cardBrand : ""}</span>
                  </span>
                </label>

                <div className="fxCheckoutRow2">
                  <label className="fxField">
                    <span className="fxFieldLabel">Expiry (MM/YY)</span>
                    <input
                      className="fxAuthInput"
                      autoComplete="cc-exp"
                      inputMode="numeric"
                      value={form.expiry}
                      onChange={(e) => setField("expiry", formatExpiry(e.target.value))}
                      placeholder="12/29"
                      disabled={busy}
                      maxLength={5}
                    />
                  </label>
                  <label className="fxField">
                    <span className="fxFieldLabel">CVC</span>
                    <span className="fxInputShell">
                      <Lock className="fxInputIcon" size={18} aria-hidden="true" />
                      <input
                        className="fxAuthInput"
                        autoComplete="cc-csc"
                        inputMode="numeric"
                        value={form.cvc}
                        onChange={(e) => setField("cvc", e.target.value.replace(/\D/g, "").slice(0, 4))}
                        placeholder="123"
                        disabled={busy}
                      />
                    </span>
                  </label>
                </div>

                <h3 className="fxCheckoutSectionTitle">
                  <ShieldCheck size={16} aria-hidden="true" />
                  Billing address
                </h3>

                <div className="fxCheckoutRow2">
                  <label className="fxField">
                    <span className="fxFieldLabel">Country</span>
                    <input
                      className="fxAuthInput"
                      autoComplete="country-name"
                      value={form.country}
                      onChange={(e) => setField("country", e.target.value)}
                      placeholder="United States"
                      disabled={busy}
                    />
                  </label>
                  <label className="fxField">
                    <span className="fxFieldLabel">Postal code</span>
                    <input
                      className="fxAuthInput"
                      autoComplete="postal-code"
                      value={form.postcode}
                      onChange={(e) => setField("postcode", e.target.value)}
                      placeholder="94114"
                      disabled={busy}
                    />
                  </label>
                </div>

                <label className="fxCheckboxRow fxCheckboxBlock fxCheckoutTerms">
                  <input
                    type="checkbox"
                    checked={form.acceptedTerms}
                    onChange={(e) => setField("acceptedTerms", e.target.checked)}
                    disabled={busy}
                  />
                  <span>
                    I understand this is a <strong>simulated</strong> purchase, no real card is charged, and the
                    resulting trading account uses simulated balances.
                  </span>
                </label>

                {error && <p className="fxAuthError">{error}</p>}
              </>
            )}
          </section>

          <aside className="fxCheckoutCol fxCheckoutColSummary" aria-label="Order summary">
            <h3 className="fxCheckoutSectionTitle">Order summary</h3>
            <div className="fxCheckoutSummaryCard">
              <p className="fxCheckoutPkgSlug">{pkg.slug.replace(/_/g, " ")}</p>
              <p className="fxCheckoutPkgName">{pkg.packageTypeLabel}</p>
              {pkg.tagline && <p className="fxCheckoutPkgTag">{pkg.tagline}</p>}

              <ul className="fxCheckoutSpecs">
                <li>
                  <span>Simulated balance</span>
                  <strong>${pkg.simulatedBalanceUsd.toLocaleString()}</strong>
                </li>
                <li>
                  <span>Template</span>
                  <strong>
                    <code className="fxPortalCode">{pkg.templateId}</code>
                  </strong>
                </li>
                <li>
                  <span>Type</span>
                  <strong>{pkg.instantFundedPassthrough ? "Instant funded" : "Evaluation"}</strong>
                </li>
              </ul>

              <ul className="fxCheckoutTotals">
                <li>
                  <span>Subtotal</span>
                  <strong>${subtotal.toFixed(2)}</strong>
                </li>
                <li>
                  <span>Platform fee (5%)</span>
                  <strong>${tax.toFixed(2)}</strong>
                </li>
                <li className="fxCheckoutTotalsRowFinal">
                  <span>Total due today</span>
                  <strong>${total.toFixed(2)}</strong>
                </li>
              </ul>
            </div>

            <button
              type="button"
              className="fxCtaFilled fxCheckoutPay"
              onClick={() => void submit()}
              disabled={busy || stage === "success"}
            >
              {stage === "processing"
                ? "Processing payment…"
                : stage === "success"
                  ? "Done"
                  : `Pay $${total.toFixed(2)}`}
            </button>
            <p className="fxCheckoutFootMuted">
              <Lock size={12} aria-hidden="true" /> Encrypted form — values are never stored or transmitted in this
              demo build.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
