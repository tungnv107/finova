# ADR-0004 — Công nợ, lãi và lịch trả dự phóng

**Status:** Accepted for P5, 20/10/2026.

**Bối cảnh:** Nhận/trả vốn vay, cho vay/thu hồi gốc phải ghi nhận tài sản và công nợ đúng nguyên tắc, không làm sai KPI thu/chi. Một kế hoạch kỳ hạn do người dùng nhập chưa đủ bằng chứng để tự động ghi lãi thực tế.

**Quyết định:** Mỗi `DebtContract` có ledger account `LIABILITY` (đi vay) hoặc `RECEIVABLE` (cho vay), liên kết journal giải ngân. Mỗi `DebtPayment` sinh journal cân bằng: phần gốc giảm công nợ, phần lãi ghi `EXPENSE`/`INCOME` tại ngày thanh toán, đối ứng bằng ví. Không ghi lãi ước tính trước khi thanh toán. Kiểm tra dư gốc từ postings, giới hạn số gốc thanh toán và khóa thao tác thanh toán theo workspace; idempotency key chống ghi trùng.

**Dự phóng:** `projectedDebtSchedule()` sử dụng gốc cố định từng kỳ, lãi danh nghĩa năm chia 12 trên dư gốc giảm dần, làm tròn VND, bù phần dư vào kỳ cuối và tính ngày theo lịch. Chỉ hiển thị lịch tham khảo từ gốc/hợp đồng ban đầu; giao diện tách khỏi lịch sử thanh toán thực tế.

**Giới hạn:** Chưa phân bổ khoản trả trước/trả thiếu vào từng kỳ, chưa xử lý điều chỉnh lãi suất, lịch hợp đồng phức tạp, phí phạt, lãi tích lũy và lịch trả đã cập nhật theo nghiệp vụ. Cảnh báo quá hạn hiện dựa vào hạn cuối hợp đồng và dư gốc. Không được gọi lịch dự phóng là lịch ngân hàng đã xác nhận.

**Bằng chứng:** `src/server/debts.ts`, `src/lib/debt-schedule.ts`, `tests/unit/debt-schedule.test.ts`, migration `20261020080000_debts_cards` và kiểm thử integration P5.
