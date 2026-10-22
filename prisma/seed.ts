import { prisma } from "../src/lib/db";
import { seedCategories } from "../src/server/seed-categories";

async function main() {
  const workspaces = await prisma.workspace.findMany({ select: { id: true } });
  for (const workspace of workspaces) await seedCategories(workspace.id);
  console.log(`Đã đồng bộ danh mục mặc định cho ${workspaces.length} workspace. Không tạo dữ liệu tài chính giả.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
