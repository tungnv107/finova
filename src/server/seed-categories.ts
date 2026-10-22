import { AccountKind, Prisma } from "@finova/prisma";
import { prisma } from "@/lib/db";

const defaults: { name: string; kind: AccountKind; icon: string; color: string }[] = [
  { name: "Lương", kind: "INCOME", icon: "Briefcase", color: "#047857" },
  { name: "Thưởng", kind: "INCOME", icon: "Gift", color: "#047857" },
  { name: "Kinh doanh", kind: "INCOME", icon: "Store", color: "#047857" },
  { name: "Đầu tư", kind: "INCOME", icon: "TrendingUp", color: "#047857" },
  { name: "Thu nhập khác", kind: "INCOME", icon: "Wallet", color: "#047857" },
  { name: "Ăn uống", kind: "EXPENSE", icon: "Utensils", color: "#1E5EFF" },
  { name: "Đi lại", kind: "EXPENSE", icon: "Car", color: "#18C5C2" },
  { name: "Nhà ở", kind: "EXPENSE", icon: "House", color: "#FFB020" },
  { name: "Hóa đơn", kind: "EXPENSE", icon: "Receipt", color: "#7C3AED" },
  { name: "Mua sắm", kind: "EXPENSE", icon: "ShoppingBag", color: "#0F8F7A" },
  { name: "Giải trí", kind: "EXPENSE", icon: "Clapperboard", color: "#64748B" },
  { name: "Giáo dục", kind: "EXPENSE", icon: "GraduationCap", color: "#B54708" },
  { name: "Y tế", kind: "EXPENSE", icon: "HeartPulse", color: "#C2410C" },
  { name: "Gia đình", kind: "EXPENSE", icon: "Users", color: "#087D79" },
  { name: "Du lịch", kind: "EXPENSE", icon: "Plane", color: "#0B1F4A" },
  { name: "Chi phí khác", kind: "EXPENSE", icon: "Circle", color: "#64748B" },
];

export async function seedCategories(workspaceId: string) {
  if (await prisma.category.count({ where: { workspaceId } })) return;
  // Stable account codes allow safe re-entry after partial onboarding or concurrent login.
  try {
  await prisma.$transaction(async (tx) => {
    for (const [i, item] of defaults.entries()) {
      const code = `CAT_${item.kind}_${i}`;
      const ledgerAccount = await tx.ledgerAccount.upsert({
        where: { workspaceId_code: { workspaceId, code } },
        create: { workspaceId, code, name: item.name, kind: item.kind },
        update: {},
      });
      await tx.category.upsert({
        where: { workspaceId_kind_name: { workspaceId, kind: item.kind, name: item.name } },
        create: { workspaceId, ...item, ledgerAccountId: ledgerAccount.id },
        update: {},
      });
    }
  });
  } catch (error) {
    // A simultaneous first login may have committed this complete seed.
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
      if (await prisma.category.count({ where: { workspaceId } }) === defaults.length) return;
    }
    throw error;
  }
}
