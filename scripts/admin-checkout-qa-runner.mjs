/** Local-only AD2-06 QA runner. Refuses non-local or non-dedicated database targets. */
const source = new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid");
if (source.hostname !== "127.0.0.1" || source.port !== "55433" || source.pathname !== "/finova") {
  throw new Error("AD2-06 runner requires the local Finova connection source");
}
source.pathname = "/finova_admin_test_ad206_20261026";
process.env.DATABASE_URL = source.toString();
process.env.FINOVA_ADMIN_ENABLED = "1";
process.env.FINOVA_BILLING_CHECKOUT_ENABLED = "1";
process.env.FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED = "1";
process.env.FINOVA_USAGE_ANALYTICS_ENABLED = "0";
process.env.FINOVA_BILLING_ENCRYPTION_KEY = "a".repeat(64); // disposable QA fixture only
process.env.BETTER_AUTH_URL = "http://localhost:31646";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:31646";
process.env.FINOVA_BROWSER_URL = "http://localhost:31646";
await import("./admin-checkout-browser-check.ts");
