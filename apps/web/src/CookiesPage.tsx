import MarketingArticleShell from "./MarketingArticleShell";
import type { MarketingSubView } from "./marketingTypes";

interface CookiesPageProps {
  onNavigate: (page: MarketingSubView) => void;
  onOpenPortal: () => void;
}

export default function CookiesPage({ onNavigate, onOpenPortal }: CookiesPageProps) {
  return (
    <MarketingArticleShell
      active="cookies"
      onNavigate={onNavigate}
      onOpenPortal={onOpenPortal}
      annTag="Legal"
      annText="Browser storage we use to keep your session working."
      title="Cookies & local storage policy"
      updated="May 2026"
    >
      <section>
        <h2>What we store</h2>
        <p>
          The PropPrime app does not set traditional HTTP cookies in the demo build. Instead it uses{" "}
          <code>sessionStorage</code> and <code>localStorage</code> to keep your authentication tokens between page
          reloads.
        </p>
        <ul>
          <li><code>propprime-session-token</code> — portal JWT for the current tab.</li>
          <li><code>propprime-token</code> — portal JWT when "remember this device" is checked.</li>
          <li><code>propprime-terminal-session-token</code> / <code>propprime-terminal-token</code> — per-package terminal JWTs.</li>
          <li><code>propprime-admin-session</code> — operator JWT.</li>
          <li><code>propprime-partner-session</code> — partner / manager JWT.</li>
          <li><code>propprime-pending-referral</code> — temporary referral code captured from <code>?ref=</code>.</li>
        </ul>
      </section>
      <section>
        <h2>Clearing storage</h2>
        <p>
          Sign out from the portal, terminal, operator console, or partner hub to clear your session storage entries.
          Your browser's "Clear site data" command also removes everything for this origin.
        </p>
      </section>
    </MarketingArticleShell>
  );
}
