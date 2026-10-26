/** Local-only AD5-08 QA. Reuse an already-migrated, dedicated browser-QA database. */
const source = new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid");
if (source.hostname !== "127.0.0.1" || source.port !== "55433" || source.pathname !== "/finova") {
  throw new Error("AD5-08 runner requires the local Finova connection source");
}
source.pathname = "/finova_admin_test_ad206_20261026";
process.env.DATABASE_URL = source.toString();
process.env.FINOVA_ADMIN_ENABLED = "1";
process.env.BETTER_AUTH_URL = "http://localhost:31646";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:31646";
await import("./admin-operational-alerts-integration-check.ts");
