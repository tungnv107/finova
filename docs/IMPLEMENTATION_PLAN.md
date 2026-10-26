# Kế hoạch triển khai thực tế theo phase — Finova

### QA checkpoint 26/10/2026 — Admin Console độc lập

- [x] **UI-26A — Thiết kế lại Admin Console (DEV):** Tách nhóm route `/admin` khỏi layout tài chính cá nhân, giữ nguyên URL và RBAC; tạo sidebar riêng theo vai trò, menu thu gọn, dashboard KPI và công việc ưu tiên; gom bộ lọc đơn, thanh toán và thao tác vận hành. Sửa vùng chạm menu ≥44px, tăng tương phản màu. `admin:test-shell-browser` **PASS** trên PostgreSQL QA cô lập với signed sessions ADMIN/ANALYST, URL bị từ chối HTTP 403, Chrome 1440/390/320 px Light/Dark, không tràn ngang và axe WCAG serious/critical = 0; cleanup fixture. **11/11 unit liên quan**, TypeScript, ESLint phạm vi thay đổi và production build **59/59 trang PASS**. Chưa thay thế UAT Google OAuth thực tế và nghiệm thu phát hành; billing production vẫn **NO-GO**.

### QA checkpoint 26/10/2026 — AD5-05 KPI thu phí từng phần

- [x] **QA-26E — AD5-05 KPI DEV từng phần:** Đã bổ sung distinct paid/first/renewing users, grant tháng/năm, tiền VERIFIED/IN chưa khớp và gross allocation theo ngày VN; SQL tránh đếm trùng người có nhiều grant, tiền không mất chính xác. PostgreSQL QA riêng `finova_admin_test_ad505_20261026` (31 migrations), `admin:test-billing-analytics` PASS gồm biên ngày, renewal, review VND và cleanup; **499/499 unit**, typecheck, lint, Prisma, route audit **80/99** PASS. Next build QA **58/58** PASS sau tối ưu SQL. **AD5-05 cha vẫn `[ ]`, Admin 36/55 DEV:** còn refund ledger/net cash/net revenue và định nghĩa churn/sign-off. Google OAuth thật, SePay UAT, staging HTTPS và nghiệm thu phát hành chưa đạt; **billing production NO-GO**.

### QA checkpoint 26/10/2026 — AD2-06 checkout, AD5-08 operational alerts

- [x] **QA-26B — AD2-06 (DEV):** `admin:test-checkout-browser` PASS (exit 0): PostgreSQL QA và signed sessions, UI React tạo đơn và lịch sử, owner scope/idempotency, 6 trạng thái server, 1440/390/320 px Light/Dark và axe WCAG A/AA serious/critical = 0; fixture cleanup. `admin:test-operations` PASS (exit 0) sau sửa cleanup 5 workspace QA tự tạo: 8 tín hiệu cảnh báo, 5-role HTTP 200/403, aggregate không PII; kiểm tra DB không còn fixture. Hồi quy 496/496 unit, TypeScript, ESLint, Prisma, route audit 79/98 và Next build QA 57/57 PASS. **Admin 36/55 DEV; AD5-08 vẫn `[ ]`** do chưa có heartbeat provider, delivery/ack cảnh báo tự động. Google OAuth thực/provider UAT/staging còn mở; billing **NO-GO**.

### QA checkpoint 26/10/2026 — AD5-06 dashboard analytics

- [x] **QA-26A — AD5-06 (DEV):** `scripts/admin-analytics-browser-check.ts` PASS (exit 0) với signed Better Auth sessions, PostgreSQL QA mới `finova_admin_test_ad506_20261026` (29/29 migrations), localhost:31642 và Chrome CDP. RBAC USER/ANALYST/FINANCE/ADMIN 403/200 trên hai dashboard, bộ lọc 7/30/90 ngày, drill-down bằng Enter; 1440 Light, 390 Light, 320 Dark, không overflow, filter ≥44px, axe WCAG serious/critical = 0, fixture cleanup. Hồi quy **496/496 unit (90 files)**, typecheck, lint, API guard 79/98, Next production build 57/57 PASS. **Admin 35/55 DEV (AD5 5/8)**. Google OAuth thật, privacy consent, provider UAT, staging và production sign-off vẫn mở; **billing NO-GO**.

### QA checkpoint 25/10/2026 — AD2-08, AD4-05, AD5-04, AD4-04 và AD4-01

- [x] **QA-25I — AD6-03 (DEV):** PostgreSQL QA `admin:test-signed-session` PASS (exit 0): signed HMAC cookie/tamper, old session, Origin/CSRF, anonymous/OWNER/ANALYST/FINANCE/ADMIN/SUPER_ADMIN 401/403/404, `private, no-store`, revoked actor/IDOR, suspend/reactivate/session revocation, audit và dual approval. Regression mới **496/496 unit, TypeScript, ESLint, API guard 79/98 PASS**. **Admin 34/55 DEV (AD6 3/8)**; OAuth Google thật, provider UAT, staging và security sign-off production còn mở, billing **NO-GO**.

- [x] **QA-25H — AD2-07 (DEV):** `npm run admin:test-billing-browser` PASS (exit 0) trên PostgreSQL QA `finova_admin_test_ui_20261025` và Chrome CDP, signed Better Auth session. Đã kiểm tra ma trận 403/200, bảng giá tạo/sửa/xem trước/hủy/công bố và tính bất biến giá đơn cũ, tài khoản nhận phí che số + mã hóa + payload đúng nội dung xác nhận, dual approval, audit, desktop/mobile 1440/390/320, Light/Dark, không tràn ngang và axe serious/critical = 0. Fixture user/receiver/order được dọn, version giá đã công bố giữ lại theo thiết kế bất biến. **Admin 33/55 DEV (AD2 6/8)**; chưa có Google OAuth E2E/provider UAT/staging; production billing **NO-GO**.

- [x] **QA-25G — AD5-02 (DEV):** Pageview chỉ ghi nhóm route của người dùng đã đăng nhập; API kiểm tra Origin/auth, loại bot, từ chối payload chứa URL/dữ liệu tài chính và analytics OFF mặc định không ghi. Unit kiểm thử StrictMode remount, điều hướng/back-forward, reload và anonymous. **496/496 unit (90 files), typecheck, lint, API audit 79/98 PASS.** Admin **32/55**; consent/privacy và loại trừ nội bộ, dashboard browser/mobile/a11y, provider UAT/staging còn mở; analytics OFF và production billing NO-GO.

- [x] **QA-25E — AD4-01 (DEV):** Browser QA `admin:test-shell-browser` với signed session trên PostgreSQL QA riêng PASS role-based direct URL 403, protected HTML boundary, menu ADMIN/ANALYST, 1440/390/320 px, Light/Dark, overflow, touch target ≥44 px, axe WCAG serious/critical = 0, fixture cleanup. **483/483 unit**, TypeScript, ESLint, Prisma, API audit **79/98**, production build **57/57 PASS**. Admin **31/55**; Google OAuth E2E, staging, provider UAT, ký duyệt còn mở; **production NO-GO**.

