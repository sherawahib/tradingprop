import { Facebook, Instagram, MessageCircle, Send, Twitter, Youtube } from "lucide-react";
import type { MarketingSubView } from "./marketingTypes";
import { PARTNER_SIGN_IN_HASH } from "./partnerAuth";

export interface SiteFooterProps {
  /**
   * Required: how to navigate to a marketing sub-page.
   * - From the marketing site this is the in-app router.
   * - From the client portal this comes via `onOpenMarketingPage`.
   */
  onNavigate: (page: MarketingSubView) => void;
  /** Open the portal / sign-in surface (used by Trader Dashboard + Become a Partner-adjacent links). */
  onOpenPortal?: () => void;
  /** Variant only changes the copyright label and disclaimer wording. */
  variant?: "marketing" | "portal";
  /** Extra blurb under the brand block when relevant (e.g. "Trader account id ABC"). */
  brandSubline?: string;
}

const SOCIALS: Array<{ key: string; label: string; href: string; Icon: typeof Twitter }> = [
  { key: "discord", label: "Discord", href: "#discord", Icon: MessageCircle },
  { key: "twitter", label: "Twitter / X", href: "#twitter", Icon: Twitter },
  { key: "facebook", label: "Facebook", href: "#facebook", Icon: Facebook },
  { key: "instagram", label: "Instagram", href: "#instagram", Icon: Instagram },
  { key: "youtube", label: "YouTube", href: "#youtube", Icon: Youtube },
  { key: "telegram", label: "Telegram", href: "#telegram", Icon: Send }
];

