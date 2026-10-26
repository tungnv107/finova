/** Only an explicitly named disposable database. No migrations against live Finova. */
const source = new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid");
if (source.hostname !== "127.0.0.1" || source.port !== "55433" || source.pathname !== "/finova") {
  throw new Error("AD5-08 monitor requires local Finova source");
}
source.pathname = "/finova_admin_test_monitor_20261026";
process.env.DATABASE_URL = source.toString();
await import("./admin-operational-monitor-integration-check.ts");