- [x] **QA-25D — AD4-04 (DEV):** Quản lý khóa/mở khóa tài khoản với lý do bắt buộc, signed Better Auth Google session mới trong 5 phút, bảo vệ admin, thu hồi phiên khi khóa và timeline audit. PostgreSQL QA `admin:test-signed-session` PASS tampered/stale cookie, Origin, role, self/protected admin, suspend/reactivate/session revoke, audit; full **483/483 unit** và quality gates PASS. Admin **30/55**; browser/staging UAT và production billing vẫn **NO-GO**.

- [x] **QA-25C — AD5-04 (DEV):** Cohort đăng ký theo giờ Việt Nam, hoạt động D0 và retention D1/D7/D30 trên dữ liệu `User`/`ProductUsageDaily`, có loại cohort chưa đủ tuổi. PostgreSQL QA `admin:test-cohorts` PASS biên ngày, ngày trống, đối chiếu counts/maturity và cleanup. **483/483 unit** (85 files), typecheck/lint/Prisma/API guards **79/98**, build **57/57 PASS**. Admin **29/55**; analytics mặc định OFF và production billing **NO-GO**.

- [x] **QA-25A — AD2-08 (DEV):** Checkout và cài đặt gói hiển thị riêng tạo đơn, PAID, Premium đã kích hoạt, cần đối soát, hết hạn và hoàn tiền; quyền Premium dựa trên grant thực tế. PostgreSQL QA `admin:test-order-history` PASS các trạng thái, Lite owner scoping và billing notice outbox; không tác động DB `finova`.
- [x] **QA-25B — AD4-05 (DEV):** Dashboard cấp bù/thu hồi/gia hạn với dual approval, chống gửi trùng, audit; bổ sung phân trang hàng chờ theo status để không che ẩn đề xuất cũ. PostgreSQL QA mới **29 migrations**, `admin:test-subscriptions` PASS 55 đề xuất/55 sự kiện có timestamp trùng, insert đồng thời, index và cleanup. Full **479/479 unit** (83 files), typecheck, lint, Prisma validate, API guard **79/98**, build **57/57 PASS**. Admin **28/55 `[x]`**; browser/provider UAT và staging vẫn mở, **production NO-GO**.

### QA checkpoint 24/10/2026 — AD4-06 cài đặt gói Premium

- [x] **QA-24O — AD4-06 (DEV):** `/settings/subscription` và `/pricing` có hai kỳ hạn tháng/năm, catalog-backed giá mặc định 29.000/199.000 VNĐ, giữ nút checkout disabled với catalog thiếu/sai hoặc chưa mở. Effective Lite/Premium, ngày hết hạn giờ VN, lịch sử và trạng thái thanh toán, gia hạn/nâng cấp không sửa dữ liệu cũ. 4/4 unit mới; full **454/454** (76 files), TypeScript, ESLint, API guard **79/98**, Next build **57/57 PASS**. Admin **26/55 `[x]` (AD4 4/7)**; browser UAT/provider/staging còn mở, **production NO-GO**.

### QA checkpoint 24/10/2026 — AD4-02/03 danh sách và vòng đời người dùng

- [x] **QA-24N — AD4-02, AD4-03 (DEV):** PostgreSQL QA `finova_admin_test_catalog_final_20261024` **27/27 migrations**; `admin:test-users` PASS 65 user/timestamp trùng, cursor trước/sau, insert giữa trang, index, role-restricted CSV ≤500 + audit, lifecycle/order/grant/last seen; fixture cleanup. Unit route chặn 401/403, PII không truy vấn wallet/transaction; TypeScript, ESLint, Prisma và API guard 79/98 PASS. **Admin 25/55 `[x]` (AD4 3/7)**; browser/provider UAT và staging/sign-off còn mở. **Production NO-GO**.

### QA checkpoint 24/10/2026 — AD1-01/04 và AD2-01 (migrations, catalog version)

- [x] **QA-24M — AD1-01, AD1-04, AD2-01 (DEV):** 26 migrations PASS trên PostgreSQL `finova_admin_test_catalog_20261024`; transaction rollback DDL rehearsal PASS; catalog integration PASS (RBAC, validation, versioned draft CRUD, publish/unpublish, one active published price, concurrent publish, audit, immutable old price/order snapshot 29.000→39.000 VNĐ, idempotency). **438/438 unit**, TypeScript, ESLint, API guard 78/97, Next build 56/56 PASS. **Admin 23/55 `[x]`** (AD1 8/8, AD2 4/8); AD2-07 UI cần browser E2E/a11y, provider sandbox, OAuth Google browser và production sign-off còn mở. **Production NO-GO**.

### QA checkpoint 24/10/2026 — AD2-02 receiver rotation và phê duyệt độc lập

- [x] **QA-24L — AD2-02 (DEV):** PostgreSQL QA chứng minh Finance không có quyền cấu hình/duyệt receiver, proposer không thể tự duyệt, chỉ Super Admin khác phê duyệt; receiver cũ disable, billing order trước thay đổi giữ snapshot, order mới sử dụng receiver mới, Admin list chỉ mask `last4`, tài khoản mã hóa AES-GCM. **438/438 unit**, typecheck/lint/Prisma, API guards 74/91, Next 16.4.2 build **55/55 PASS**. **AD2-02 [x], Admin 20/55 (AD2 3/8).** Chưa UAT xác minh ngân hàng thực và các gate production vẫn **NO-GO**.

### QA checkpoint 24/10/2026 — AD1-08 bảo vệ thông tin nhạy cảm

- [x] **QA-24K — AD1-08 (DEV):** Đã lọc credential, JSON secret và số tài khoản khỏi lý do thao tác, xác minh persisted access/action/audit trên PostgreSQL QA `finova_admin_test_20261024`; AES-256-GCM receiver, masked Admin response, IDOR deny, RBAC/Finance data isolation và từ chối xác minh receiver đã disable đều PASS. **438/438 unit (72 files)**, typecheck, ESLint, Prisma validate, API guards **74 files/91 handlers**, Next.js 16.4.2 build **55/55 PASS**. **AD1-08 [x], Admin 19/55, AD1 6/8.** Provider UAT, browser OAuth, staging, sign-off chưa có: **production NO-GO**.

### QA checkpoint 24/10/2026 — AD6-01 billing domain, pricing snapshot

- [x] **QA-24J — AD6-01 (DEV):** 421/421 unit (71 files), TypeScript, lint, Prisma validate, API guard audit 74/91; PostgreSQL Admin integration QA PASS cho idempotency conflict/retry, giá order bất biến qua thay đổi catalog, giá 0 bị từ chối, receiver snapshot, entitlement theo ngày VN, trạng thái thanh toán sai, replay và rollback. Next.js build QA 55/55 trang PASS với quyền Windows phù hợp (sandbox thông thường bị EPERM mkdir). **AD6-01 [x], Admin 18/55 (AD6 2/8).** UAT provider/Google OAuth browser và production vẫn NO-GO.

