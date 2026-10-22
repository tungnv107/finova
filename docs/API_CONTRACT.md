# HTTP API contract hiện có — /api/v1

Tất cả endpoint dùng cookie session Better Auth; không nhận `userId` hoặc `workspaceId` từ client. Mọi thao tác thay đổi dữ liệu yêu cầu same-origin `Origin` và JSON hợp lệ. Responses thành công: `{ "data": ..., "meta": { "currency":"VND", "timezone":"Asia/Ho_Chi_Minh" } }`. Lỗi: `{ "error": { "code": "...", "message": "..." } }`; status 400/401/403/404/409/422/429/500/503 tùy điều kiện. API tài chính đặt `Cache-Control: private, no-store, max-age=0`. Kiến trúc và giới hạn nghiệm thu trong [ADR-0006](ADR/0006-stack-runtime-and-release.md), [test plan](TEST_PLAN.md).

| Verb | Endpoint | Công dụng |
| --- | --- | --- |
| GET | `/api/v1/me` | Thông tin context phiên đăng nhập |
| GET | `/api/v1/categories?includeArchived=true` | Danh mục của workspace; mặc định chỉ danh mục chưa lưu trữ |
| POST | `/api/v1/categories` | Tạo danh mục và tài khoản sổ cái tương ứng |
| PATCH | `/api/v1/categories/:id` | Đổi tên/icon/màu, lưu trữ hoặc khôi phục |
| GET | `/api/v1/wallets` | Danh sách ví và số dư sổ cái |
| POST | `/api/v1/wallets` | Tạo ví cùng số dư mở đầu |
| PATCH | `/api/v1/wallets/:id` | Đổi tên/lưu trữ/khôi phục, bật/tắt tính vào số dư khả dụng |
| GET | `/api/v1/transactions` | Giao dịch có phân trang cursor; filter kind/wallet/category/search/limit/cursor |
| POST | `/api/v1/transactions` | Ghi thu/chi/chuyển ví; tùy chọn `Idempotency-Key` |
| PATCH | `/api/v1/transactions/:id` | Sửa với `version`, reversal + replacement |
| DELETE | `/api/v1/transactions/:id?version=N` | Hủy bằng reversal |
| POST | `/api/v1/transactions/:id/refunds` | Hoàn tiền khoản chi; tùy chọn `Idempotency-Key` |
| GET | `/api/v1/reports/overview` | 8 KPI, so sánh kỳ trước, series, danh mục, ví, top expense, recent |
| GET/POST | `/api/auth/*` | Better Auth Google OAuth callback/session |

## Ví dụ tạo giao dịch

```json
{
  "kind": "EXPENSE",
  "walletId": "wallet_id_from_API",
  "categoryId": "category_id_from_API",
  "amount": "250000",
  "occurredAt": "2026-10-19T10:00:00+07:00",
  "note": "Bữa trưa",
  "tags": ["Ăn uống", "Công việc"]
}
```

Tạo ví: `{ "name":"Tiền mặt", "type":"CASH", "openingBalance":"2000000", "openingDate":"2026-10-19T00:00:00+07:00" }`. Các giá trị tiền là **string** (không dùng số JSON). `kind`: `INCOME`, `EXPENSE`, `TRANSFER` (chuyển phải có `destinationWalletId`, không dùng category). `refund`: `{ "amount":"100000", "note":"Hoàn tiền" }`. Bộ lọc báo cáo: `start`, `endExclusive` là ngày địa phương dạng `YYYY-MM-DD`; trường trống mặc định tháng hiện tại.

`tags` là mảng chuỗi tùy chọn cho giao dịch thu/chi (mặc định `[]`), tối đa 10 thẻ, mỗi thẻ 1–30 ký tự sau khi loại khoảng trắng đầu/cuối. Không cho phép trùng nhau không phân biệt hoa/thường, dấu phẩy hoặc xuống dòng. `POST` lưu tags và so sánh tags khi phát lại cùng `Idempotency-Key`; `PATCH` có thể sửa/xóa tags (gửi `[]` để xóa). `GET /api/v1/transactions` và chi tiết giao dịch trên trang `/transactions?transactionId=...` trả tags. Khi chưa truyền tags trong `PATCH`, hệ thống giữ nguyên giá trị cũ.

Sửa ví: `PATCH /api/v1/wallets/:id` có thể nhận `{ "name":"Tài khoản lương", "includeInAvailable":false }` hoặc `{ "archived":true }`. Đổi tên đồng bộ sang LedgerAccount; `includeInAvailable=false` chỉ loại ví khỏi KPI số dư khả dụng, không thay đổi số dư và lịch sử.

