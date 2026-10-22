# ADR-0003 — Mục tiêu tiết kiệm gắn với ví

**Status:** Accepted for P5, 20/10/2026.

**Bối cảnh:** Người dùng cần dành một phần tiền có thật trong ví cho nhiều mục tiêu. Nếu tạo tài sản hoặc ghi income cho mỗi lần phân bổ thì dashboard/net worth sẽ đếm đôi.

**Quyết định:** `SavingsGoal` tham chiếu ví thuộc cùng workspace; `GoalAllocation` ghi sự kiện `ALLOCATE`/`RELEASE` có idempotency key. Giá trị đã dành là tổng các sự kiện còn hiệu lực. Đây là earmarking, không tạo Journal/Posting, không tăng tài sản, doanh thu hoặc chi phí. Số dư ví lấy từ ledger, mức dành được kiểm tra trên dữ liệu ví thực và được bảo vệ bởi khóa giao dịch workspace. Lưu trữ mục tiêu không tự chuyển tiền hoặc xóa lịch sử phân bổ.

**Giới hạn:** Mục tiêu không phải tài khoản ngân hàng độc lập. Việc tiền đã dành trong ví được người dùng chi cho nghiệp vụ khác không tự sinh giao dịch rút khỏi mục tiêu; cần làm rõ trên giao diện số có thể sử dụng và cân nhắc ràng buộc chi tiêu ở phase sau.

**Bằng chứng:** `src/server/goals.ts`, migration `20261019235500_savings_goals`, integration P5 về allocation/release, ledger không đổi và net worth không đếm đôi.