### QA checkpoint 24/10/2026 — AD5-03 rollup, restart/backfill, TTL

- [x] **QA-24I — AD5-03 (DEV):** PostgreSQL QA `finova_admin_test_export_20261024_1200` PASS: khôi phục daily từ receipt trong 2 ngày, replay idempotent không UPDATE thừa, 3 worker repair đồng thời với pageview trực tiếp không mất count, mốc đầu/cuối monotonic, biên ngày Việt Nam 17:00 UTC, receipt TTL 2 ngày và rollup TTL 400 ngày có index. Đồng thời CSV/XLSX với signed session 401/403/200 PASS; 418/418 unit, typecheck, lint, Prisma validate, API guards 74/91 và Next build 55/55 PASS. **AD5-03 [x], Admin 17/55 (AD5 2/8).** Indexed deletion được sử dụng, chưa partition. Scheduler staging, consent/privacy, provider UAT và các gate production vẫn mở; **NO-GO**.

### QA checkpoint 24/10/2026 — báo cáo tổng hợp Admin CSV/XLSX

- [x] **QA-24H — AD5-07 xuất báo cáo (DEV):** PostgreSQL QA mới `finova_admin_test_export_20261024_1200` 24/24 migrations, signed Better Auth session qua handler thật, 401/403/200 role matrix, đối chiếu ngày VN/đơn/tiền phân bổ và CSV/XLSX không lộ định danh PASS. 418/418 unit (71 files), typecheck, lint, Prisma validate, API guard audit 74/91, Next production build 55/55 PASS. Báo cáo tiền gross trước hoàn tiền; **AD5-07 [x], Admin 16/55 (AD5 1/8)**. Google OAuth browser, provider UAT, HTTPS staging, security/legal/finance sign-off còn mở; **production NO-GO**.

### QA checkpoint 24/10/2026 — khôi phục đồng bộ khi quyền Premium thay đổi

- [x] **QA-24G — Entitlement và chặn Lite (DEV):** 24/24 PostgreSQL migrations + Admin integration trên DB QA mới PASS; 3 feature keys Lite deny/Premium allow/expiry/revoke, worker recheck, event PAUSED/consent/resume; SePay poller không dừng khi owner bị khóa. 408/408 unit, 13/13 targeted, typecheck, lint, Prisma, API guards 73/90, Next build 54/54 PASS. **AD1-06 và AD4-07 [x], Admin 15/55. Production NO-GO.**
- [x] **QA-24F — AD2-03 DB integrity (DEV):** PostgreSQL riêng 24/24 migrations, 11 CHECK, 10 FK, 8 unique indexes, 5 lookup indexes; 11 invalid writes bị chặn, fixtures giữ nguyên. npm run admin:test-billing-schema PASS. Admin **13/55**, production **NO-GO**.
- [x] **QA-24E — Khóa tài khoản & checkout QR (DEV):** AD1-07 PostgreSQL integration PASS (revoke sessions, audit, 403 khi suspended/deactivated, rollback flag, purchase history retention); **407/407** unit (69 files), typecheck, lint, Prisma validate, API guard audit **73/90**, Next build **54/54 pages PASS**. VietQR checkout đã có Quick Link + validation/fallback, nhưng AD2-05 chờ scan qua app ngân hàng và mobile E2E. Database Admin test còn 146 user fixture cần dọn có kiểm soát.
- [x] **QA-24A — Regression PostgreSQL cách ly:** `finova_test` Bank Sync **36/36 PASS**; `finova_admin_test_20261024` Admin/Premium **PASS**, gồm Lite/expiry/revoke, hai worker resume đồng thời và consent SePay đúng từng tài khoản.
- [x] **QA-24B — Kiểm thử mã và build:** **363/363** unit tests (62 files), TypeScript, ESLint, Prisma schema, API guard audit **73 files/90 handlers** và production build riêng **54/54 pages PASS**.
- [x] **QA-24C — Chống bỏ sót sự kiện Bank Sync khi khôi phục Premium:** `resumePremiumPausedBankEvents()` quét theo keyset `(createdAt, id)`, mỗi trang trong transaction riêng với `SKIP LOCKED`, giữ chính xác microsecond PostgreSQL; xác minh raw event/account consent trước khi resume. Integration PostgreSQL với **22 sự kiện SePay không có consent xếp trước**, `limit=1` vẫn khôi phục đúng sự kiện A, B và 22 sự kiện sai phạm vi vẫn PAUSED. `finova_admin_test_20261024` PASS; Bank Sync **36/36**, unit **363/363**, typecheck/lint/Prisma/API audit và production build **54/54** PASS.
- [x] **QA-24D — Bootstrap & admin RBAC regression:** AD1-02 PostgreSQL isolated CLI bootstrap PASS (concurrent, unverified, audit và fixture sạch 0/0/0); AD1-03 bổ sung **17 unit tests** cho role matrix và field projection, audit mọi admin API/page bắt buộc platform role. Tổng unit **380/380 (64 files)**, typecheck, ESLint, security:routes **73 files/90 handlers PASS**. Đã đóng AD1-02 và AD1-03 trong phạm vi DEV; signed Google browser E2E riêng ở AD6-03/04 vẫn mở.
- [ ] **G5/G6/G7 — acceptance trên môi trường thật:** Google hai session, provider SePay sandbox UAT, PostgreSQL outage/restore, staging HTTPS, multi-replica load, CI/rollback và security/legal/finance sign-off. **Production NO-GO**.

Các checkbox QA-24A/B/C/D/E/F/G/H/I/J/K/L/M/N/O và QA-25A/B/C/D/E chỉ xác nhận phạm vi regression/hardening hoặc nghiệm thu DEV vừa kiểm thử; **task chính Admin chỉ tăng khi có nghiệm thu riêng**. Sau QA-25E, tổng hiện tại: Admin **31/55**, Bank Sync **9/45**, SePay **13**.

**Phân hệ FN-ADMIN-BILLING (cập nhật 25/10/2026):** [Quản trị, Lite/Premium, chuyển khoản, auto-activation và báo cáo vận hành](FINOVA_ADMIN_PREMIUM_IMPLEMENTATION_PLAN.md), **31/55 task `[x]` theo kiểm thử độc lập**, gồm admin shell responsive/a11y theo role, schema/constraints, catalog giá có phiên bản, bootstrap Super Admin, RBAC, user access/khóa/mở khóa/thu hồi session và audit, danh sách/chi tiết user có keyset/CSV giới hạn, Lite backfill, trạng thái thanh toán, duyệt cấp bù/thu hồi, gia hạn/hết hạn, analytics repair/TTL, cohort/retention và báo cáo CSV/XLSX. Thanh toán production vẫn NO-GO vì thiếu provider UAT và phê duyệt. Checklist/chứng cứ theo tracker chuyên biệt, không cộng vào các con số Bank Sync/SePay phía dưới.

