# Contract dashboard và đối soát

Endpoint: `GET /api/v1/reports/overview?start=YYYY-MM-DD&endExclusive=YYYY-MM-DD&walletId=&categoryId=`. Trả `period`, `filters`, `kpis`, `comparison`, `worth`, `wallets`, `series`, `categories`, `topExpenses`, `recentTransactions`. Tất cả số tiền là chuỗi VND; biểu đồ đổi sang số JS **chỉ ở lớp trình bày**, không dùng để tính sổ sách.

| Trường | Định nghĩa |
| --- | --- |
| income | Tổng normal balance postings tài khoản INCOME (Credit trừ Debit) trong kỳ |
| expense | Tổng normal balance postings EXPENSE (Debit trừ Credit), đã trừ refund |
| surplus | `income - expense` |
| available | Tổng số dư ASSET của các ví `includeInAvailable` tại thời điểm `endExclusive` |
| savingsRate | `(income - expense)/income * 100`, `null` nếu `income <= 0` |
| averageDailyExpense | `expense / max(1, số ngày đã qua trong kỳ)` |
| netWorth | `worth.current.netWorth` = tài sản + phải thu − nợ phải trả; **toàn workspace**, không chịu lọc ví/danh mục; ngày chụp nằm trong `worth.current.date` |
| budgetUsage | `{budgetId, name, scope, used, limit, percent}` hoặc `null`; chỉ khi có đúng một ngân sách bao trùm an toàn, đúng `start`/`endExclusive`, không có lọc ví/danh mục; ưu tiên ngân sách TOTAL; không cộng các ngân sách chồng nhau |
| series | Bucket theo ngày địa phương từ Journal `effectiveAt`; thu/chi theo postings, không tính mở đầu và transfer |
| categories | Tổng postings EXPENSE theo LedgerAccount/Category, kể cả reversal/refund (số âm có thể xảy ra riêng trong kỳ) |
| wallets | Số dư postings tài khoản ASSET theo ví (Debit trừ Credit) trước `endExclusive` |
| topExpenses | 5 transaction EXPENSE ACTIVE có số tiền gốc cao nhất trong kỳ; **trước hoàn tiền** |
| recentTransactions | 8 transaction ACTIVE gần nhất trong bộ lọc, sắp theo `occurredAt` |

`walletId` lọc journal liên quan ví nguồn; trong chuyển nội bộ, ví được chọn nhận số dư thực tế nhưng không có income/expense. `categoryId` lọc các postings thuộc danh mục. Bộ lọc số dư khả dụng chỉ áp dụng ví, không áp dụng danh mục. Không cộng tất cả wallet với `category` filter vì hai đại lượng khác scope.

`comparison` dùng `mode: "equal_calendar_days"`, `start`, `endExclusive` cho cửa sổ ngay trước kỳ hiện tại, có **cùng số ngày lịch Việt Nam**. `previous` chứa `income`, `expense`, `surplus`, `available`, `savingsRate`, `averageDailyExpense`, `netWorth`. `changes` chứa `{change, percent}` tương ứng và `budgetUsage: null` (chưa có comparison ngân sách đúng scope). `change = current − previous` dùng Decimal; `percent = 100 × change / abs(previous)`, `null` nếu baseline bằng 0/không xác định. `averageDayBasis` ghi rõ số ngày chia: kỳ đang diễn ra tính tới hết ngày Việt Nam hiện tại, kỳ trước tính đủ ngày của kỳ so sánh; vì vậy so sánh daily average khi kỳ chưa khép lại chỉ để tham khảo. Net worth dùng snapshot đến ngày cuối kỳ khi kỳ đã khép; khi kỳ chưa khép hoặc nằm ở tương lai, snapshot giới hạn ở ngày hiện tại, hiển thị rõ `worth.current.date`/`worth.comparison.date`. `available` và các ledger posting trong bộ lọc hiện vẫn lấy cutoff `endExclusive`, kể cả khi đó là ngày tương lai, nên hai loại snapshot có thể khác thời điểm. Dữ liệu đọc qua nhiều truy vấn song song, chưa bảo đảm một snapshot cơ sở dữ liệu nếu có ghi đồng thời.

Chi tiêu category có giá trị âm nếu kỳ chỉ chứa refund (chi trước kỳ). Donut chỉ vẽ tỷ trọng khi tất cả danh mục không âm; nếu âm sẽ hiển thị thông báo và giá trị chi ròng vẫn nguyên vẹn. Đối soát chung: `sum(series.income) = income`, `sum(series.expense) = expense`, `sum(categories.amount) = expense` khi không có postings thiếu category. `topExpenses` được tính từ transactions gốc nên không dùng để đối soát expense KPI.

Triển khai P7 ngày 21/10/2026: `overview()` dùng PostgreSQL aggregate `SUM/GROUP BY` theo ngày và tài khoản, bao gồm reversal/refund với dấu đúng; `recentTransactions` lấy **8** giao dịch ACTIVE theo bộ lọc qua `listTransactionsPage(limit: 8)`, không còn tải 100 bản ghi để cắt ở Node. KPI comparison và lựa chọn ngân sách đã triển khai, nhưng lần nghiệm thu DB mới nhất chưa chạy được (không có PostgreSQL). Ngày trống chưa sinh bucket 0; so sánh ngân sách và các biểu đồ nâng cao vẫn chưa đầy đủ. Đối soát chi tiết xem [test plan](TEST_PLAN.md) và [QA](TEST_REPORT.md).
