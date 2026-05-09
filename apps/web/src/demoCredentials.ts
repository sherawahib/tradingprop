/**
 * Seeded demo accounts — must match API defaults in `adminAuthService` + `managerAuthService`
 * unless ADMIN_BOOTSTRAP_* / you rotate the demo partner in state.
 */
export const DEMO_TRADER_LOGIN = "client1@propprime.demo";
export const DEMO_TRADER_PASSWORD = "pass1234";
export const DEMO_PARTNER_EMAIL = "partner@propprime.demo";
export const DEMO_PARTNER_PASSWORD = "PartnerDemo2026!";
/** Operator username is compared case-insensitively; upper-case form is stored server-side. */
export const DEMO_ADMIN_USERNAME = "PROPPRIME_OPS";
export const DEMO_ADMIN_PASSWORD = "OpsDemo2026!";

export const DEMO_URL_CLIENT_PORTAL = "Client portal (this page)";
export const DEMO_URL_PARTNER_HUB = "#/partner/sign-in";
export const DEMO_URL_OPS_CONSOLE = "#/ops/sign-in";