`GET /api/v1/transactions` trả `{ "data": { "items": [...], "nextCursor": "id_hoặc_null" } }`; mặc định 50 giao dịch/trang, tối đa 100. Truyền `cursor` bằng `nextCursor` của trang trước và giữ nguyên mọi bộ lọc để tải trang tiếp. Cursor được xác minh thuộc chính workspace và bộ lọc. Giao diện tự tải thêm và ghép các trang mà không tạo giao dịch mẫu.

Danh mục: `POST /api/v1/categories` nhận `{ "kind":"EXPENSE", "name":"Thú cưng", "icon":"Circle", "color":"#18C5C2" }`. `kind` chỉ nhận `EXPENSE` hoặc `INCOME`. `PATCH /api/v1/categories/:id` nhận một số trường trong `{ "name":"Thú cưng", "icon":"Circle", "color":"#1E5EFF", "archived":true }`. Đổi loại danh mục và xóa cứng không được hỗ trợ nhằm bảo toàn lịch sử ledger. Danh mục lưu trữ vẫn xuất hiện trong báo cáo lịch sử.

Các endpoint P4–P5 đã bổ sung:

| Verb | Endpoint | Dữ liệu/nghiệp vụ |
| --- | --- | --- |
| GET/POST | `/api/v1/budgets` | Ngân sách theo tháng, danh mục và hạn mức |
| PATCH | `/api/v1/budgets/:id` | Cập nhật ngân sách |
| GET | `/api/v1/reports/budget-performance` | Hiệu suất và ngưỡng cảnh báo |
| GET | `/api/v1/reports/trends`, `/api/v1/reports/heatmap` | Xu hướng và heatmap |
| GET | `/api/v1/exports/transactions.csv`, `/api/v1/exports/reports.xlsx`, `/api/v1/exports/reports.pdf` | Xuất tệp từ dữ liệu thật |
| GET/POST | `/api/v1/goals` | Danh sách/tạo mục tiêu, liên kết ví |
| PATCH | `/api/v1/goals/:id` | Sửa/lưu trữ/khôi phục |
| POST | `/api/v1/goals/:id/allocations` | `{kind:"ALLOCATE"\|"RELEASE",amount:"100000"}`, có idempotency |
| GET/POST | `/api/v1/debts` | Khoản đi vay/cho vay; `direction`, `counterparty`, `walletId`, `principal`, `annualRate` number, `installmentCount` number, `startDate`, `dueDate` |
| PATCH | `/api/v1/debts/:id` | Thay đối tác/ghi chú/ngày đến hạn |
| POST | `/api/v1/debts/:id/payments` | `{walletId,principal:"2000000",interest:"100000",date:"YYYY-MM-DD"}`, `Idempotency-Key` |
| GET/POST | `/api/v1/cards` | Thẻ tín dụng: `name`, `lastFour`, `creditLimit`, `openingDebt`, `statementDay`, `paymentDueDay` |
| PATCH | `/api/v1/cards/:id` | Sửa tên/hạn mức/ngày chốt/ngày thanh toán |
| POST | `/api/v1/cards/:id/entries` | `PURCHASE` (`categoryId`), `REFUND` (`originalEntryId`), `PAYMENT` (`walletId`); chung `kind`, `amount`, `date`, `note` tùy chọn, `Idempotency-Key` |

| GET | `/api/v1/reports/net-worth?date=YYYY-MM-DD&compareDate=YYYY-MM-DD` | Tài sản, phải thu, nợ phải trả và chênh lệch giá trị ròng |

`GET /api/v1/cards` trả về ba giá trị kế toán khác nhau cho từng thẻ: `outstanding` (dư nợ hiện tại), `lastStatementBalance` (dư nợ ledger tại cuối ngày `lastStatementDate`) và `estimatedStatementRemaining` (ước tính phần sao kê đã chốt còn chưa thanh toán). Giá trị cuối trừ các khoản thanh toán sau ngày chốt và các khoản hoàn tiền có giao dịch mua gốc thuộc kỳ đã chốt hoặc trước đó. Không dùng số ước tính này như số tiền tối thiểu hoặc sao kê chính thức do ngân hàng cấp.

Phân tích lịch dự kiến không ghi bút toán. Các endpoint thay đổi dữ liệu yêu cầu session Google hợp lệ và same-origin.

## P6 — Lịch định kỳ, nhập CSV, thông báo