**Checkpoint hiện hành 23/10/2026 — signed-session manual sync:** Bank Sync **9/45** task `[x]`, SePay Bank Hub **13 task `[x]`** (SP3-02 vừa đóng). PostgreSQL `finova_test` **16/16 migrations, 36/36 scenarios PASS**; unit **320/320** (51 files), typecheck, lint, Prisma validate, route guard audit và production build PASS. Fixture cleanup 0 workspace/user/pending outbox. Signed Better Auth session, CSRF, tenant separation, dedupe, watermark và REVIEW_FIRST được kiểm chứng qua API route thực; Google OAuth browser và SePay UAT thật vẫn mở. Dependency audit inconclusive; một stress run song song có 1 retry trước khi chạy độc lập PASS. **G5 OPEN, G6 CONDITIONAL, G7 IN PROGRESS, P8 NOT STARTED; Production/SePay Live NO-GO.** Các checkpoint sau đây là lịch sử.

**Checkpoint lịch sử 23/10/2026:** Bank Sync **9/45** task `[x]`, SePay Bank Hub **12 task `[x]`** (đóng SP3-05 stress/retry/pagination synthetic). PostgreSQL `finova_test` **16/16 migrations, 31/31 scenarios PASS**, unit **320/320** (51 files) PASS; typecheck, lint và Prisma validate PASS. Job lease, 401 lặp và consent theo từng tài khoản đã được xác minh. **G5 OPEN, G6 CONDITIONAL, G7 IN PROGRESS, P8 NOT STARTED; Production/SePay Live NO-GO** vì còn thiếu UAT SePay thật, outage DB, browser auth, HTTPS staging và sign-off. Các checkpoint dưới đây là lịch sử.

**Checkpoint 23/10/2026 (lịch sử):** Bank Sync **9/45** task `[x]`; SePay Bank Hub **11 task `[x]`**, đóng SP1-03 (tenant/company/account + concurrent claim) và SP3-01 (history tenant-scoped, 50 rows/20 trang/31 ngày, DB integration). `finova_test` **15/15 migrations**, **24/24 PostgreSQL Bank Sync scenarios PASS**; unit **314/314** (50 files) PASS. Đã bổ sung tình huống history HTTP 503/timeout ở trang thứ hai và phục hồi dedupe. Typecheck, lint, Prisma validate, API route audit **54/69** và production build PASS ở checkpoint kiểm tra gần nhất. Các gate **G5 OPEN, G6 CONDITIONAL, G7 IN PROGRESS, P8 NOT STARTED; PRODUCTION NO-GO** do thiếu sandbox UAT thật, DB outage, browser auth, HTTPS staging, security/legal sign-off. Những checkpoint trước giữ làm lịch sử.

**Checkpoint bổ sung 22/10/2026 (Bank Sync/SePay):** `docs/FINOVA_BANK_SYNC_IMPLEMENTATION_PLAN.md` đã nghiệm thu **9/45** task, đóng **BS2-04** cho durable inbox/outbox, lease/retry/DLQ và controlled replay; `docs/FINOVA_SEPAY_BANKHUB_IMPLEMENTATION_PLAN.md` có **9 task** `[x]`. PostgreSQL `finova_test` **15/15 migrations**, **17/17 integration scenarios PASS**; unit **310/310**, typecheck, lint và production build PASS. Chỉ có HTTP IPN synthetic; UAT SePay thật, DB outage/recovery, admin UI, browser auth E2E, staging/legal/security sign-off vẫn mở. **G5 OPEN, G6 CONDITIONAL, G7 IN PROGRESS, P8 NOT STARTED; production NO-GO.** Xem `docs/TEST_REPORT.md` và runbook. Các con số cũ dưới đây là mốc lịch sử.

**Cập nhật P7 dependency remediation (20/10/2026):** Vitest nâng lên 5.0.5, Prisma 6 giữ nguyên và override `@prisma/config/deepmerge-ts` lên 8.0.2; 11 → **5 High dev-only** (chuỗi `braces`, upstream chưa phát hành bản vá), runtime audit **0**. CI có `npm run security:audit` chặn advisory mới, theo dõi có hạn đến 01/12/2026. TypeScript, ESLint, 40 unit tests, PostgreSQL security + financial integration 53 journals, 9 migrations, ledger reconciliation, Docker Linux build và HTTP smoke **PASS**. G7 vẫn **IN PROGRESS** do security/browser/deploy acceptance chưa hoàn tất.

Nguồn chỉ đạo: hai đặc tả Markdown gốc tại thư mục root. Tài liệu này là execution tracker theo tình trạng repository, cập nhật ngày 21/10/2026.

**P7 anti-abuse bổ sung (20/10/2026):** Đã triển khai quota trước xác thực cho OAuth (600 yêu cầu/phút chung, 30 yêu cầu/phút/IP sau trusted proxy), quota báo cáo/danh sách giao dịch 120/phút theo workspace; Retry-After từ đồng hồ PostgreSQL; lệnh dọn quota hết hạn `npm run db:prune-rate-limits`. Unit 40/40 PASS, PostgreSQL security/financial integration PASS; không migration mới. Cần nghiệm thu WAF/trusted ingress, browser Google callback có session, tải đa instance, CSP enforcement; G7 vẫn mở.

**Cập nhật P6/P7 mới nhất:** Đã refactor import commit và recurring post/link thành một transaction Serializable, bổ sung xử lý concurrent batches, rollback sau khi ghi journal, phục hồi lỗi đầu vào và liên kết dữ liệu legacy. PostgreSQL integration **53 journals balanced**, TypeScript/ESLint/32 unit tests PASS; 8 migrations up-to-date và ledger reconciliation sai lệch 0. Docker image `finova:phase7-atomic` build và runtime smoke PASS sau npm pruning (Prisma Client, healthcheck, headers và API guard). Phần stress đa instance/browser PWA, 2 cảnh báo moderate và hardening production vẫn mở. Các số 41/47 bên dưới là mốc nghiệm thu trước đây.

**Cập nhật P7 security — 20/10/2026:** Đã bổ sung PostgreSQL rate limiting chia sẻ đa instance, đồng nhất Origin/Better Auth, CSP Report-Only, migration thứ 9, test unit (36/36) và integration quota đồng thời (12 nhận/8 từ chối), isolation và expiry PASS. `exceljs → uuid` đã override lên `uuid@11.1.1`, XLSX integration PASS, `npm audit --omit=dev --omit=peer` **0 cảnh báo trên cây runtime được audit ở host**. Cây phụ thuộc đầy đủ vẫn có advisories Prisma/Vitest; tiếp tục kiểm tra image runtime, browser OAuth và hiệu năng trước khi chốt G7.

