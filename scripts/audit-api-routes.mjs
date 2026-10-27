/** Static HTTP guard inventory. Ownership and SQL scopes still need integration review. */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.join(process.cwd(), "src", "app", "api", "v1");
const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const mutating = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// Public catalog is read-only. Every other v1 handler must authenticate through
// a signed session via one of these reviewed server-side guards.
const publicReadRoutes = new Set(["GET api/v1/billing/plans/route.ts"]);
const sessionGuards = ["requireContext", "requireStatementImportContext", "requireBankSyncContext",
  "requireNotificationsContext", "requireSystemRole"];
// A signed session alone is insufficient for paid utilities. A new route must
// explicitly require its feature entitlement as well as a signed session.
const premiumApiGuards = [
  ["api/v1/imports/", "requireStatementImportContext"],
  ["api/v1/bank-sync/", "requireBankSyncContext"],
  ["api/v1/notifications/", "requireNotificationsContext"],
];
const files = [];
function visit(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(fullPath);
    else if (entry.name === "route.ts") files.push(fullPath);
  }
}
visit(root);

let handlers = 0;
const failures = [];
const inventory = [];
for (const file of files.sort()) {
  const content = readFileSync(file, "utf8");
  const parsed = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const relative = path.relative(path.join(process.cwd(), "src", "app"), file).replaceAll("\\", "/");
  const handlersInFile = parsed.statements.filter(node =>
    ts.isFunctionDeclaration(node) && node.name && methods.has(node.name.text) &&
    node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword));
  if (!handlersInFile.length) failures.push(`${relative}: thiếu exported HTTP handler`);
  for (const handler of handlersInFile) {
    handlers++;
    const method = handler.name.text;
    inventory.push({ method, route: "/" + relative.replace(/\/route\.ts$/, "") });
    const body = handler.body?.getText(parsed) ?? "";
    const premiumGuard = premiumApiGuards.find(([prefix]) => relative.startsWith(prefix))?.[1];
    if (premiumGuard && !new RegExp("\\b" + premiumGuard + "\\s*\\(").test(body)) {
      failures.push(method + " " + relative + ": thiếu Premium feature guard " + premiumGuard);
    }
    if (!publicReadRoutes.has(`${method} ${relative}`) &&
      !sessionGuards.some(guard => new RegExp(`\\b${guard}\\s*\\(`).test(body))) {
      failures.push(`${method} ${relative}: thiếu signed-session/system-role/feature guard`);
    }
    // Admin endpoints must use platform-level RBAC. A normal workspace owner
    // can pass requireContext(), so that guard is insufficient here.
    if (relative.startsWith("api/v1/admin/") && !/\brequireSystemRole\s*\(/.test(body)) {
      failures.push(`${method} ${relative}: admin endpoint thiếu platform RBAC`);
    }
    if (mutating.has(method) && !/\bassertSameOrigin\s*\(/.test(body)) {
      failures.push(`${method} ${relative}: thiếu assertSameOrigin`);
    }
  }
}

// App Router can evaluate page and layout components independently. Every
// data-reading admin page must have its own role guard before querying data.
const adminDir = path.join(process.cwd(), "src", "app", "(admin-portal)", "admin");
function checkAdminPages(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) { checkAdminPages(fullPath); continue; }
    if (entry.name !== "page.tsx" && entry.name !== "layout.tsx") continue;
    const content = readFileSync(fullPath, "utf8");
    if (!/\brequireAdminPageRole\s*\(/.test(content)) {
      failures.push(`${path.relative(process.cwd(), fullPath)}: thiếu page-level platform RBAC`);
    }
  }
}
checkAdminPages(adminDir);

// Paid pages must guard their own render before reading user financial data.
// The protected layout also hides the entire utility navigation group for Lite.
for (const [route, feature] of [
  ["imports", "STATEMENT_IMPORT"], ["bank-sync", "BANK_SYNC"], ["notifications", "NOTIFICATIONS"],
]) {
  const source = readFileSync(path.join(process.cwd(), "src", "app", "(protected)", route, "page.tsx"), "utf8");
  if (!source.includes('requirePremiumPage(') || !source.includes('"' + feature + '"')) {
    failures.push("/" + route + ": thiếu Premium page guard");
  }
}
const protectedLayout = readFileSync(path.join(process.cwd(), "src", "app", "(protected)", "layout.tsx"), "utf8");
const navigation = readFileSync(path.join(process.cwd(), "src", "components", "navigation.tsx"), "utf8");
if (!protectedLayout.includes('hasPremiumFeature(') || !navigation.includes('utilitiesEnabled &&')) {
  failures.push("Protected layout/navigation: thiếu ẩn nhóm tiện ích cho Lite");
}

// Recheck inside the transaction that writes imported rows, bank events,
// canonical ledger entries and notification reminders.
for (const [file, required] of [
  ["src/server/imports.ts", "requireWorkspacePremiumInDb"],
  ["src/server/notifications.ts", "requireWorkspacePremiumInDb"],
  ["src/modules/bank-sync/service.ts", "requireWorkspacePremiumInDb"],
  ["src/modules/bank-sync/sepay/service.ts", "requireWorkspacePremiumInDb"],
]) {
  if (!readFileSync(path.join(process.cwd(), file), "utf8").includes(required + "(")) {
    failures.push(file + ": thiếu Premium worker/transaction recheck");
  }
}
const httpSource = readFileSync(path.join(process.cwd(), "src", "server", "http.ts"), "utf8");
if (!/Cache-Control.*no-store/.test(httpSource)) {
  failures.push("HTTP response helper: thiếu no-store cho dữ liệu riêng tư");
}

// These two endpoints use different, explicit authentication strategies.
const authSource = readFileSync(path.join(process.cwd(), "src", "app", "api", "auth", "[...all]", "route.ts"), "utf8");
if (!/limitAuthRequest\s*\(/.test(authSource) || !/configuredAppOrigin\s*\(/.test(authSource)) {
  failures.push("/api/auth/[...all]: thiếu pre-auth quota hoặc kiểm tra origin cấu hình");
}
const schedulerSource = readFileSync(path.join(process.cwd(), "src", "app", "api", "internal", "recurring", "route.ts"), "utf8");
if (!/timingSafeEqual\s*\(/.test(schedulerSource) || !/consumeRateLimitKey\s*\(/.test(schedulerSource)) {
  failures.push("/api/internal/recurring: thiếu Bearer constant-time verification hoặc quota");
}

if (process.argv.includes("--markdown")) {
  console.log("| HTTP method | Endpoint |\n| --- | --- |");
  for (const { method, route } of inventory) console.log(`| ${method} | \`${route}\` |`);
}

console.log(`API guard audit: ${files.length} v1 route files, ${handlers} HTTP handlers.`);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exitCode = 1;
} else {
  console.log("PASS: tất cả v1 handlers có session/role/feature guard (ngoại trừ public plan catalog); mutations kiểm tra Origin.");
  console.log("Lưu ý: kiểm tra AST này chưa chứng nhận ownership ở service, response cache hay runtime E2E.");
}
