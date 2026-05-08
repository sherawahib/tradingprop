/**
 * Program lineup structured from public prop-firm program pages
 * (see e.g. reference layout: https://fxify.com/programs/two-phase/).
 * PropPrime naming only — not affiliated with any third-party firm.
 */

export type ProgramKey = "ONE_PHASE" | "TWO_PHASE" | "THREE_PHASE" | "INSTANT_FUNDING" | "LIGHTNING";

export const programTabOrder: ProgramKey[] = ["ONE_PHASE", "TWO_PHASE", "THREE_PHASE", "INSTANT_FUNDING", "LIGHTNING"];

export const programTabLabel: Record<ProgramKey, string> = {
  ONE_PHASE: "One Phase",
  TWO_PHASE: "Two Phase",
  THREE_PHASE: "Three Phase",
  INSTANT_FUNDING: "Instant Funding",
  LIGHTNING: "Lightning"
};

export interface AccountTier {
  sizeLabel: string;
  feeLabel: string;
  note?: string;
}

export interface ProgramDefinition {
  key: ProgramKey;
  headline: string;
  intro: string;
  audience: string;
  accountTiers: AccountTier[];
  includes: string[];
  ruleHighlights: string[];
}

export const programs: Record<ProgramKey, ProgramDefinition> = {
  TWO_PHASE: {
    key: "TWO_PHASE",
    headline: "Two Phase",
    intro:
      "Built for traders who can show consistent discipline across two assessment phases. You pass two evaluations before operating on a funded-style account with dashboards, rules, and payouts in one stack.",
    audience: "Traders who prefer a structured, industry-common evaluation path with clear phase gates.",
    accountTiers: [
      { sizeLabel: "$50,000 evaluation", feeLabel: "from $349", note: "Demo pricing in app" },
      { sizeLabel: "$100,000 evaluation", feeLabel: "from $549", note: "Demo pricing in app" },
      { sizeLabel: "$200,000 evaluation", feeLabel: "from $849", note: "Demo pricing in app" }
    ],
    includes: ["Industry dashboard (progress, risk, violations)", "Customisable addons at checkout", "Unlimited evaluation days where applicable"],
    ruleHighlights: ["Phase 1 profit target before Phase 2", "Daily drawdown guardrails", "Max drawdown cap", "Rule engine enforced in terminal"]
  },
  ONE_PHASE: {
    key: "ONE_PHASE",
    headline: "One Phase",
    intro:
      "Single evaluation cycle for traders confident in passing one set of objectives. Faster path than multi-phase routes when consistency is already embedded in process.",
    audience: "Beginners and advanced traders who want fewer gates before progression.",
    accountTiers: [
      { sizeLabel: "$5,000 evaluation", feeLabel: "from $250", note: "Example tier on reference pages" },
      { sizeLabel: "$25,000 evaluation", feeLabel: "from $399", note: "" },
      { sizeLabel: "$100,000 evaluation", feeLabel: "from $599", note: "" }
    ],
    includes: ["One profit target hurdle", "Drawdown profiles (static/trailing simulated)", "Web terminal linkage to same account"],
    ruleHighlights: ["Single-phase pass/fail clarity", "Addon bundles at checkout", "Credential issuance after simulated purchase"]
  },
  THREE_PHASE: {
    key: "THREE_PHASE",
    headline: "Three Phase",
    intro:
      "Progressive checkpoints for traders who benefit from gradual scaling of difficulty and scrutiny across three milestones.",
    audience: "Structured learners and teams running repeatable playbooks.",
    accountTiers: [
      { sizeLabel: "$25,000 evaluation", feeLabel: "from $379", note: "" },
      { sizeLabel: "$100,000 evaluation", feeLabel: "from $649", note: "" },
      { sizeLabel: "$400,000 evaluation", feeLabel: "from $1299", note: "Cap illustrative" }
    ],
    includes: ["Three staged objectives", "Dashboard phase timeline", "Admin reset/promotion hooks"],
    ruleHighlights: ["Phase rollover on pass", "Breach freezes account", "Payout unlocked only on funded/eligible tier"]
  },
  INSTANT_FUNDING: {
    key: "INSTANT_FUNDING",
    headline: "Instant Funding",
    intro:
      "Skip staged evaluation — start directly on an account tier designed for payout cadence simulation and addon-driven economics.",
    audience: "Experienced traders who want speed over evaluation drama.",
    accountTiers: [
      { sizeLabel: "$10,000", feeLabel: "from $499", note: "Simulation capital" },
      { sizeLabel: "$25,000", feeLabel: "from $799", note: "" },
      { sizeLabel: "$50,000", feeLabel: "from $1499", note: "" }
    ],
    includes: ["No staged profit target hurdle", "Bi-weekly style payout scheduling options", "Split upgrades via addons"],
    ruleHighlights: ["Operational drawdown envelopes still apply", "Payout queues require admin clearance in demo ops"]
  },
  LIGHTNING: {
    key: "LIGHTNING",
    headline: "Lightning Challenge",
    intro:
      "Low entry fee, fast turnaround challenge for proving execution under tight targets — ideal onboarding SKU.",
    audience: "Budget-conscious traders and rapid skill checks.",
    accountTiers: [
      { sizeLabel: "$5,000 evaluation", feeLabel: "from $59", note: "Entry-level SKU pattern" },
      { sizeLabel: "$10,000 evaluation", feeLabel: "from $99", note: "" },
      { sizeLabel: "$25,000 evaluation", feeLabel: "from $179", note: "" }
    ],
    includes: ["One-step hurdle", "~5% target style objective on low tiers", "Upgrade paths to larger evaluations"],
    ruleHighlights: ["Fast credential path", "Same risk engine + portal as flagship programs"]
  }
};