**Đã kiểm chứng image:** `finova:phase7-security` build Linux và runtime HTTP smoke PASS; production prune audit **0 vulnerabilities/302 packages**, `npx prisma migrate status` 9 migrations, ledger sai lệch 0. G7 còn conditional vì authenticated browser E2E, multi-instance stress, CSP enforcement, HTTPS/monitoring và CI thực tế chưa nghiệm thu.

## Kiểm soát chất lượng chung

Mỗi hạng mục đi theo chuỗi **Prisma model/migration → service + quy tắc nghiệp vụ → API có authorization/validation → UI có loading/empty/error/success → unit/integration test → tài liệu**. Không đánh dấu hoàn tất khi chỉ có component UI hoặc khi SQL migration chưa chạy trên DB. Mỗi gate phải có `typecheck`, `lint`, `test`, `build`, kiểm tra ledger và kết quả E2E tương ứng.

| Phase | Kết quả chính | Thực trạng / gate |
| --- | --- | --- |
| **P0** — khảo sát/kiến trúc | Gap analysis, PRD, ERD, ADR, API/report contracts, phase plan | Tài liệu đã tạo; tiếp tục nghiệm thu theo code thực tế |
| **P1** — nền tảng/auth | Next.js/Prisma/Postgres/Google/Workspace/Bootstrap/Onboarding | PostgreSQL 17 chạy thật; ba migrations applied; concurrent bootstrap PASS; onboarding tạo ví có UI; Google OAuth initiation PASS. Callback/session thật chờ chủ tài khoản đăng nhập, gate chưa đạt đầy đủ |
| **P2** — financial core | Wallet/category/transactions/ledger, reversal/refund, authorization/concurrency tests | CRUD danh mục và ví/thu chi đã có API/UI; ví cho phép đổi tên và loại khỏi số dư khả dụng. PostgreSQL integration PASS gồm tranh chấp idempotency/refund, DB cross-workspace FK và deferred journal balance constraint. Chưa browser E2E |
| **P3** — dashboard thật | KPI + daily chart + category donut + wallets + drill-down | Báo cáo đối soát trên PostgreSQL integration PASS; chưa kiểm chứng browser sau Google login |
| **P4** — ngân sách/export | Budget engine, threshold 50/80/100, CSV/XLSX/PDF, nâng cao báo cáo | API/UI, PostgreSQL integration PASS; browser E2E có session chưa thực hiện |
| **P5** — mục tiêu/vay nợ/thẻ | Goals, debts, credit card statement/repayment, net worth | Migration `savings_goals` và `debts_cards` đã áp dụng; API/UI, đối soát ledger và PostgreSQL integration PASS, unit 18/18. Đã tách dư nợ sao kê tại chốt và ước tính còn phải trả sau chốt. Lịch gốc cố định và sao kê là dự phóng từ dữ liệu sổ cái, chưa thay thế hợp đồng/bảng kê ngân hàng. G5 chờ browser E2E với Google session thật |
| **P6** — recurring/import/PWA | Rules idempotent, CSV/XLSX import, notifications, PWA | T06.01–T06.07 đã triển khai; CSV/XLSX preview/commit/retry PostgreSQL integration PASS 47 journals; T06.08 service worker có nhưng browser installability chờ QA, T06.09 mobile polish và T06.10 browser regression đang mở. G6 conditional |
| **P7** — hardening/deploy | Security/privacy/accessibility, anti-abuse, CI, E2E, migration backup, load testing, runbooks | Security headers, Docker Linux build/smoke, CI YAML, backup/restore drill và runbook đã có; dependency/security audit, authenticated E2E, hiệu năng, accessibility và GitHub CI xanh chưa đạt |
| **P8** — mở rộng | Family sharing, đa tiền tệ, ngân hàng theo chuẩn cho phép | Chưa bắt đầu |

## Thứ tự thực thi kế tiếp (ưu tiên nghiêm ngặt)

1. **Đã thực hiện:** PostgreSQL 17 healthy ở `127.0.0.1:55433`; sáu migration đã áp dụng tới `20261020080000_debts_cards`; Prisma generate/validate PASS. Không reset database.
2. **Đã thực hiện:** `FINOVA_TEST_RUN=1 npm run test:integration` trên PostgreSQL phát triển PASS: P2–P5, 41 journals cân bằng, workspace isolation, idempotency, tranh chấp hạn mức, thanh toán/hoàn tiền thẻ, hoàn gốc nợ đồng thời và đối soát sao kê sau chốt. `npm run typecheck`, `npm run lint`, `npm run test` (18 test), `npm run build`, `npm run db:generate` và `npx prisma validate` PASS ngày 20/10. `npx prisma migrate status` và `npm run db:reconcile` PASS.
3. **Đã thực hiện một phần:** Google OAuth credentials được cấu hình cục bộ; `npm run test:oauth` PASS khởi tạo/guards ngày 20/10. Chrome `npm run test:browser` PASS login responsive 1440/390/320 với CSS thực và click nút Google dẫn tới OAuth endpoint. **Tiếp theo:** chủ tài khoản hoàn thành Google login/callback/session/logout, rồi thử cách ly hai tài khoản.
4. **Tiếp theo:** authenticated browser E2E ví, thu chi, sửa/hủy/hoàn tiền, danh mục, biểu đồ desktop/mobile; kiểm tra empty/error/filter/drill-down.
5. **Trước production:** deferred journal constraint đã áp dụng/kiểm chứng. Tiếp tục ràng buộc tham chiếu sổ cái đầy đủ, load test/backup/restore, CI và kiểm tra bảo mật/khả năng truy cập.
6. **P6 đã triển khai:** migrations `20261020093000_recurring_notifications` và `20261020094500_csv_import`, recurrence/notifications/import CSV/XLSX có API/UI, staging/commit/retry, service worker tách cache public khỏi API/tài chính. Unit **32/32 PASS** và PostgreSQL integration P2–P6 **47 journals cân bằng** (20/10/2026). Còn batch concurrency đa instance, browser PWA/mobile QA và authenticated E2E.
7. **Tiếp theo:** chốt G6 browser QA; P7 đã có CI workflow, Docker Linux build, backup/restore drill và runbook. Cần xác minh runtime image mới sau bước loại optional peers, dependency remediation, authenticated E2E, bảo mật và hiệu năng; không tự suy diễn production-ready từ dev tests.

## Công việc bổ sung trước production

- Migrations có rollback/backup, indexes tối ưu, constraint chống cross-workspace và write ngoài service; CI và E2E.
- Rate limiting trên mutations/auth, kiểm tra quyền bằng thử nghiệm và audit lịch sử; giám sát lỗi và logging không chứa token.
- Pagination cursor+sort whitelist, filter từ dashboard đồng nhất; tối ưu aggregate PostgreSQL cho dữ liệu lớn.
- Security headers/CSP, bảo vệ secret, ngăn cache dữ liệu cá nhân; thử deploy HTTPS, cookies Secure, structured logs.

