# ADR-0001 — Ledger VND, double entry, reversal

**Status:** Accepted for MVP, 19/10/2026.

**Context:** Cần chính xác tiền và sửa/hủy có khả năng đối soát, không lưu mutable balance gây sai số.

**Decision:** PostgreSQL NUMERIC(20,4), API integer VND dạng chuỗi, Decimal.js, Wallet liên kết LedgerAccount. Journal/Postings cân đối và immutable; sửa/hủy bằng reversed journal và replacement. Thu/chi từ tài khoản INCOME/EXPENSE; chuyển nội bộ và opening equity không ảnh hưởng thu chi. Múi giờ mặc định +07, report `[start, endExclusive)`.

**Trade-offs:** Nhiều journal hơn; phải đối soát/aggregate postings theo kỳ. FX vẫn chưa hỗ trợ. Công nợ và thẻ đã có model/service/test riêng trong P5 (ADR-0004 và ADR-0005). Migration `20261019222000_deferred_journal_integrity` đã triển khai deferred constraint trigger ở COMMIT bên cạnh kiểm tra service; vẫn cần hardening, đo tải và backup trước production.
