/** Run locally with the exact verified Better Auth user ID, never from a public route. */
import { prisma } from "../src/lib/db";

async function main() {
  const userId = process.argv[2];
  if (!userId || !/^[A-Za-z0-9_-]{6,150}$/.test(userId) || process.argv.length !== 3) {
    throw new Error("Usage: npm run admin:bootstrap -- <VERIFIED_BETTER_AUTH_USER_ID>");
  }
  await prisma.$transaction(async db => {
    const existing = await db.systemRoleAssignment.count({ where: { role: "SUPER_ADMIN", revokedAt: null } });
    if (existing > 0) throw new Error("A Super Admin already exists. Further grants require a separate audited role-management procedure.");
    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, emailVerified: true } });
    if (!user || !user.emailVerified) throw new Error("Target user not found or email has not been verified by the auth provider.");
    await db.systemRoleAssignment.create({ data: { userId, role: "SUPER_ADMIN", assignedBy: "BOOTSTRAP_CLI" } });
    await db.adminAuditLog.create({ data: { actorId: "BOOTSTRAP_CLI", action: "ROLE_ASSIGN", resourceType: "USER",
      resourceId: userId, reason: "First Super Admin installed by local operational command", afterJson: { role: "SUPER_ADMIN" } } });
  }, { isolationLevel: "Serializable" });
  console.log("First Super Admin installed and audited.");
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Bootstrap failed"); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