export default function SiteFooter({ onNavigate, onOpenPortal, variant = "marketing", brandSubline }: SiteFooterProps) {
  const navTo = (page: MarketingSubView) => () => onNavigate(page);
  const openPortal = onOpenPortal ?? (() => onNavigate("home"));
  const openPartner = () => {
    if (typeof window !== "undefined") {
      window.location.hash = PARTNER_SIGN_IN_HASH;
    }
  };

  return (
    <footer className="fxSiteFooter" aria-label="Site footer">
      <div className="fxSiteFooterInner">
        <div className="fxSiteFooterGrid">
          <div className="fxSiteFooterBrandCol">
            <div className="fxSiteFooterBrandRow">
              <span className="fxLogoMark" aria-hidden="true" />
              <strong className="fxSiteFooterBrandWord">
                PropPrime<sup className="fxSiteFooterTm">™</sup>
              </strong>
            </div>
            <ul className="fxSiteFooterSocials" aria-label="Communities">
              {SOCIALS.map(({ key, label, href, Icon }) => (
                <li key={key}>
                  <a className="fxSiteFooterSocialBtn" href={href} title={label} aria-label={label}>
                    <Icon size={16} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
            <p className="fxSiteFooterAddress">
              <strong>PropPrime™ Markets LTD</strong>
              <br />
              1 - 13(A), First Floor, Paragon,
              <br />
              Jalan Tun Mustapha, 87009 Labuan
            </p>
            {brandSubline && <p className="fxSiteFooterMuted">{brandSubline}</p>}
          </div>

          <div className="fxSiteFooterCol">
            <h4 className="fxSiteFooterHdr">Contacts</h4>
            <button type="button" className="fxSiteFooterLink" onClick={navTo("support")}>
              Support Portal
            </button>
            <a className="fxSiteFooterLink" href="mailto:support@propprime.demo">
              Live Chat
            </a>
            <a className="fxSiteFooterLink" href="mailto:hello@propprime.demo">
              Contact
            </a>
            <button type="button" className="fxSiteFooterLink" onClick={navTo("resources")}>
              FAQs
            </button>
            <button type="button" className="fxSiteFooterLink" onClick={openPartner}>
              Become a Partner
            </button>
          </div>

          <div className="fxSiteFooterCol">
            <h4 className="fxSiteFooterHdr">Important Links</h4>
            <button type="button" className="fxSiteFooterLink" onClick={openPortal}>
              Trader Dashboard
            </button>
            <button type="button" className="fxSiteFooterLink" onClick={navTo("programs")}>
              Competitions
            </button>
            <a className="fxSiteFooterLink" href="mailto:careers@propprime.demo">
              Jobs
            </a>
            <button type="button" className="fxSiteFooterLink" onClick={navTo("programs")}>
              Purchase Assessment
            </button>
          </div>

          <div className="fxSiteFooterCol">
            <h4 className="fxSiteFooterHdr">Programs</h4>
            <button type="button" className="fxSiteFooterLink" onClick={navTo("how")}>
              How It Works
            </button>
            <button type="button" className="fxSiteFooterLink" onClick={navTo("programs")}>
              One Phase
            </button>
            <button type="button" className="fxSiteFooterLink" onClick={navTo("programs")}>
              Two Phase
            </button>
            <button type="button" className="fxSiteFooterLink" onClick={navTo("programs")}>
              Three Phase
            </button>
            <button type="button" className="fxSiteFooterLink" onClick={navTo("programs")}>
              Instant Funding
            </button>
            <button type="button" className="fxSiteFooterLink" onClick={navTo("programs")}>
              Lightning Challenge
            </button>
          </div>

          <div className="fxSiteFooterCol">
            <h4 className="fxSiteFooterHdr">Community</h4>
            <a className="fxSiteFooterLink" href="#discord">
              Official Discord Community
            </a>
            <a className="fxSiteFooterLink" href="#twitter">
              Official Twitter Community
            </a>
            <a className="fxSiteFooterLink" href="#facebook">
              Official Facebook Community
            </a>
            <a className="fxSiteFooterLink" href="#instagram">
              Official Instagram Community
            </a>
          </div>

          <div className="fxSiteFooterCol">
            <h4 className="fxSiteFooterHdr">Documents</h4>
            <button type="button" className="fxSiteFooterLink" onClick={navTo("terms")}>
              Terms and Conditions
            </button>
            <button type="button" className="fxSiteFooterLink" onClick={navTo("privacy")}>
              Privacy Policy
            </button>
            <button type="button" className="fxSiteFooterLink" onClick={navTo("cookies")}>
              Cookies Policy
            </button>
            <button type="button" className="fxSiteFooterLink" onClick={navTo("risk")}>
              Risk Disclosure
            </button>
          </div>
        </div>

        <div className="fxSiteFooterDivider" />

        <div className="fxSiteFooterLegal">
          <p>
            <strong>PropPrime™ Markets Ltd</strong> is licensed in Labuan, Malaysia, as a money-broker under licence
            no. MB/22/0097, with its registered office at 1 - 13(A), First Floor, Paragon, Jalan Tun Mustapha, 87009
            Labuan.
          </p>
          <p>
            <strong>PropPrime Solutions Limited</strong> is a registered company in the United Kingdom (Company No.
            14457720) with its registered office at 142 Central Street, Clerkenwell, London, United Kingdom, EC1V
            8AR, operating as a payment agent.
          </p>
          <p>
            All information provided on this website is intended for educational purposes only and is not directed at
            residents of any jurisdiction where such distribution or use would be contrary to local laws or
            regulations.
          </p>
          <p>
            The content on this site does not constitute investment advice, business recommendations, investment
            opportunity analysis, or any form of generic recommendation regarding the trading of financial
            instruments and is intended for users 18 years and older. Before engaging in trading, ensure you fully
            understand the risks involved and, if necessary, seek independent financial advice.
          </p>
          <p>
            Restricted Jurisdictions: We do not establish accounts to residents of certain jurisdictions including
            the United States, Zimbabwe, Iran, Iraq, North Korea, Somalia, Vietnam, Burundi, Central African
            Republic, Ivory Coast, Liberia, Libya, Sudan, Cuba, Syria, Afghanistan, Yemen, Palestine, Myanmar,
            Nicaragua, Congo Republic, Crimea, Democratic Republic of Congo, Eritrea, Guinea, Guinea-Bissau, Papua
            New Guinea, South Sudan, Vanuatu, Venezuela, Algeria, Russia, Belarus, Kenya, and Ghana, and / or any
            particular country or jurisdiction where such distribution or use would be contrary to local law or
            regulation. This website is intended for users who are 18 years and older.
          </p>
        </div>

        <div className="fxSiteFooterBottom">
          <span className="fxSiteFooterCopy">
            © {new Date().getFullYear()} PropPrime™ Markets — {variant === "portal" ? "Client Portal" : "Educational simulation"}.
          </span>
          {typeof window !== "undefined" && (
            <button
              type="button"
              className="fxSiteFooterTopBtn"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              aria-label="Back to top"
            >
              ↑
            </button>
          )}
        </div>
      </div>
    </footer>
  );
}
