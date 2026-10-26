/** Run through trusted operations with a verified Better Auth user ID or exact email. Never expose via a public route. */
import { prisma } from "../src/lib/db";

async function main() {
  const args = process.argv.slice(2);
  const byEmail = args.length === 2 && args[0] === "--email";
  const byId = args.length === 1 && /^[A-Za-z0-9_-]{6,150}$/.test(args[0]);
  if (!byId && (!byEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args[1]) || args[1].length > 254)) {
    throw new Error("Usage: npm run admin:bootstrap -- <VERIFIED_BETTER_AUTH_USER_ID> | --email <VERIFIED_GOOGLE_EMAIL>");
  }
  await prisma.$transaction(async db => {
    const existing = await db.systemRoleAssignment.count({ where: { role: "SUPER_ADMIN", revokedAt: null } });
    if (existing > 0) throw new Error("A Super Admin already exists. Further grants require a separate audited role-management procedure.");
    const user = await db.user.findUnique({
      where: byEmail ? { email: args[1] } : { id: args[0] },
      select: { id: true, emailVerified: true },
    });
    if (!user || !user.emailVerified) throw new Error("Target user not found or email has not been verified by the auth provider.");
    await db.systemRoleAssignment.create({ data: { userId: user.id, role: "SUPER_ADMIN", assignedBy: "BOOTSTRAP_CLI" } });
    await db.adminAuditLog.create({ data: { actorId: "BOOTSTRAP_CLI", action: "ROLE_ASSIGN", resourceType: "USER",
      resourceId: user.id, reason: "First Super Admin installed by local operational command", afterJson: { role: "SUPER_ADMIN" } } });
  }, { isolationLevel: "Serializable" });
  console.log("First Super Admin installed and audited.");
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Bootstrap failed"); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
