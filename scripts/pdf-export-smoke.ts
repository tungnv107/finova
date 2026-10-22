import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderReportPdf } from "../src/server/file-exports";

async function main() {
  const folder = join(process.cwd(), "artifacts", "qa");
  await mkdir(folder, { recursive: true });
  const common = {
  period: { start: "2026-10-01", endExclusive: "2026-11-01", actualEndExclusive: "2026-10-22" },
  filters: { walletId: null, categoryId: null },
  kpis: { income: "15000000", expense: "2500000", surplus: "12500000", available: "45000000" },
  };
  const full = await renderReportPdf({ ...common, categories: Array.from({ length: 42 }, (_, i) => ({
  name: `Chi tiêu ăn uống, đi lại và sinh hoạt ${i + 1}`,
  amount: String(85000 + i * 4000),
  })) }, new Date("2026-10-21T11:00:00Z"));
  const refund = await renderReportPdf({ ...common, categories: [
  { name: "Ăn uống", amount: "-350000" }, { name: "Di chuyển", amount: "680000" },
  ] }, new Date("2026-10-21T11:00:00Z"));
  await writeFile(join(folder, "finova-pdf-many-categories.pdf"), full);
  await writeFile(join(folder, "finova-pdf-refund.pdf"), refund);
  console.log(`PDF smoke: generated ${full.length} and ${refund.length} bytes`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
