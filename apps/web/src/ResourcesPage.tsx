import { ArrowRight, BookOpen, FileText, MessageSquare } from "lucide-react";
import MarketingShell from "./MarketingShell";
import type { MarketingSubView } from "./marketingTypes";
import { faqTopFive } from "./programCatalog";

interface ResourcesPageProps {
  onNavigate: (page: MarketingSubView) => void;
  onOpenPortal: () => void;
}

export default function ResourcesPage({ onNavigate, onOpenPortal }: ResourcesPageProps) {
  return (
    <MarketingShell active="resources" onNavigate={onNavigate} onOpenPortal={onOpenPortal}>
      <section className="fxProgramsHero">
        <p className="fxEyebrow">Resources</p>
        <h1 className="fxSectionTitle">Learn the rules. Trade them confidently.</h1>
        <p className="fxSectionLead">FAQs, rule explainers, support, and developer references.</p>
      </section>

      <section className="fxSection">
        <header className="fxSectionHeader">
          <p className="fxEyebrow">Top five</p>
          <h2 className="fxSectionTitle">Frequently asked</h2>
        </header>
        <ul className="fxFaqAccord">
          {faqTopFive.map((q) => (
            <li key={q.question} className="fxFaqAccordRow">
              <BookOpen size={16} aria-hidden="true" />
              <div>
                <p className="fxFaqQ">{q.question}</p>
                <p className="fxFaqA">{q.answer}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="fxSection fxSectionMuted">
        <header className="fxSectionHeader">
          <p className="fxEyebrow">More</p>
          <h2 className="fxSectionTitle">Other places to go next</h2>
        </header>
        <div className="fxResourceCards">
          <article className="fxResourceCard">
            <FileText size={18} aria-hidden="true" />
            <h3>Legal documents</h3>
            <p>Terms of service, privacy policy, cookie policy, and risk disclosures.</p>
            <button type="button" className="fxLinkBtn" onClick={() => onNavigate("terms")}>
              Open documents <ArrowRight size={13} aria-hidden="true" />
            </button>
          </article>
          <article className="fxResourceCard">
            <MessageSquare size={18} aria-hidden="true" />
            <h3>Support</h3>
            <p>Open a support ticket from inside your client portal — or reach the support page from the footer.</p>
            <button type="button" className="fxLinkBtn" onClick={() => onNavigate("support")}>
              Get help <ArrowRight size={13} aria-hidden="true" />
            </button>
          </article>
          <article className="fxResourceCard">
            <BookOpen size={18} aria-hidden="true" />
            <h3>How it works</h3>
            <p>Step-by-step explainer for the simulated evaluation flow.</p>
            <button type="button" className="fxLinkBtn" onClick={() => onNavigate("how")}>
              Walk through <ArrowRight size={13} aria-hidden="true" />
            </button>
          </article>
        </div>
      </section>

      <section className="fxCtaBlock">
        <div>
          <h2 className="fxCtaBlockTitle">Got questions about your account?</h2>
          <p className="fxCtaBlockLead">Open the portal, check your dashboard, or file a support ticket.</p>
        </div>
        <div className="fxCtaBlockBtns">
          <button type="button" className="fxCtaFilled" onClick={onOpenPortal}>
            Open portal
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </section>
    </MarketingShell>
  );
}
