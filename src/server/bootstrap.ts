import { Prisma } from "@finova/prisma";
import { prisma } from "@/lib/db";
import { seedCategories } from "@/server/seed-categories";

/** Called after a verified session. Safe to invoke more than once or concurrently. */
export async function bootstrapPersonalWorkspace(user: { id: string; name: string }) {
  const workspaceId = `personal-${user.id}`;
  const [workspace, preferences] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } }),
    prisma.userPreferences.findUnique({ where: { userId: user.id }, select: { userId: true } }),
  ]);
  if (!workspace) {
    try {
      await prisma.workspace.upsert({
        where: { id: workspaceId },
        create: { id: workspaceId, name: `Cá nhân · ${user.name}`, createdById: user.id, memberships: { create: { userId: user.id } } },
        update: {},
      });
    } catch (error) {
      // Concurrent bootstrap can race the nested membership create.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" &&
          await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } }))) throw error;
    }
  }
  if (!preferences) await prisma.userPreferences.createMany({ data: [{ userId: user.id }], skipDuplicates: true });
  await seedCategories(workspaceId);
  return workspaceId;
}
