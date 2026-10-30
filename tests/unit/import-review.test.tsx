import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ImportManager } from "@/components/import-manager";
import { ImportReview, type ImportBatch } from "@/components/import-review";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const wallets = [{ id: "wallet", name: "Tài khoản chính" }];
const categories = [{ id: "food", name: "Ăn uống", kind: "EXPENSE" }];
const row: ImportBatch["rows"][number] = { id: "row", rowNumber: 1, kind: "EXPENSE", amount: "50000", date: "2026-10-01", note: "Ăn trưa", status: "INVALID", error: "Cần xác nhận danh mục.", categoryId: null, destinationWalletId: null, walletId: "wallet", confidence: 0.5, categoryReason: "Chưa chắc chắn", needsReview: true, sourceReference: null };
const batch: ImportBatch = { id: "batch", fileName: "Sao kê từ văn bản", status: "PREVIEW", counts: { INVALID: 1 }, total: 1, rows: [row] };
const props = { wallets, categories, onChange: vi.fn(), onLockedChange: vi.fn() };

describe("resumable statement review", () => {
  it("exposes confirmation, edit and delete when reopening a saved AI batch with no valid rows", () => {
    const html = renderToStaticMarkup(<ImportManager wallets={wallets} categories={categories} batches={[]} aiAvailable={false} initialPreview={batch} />);
    expect(html).toContain('aria-label="Xác nhận dòng 1"');
    expect(html).toContain('aria-label="Sửa dòng 1"');
    expect(html).toContain('aria-label="Xóa dòng 1"');
    expect(html).toContain("50.000 ₫");
    expect(html).toContain("Chưa chọn danh mục");
    expect(html).toMatch(/disabled=""[^>]*>[\s\S]*?Nhập 0 giao dịch vào ví/);
  });
  it("does not gate row corrections on AI confidence being present", () => {
    const html = renderToStaticMarkup(<ImportReview {...props} batch={{ ...batch, rows: [{ ...row, confidence: null }] }} />);
    expect(html).toContain('aria-label="Sửa dòng 1"');
    expect(html).toContain('aria-label="Xác nhận dòng 1"');
  });
  it("locks posted rows and keeps duplicates removable without making them importable", () => {
    const html = renderToStaticMarkup(<ImportReview {...props} batch={{ ...batch, total: 2, counts: { IMPORTED: 1, DUPLICATE: 1 }, rows: [{ ...row, status: "IMPORTED" }, { ...row, id: "dup", rowNumber: 2, status: "DUPLICATE" }] }} />);
    expect(html).not.toContain('aria-label="Sửa dòng 1"');
    expect(html).not.toContain('aria-label="Xóa dòng 1"');
    expect(html).not.toContain('aria-label="Xác nhận dòng 2"');
    expect(html).toContain('aria-label="Xóa dòng 2"');
    expect(html).toContain("Đã ghi vào ví");
  });
});
