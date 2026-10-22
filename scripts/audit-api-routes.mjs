/** Static HTTP guard inventory. Ownership and SQL scopes still need integration review. */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.join(process.cwd(), "src", "app", "api", "v1");
const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const mutating = new Set(["POST", "PUT", "PATCH", "DELETE"]);
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
    if (!/\brequireContext\s*\(/.test(body)) failures.push(`${method} ${relative}: thiếu requireContext`);
    if (mutating.has(method) && !/\bassertSameOrigin\s*\(/.test(body)) {
      failures.push(`${method} ${relative}: thiếu assertSameOrigin`);
    }
  }
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
  console.log("PASS: tất cả v1 handlers gọi requireContext; mutations kiểm tra Origin.");
  console.log("Lưu ý: kiểm tra AST này chưa chứng nhận ownership ở service, response cache hay runtime E2E.");
}
