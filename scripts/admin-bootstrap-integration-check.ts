/** Run only against a new, disposable finova_admin_test_* PostgreSQL database. */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";

function check(condition: unknown, description: string): asserts condition {
  if (!condition) throw new Error(`BOOTSTRAP_ASSERTION_FAILED: ${description}`);
}

async function runBootstrap(userId: string) {
  const child = spawn(process.execPath, ["--env-file-if-exists=.env", "--import", "tsx",
    "scripts/bootstrap-finova-super-admin.ts", userId], {
    cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", data => { stdout += data; });
  child.stderr.setEncoding("utf8").on("data", data => { stderr += data; });
  return new Promise<{ code: number; output: string }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", code => resolve({ code: code ?? 1, output: stdout + stderr }));
  });
}

async function main() {
  const databaseName = new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid").pathname;
  check(/^\/finova_admin_test_[a-zA-Z0-9_]+$/.test(databaseName),
    "bootstrap integration requires an isolated finova_admin_test_* database");
  check((await prisma.systemRoleAssignment.count({ where: { role: "SUPER_ADMIN", revokedAt: null } })) === 0,
    "test database must start without a Super Admin; no existing roles will be modified");

  const suffix = randomUUID().replaceAll("-", "");
  const verifiedA = `bootstrap_a_${suffix}`;
  const verifiedB = `bootstrap_b_${suffix}`;
  const unverified = `bootstrap_no_${suffix}`;
  const ids = [verifiedA, verifiedB, unverified];
  await prisma.user.createMany({ data: ids.map(id => ({
    id, name: id.slice(0, 20), email: `${id}@example.test`, emailVerified: id !== unverified,
  })) });
  try {
    const rejected = await runBootstrap(unverified);
    check(rejected.code !== 0 && rejected.output.includes("email has not been verified"),
      "unverified account cannot obtain the first Super Admin role");
    check((await prisma.systemRoleAssignment.count({ where: { role: "SUPER_ADMIN", revokedAt: null } })) === 0,
      "rejected bootstrap does not write a role");

    const attempts = await Promise.all([runBootstrap(verifiedA), runBootstrap(verifiedB)]);
    check(attempts.filter(result => result.code === 0).length === 1,
      "exactly one concurrent bootstrap succeeds");
    const roles = await prisma.systemRoleAssignment.findMany({
      where: { userId: { in: [verifiedA, verifiedB] }, role: "SUPER_ADMIN", revokedAt: null },
    });
    check(roles.length === 1 && roles[0].assignedBy === "BOOTSTRAP_CLI",
      "one verified user is installed as Super Admin by the operational CLI");
    const audits = await prisma.adminAuditLog.findMany({ where: {
      resourceType: "USER", resourceId: { in: [verifiedA, verifiedB] }, action: "ROLE_ASSIGN",
    } });
    check(audits.length === 1 && audits[0].resourceId === roles[0].userId &&
      audits[0].actorId === "BOOTSTRAP_CLI", "successful bootstrap is audited exactly once");

    const repeated = await runBootstrap(roles[0].userId === verifiedA ? verifiedB : verifiedA);
    check(repeated.code !== 0 && repeated.output.includes("A Super Admin already exists"),
      "bootstrap refuses a second privileged assignment");
    check((await prisma.systemRoleAssignment.count({ where: { role: "SUPER_ADMIN", revokedAt: null } })) === 1,
      "retries cannot grant another Super Admin role");
    console.log("PASS: Super Admin bootstrap denies unverified users, allows one concurrent first grant, audits it and rejects subsequent grants.");
  } finally {
    await prisma.systemRoleAssignment.deleteMany({ where: { userId: { in: ids } } });
    await prisma.adminAuditLog.deleteMany({ where: { resourceType: "USER", resourceId: { in: ids }, action: "ROLE_ASSIGN" } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
