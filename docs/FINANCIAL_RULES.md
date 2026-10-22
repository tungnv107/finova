# Quy tắc tài chính (VND / double-entry ledger)

## Tài khoản và dấu

`ASSET`, `EXPENSE`, `RECEIVABLE` có số dư chuẩn Debit. `INCOME`, `LIABILITY`, `EQUITY` có số dư chuẩn Credit. Mọi Posting phải dương, VND nguyên; mỗi Journal ít nhất hai postings và tổng Debit bằng Credit. Một thao tác nghiệp vụ và tất cả postings/audit cùng PostgreSQL transaction.

| Sự kiện | Debit | Credit | Thu/chi KPI |
| --- | --- | --- | --- |
| Tạo ví, số dư đầu kỳ | Asset ví | Equity opening | 0 / 0 |
| Thu nhập | Asset ví | Income danh mục | tăng thu |
| Chi tiêu | Expense danh mục | Asset ví | tăng chi |
| Chuyển tiền nội bộ | Asset ví đích | Asset ví nguồn | 0 / 0 |
| Hoàn tiền chi phí | Asset ví | Expense danh mục | giảm chi |
| Sửa giao dịch | Đảo các postings gốc, ghi postings mới | tương ứng | theo net postings |
| Hủy giao dịch | Reversal đảo postings gốc | tương ứng | bù trừ kỳ gốc |

## Chính sách triển khai

- Số tiền truyền API dưới dạng chuỗi số nguyên (`"500000"`), xử lý bằng Decimal.js và NUMERIC SQL. Không dùng JS floating-point để tính tiền hoặc so sánh cân đối.
- Giao dịch thực tế lưu `occurredAt`, kế toán lưu `effectiveAt`; ngày hiển thị `Asia/Ho_Chi_Minh`, kỳ `[start, endExclusive)`.
- Khi sửa/hủy, journal gốc không sửa; reversal giữ nguyên thời điểm và ví gốc; replacement có thời điểm và ví mới. Thao tác có optimistic version.
- Hoàn tiền liên kết `originalTransactionId`, chỉ hoàn khoản chi đang ACTIVE, tổng hoàn không vượt chi gốc. Giao dịch gốc có hoàn tiền đang hoạt động không được sửa/hủy trước khi xử lý hoàn tiền.
- Tồn quỹ có thể âm theo lịch sử chi; chính sách chặn số dư âm hoặc vay thấu chi chưa quyết định ở MVP.
- Không đếm chuyển nội bộ và số dư đầu kỳ thành income/expense. Vay nợ và thẻ tín dụng đã có nghiệp vụ riêng trong P5; khác tiền tệ và phí chuyển tiền chưa triển khai.
- Migration `20261019222000_deferred_journal_integrity` bổ sung kiểm tra ở COMMIT: mỗi journal tồn tại phải có ít nhất 2 posting, Debit/Credit cân, tiền dương/VND nguyên, account và tham chiếu journal thuộc workspace. Các thao tác xóa journal/posting trong test được thực hiện trong cùng một DB transaction.

Mọi thay đổi phải chạy `tests/unit/ledger.test.ts`, `scripts/integration-check.ts`, `scripts/reconcile-ledger.ts` trên DB phát triển trước khi phát hành.

## P5 — Mục tiêu, công nợ, thẻ tín dụng và giá trị ròng

| Sự kiện | Debit | Credit | Ảnh hưởng KPI thu/chi |
| --- | --- | --- | --- |
| Dành/rút tiền mục tiêu trong ví | Không có journal | Không có journal | Không đổi; đây là earmarking |
| Nhận tiền vay | Asset:Wallet | Liability:Debt | Không tăng income |
| Trả gốc vay | Liability:Debt | Asset:Wallet | Không tăng expense |
| Trả lãi vay | Expense:Debt interest | Asset:Wallet | Tăng expense |
| Cho vay | Receivable:Debt | Asset:Wallet | Không tăng expense |
| Thu hồi gốc cho vay | Asset:Wallet | Receivable:Debt | Không tăng income |
| Thu lãi cho vay | Asset:Wallet | Income:Debt interest | Tăng income |
| Mua bằng thẻ | Expense:Category | Liability:Credit card | Tăng expense |
| Thanh toán thẻ bằng ví | Liability:Credit card | Asset:Wallet | Không chi hai lần |
| Hoàn tiền mua bằng thẻ | Liability:Credit card | Expense:Category | Giảm expense |
| Dư nợ thẻ mở đầu | Equity:Opening | Liability:Credit card | Không tạo expense lịch sử giả |

Net worth = tài sản + các khoản phải thu − nợ phải trả, tại ngày chốt theo `Asia/Ho_Chi_Minh`. Hạn mức tín dụng không được tính vào tài sản; tổng tiền phân bổ mục tiêu không được cộng lần thứ hai. Khi đã ghi thanh toán, service kiểm tra số gốc không vượt dư nợ; card purchase không vượt hạn mức, refund không vượt khoản mua còn được phép hoàn. Nghiệp vụ có lock workspace và idempotency key.

CSV/XLSX import và giao dịch định kỳ phải cập nhật trạng thái nghiệp vụ, liên kết transaction và ghi journal/postings trong **một** PostgreSQL transaction Serializable. Khi thao tác thất bại, toàn bộ dữ liệu vừa tạo bị rollback. `ImportRow` chỉ được chuyển từ `VALID` sang `IMPORTED` cùng lúc với ghi sổ; các batch cạnh tranh cùng `sourceHash` dựa vào unique transaction idempotency key, retry serialization và đánh dấu duplicate. `RecurringOccurrence` chỉ được chuyển thành `POSTED` sau khi journal hợp lệ và liên kết transaction trong cùng lần COMMIT. Với bản ghi cũ có transaction tồn tại nhưng chưa được liên kết, retry phải tái sử dụng chính idempotency key và không tạo journal thứ hai.

Lãi vay hiện được ghi **khi thực trả/nhận**, không tự động dự thu/dự chi. `projectedDebtSchedule()` tạo lịch tham khảo gốc cố định, lãi tháng trên dư gốc giảm dần theo lãi danh nghĩa năm/12; không ghi journal và không tự đánh dấu kỳ đã trả. Chu kỳ sao kê thẻ tính theo ngày 1–28 do người dùng nhập, cho biết dư nợ tại lần chốt trước và dự kiến kỳ kế tiếp; không tính phí/lãi phạt và không thay thế sao kê ngân hàng. Chi phí lãi không có Category vẫn được tổng hợp theo ledger account trong breakdown để số danh mục khớp KPI chi.

**Số sao kê ước tính còn phải trả:** `estimatedStatementRemaining = max(0, lastStatementBalance − paymentsAfterClose − eligibleRefundsAfterClose)`. `eligibleRefundsAfterClose` chỉ gồm hoàn tiền của giao dịch mua có ngày hiệu lực không muộn hơn cuối ngày chốt gần nhất. Hoàn tiền của giao dịch mua sau chốt thuộc kỳ mới không làm giảm số ước tính kỳ trước. Đây là quy ước đối soát trong Finova; ngân hàng có thể phân bổ thanh toán/hoàn tiền khác. Xem ADR-0005.
