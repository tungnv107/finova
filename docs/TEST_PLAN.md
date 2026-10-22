# Finova — Kế hoạch kiểm thử và ma trận nghiệm thu V1

**Cập nhật:** 21/10/2026. **Trạng thái:** tài liệu và fixture plan đã chuẩn bị; các ca chưa có session Google thật hoặc staging HTTPS vẫn mở. Nguồn yêu cầu: mục 19.1 của [master plan](../IMPLEMENTATION_PLAN_QUAN_LY_TAI_CHINH_CA_NHAN.md).

## Cách đọc kết quả

- **PASS local**: logic và dữ liệu dự kiến được xác minh bằng unit/PostgreSQL integration trong môi trường phát triển; không thay cho E2E sản phẩm.
- **PARTIAL**: đã xác minh một số thành phần, còn ít nhất một assertion bắt buộc chưa chạy.
- **BLOCKED**: thiếu tiền đề để chạy đúng end-to-end; không suy diễn PASS từ unit test.
- **GATE OPEN**: dù có PASS local, chưa thể đóng gate giai đoạn nếu thiếu Google session thật, thiết bị, HTTPS, CI remote hoặc kiểm thử vận hành liên quan.

## Quy tắc fixture và môi trường

Sử dụng hai người dùng A/B độc lập, hai workspace test có tiền tố `integration-`, thời điểm cố định trong tháng 10/2026 theo múi giờ `Asia/Ho_Chi_Minh`, VND integer string và ví A/B có số dư mở đầu 2.000.000/1.000.000. Mỗi ca tạo giao dịch mới hoặc dùng database cách ly/snapshot có kiểm soát để tránh ảnh hưởng các ca khác. Chạy financial integration với `FINOVA_TEST_RUN=1` trên PostgreSQL phát triển được chỉ định; script tạo và dọn đúng các fixture của mình, không dùng database production. Đối với benchmark 10.000 giao dịch chỉ dùng `finova_bench` với guard và kiểm tra cleanup.

Không dùng tài khoản hoặc dữ liệu tài chính thật. Ca AT-01/02/16/18 cần **hai tài khoản Google thử nghiệm** và HTTPS staging có OAuth Client phù hợp; không tạo session giả trong runtime và không lưu cookie/token vào artifact. Lưu kết quả dạng ngày, môi trường, image/commit, migration, ID case, expected/actual, bằng chứng đã khử dữ liệu nhạy cảm, người kiểm thử.

## Ma trận AT-01 đến AT-18

| ID / Gate | Dữ liệu, thao tác | Assertion phải đạt | Kiểm thử hiện có / trạng thái ngày 21/10 |
| --- | --- | --- | --- |
| **AT-01 · G1** | Google user A đăng nhập lần đầu, reload, đăng nhập lại | Một workspace/member/preferences + danh mục; zero demo transactions; session hợp lệ | Bootstrap concurrency PostgreSQL và OAuth initiation local PASS; callback/session thật **BLOCKED** → **PARTIAL** |
| **AT-02 · G1/G2/G7** | A dùng ID wallet/category/transaction/report/export của B và ngược lại | 403/404; không rò rỉ payload; không đổi journal/audit B | `scripts/integration-check.ts`, HTTP guard tests có negative cases; hai Google sessions **chưa thử** → **PARTIAL** |
| **AT-03 · G2** | Ví A 2m, B 1m, chuyển 500k | Số dư A/B 1,5m; thu/chi 0; journal debit=credit | Financial integration assert balances và overview → **PASS local** |
| **AT-04 · G2/G3** | Lương 15m, ăn uống 500k | Thu 15m, chi 500k, thặng dư 14,5m tại cutoff tương ứng | Financial/report integration có kiểm tra thu/chi/surplus; xác minh fixture độc lập khi chạy E2E → **PARTIAL** |
| **AT-05 · G2/G4** | Sửa chi 500k thành 300k | Reversal/repost; số dư, budget và donut dùng chi ròng 300k | Edit/reconciliation/refund được integration test; cần E2E đối chiếu cả ba UI → **PARTIAL** |
| **AT-06 · G2/G3** | Hoàn 100k trên chi 300k | Chi ròng 200k; giới hạn hoàn; đồng bộ chart/KPI | Refund + aggregate integration → **PASS local** |
| **AT-07 · G4** | Budget 1m; ghi chi 800k rồi 1,1m | 80% rồi 110%, cảnh báo dedup; hoàn tiền cập nhật | Threshold integration 50/80/100/OVER100 → **PASS local** |
| **AT-08 · G5** | Thẻ chi 1m, trả 600k | Expense 1m; dư nợ 400k, payment không tạo expense kép | Card lifecycle/integration + unit có; E2E thẻ còn thiếu → **PARTIAL** |
| **AT-09 · G5** | Vay 10m, trả gốc 2m, lãi 100k | Income vay=0; expense lãi=100k; gốc còn 8m | Loan integration + `debt-schedule.test.ts` → **PASS local** |
| **AT-10 · G6** | Scheduler thực thi cùng period hai lần (kể cả retry) | Một occurrence, tối đa một posted transaction/journal; không ghi actual trước due | Recurrence unit + PostgreSQL concurrency/rollback → **PASS local**, multi-replica chưa thử |
| **AT-11 · G3** | Period income=0; previous=0 | N/A hoặc “Mới phát sinh” theo spec; không NaN/Infinity, biểu đồ ổn | Report/date unit có; chưa có screenshot/E2E mọi zero states → **PARTIAL** |
| **AT-12 · G3** | Lọc ví A, chuyển 500k sang B ngoài scope filter | Ví A giảm 500k; expense scoped không đổi | Report filter ownership/aggregate integration → **PASS local**, browser filter chưa thử |
| **AT-13 · G2/G3** | 29/02 năm nhuận, 31/12, UTC 17:00 = +07 ngày sau | `[start,endExclusive)` và ngày nhóm tại Việt Nam chính xác | `dates.test.ts` + integration November day boundary → **PASS local** |
| **AT-14 · G3/G4** | So sánh donut, table, KPI sau edit/refund | Tổng category và chart buckets = expense KPI dưới cùng bộ lọc | `assertOverviewMatchesLedger` độc lập từ Posting + integration → **PASS local** |
| **AT-15 · G4** | Export CSV/XLSX/PDF với ví, danh mục và user A/B | Unicode, filter, tổng tiền, tenant isolation; PDF A4/chia trang nhìn rõ | Export integration/data checks + HTTP guards → **PARTIAL**: visual/PDF/browser chưa kiểm chứng |
| **AT-16 · G1/G7** | Kiểm build bundle, cookies/session, secret config | Không xuất hiện Google secret/private finance trong client/log/cache; không leak qua HTTP | Runtime image/no-store/PWA cache smoke local → **PARTIAL**, HTTPS secret rotation và session inspection mở |
| **AT-17 · G1** | Chạy server thiếu OAuth env | Thông báo cấu hình; không bypass/giả danh user | Login guard/OAuth initiation smoke; cần negative deployment smoke → **PARTIAL** |
| **AT-18 · G4/G7** | Đăng nhập A rồi wallet → expense → chart drilldown → edit → export | UI/ledger/chart/export nhất quán; reload/session; desktop và mobile | **BLOCKED**: chưa có authenticated browser E2E trên hai Google test users |