Nguồn sự thật trạng thái thực tế: `docs/PHASE_REPORT.md`. Không sử dụng dữ liệu giả trong production.

## Checkpoint G7 bổ sung — 20/10/2026

Đã bổ sung ma trận regression hai workspace cho CSV/XLSX/PDF và import read/commit/retry trong `scripts/integration-check.ts`. Script `scripts/benchmark-reports.ts` được gia cố: kiểm tra ownership của fixture, dọn các bản ghi trong **một transaction**, phát hiện workspace tạo dở, kiểm tra không còn fixture, giữ nguyên lỗi benchmark khi cleanup cũng thất bại; chỉ xuất `G7_PERFORMANCE_10000.json` sau khi cleanup đạt. Thêm 8 HTTP handler unit tests cho export/import boundaries và chống spreadsheet formula injection trong import errors CSV. Đây là triển khai mã nguồn, **chưa phải kết quả PostgreSQL benchmark hay authenticated browser E2E**.

Kết quả static ở checkpoint gần nhất: `typecheck`, `lint`, `test` (**48/48, 10 files**), `security:routes` (**40 API v1 files / 51 handlers**) và `prisma validate` PASS. `npm run security:audit` không thu được báo cáo npm audit hoàn chỉnh nên lần kiểm toán này **không xác nhận sạch cảnh báo**; 5 High dev-only là số liệu checkpoint trước. Docker API hiện trả `permission denied`, Prisma read probe trả `Can't reach database server at localhost:55433`, `prisma migrate status` trả `Schema engine error`; benchmark, integration DB và runtime Docker **BLOCKED**. Windows `npm run build` **FAIL** do `EACCES readlink` tại socket stale trong AppData ngoài workspace. Cần chạy lại các gate trên runtime hợp lệ sau khi quyền truy cập được khôi phục. G5 **OPEN**, G6 **CONDITIONAL**, G7 **IN PROGRESS**, P8 **NOT STARTED**.
# G7 progress checkpoint — 20/10/2026 (audit/integrity)

| Task | Thực thi hiện tại | Gate còn lại |
| --- | --- | --- |
| T07.01 Threat modeling | Đã tạo `SECURITY_THREAT_MODEL.md` với 17 nguy cơ, trust boundaries, controls và residual risks | Security review độc lập và production verification |
| T07.02 Authorization | Đã kiểm kê 42 route files, 51 v1 HTTP handlers; CI `security:routes` PASS; negative integration theo nhóm | Service-level IDOR HTTP matrix cho tất cả IDs/filters/exports, Google two-account E2E |
| T07.03 Session/OAuth | Pre-auth quota, state initiation và smoke đã có từ trước | Authenticated callback/session/logout, HTTPS/SameSite trên staging |
| T07.04 Secrets/config | Env sample và Docker .env exclusion baseline; Origin guards | Rotate OAuth secret đã lộ qua hội thoại, secret manager, ingress config |
| T07.05 Data integrity | 11 check read-only; `auditLedger` trong financial integration; 3 corruption probes rollback PASS; migrations 9/9 | Tăng coverage broken link/foreign data và monitor đối soát định kỳ |
| T07.06 Performance | Reporting recent transactions limit 8; goals PostgreSQL aggregation | Benchmark 10k transactions trên DB riêng, p50/p95/p99, EXPLAIN |
| T07.07 Accessibility/PWA | Responsive login browser baseline | Authenticated pages, keyboard, screen reader, mobile install QA |
| T07.08 Docker build | Image baseline verified (trước changes) | Rebuild + HTTP smoke source mới |
| T07.09 Backup/restore | Local drill PASS | Encrypted offsite, RPO/RTO/retention |
| T07.10 Staging | Code + runbook | HTTPS ingress/WAF, monitoring, staged DB migration |
| T07.11 Release checklist | Có policy/requirements | Chỉ ký nghiệm thu khi toàn bộ blockers đạt |
| T07.12 Documentation | Threat model, authorization audit, phase report cập nhật | Chốt release evidence sau QA thực |

**P8:** chưa triển khai; ưu tiên đóng G7 để tránh phát triển chức năng mới khi các gate production vẫn mở. **Không reset database hoặc phát hành production trong checkpoint này.**

## G7 checkpoint tiếp theo — async export errors / fixture counts (20/10/2026)

Đã sửa ba đường xuất báo cáo XLSX/PDF/POST để bắt rejection từ `sendExport()` ngay trong handler, đảm bảo lỗi không truy cập được foreign wallet/category trả 404 có `Cache-Control: private, no-store`. HTTP unit matrix tăng lên **53/53 PASS (10 files)**; `typecheck`, `lint`, `security:routes` PASS. Ma trận PostgreSQL negative cases bổ sung overview/heatmap/trends/transaction page hai chiều. Benchmark script bổ sung xác nhận chính xác **10.000 transactions, 10.000 journals, 20.000 postings** trước đo và kiểm tra email fixture trước khi xóa user. Các thay đổi DB integration và benchmark vẫn **CHƯA CHẠY** do cổng PostgreSQL không kết nối; Docker build/smoke chưa chạy lại. Audit npm vẫn **INCONCLUSIVE/FAIL** do thiếu report; không nâng G7.


## G7 JSON request hardening checkpoint (20/10/2026)

- Chuyển 23 v1 API route files có JSON request sang `readJsonBody()`; parser giới hạn 64 KiB theo cả header và stream. JSON hoặc UTF-8 không hợp lệ trả `400 INVALID_JSON`; vượt size trả `413 SIZE`. Bỏ cách ánh xạ SyntaxError toàn cục dễ che lỗi lập trình.
- Bổ sung regression malformed JSON cho 9 PATCH handlers, oversized wallet body, parser UTF-8/size và lỗi nội bộ; bảo toàn Origin, session, response no-store.
- Kiểm chứng mới: `typecheck`, `lint`, `test` **175/175 (14 files)**, `security:routes` (40 v1 files/51 handlers) và `prisma validate` PASS.
- Cổng PostgreSQL 55433 vẫn đóng, Docker Linux API trả `permission denied`; integration/ledger reconciliation/benchmark 10.000/Docker rebuild/Google authenticated browser E2E chưa được tái nghiệm thu. Security audit trước đó inconclusive.
- **G5 OPEN; G6 CONDITIONAL; G7 IN PROGRESS; P8 NOT STARTED; production NOT READY.** Tiếp theo: PostgreSQL negative matrix, benchmark DB riêng, Linux smoke và browser acceptance khi môi trường hợp lệ.


### G7 follow-up — form labels and representative EXPLAIN (20/10/2026)

