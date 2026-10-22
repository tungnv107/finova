import { describe, expect, it } from "vitest";
import { renderReportPdf, topChartCategories } from "@/server/file-exports";

const base = {
  period: { start: "2026-10-01", endExclusive: "2026-11-01", actualEndExclusive: "2026-10-22" },
  filters: { walletId: null, categoryId: null },
  kpis: { income: "15000000", expense: "2500000", surplus: "12500000", available: "45000000" },
};

describe("PDF export rendering", () => {
  it("ranks the top seven net expenses with Decimal precision, independent of input order", () => {
    const categories = [
      { name: "Bé", amount: "1" },
      { name: "Lớn", amount: "900719925474099312346" },
      { name: "Trung bình", amount: "900719925474099312345" },
      ...Array.from({ length: 10 }, (_, i) => ({ name: `Danh mục ${i}`, amount: String(i + 2) })),
      { name: "Không phát sinh", amount: "0" },
    ];
    const ranked = topChartCategories(categories);
    expect(ranked).toHaveLength(7);
    expect(ranked[0].name).toBe("Lớn");
    expect(ranked[1].name).toBe("Trung bình");
    expect(ranked.map(row => row.amount)).toEqual([
      "900719925474099312346", "900719925474099312345", "11", "10", "9", "8", "7",
    ]);
    expect(categories[0].name).toBe("Bé");
    expect(topChartCategories([{ name: "Refund", amount: "-1" }, { name: "Chi", amount: "100" }])).toEqual([]);
    expect(topChartCategories([{ name: "Trống", amount: "0" }])).toEqual([]);
  });

  it("generates a real A4 PDF with Vietnamese content and many categories", async () => {
    const categories = Array.from({ length: 42 }, (_, i) => ({
      name: `Ăn uống và đi lại — danh mục số ${i + 1}`,
      amount: String(10000 + i * 1000),
    }));
    const pdf = await renderReportPdf({ ...base, categories }, new Date("2026-10-21T11:00:00Z"));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5000);
    expect(pdf.toString("latin1")).toMatch(/\/Type\s*\/Pages/);
  });

  it("renders mixed-sign net expenses without an inaccurate positive-only chart", async () => {
    const pdf = await renderReportPdf({ ...base, filters: { walletId: "w1", categoryId: "c1" },
      categories: [{ name: "Ăn uống", amount: "-300000" }, { name: "Di chuyển", amount: "700000" }],
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(3000);
  });

  it("supports an empty report and long labels with special XML characters and very large VND amounts", async () => {
    const empty = await renderReportPdf({ ...base, categories: [] });
    const large = await renderReportPdf({ ...base, categories: [
      { name: `Chi phí <A&B> "điện nước" ${"tên dài ".repeat(8)}`, amount: "900719925474099312345" },
      { name: "Ăn uống", amount: "100000000000000000000" },
    ] });
    expect(empty.subarray(0, 5).toString()).toBe("%PDF-");
    expect(large.subarray(0, 5).toString()).toBe("%PDF-");
    expect(large.length).toBeGreaterThan(5000);
  });

  it("paginates both short and very long category reports without failing on unicode", async () => {
    for (const count of [1, 7, 100]) {
      const pdf = await renderReportPdf({ ...base, categories: Array.from({ length: count }, (_, i) => ({
        name: `Điện & nước <đặc biệt> 'nhà tôi' ${"chi phí sinh hoạt ".repeat(i % 3)}`,
        amount: String(1000 + i * 1000),
      })) });
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdf.length).toBeGreaterThan(3000);
    }
  });
});