/** Checkout-style addons mirrored from common program pages */
export interface ProgramAddon {
  title: string;
  description: string;
}

export const programAddons: ProgramAddon[] = [
  {
    title: "Increased leverage",
    description: "Optional higher simulated leverage tiers for qualifying accounts where your risk preset allows extra headroom."
  },
  {
    title: "Extra performance split (+15%)",
    description: "Raise your payout share on simulated gains toward a 90/10-style split profile when addons are purchased at checkout."
  },
  {
    title: "Bi-weekly payouts",
    description: "Shorten payout windows after first withdrawal cycle so withdrawals can run as frequent as twice monthly when unlocked."
  }
];

export const payoutPolicy = {
  firstWithdrawalSummary:
    "First simulated withdrawal can follow an on-demand request path after eligibility is met — minimum payout amount commonly around $50 in industry examples; some programs require minimum active trading days before first withdrawal.",
  firstPayoutTradingDaysHint: "Reference programs often cite ~5 minimum trading days before certain first payouts (verify your exact rule pack).",
  splitHeading: "Up to 90% performance split",
  splitBody: "Traders may receive elevated split via addon selection on funded/eligible tiers in our simulated stack.",
  principles: ["Easy payout flow in portal", "Flexible scheduling options vs addon", "On-demand-first style where rules allow"]
};

export const brokerStyleFeatures = {
  headline: "What you’d expect from a retail broker-grade stack",
  bullets: [
    { title: "RAW or All‑In feeds", detail: "Simulated choice between raw-plus-commission-style or all-in markup-style pricing personas." },
    { title: "100+ instruments", detail: "FX, metals, indices, oil-equivalent CFD personas — expandable list in roadmap." },
    { title: "Trader-friendly leverage", detail: "Common baseline 30:1-style FX personas; addons can elevate toward 50:1 where enabled." },
    { title: "Platform choice", detail: "Web terminal now; adapters for TradingView embed and third-party gateways are pluggable layers." }
  ],
  checklist: ["Tight simulated spreads personas", "From 0.0-style majors in marketing tier", "Consistent rounding + audit trail"]
};

export interface FaqItem {
  question: string;
  answer: string;
}

export const faqTopFive: FaqItem[] = [
  {
    question: "What are pros and cons of trading a prop evaluation?",
    answer:
      "Pros: simulated capital sizing, dashboards, payout mechanics. Cons: breach risk, behavioural pressure, splits vs fully independent trading."
  },
  {
    question: "Do prop-style platforms actually pay?",
    answer: "Healthy operators pay per published rules once funded or eligible tiers are unlocked — always read terms and jurisdiction blocks."
  },
  {
    question: "What is a prop trading firm?",
    answer: "Capital provider runs evaluation tiers; trader receives accounts under rules aiming for shared simulated or live economics."
  },
  {
    question: "When do I receive account details after signup?",
    answer: "In this demo stack, signup issues credentials instantly in Client Portal — production would mirror email + inbox checks."
  },
  {
    question: "Are there fees beyond evaluation purchase?",
    answer: "We surface swap/spread personas in disclaimers — addon prices are explicit before checkout simulation in a full rollout."
  }
];