- Bổ sung `financial-form-label-coverage.test.ts`: 91 native controls thuộc 11 financial components được kiểm tra nhãn explicit hoặc implicit hợp lệ bằng TypeScript JSX AST; tránh lỗi accessibility khi thêm trường về sau. Browser screen-reader/keyboard E2E vẫn OPEN.
- `scripts/benchmark-reports.ts` nay ghi thêm `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` cho representative transaction pagination và posting aggregation khi benchmark trên `finova_bench`; measurements chính vẫn gọi service thực. **Chưa chạy SQL EXPLAIN/benchmark** vì PostgreSQL chưa truy cập được; không suy diễn số liệu hoặc plan.
- **Latest static gates: 176/176 unit tests (15 files), typecheck, lint và security:routes PASS.** `security:audit` hiện FAIL vì npm audit thiếu vulnerability report đầy đủ. Các production acceptance gates tiếp tục OPEN.


### Browser smoke environment checkpoint — 20/10/2026

Next dev cổng 3002 thất bại do `EADDRINUSE`, cổng 3012 khởi động được nhưng browser smoke không thể kết nối loopback (`EACCES 127.0.0.1:3012`). Đã tắt server 3012 và dọn tệp Next.js auto-generated. Browser smoke lần này **NOT PASSED**; không tính vào G7 acceptance. Cần chạy lại trên runtime cho phép loopback và có PostgreSQL/Google session thật.

### G7 — giới hạn ngày kết thúc recurring và bằng chứng mới (20/10/2026)

Đã sửa `updateRule()` để loại bỏ kỳ dự kiến chưa hạch toán nằm sau `endDate` trong một Serializable transaction và bổ sung guard `RULE_DATE_RANGE` trong `processOccurrence()` để lịch đã hết hạn không tạo giao dịch thu/chi ngoài kỳ. Lịch sử POSTED được bảo toàn; khi gia hạn, kỳ forecast được tạo lại bằng `generateOccurrences()`. Bổ sung 4 unit regressions và PostgreSQL integration scenario (rút ngắn → chặn stale period → kéo dài → regenerate).

Quality gates mới nhất: **180/180 unit tests (16 files), typecheck, lint, security:routes, prisma validate PASS**. PostgreSQL integration vừa bổ sung chưa chạy vì cổng 55433 không kết nối; Docker API permission denied; Windows production build lỗi `EACCES readlink` tại socket ngoài workspace; `security:audit` inconclusive vì npm audit thiếu report. **Không nâng G5/G6/G7; P8 chưa triển khai.** Thứ tự tiếp theo: PostgreSQL integration/reconciliation trên database phù hợp → benchmark `finova_bench` 10k → Docker Linux build/smoke → Google authenticated E2E hai tài khoản → staging acceptance.

### G7 tiếp tục — Serializable retries/concurrency (20/10/2026)

- **Mã đã bổ sung:** `src/server/ledger.ts` dùng `serializable()` cho create/edit/void/refund (tự chạy lại trọn transaction tối đa 5 lần nếu P2034/P2002); `scripts/integration-check.ts` kiểm tra hai edit/void cùng version, generation đồng thời với rút ngắn/pause recurring và uniqueness. `tests/unit/serializable-retry.test.ts` có 4 regression mới.
- **Static gates vừa xác minh:** `typecheck`, `lint`, `test` **186/186 (17 files)**, `security:routes` (40/51 handlers), `prisma validate` PASS. PostgreSQL TCP 55433 đóng; Docker API permission denied. `security:audit` **inconclusive/FAIL** vì registry không trả report đầy đủ.
- **Các task nghiệm thu còn lại:** T07.05 cần PostgreSQL integration/reconciliation và concurrency; T07.06 benchmark 10k trên `finova_bench`; T07.08 Linux image rebuild/smoke; T07.03 Google session/logout hai tài khoản, PWA/mobile/a11y; T07.04 rotate secret; T07.09 offsite encrypted backup/RPO/RTO; T07.10 HTTPS/trusted ingress/WAF/monitoring/CI remote; T07.11 ký release acceptance. Cần khôi phục hạ tầng và nghiệm thu thực tế trước khi chốt G5/G6/G7.
- **Trạng thái:** G5 **OPEN**, G6 **CONDITIONAL**, G7 **IN PROGRESS**, P8 **NOT STARTED**, production **NOT READY**.


### G7 tiếp tục — T07.05/T07.06 ngân sách và benchmark (20/10/2026)

Đã thay truy vấn postings theo từng ngân sách bằng PostgreSQL aggregate gộp, giữ độ chính xác Decimal và trạng thái cảnh báo bằng Serializable transaction. Đã bổ sung regression cho cảnh báo, ngân sách đã lưu trữ, group category; mở rộng benchmark 10k để đo budget service và EXPLAIN. Static/unit gates đạt 191/191, typecheck, lint, route audit, Prisma validate. Việc nghiệm thu DB performance/concurrency, Linux production build, browser OAuth và staging vẫn OPEN vì PostgreSQL 55433 không kết nối, Docker API bị từ chối; Webpack EACCES readlink ngoài workspace; npm vulnerability report chưa đầy đủ. G5 OPEN / G6 CONDITIONAL / G7 IN PROGRESS / P8 NOT STARTED. Không phát hành production khi chưa đủ chứng cứ.

### G7 checkpoint 21/10/2026 — kiểm chứng runtime và hiệu năng

Docker/PostgreSQL truy cập thành công với quyền phù hợp: 9 migrations, integration tài chính 59 journals, security integration, đối soát 0 sai lệch; TypeScript/ESLint/191 unit tests/route audit PASS. Benchmark 10k trên `finova_bench` và cleanup PASS: dashboard p95 giảm **1.711,86 → 38,97 ms** nhờ PostgreSQL aggregate ở `src/server/reporting.ts`. Docker Linux `finova:g7-reverify-20261021` build + HTTP smoke PASS, production prune 302 packages/0 vulnerabilities; npm audit còn 5 High dev-only được theo dõi. Chi tiết và artifact tại `docs/PHASE_REPORT.md`.

**T07.05** và baseline **T07.06** đã có bằng chứng local; **T07.08** đạt local image/runtime smoke. Tiếp tục multi-instance performance/staging, Google two-account authenticated E2E (T07.03/T07.07), trusted HTTPS ingress và secret rotation (T07.04/T07.10), offsite encrypted backup (T07.09), CI remote và release gate (T07.11). **G5 OPEN — G6 CONDITIONAL — G7 IN PROGRESS; P8 NOT STARTED; production NOT READY.**

### G7 checkpoint tiếp theo — so sánh ledger và tải đồng thời (21/10/2026)