**Ghi chú:** Giá trị PASS local chỉ mô tả lớp test đã chạy, không đồng nghĩa toàn bộ AT hoặc gate release đã đạt. Giá trị kết quả trên cần cập nhật bằng biên bản chạy mới khi mã nguồn/fixture thay đổi. Tham khảo [QA hiện tại](TEST_REPORT.md) và [phase report](PHASE_REPORT.md).

## Kiểm thử invariant/property và ma trận chạy

| Invariant / rủi ro | Automation hiện có | Điều kiện bổ sung trước khi đóng |
| --- | --- | --- |
| Mọi journal có tổng DEBIT=CREDIT, VND integer dương; reversal triệt tiêu và JSON giữ precision | `tests/unit/ledger.test.ts`: 512 trường hợp pseudo-random có seed cố định (128 trường hợp/loại INCOME, EXPENSE, TRANSFER, REFUND), reversal và VND JSON; PostgreSQL deferred trigger + `db:reconcile` ở checkpoint riêng | Đây là property sweep **ở cấp hàm**, không thay thế PostgreSQL concurrency hoặc HTTP E2E; tiếp tục chạy sau mọi thay đổi posting/schema |
| Cross-workspace posting/reference | `scripts/integration-check.ts` negative FK/scope và `security:routes` | HTTP IDOR matrix của **mọi** ID bằng hai session Google thật |
| Idempotency key, concurrent edits/voids, recurring re-run, import retry | Financial integration và `serializable-retry.test.ts` | Multi-replica HTTP stress trên staging |
| Dashboard `sum(series)=sum(categories)=expense` và date/filter | `assertOverviewMatchesLedger` theo từng Posting với 11 bộ lọc/2 workspaces | Authenticated filter/drill-down E2E |
| Serialize money lớn, timezone leap/month-end | `ledger.test.ts`, `dates.test.ts` | Contract API với số tiền lớn end-to-end |
| Cached balances bằng ledger | Không có mutable wallet balance cache; đọc trực tiếp PostgreSQL ledger | Nếu đưa cache vào sau này, thêm reconciliation suite trước khi bật |

Chạy tại workspace trên Windows:

```powershell
npm run typecheck
npm run lint
npm run test
npm run security:routes
npm run test:oauth        # server localhost:3002 cấu hình đúng, pre-auth only
npm run test:browser      # responsive login, không phải authenticated E2E
# Khi đã xác nhận DSN trỏ đúng PostgreSQL phát triển riêng:
$env:FINOVA_TEST_RUN='1'; npm run test:integration
$env:FINOVA_TEST_RUN='1'; npm run test:security-integration
npm run db:reconcile      # chỉ đọc
```

**Release acceptance còn mở:** lưu evidence staging HTTPS, Google callback/session/logout 2 tài khoản, IDOR E2E, PDF visual/mobile/screen reader/PWA install, import 10k/worker multi-instance, rollback, backup mã hóa offsite, p50/p95/p99 HTTP nhiều replica, CI remote và security sign-off. Các việc này không được đánh dấu `[x]` khi chưa chạy thật.