| Verb | Endpoint | Nghiệp vụ |
| --- | --- | --- |
| GET/POST/PUT | `/api/v1/recurring` | Liệt kê/tạo rule; PUT đồng bộ các kỳ đến hạn |
| PATCH | `/api/v1/recurring/:id` | Đổi tên, pause/resume hoặc ngày kết thúc |
| POST | `/api/v1/recurring/:id/confirm` | Ghi sổ kỳ đến hạn, idempotency theo rule+period |
| POST | `/api/v1/recurring/:id/skip` | Bỏ qua kỳ chưa ghi sổ |
| POST | `/api/v1/imports/columns` | Multipart CSV UTF-8 hoặc XLSX; trả tên cột; không ghi staging hoặc ledger |
| POST | `/api/v1/imports/preview` | Multipart CSV UTF-8 hoặc XLSX và JSON `options`; ghi staging, không ghi ledger |
| POST | `/api/v1/imports/commit` | Ghi tối đa 50 dòng hợp lệ mỗi request; gọi tiếp theo `remaining` |
| POST | `/api/v1/imports/:id/retry` | Đưa các dòng `FAILED` của batch thuộc workspace về `VALID`; thao tác idempotent, không trực tiếp ghi ledger |
| GET | `/api/v1/imports/:id` | Trạng thái batch và tối đa 100 dòng đầu |
| GET | `/api/v1/imports/:id/errors.csv` | Báo cáo lỗi/trùng CSV |
| GET | `/api/v1/notifications` | Liệt kê thông báo của workspace |
| PATCH | `/api/v1/notifications/:id` | Đánh dấu đã đọc/chưa đọc |
| POST | `/api/internal/recurring` | Scheduler nội bộ: Bearer `FINOVA_CRON_SECRET` đủ mạnh; không public |

Các endpoint này không chấp nhận workspace ID từ client. Preview giới hạn 5 MB/10.000 dòng, kể cả HTTP request thiếu `Content-Length`. XLSX lấy trang tính hiển thị đầu tiên, tối đa 60 cột và từ chối ô công thức; ngày/số được đọc thành giá trị tĩnh. Commit dùng idempotency key ổn định và một database transaction cho posting/row-status; batch cạnh tranh tạo tối đa một transaction cho cùng `sourceHash`, bản ghi sau chuyển `DUPLICATE`. CSV có ô không hợp lệ hoặc có tiền tố công thức bị đánh dấu lỗi. `retry` đưa các dòng `FAILED` vào hàng chờ, sau đó client gọi lại `commit`. Cần nghiệm thu stress concurrency đa instance trước production.

## P7 — API anti-abuse

- Mọi API v1 ghi dữ liệu yêu cầu `Origin` chính xác bằng `BETTER_AUTH_URL` và session Google; môi trường production thiếu hoặc cấu hình sai URL trả `503 ORIGIN_NOT_CONFIGURED`. Origin lạ trả `403`, thiếu Origin trả `403 ORIGIN_REQUIRED`.
- Sau xác thực, PostgreSQL chia quota riêng theo `(userId, workspaceId, policy)` và cửa sổ 60 giây: mutation thông thường **90/phút**, upload CSV/XLSX (`columns`, `preview`) **12/phút**, tác vụ đồng bộ recurring **12/phút**, exports **20/phút**, `GET /api/v1/reports/*` và `GET /api/v1/transactions` **120/phút**. Những `GET` khác không thuộc báo cáo/export hiện chưa áp quota riêng. Các quota không trộn giữa các loại request.
- Better Auth `POST /api/auth/*` và `GET /api/auth/callback/*` chịu quota **600/phút toàn hệ thống** trước xác thực; thêm quota **30/phút/IP** nếu `FINOVA_TRUSTED_CLIENT_IP_HEADER` được cấu hình tại ingress đáng tin cậy. Header cấu hình nhưng thiếu/không hợp lệ trả `503 PROXY_IP_REQUIRED`; request polling `GET /api/auth/get-session` không tính. Không tin `X-Forwarded-For` mặc định.
- `POST /api/internal/recurring` chỉ sau khi Bearer secret hợp lệ mới ghi quota scheduler **10/phút** chung toàn hệ thống.
- Khi vượt quota: HTTP **429**, `Retry-After` là **1–60 giây** còn lại trong cửa sổ PostgreSQL, `{ "error": { "code":"RATE_LIMITED", "message":"..." } }`; không thực hiện ghi sổ. `Cache-Control: private, no-store` áp dụng cho response tài chính và lỗi.
- Giới hạn rate limit không thay thế idempotency, database transaction, WAF hoặc bảo vệ đăng nhập chưa xác thực qua trusted proxy.