`scripts/integration-check.ts` có phép đối chiếu độc lập theo từng Posting cho 11 bộ lọc Dashboard qua 2 workspace; PostgreSQL integration 59 journals, 191 unit tests, typecheck, lint, route audit, Prisma validate và reconciliation 0 sai lệch PASS. Benchmark 10k mở rộng đồng thời 4/8/16 request trong một process, chạy 3 lần và cleanup PASS. SQL aggregate EXPLAIN gần nhất ~17,14 ms, nhưng Dashboard p95 tuần tự dao động 23,22–242,40 ms; concurrency 4 ghi nhận p95 ~2 giây ở cả 3 lần. Cần điều tra nguồn biến thiên rồi kiểm tra nhiều instance/staging, chưa nghiệm thu hiệu năng production. Docker/PostgreSQL healthy; runtime audit 0 findings, 5 High dev-only còn mở. Xem số liệu và artifact trong `docs/PHASE_REPORT.md`.

Ưu tiên kế tiếp của T07.06: phân rã latency theo Prisma connection/query, tăng warmup và đo HTTP tải nhiều replica với edge rate limiting. T07.03/T07.07: Google OAuth hai tài khoản và browser E2E; T07.04/T07.09/T07.10/T07.11: rotate secrets, HTTPS/WAF, offsite restore, CI và release acceptance. **G5 OPEN — G6 CONDITIONAL — G7 IN PROGRESS; P8 NOT STARTED; production NOT READY.**

## G7 checklist nghiệm thu tiếp theo — 21/10/2026

- [x] **T07.05 integrity regression:** PostgreSQL integration 59 journals cân bằng gồm isolation, concurrency, recurring/import và corruption probes rollback; read-only ledger audit 11 kiểm tra/0 sai lệch; security integration quota/isolation PASS.
- [x] **T07.06a/b local performance profiling:** benchmark riêng `finova_bench` 10k/10k/20k và cleanup PASS; `overview()` có timing callback tùy chọn chỉ dùng khi benchmark, đo 4/8/16 request, DB ping, SQL sleep 50 ms, 4 nhánh, event loop và pool prewarm. Artifact `artifacts/G7_PERFORMANCE_10000.json`.
- [x] **T07.08a Docker runtime smoke:** image `finova:g7-profile-20261021` non-root healthy; HTTP 200/401/403, security headers/CSP Report-Only PASS; Prisma Client load thành công, image không có `.env`/Vitest/Prisma CLI. Container tạm tại 3003 đã xóa. T07.08b release/staging vẫn mở.
- [x] **T07.08b Compose packaging + migration cục bộ:** cấu hình profile `app`/`release` PASS; build job migration PASS; `migrate status/deploy` từ Compose trên `finova_bench` xác nhận 9 migrations/0 pending; app Compose cổng 3004 non-root/healthy, HTTP guard 200/401/403 + CSP/headers PASS, Prisma kết nối đúng `finova_bench`. Đã dọn toàn bộ container thử nghiệm.
- [ ] **T07.08c staging release acceptance:** migration/rollback, HTTPS ingress, real OAuth/session, staging smoke chưa có kết quả; parent T07.08 và G7 giữ OPEN.
- [x] **T07.06c root cause và cải thiện cold connection cục bộ:** `localhost` trên Windows resolve IPv6 trước, Prisma `$connect()` ~2.307,64 ms và mở 16 kết nối lạnh ~2.043,92 ms; với `127.0.0.1` cùng pool 16 tương ứng ~17,92 và ~20,04 ms. Đổi host DB trong `.env.example`/local `.env`; 10k benchmark riêng cho dashboard concurrent 4/8/16 p95 64,85/89,34/174,53 ms, không có request >500 ms, cleanup PASS. Staging/SLA vẫn mở.
- [x] **T07.06c1 Prisma query timeline/pool comparison:** baseline 3.800 Prisma query events, 0 SQL events >500 ms dù Dashboard outlier ~2 giây. `connection_limit=8` và `16` loại được outlier trong local benchmark 10k (4/8/16 concurrent); cấu hình mẫu 16/replica.
- [x] **T07.06c2 DNS/TCP + IPv4 regression:** Windows default/16 và Docker Linux đã đo; TCP thuần vài ms nhưng Prisma cold path `localhost`/IPv6 ~2 giây. 191 unit tests, typecheck, lint, audit 40 routes/51 handlers PASS. Goals p99 ghi nhận một outlier 4.686,06 ms; theo dõi ở T07.06d. Compose app yêu cầu DSN tường minh: fail-fast thiếu DSN và HTTP smoke với DSN benchmark PASS.
- [ ] **T07.06d multi-instance acceptance:** đo tải HTTPS nhiều replica và xác nhận p95/p99 theo SLA trước G7.
- [ ] **G7 release acceptance:** Google hai tài khoản, responsive/a11y/PWA, HTTPS/CSP/WAF, secret rotation, offsite restore, remote CI và staging smoke.

Các checkbox trên chỉ xác nhận phần có test thực chạy. T07.06 tổng thể, G5/G6/G7 vẫn chưa đạt gate phát hành; chưa triển khai production.

## Checkpoint P0/tài liệu và invariant — 21/10/2026

- [x] **T00.03 — PRD & user stories:** persona, 3 journeys, 10 user stories và AT mapping trong `docs/PRD.md`.
- [x] **T00.05 — ADR hạ tầng:** ADR-0006 ghi stack/auth/jobs/Compose, migration job, rollback; hosting/domain/staging chưa được phê duyệt.
- [x] **T00.10 — Test plan & fixtures:** `docs/TEST_PLAN.md` có AT-01–18 và fixture/gate matrix, mapping invariant. Unit ledger bổ sung 512 trường hợp pseudo-random seeded cho bốn loại posting, reversal và VND qua JSON; 195/195 tests PASS.
- [x] **Đồng bộ tài liệu triển khai cục bộ:** `ARCHITECTURE`, `ERD` (9 migrations), `REPORT_DEFINITIONS` (aggregate/8 recent), `API_CONTRACT`, `GAP_ANALYSIS`, `README`, `TEST_REPORT` và master checklist.
- [ ] **G0 hoàn toàn / acceptance trên hệ thống:** cần đối chiếu trọn vẹn công thức/ví dụ với đặc tả; các ca AT phụ thuộc Google/staging/PWA vẫn mở. Checkbox tài liệu không đồng nghĩa release gate PASS.
- [ ] **G5/G6/G7:** authenticated Google E2E, HTTP IDOR hai session, PWA/install/screen reader, HTTPS/CSP/WAF, multi-replica load, secret rotation, offsite restore, CI remote, rollback/staging sign-off. **PRODUCTION NOT READY**; ưu tiên các mục này trước P8.

**Kiểm thử thực chạy cho checkpoint này:** `test` 195/195 (20 files), `typecheck`, `lint`, `security:routes` 40/51 và `prisma validate` PASS. `tests/unit/ledger.test.ts` 9/9 PASS sau sửa BigInt theo TypeScript target. Integration PostgreSQL/Docker/benchmark không chạy lại vì thay đổi chỉ liên quan test và tài liệu; các chứng cứ local trước vẫn tra cứu ở `PHASE_REPORT.md`.
