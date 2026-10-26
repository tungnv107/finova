# FINOVA — IMPLEMENTATION PLAN: QUẢN TRỊ HỆ THỐNG, GÓI LITE/PREMIUM VÀ PHÂN TÍCH VẬN HÀNH

**Mã phân hệ:** FN-ADMIN-BILLING · **Phiên bản kế hoạch:** 1.0 · **Lập ngày:** 23/10/2026  
**Tình trạng:** ĐANG TRIỂN KHAI; **36/55 nhiệm vụ đã có bằng chứng nghiệm thu theo phạm vi DEV**; chưa UAT provider thu phí thực tế.

**Checkpoint QA-26E ngày 26/10/2026 — AD5-05 tiếp tục (chưa nghiệm thu toàn bộ):** Bổ sung KPI số người trả phí duy nhất, lần đầu/gia hạn, grant theo tháng/năm và giá trị đầu vào VERIFIED/IN chờ đối soát; tránh đếm trùng người có nhiều grant trong một kỳ, giữ số tiền PostgreSQL numeric chính xác dạng chuỗi. Tối ưu đếm grant tháng/năm từ CTE chung. `admin:test-billing-analytics` **PASS** trên PostgreSQL QA cách ly `finova_admin_test_ad505_20261026` (31 migrations), kiểm tra ranh giới ngày VN, nhiều grant, gross allocation, review incoming và fixture cleanup. **499/499 unit (91 files)**, typecheck, lint, Prisma validate, API guard **80/99** PASS; Next production build QA **58/58 trang PASS** sau tối ưu SQL. **AD5-05 giữ `[ ]`** do chưa có ledger hoàn tiền theo ngày/giá trị, doanh thu thuần và định nghĩa churn được nghiệm thu. Admin **36/55 DEV**, billing production **NO-GO**.

**Checkpoint QA-26D ngày 26/10/2026 — AD5-08 hardening:** Chuyển snapshot 8 tín hiệu vào transaction PostgreSQL Serializable **sau khi lấy advisory lock**, tránh lượt cron chồng lấn ghi sự cố từ snapshot cũ. Hộp thư và ACK kiểm tra vai trò hiện tại: người từng nhận warning khi là Finance nhưng sau đó chỉ còn ADMIN không được xem/xác nhận warning từ delivery lịch sử. Bổ sung hồi quy thay vai trò giữa vòng đời incident; `admin:test-monitor` (QA DB riêng), `admin:test-operations` (signed-session HTTP), **499/499 unit (91 files)**, typecheck, targeted lint, Prisma validate, API audit **80/99**, Next.js isolated production build **58/58 trang** PASS. SePay có trang status và cảnh báo webhook thất bại, nhưng **chưa chứng minh có health API độc lập**. Giữ AD5-08 `[ ]`, tổng **36/55**, production billing **NO-GO**.

**Checkpoint QA-26B ngày 26/10/2026 — AD2-06 nghiệm thu DEV, AD5-08 tiếp tục:** `npm run admin:test-checkout-browser` PASS (exit 0) trên PostgreSQL QA `finova_admin_test_ad206_20261026` và React/Chrome với signed Better Auth sessions: kiểm tra giá 29.000/199.000 VNĐ, tạo đơn thực, idempotency/owner scope, 6 trạng thái phía server, không cấp Premium khi mới tạo đơn; desktop 1440 Light, mobile 390 Light/320 Dark, không tràn và axe WCAG serious/critical = 0, fixture cleanup PASS. **AD2-06 `[x]`, Admin 36/55 DEV (AD2 7/8).** Đồng thời sửa cleanup AD5-08 để dọn workspace tạo qua bootstrap trước khi xóa role users; phục hồi có kiểm soát 5 fixture QA tồn dư, chạy `npm run admin:test-operations` **PASS exit 0** trên DB QA 29 migrations: 7 cảnh báo hàng lỗi/độ trễ/ngoại lệ/quá hạn/audit, tín hiệu thứ 8 `IPN_NO_SIGNAL` ở mức info, phân quyền HTTP 200/403 cho 5 role, không lộ PII; kiểm tra lại **0 QA users, 0 workspace, 0 payment fixture**. Typecheck, lint, **496/496 unit (90 files)**, Prisma validate, route audit **79/98**, Next production build QA riêng **57/57 PASS**. **AD5-08 giữ `[ ]`** vì mới có dashboard truy vấn khi mở trang; còn thiếu heartbeat provider và tự động gửi cảnh báo đúng người vận hành qua kênh độc lập. Signed sessions chưa thay thế Google OAuth E2E; provider sandbox/staging và production sign-off còn mở. **Billing production NO-GO.**

**Checkpoint QA-26A ngày 26/10/2026 — AD5-06 nghiệm thu DEV:** Chạy `scripts/admin-analytics-browser-check.ts` trên Next.js 16.4.2 tại localhost:31642 và database riêng `finova_admin_test_ad506_20261026` (**29/29 migrations PASS**): `ADMIN_ANALYTICS_BROWSER_QA_PASS` (exit 0), signed Better Auth sessions cho USER/ADMIN/ANALYST/FINANCE_OPERATOR; direct URL 403/200, hai dashboard `/admin/analytics` và `/admin/billing/analytics` lọc 7/30/90 ngày, mỗi kỳ đủ số dòng ngày và có drill-down bằng Enter. Chrome headless 1440 Light, 390 Light, 320 Dark: không tràn ngang, mục tiêu lọc ≥44px; axe WCAG A/AA serious/critical = 0, không lộ PII fixture; cleanup user/order/receiver/price và session PASS. Hồi quy **496/496 unit (90 files)**, TypeScript, ESLint, API guards **79 route/98 handler**, production build riêng **57/57 PASS**. **AD5-06 `[x]`; Admin 35/55 (AD5 5/8)**. Đây là phiên signed QA synthetic, Google OAuth browser thật/consent/privacy, provider UAT, HTTPS staging vẫn cần nghiệm thu; **production billing NO-GO**.

**Checkpoint QA-25I ngày 25/10/2026 — AD6-03 nghiệm thu DEV:** Chạy lại `admin:test-signed-session` trên PostgreSQL QA riêng `finova_admin_test_ui_20261025` **PASS (exit 0)**: cookie HMAC hợp lệ/giả mạo, session cũ, Origin thiếu/sai (CSRF), anonymous và Workspace OWNER 401/403, ANALYST/FINANCE_OPERATOR/ADMIN/SUPER_ADMIN ma trận 401/403/404 trên user list/detail, billing payments và overview, response `private, no-store`, actor revoked/suspended, IDOR với quản trị viên được bảo vệ, suspend/reactivate/session revocation, audit và dual approval. Regression sau thay đổi gần nhất: **496/496 unit (90 files), TypeScript, ESLint, route guard audit 79 files/98 handlers PASS**. **AD6-03 `[x]`, Admin 34/55 (AD6 3/8)**. Google OAuth browser thực, provider sandbox, staging và ký duyệt bảo mật production là các gate riêng, **production billing NO-GO**.

**Checkpoint QA-25H ngày 25/10/2026 — AD2-07 nghiệm thu DEV:** `admin:test-billing-browser` **PASS (exit 0)** trên Next.js QA cổng 31637 và PostgreSQL riêng `finova_admin_test_ui_20261025`. Signed Better Auth sessions kiểm tra HTTP 403/200 theo role và API, Chrome 1440/390/320 px, Light/Dark, menu/touch target/overflow và axe WCAG AA không có lỗi serious/critical. Form tài khoản chỉ gửi snapshot đã xác nhận dù autofill làm đổi DOM, che tài khoản, mã hóa, chặn người đề xuất tự duyệt và yêu cầu hai Super Admin khác nhau; thử CRUD giá, xem trước/hủy/công bố, giữ giá đơn cũ và giá đơn mới, audit và fixture cleanup PASS. Một price version QA đã công bố được giữ lại có chủ ý vì catalog lịch sử bất biến. **AD2-07 `[x]`; Admin 33/55 (AD2 6/8)**. Đây là browser QA với synthetic signed sessions; Google OAuth E2E, provider sandbox và phê duyệt thu phí thật vẫn mở, **production NO-GO**.

**Checkpoint QA-25G ngày 25/10/2026 — AD5-02 nghiệm thu DEV:** Hoàn thiện chuỗi pageview từ `UsagePageview` đến API xác thực và service ghi nhận theo nhóm route; chỉ ghi dữ liệu của người dùng đã đăng nhập, kiểm tra Origin, loại bot, từ chối route/payload không hợp lệ và không nhận URL, query string hay dữ liệu tài chính. Unit tests xác nhận StrictMode remount không đếm trùng, chuyển trang/back-forward được ghi nhận, reload tạo navigation mới, anonymous/bot không được ghi và analytics flag mặc định OFF không ghi dữ liệu. **496/496 unit tests (90 files), TypeScript, ESLint và API guard audit 79 route files/98 handlers PASS.** **AD5-02 `[x]`; Admin 32/55 (AD5 4/8).** Browser/mobile/a11y acceptance của dashboard vẫn thuộc AD5-06; privacy/consent và loại trừ hoạt động nội bộ vẫn thuộc AD5-01. Analytics giữ OFF mặc định; production billing NO-GO.

**Checkpoint QA-25F ngày 25/10/2026 — AD2-07 đang triển khai, CHƯA nghiệm thu:** Hai trang quản trị bảng giá/tài khoản nhận phí đã có preview và audit; payload tài khoản gửi đi được chốt theo nội dung đã xem trước để tránh thay đổi âm thầm bởi autofill. Đã thêm kịch bản `admin:test-billing-browser` bao phủ signed-role 403/200, tạo/sửa/công bố giá, snapshot giá đơn cũ/mới, receiver che số, phê duyệt hai người, audit, mobile 1440/390/320, Light/Dark và axe WCAG. **Kịch bản này chưa được chạy thành công.** DB QA tách biệt `finova_admin_test_ui_20261025` đã áp dụng **29/29 migrations PASS**. Seed QA có quyền nâng cao bị auto-review chặn; chạy trong sandbox không kết nối được DB. Port 3017 bị chiếm và lần yêu cầu khởi động server QA ở 3027 bị auto-review chặn. Static gates: typecheck, ESLint, **483/483 unit (85 files)**, Prisma validate, API guard **79 routes/98 handlers** và Next.js production build riêng **57/57 trang PASS** (sau khi chạy lại với quyền phù hợp vì sandbox gặp EPERM mkdir). **Giữ AD2-07 `[ ]`, tiến độ Admin 31/55, production NO-GO.** Cần browser QA trên PostgreSQL cô lập trước khi nghiệm thu DEV; chưa có Google OAuth E2E/provider UAT thật.

**Checkpoint QA-25E ngày 25/10/2026 — AD4-01 nghiệm thu DEV:** Browser QA với Better Auth signed session trên PostgreSQL QA biệt lập `finova_admin_test_subscriptions_20261025`: USER vào `/admin`, `/admin/users` và ANALYST vào route ngoài quyền đều HTTP 403, không render admin shell; ADMIN/ANALYST kiểm tra menu phân quyền, desktop 1440 px, mobile 390/320 px, Light/Dark, không tràn ngang, nút ≥44 px và axe WCAG AA không có lỗi serious/critical, fixture cleanup **PASS** (`admin:test-shell-browser`). Full **483/483 unit**, typecheck, ESLint, Prisma validate, audit route **79/98**, Next.js production build thư mục QA riêng **57/57 PASS**. **AD4-01 `[x]`, Admin 31/55 (AD4 7/7).** Synthetic signed session không thay thế Google OAuth E2E; staging/provider UAT còn mở, **production NO-GO**.

**Checkpoint QA-25D ngày 25/10/2026 — AD4-04 nghiệm thu DEV:** Quản lý `ACTIVE`/`SUSPENDED`/`DEACTIVATED` có lý do 10–500 ký tự, bắt xác thực Better Auth Google session được tạo trong 5 phút (không dùng `updatedAt`), bảo vệ tài khoản quản trị, thu hồi session khi khóa và timeline audit trạng thái trong trang chi tiết. PostgreSQL QA biệt lập `finova_admin_test_subscriptions_20261025` chạy `admin:test-signed-session` **PASS**: HMAC thật, session cũ/giả mạo, Origin, RBAC, actor bị khóa, protected admin, khóa/mở, session revoke, audit, dual approval cấp/thu hồi Premium. Full regression **483/483 unit**, TypeScript/ESLint/Prisma/API guard **79/98**, build **57/57 PASS**. **AD4-04 `[x]`, Admin 30/55 (AD4 6/7).** Browser Google E2E/staging vẫn mở; **production NO-GO**.

**Checkpoint QA-25C ngày 25/10/2026 — AD5-04 nghiệm thu DEV:** Thống kê user đăng ký, đăng ký 30 ngày, DAU/WAU/MAU, cohort theo ngày đăng ký Việt Nam và retention D1/D7/D30 từ PostgreSQL; chỉ đưa cohort đủ tuổi vào mẫu số. `admin:test-cohorts` PASS: mốc 00:00 Việt Nam, ngày trống, D0/D1/D7/D30, maturity và fixture cleanup trên DB QA biệt lập. Unit mới 4/4; **full 483/483 (85 files)**, TypeScript, ESLint, Prisma validate, API guard **79/98**, Next.js build **57/57 PASS**. **AD5-04 `[x]`; Admin 29/55 (AD5 3/8).** Analytics mặc định OFF, retention chỉ phản ánh activity được ghi nhận sau khi bật consent; privacy/bot exclusion còn AD5-01/02. **Production billing NO-GO**.

**Checkpoint QA-25B ngày 25/10/2026 — AD4-05 nghiệm thu DEV:** Trang `/admin/subscriptions` có tổng hợp đề xuất chờ/đã duyệt/từ chối và grant thủ công còn hiệu lực, lịch sử sự kiện thanh toán/gia hạn/cấp bù/thu hồi; hai người phê duyệt và không tự cấp quyền, idempotency, audit được chứng minh bằng integration Admin/Premium. Đã khắc phục giới hạn chỉ hiển thị 50 yêu cầu mới nhất: bổ sung keyset cursor theo trạng thái, `createdAt DESC, id DESC`, navigation trang sau và chỉ mục PostgreSQL `20261025090500_subscription_action_keyset`. **29/29 migrations** trên QA riêng `finova_admin_test_subscriptions_20261025`; `admin:test-subscriptions` **PASS** 55 yêu cầu pending và 55 sự kiện trùng timestamp, xen insert và kiểm tra không trùng/bỏ sót, khóa cursor theo status, đối soát counts/index, cleanup fixture. Unit **479/479 (83 files)**, TypeScript, ESLint, Prisma validate, guard audit **79/98**, production build **57/57 trang PASS**. **AD4-05 `[x]`; Admin 28/55 (AD4 5/7)**. Không bao gồm hoàn tiền có phí, browser Google E2E, staging/provider UAT; **production NO-GO**.

**Checkpoint QA-25A ngày 25/10/2026 — AD2-08 nghiệm thu DEV:** Checkout và `/settings/subscription` hiển thị tiến độ tạo đơn → xác minh tiền vào → kích hoạt Premium, trạng thái cần đối soát/hết hạn/đã hoàn tiền; `PAID` chưa được trình bày là quyền Premium đã kích hoạt, quyền hiện tại tính từ grant hiệu lực. Lite vẫn tra cứu trạng thái đơn qua owner-scoped service, thông báo thanh toán nghiệp vụ hoạt động độc lập entitlement `NOTIFICATIONS`. PostgreSQL QA riêng `finova_admin_test_history_20261025` (**28/28 migrations**) kiểm tra PENDING/EXPIRED/REVIEW/PAID/ACTIVATED/REFUNDED, Lite/Premium, outbox và chống IDOR **PASS** (`admin:test-order-history`). Full unit trước patch phân trang 478/478 và hồi quy sau cùng **479/479**, TypeScript/ESLint/API guards/production build PASS. **AD2-08 `[x]`; Admin 27/55 (AD2 5/8)** ở mốc nghiệm thu này. Browser E2E/mobile, QR bằng app ngân hàng và provider sandbox UAT vẫn là gate riêng; **production NO-GO**.

**Checkpoint QA-24O ngày 24/10/2026 — AD4-06 nghiệm thu DEV:** `/settings/subscription` đã hiển thị effective Lite/Premium, hạn sử dụng theo `Asia/Ho_Chi_Minh`, hai tùy chọn Premium tháng/năm theo catalog công bố (mặc định 29.000/199.000 VNĐ), nâng cấp/gia hạn, lịch sử đơn và xác nhận kích hoạt. `/pricing` dùng chung hai kỳ hạn; giá không hợp lệ, kỳ hạn thiếu hoặc checkout bị tắt chỉ hiển thị và không tạo đơn. Không có thao tác đổi/xóa dữ liệu tài chính khi hết hạn. Unit mới 4/4; full suite **454/454 (76 files)**, TypeScript, ESLint, API guards **79/98**, Next build **57/57 trang PASS**. **AD4-06 `[x]`; Admin 26/55 (AD4 4/7) theo phạm vi DEV.** Browser signed-Google E2E trên mobile, provider UAT và staging approval còn thiếu; **production NO-GO**.

**Checkpoint QA-24N ngày 24/10/2026 — AD4-02, AD4-03 nghiệm thu DEV:** Danh sách user dùng keyset `(createdAt DESC, id ASC)`, cursor gắn bộ lọc, hai chiều và index PostgreSQL mới `20261024221500_admin_user_keyset_index`; export CSV 500 dòng tối đa, chỉ Super Admin, chặn CSV formula, audit không lưu PII. Chi tiết người dùng có effective Premium, subscription event/access lifecycle, order/grant và thời điểm hoạt động gần nhất từ session/pageview, không truy vấn ví/giao dịch cá nhân. **27/27 migrations** trên QA `finova_admin_test_catalog_final_20261024`, `admin:test-users` PASS (65 user trùng timestamp, trang trước/sau, lọc, insert đồng thời, CSV, audit, lifecycle, index; fixture cleanup), test route 401/403 trước truy vấn và PII projection PASS. **AD4-02/AD4-03 `[x]`; Admin 25/55 (AD4 3/7).** Đây là nghiệm thu DEV; Google OAuth/browser E2E, provider UAT và sản phẩm thu phí live còn **NO-GO**.

**Checkpoint QA-24M ngày 24/10/2026 — AD1-01, AD1-04, AD2-01 nghiệm thu DEV:** Trên DB QA độc lập `finova_admin_test_catalog_20261024`, áp dụng **26/26 migrations PASS**, diễn tập ngược DDL hai migration mới trong transaction `ROLLBACK` và xác minh schema nguyên trạng **PASS**. `admin-catalog-integration-check.ts` PASS các ca RBAC, giá/sản phẩm không hợp lệ, CRUD nháp, publish/unpublish, đổi giá 29.000→39.000 VNĐ, đơn hàng cũ giữ snapshot, checkout idempotency, ràng buộc FK/CHECK/partial unique/immutable SQL, cạnh tranh publish và audit. `438/438` unit (72 files), TypeScript, ESLint, API guard **78 route files/97 handlers**, Next 16.4.2 production build **56/56 trang PASS** với quyền Windows phù hợp; build trong sandbox mặc định báo `EPERM mkdir`. **AD1-01/AD1-04/AD2-01 `[x]`, Admin 23/55 (AD1 8/8, AD2 4/8).** Trang UI bảng giá đã có nhưng AD2-07 vẫn `[ ]` do chưa browser E2E/a11y. Rollback mới diễn tập trong giao dịch QA, chưa diễn tập full restore trên staging. Provider sandbox, OAuth Google browser, đối soát/hoàn tiền và phê duyệt production còn mở: **NO-GO**.

**Checkpoint QA-24L ngày 24/10/2026 — AD2-02 nghiệm thu DEV:** PostgreSQL QA `finova_admin_test_20261024` PASS việc đề xuất receiver mới phải chờ phê duyệt, Finance bị từ chối ở service, người duyệt cần là Super Admin khác; receiver cũ tự động `DISABLED`, order cũ giữ số tài khoản đã snapshot, order mới sử dụng receiver vừa kích hoạt. Danh sách Admin chỉ thấy số đã che, không trả số gốc/ciphertext; webhook từ chối receiver đã disable. **438/438 unit (72 files)**, TypeScript/ESLint/Prisma, API guard **74/91**, Next build **55/55 PASS**. **AD2-02 [x], Admin 20/55 (AD2 3/8).** Chưa xác minh tài khoản với ngân hàng/provider thực, còn provider UAT và các gate production: **NO-GO**.

**Checkpoint QA-24K ngày 24/10/2026 — AD1-08 nghiệm thu DEV:** Sanitizer lọc token/API key/password/Authorization (kể cả JSON có dấu nháy) và số tài khoản trong lý do thao tác, trước khi lưu access/action/audit. PostgreSQL QA `finova_admin_test_20261024` PASS: audit không chứa synthetic secret hay số tài khoản; receiver AES-256-GCM, admin chỉ nhận số tài khoản đã che, receiver `DISABLED` bị từ chối, negative IDOR billing order; RBAC deny-list và Finance PII projection có unit + route guard audit. **438/438 unit (72 files)**, typecheck, lint, Prisma validate, API guard **74/91**, Next.js build **55/55 PASS**. **AD1-08 [x], Admin 19/55 (AD1 6/8)**. Browser OAuth, provider UAT, staging và security sign-off production còn mở; **NO-GO**.

**Checkpoint QA-24J ngày 24/10/2026 — AD6-01 nghiệm thu DEV:** Unit state machine, phân loại credit, parser mã đơn và webhook, giá catalog không hợp lệ (`null`, 0, âm, thập phân, vượt giới hạn, sai tiền tệ/kỳ hạn), quyền từ grant tại mốc hết hạn và lịch tháng/năm Việt Nam đã được kiểm thử. PostgreSQL QA riêng `finova_admin_test_20261024` PASS integration checkout idempotency, conflict kỳ hạn, snapshot giá 29.000 VNĐ qua repricing 39.000 VNĐ, retry, receiver snapshot, từ chối giá 0, gia hạn/rollback/replay. Hồi quy: **421/421 unit (71 files)**, TypeScript, ESLint, Prisma validate, API guard audit **74 files/91 handlers**, Next.js 16.4.2 production build **55/55 trang PASS** khi chạy bằng quyền Windows phù hợp (sandbox thông thường bị `EPERM mkdir`). **AD6-01 [x]; Admin 18/55, AD6 2/8.** Chưa có provider UAT hay Google OAuth browser E2E; **production NO-GO**.

**Checkpoint QA-24I ngày 24/10/2026 — AD5-03 nghiệm thu DEV:** `ProductUsageDaily` tăng trong transaction Serializable cùng idempotency receipt; first/last monotonic. Backfill từ receipt trong **2 ngày** idempotent, không làm giảm số đếm và tránh update khi không đổi. Endpoint `POST /api/internal/usage/prune` backfill trước khi xóa receipt >2 ngày và summary >400 ngày, dùng index `createdAt`/`dayVn` (chưa partition). PostgreSQL QA `finova_admin_test_export_20261024_1200` kiểm tra missing rollup, restart, 3 worker repair đồng thời với pageview mới, ranh giới 17:00 UTC, TTL inclusive, 400 ngày và index **PASS**; export/signed session regression PASS. **418/418 unit, TypeScript, lint, Prisma validate, API guards 74/91, Next.js build 55/55 PASS. AD5-03 [x]; Admin 17/55 (AD5 2/8).** Không thể phục hồi chi tiết sau khi receipt hết 2 ngày; scheduler bên ngoài và consent/privacy còn chờ staging/approval. **Production NO-GO**.
**Liên kết:** [Kế hoạch tổng thể](../IMPLEMENTATION_PLAN_QUAN_LY_TAI_CHINH_CA_NHAN.md) · [Tracker triển khai](IMPLEMENTATION_PLAN.md) · [Kiến trúc](ARCHITECTURE.md) · [Thiết kế Bank Sync](FINOVA_BANK_SYNC_IMPLEMENTATION_PLAN.md) · [SePay Bank Hub](FINOVA_SEPAY_BANKHUB_IMPLEMENTATION_PLAN.md) · [Bảo mật](SECURITY_THREAT_MODEL.md).

> **Nguyên tắc cập nhật:** chỉ đánh dấu `[x]` sau khi có đủ mã nguồn, migration áp dụng lên DB kiểm thử, bằng chứng unit/integration hoặc E2E phù hợp và tài liệu được cập nhật. Bằng chứng phần matcher/checkout: [Runbook & kiểm thử](FINOVA_ADMIN_PREMIUM_PAYMENT_RUNBOOK.md). Kết quả Bank Sync/SePay hiện có **không chứng minh** đã đối soát thanh toán Premium. Chế độ production của các luồng ngân hàng hiện vẫn **NO-GO** theo các tracker nguồn.

**Checkpoint QA-24H ngày 24/10/2026 — AD5-07 nghiệm thu DEV:** Đã triển khai `GET /api/v1/admin/analytics/export` cho CSV/XLSX tổng hợp thu phí và truy cập (7/30/90 ngày), bảo vệ bằng signed Better Auth session + platform role, giới hạn Finance chỉ được xem billing; dữ liệu ngày theo `Asia/Ho_Chi_Minh`, download `private, no-store`, CSV BOM/formula-safe, Excel định dạng VND, không xuất PII. PostgreSQL QA **mới, biệt lập** `finova_admin_test_export_20261024_1200`: 24/24 migrations PASS, `npm run admin:test-export` PASS (created/paid/matchedAt độc lập qua biên giờ VN, dữ liệu rỗng, unique allocation, refunded gross, daily distinct, role 401/403/200 bằng signed cookie thật, bytes CSV/XLSX). 418/418 unit (71 files), typecheck, lint, Prisma validate, API audit 74 route files/91 handlers, Next.js production build 55/55 pages **PASS**; giữ fixture QA phục vụ kiểm toán. Báo cáo thu phí thể hiện **gross allocated collections**, chưa trừ hoàn tiền/điều chỉnh và **không đại diện net revenue**; không có lịch xuất/snapshot vì báo cáo on-demand hiện đủ phạm vi. **AD5-07 [x]; Admin 16/55 (AD5 1/8)**. Browser Google OAuth, provider sandbox UAT, staging, hoàn tiền/thuế và sign-off chưa đạt: **production NO-GO**.

**Checkpoint QA-24G ngày 24/10/2026 — AD1-06/AD4-07 nghiệm thu DEV:** PostgreSQL QA mới, cô lập `finova_admin_test_entitlements_20261024_1137`: 24/24 migrations, `npm run admin:test-integration` PASS, Lite deny ba feature keys, Premium allow, hết hạn/thu hồi deny và event PAUSED được giữ để resume đúng consent. Sửa cron SePay bỏ qua tài khoản bị khóa thay vì dừng toàn lượt. Unit 408/408 (69 files), targeted 13/13, typecheck, lint, Prisma validate, API audit 73 routes/90 handlers và Next build 54/54 trang PASS. **AD1-06, AD4-07 [x], Admin 15/55 (DEV)**; Google browser E2E, provider UAT, staging và sign-off chưa đạt, **production NO-GO**.

**Checkpoint QA-24F ngày 24/10/2026 — AD2-03 nghiệm thu DB trong DEV:** Migration 20261024112000_billing_core_integrity bổ sung 11 CHECK constraints cho billing order, payment event và allocation. PostgreSQL QA riêng finova_admin_test_schema_20261024: 24/24 migration, 11 CHECK, 10 FK, 8 unique indexes, 5 lookup indexes; 11 lần ghi dữ liệu sai bị từ chối, fixtures không đổi. npm run admin:test-billing-schema PASS. **AD2-03 [x], Admin 13/55**. Chưa UAT provider, chưa bật thanh toán production.

**Checkpoint QA-24E ngày 24/10/2026 — AD1-07 nghiệm thu DEV:** `changeUserAccess()` chuyển ACTIVE/SUSPENDED/DEACTIVATED, hủy toàn bộ sessions khi khóa, ghi audit từng thay đổi và bảo vệ SUPER_ADMIN; shared authenticated guard trả 403 cho trạng thái bị khóa, kể cả khi Admin UI rollback nhưng `FINOVA_USER_ACCESS_ENFORCED=1`. PostgreSQL `finova_admin_test_20261024` integration **PASS**; xác minh session count = 0, reactivation, giữ nguyên billing orders/subscription grants của tài khoản Premium. Targeted tests **20/20 PASS**, toàn bộ **407/407 unit (69 files)**, typecheck, lint, Prisma validate, API guard audit **73 route files/90 handlers** và Next.js production build **54/54 pages PASS**. **AD1-07 `[x]` → 12/55.** Signed Google browser E2E và kiểm thử xuyên suốt toàn bộ API thuộc AD6-03/AD6-04 vẫn mở.

**AD2-05 đang triển khai (chưa nghiệm thu):** Checkout chỉ hiển thị ảnh VietQR khi đơn `PENDING_PAYMENT` và checkout được bật; Quick Link chính thức `img.vietqr.io` dùng bank code, số tài khoản, tên thụ hưởng, số tiền VND, `orderCode` từ snapshot đơn; mã được validate và URL-encode, không có secret/callback, fallback chuyển khoản thủ công. Unit `billing-vietqr.test.ts` đã PASS; chưa xác minh ảnh/QR bằng ứng dụng ngân hàng tham gia NAPAS và chưa browser E2E ở mobile, nên giữ `[ ]`. Ảnh QR do dịch vụ VietQR ngoài Finova cung cấp; cần đánh giá luồng dữ liệu thụ hưởng/đơn hàng trước khi mở production. **Môi trường test `finova_admin_test_20261024` còn 146 user `@example.test` từ nhiều lượt integration**, `finova_test` còn 0; cần cleanup có kiểm soát, không xóa dữ liệu tùy tiện khi có luồng kiểm thử khác.

**Nghiệm thu bổ sung 24/10/2026 — AD1-02:** `npm run admin:test-bootstrap` **PASS** trên PostgreSQL riêng `finova_admin_test_bootstrap_20261024` (23 migrations), gồm từ chối user chưa xác minh, đồng thời hai CLI chỉ một SUPER_ADMIN, một audit, chạy lại bị từ chối. Duyệt các điểm ghi role trong runtime xác nhận không có API public cấp quyền; access policy chặn mọi thay đổi trạng thái Super Admin. Truy vấn PostgreSQL sau test: **0 user, 0 role, 0 audit fixture**. Những checkpoint 9/55 dưới đây là kết quả tại thời điểm trước nghiệm thu AD1-02.

**Nghiệm thu AD1-03 — 24/10/2026 (DEV):** hai file `system-role-authorization.test.ts` và `admin-role-data-projection.test.ts` **17/17 PASS**: admin OFF, 401 không có session, USER/OWNER 403, tài khoản khóa, role revoked, ma trận 4 role trên users/payments/analytics, giới hạn request, Finance chỉ thấy KPI thu phí, thanh toán che transaction ID và raw memo. Audit AST bắt buộc `requireSystemRole()` trên mọi API admin và `requireAdminPageRole()` trên mọi trang/layout admin; mọi mutation có Origin guard. Tổng **380/380 unit (64 files)**, TypeScript, ESLint, API audit **73 files/90 handlers PASS**. **AD1-03 `[x]`, tổng 11/55.** Signed Google browser/API end-to-end còn thuộc AD6-03/AD6-04 và không được coi là hoàn tất.

**Checkpoint lịch sử trước QA-24G (24/10/2026):** PostgreSQL Admin/Premium integration **PASS** khi thử song song 2 resume workers, ma trận `FINOVA_ADMIN_ENABLED` × `FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED`, và tài khoản SePay A/B chỉ A có consent; event của B giữ PAUSED. Bank Sync 36/36, unit 363/363 (62 files), typecheck, lint, Prisma validate, API guards 73 files/90 handlers, Next production build 54/54 pages PASS. **Tại thời điểm checkpoint này** mới 9/55 `[x]` và AD1-06/AD4-07 còn `[ ]`. Hai task đó **đã đóng trong QA-24G** ở đầu tài liệu; AD6-04/05/08 vẫn mở vì thiếu nghiệm thu E2E/staging/provider. **Không bật billing production.**

**QA bổ sung — keyset resume 24/10/2026:** sửa starvation khi nhiều sự kiện PAUSED có consent không hợp lệ đứng trước. Integration trên `finova_admin_test_20261024` tạo **22 sự kiện SePay sai consent cùng timestamp microsecond** trước sự kiện hợp lệ; `resumePremiumPausedBankEvents(1)` chỉ khôi phục sự kiện được cấp consent. Typecheck/lint, Bank Sync **36/36**, unit **363/363** và build Next **54/54 PASS**; ghi `[x]` QA-24C trong [tracker tổng thể](IMPLEMENTATION_PLAN.md), không tăng 9/55 task chính. Chưa nghiệm thu browser Google, provider sandbox, đa instance và staging.

> **Quyết định sản phẩm đã xác nhận ngày 23/10/2026:** Premium **29.000 VNĐ/1 tháng lịch** hoặc **199.000 VNĐ/1 năm lịch**; Lite **miễn phí**, **không được dùng nhóm “Công cụ & thông báo” gồm Nhập sao kê, Đồng bộ sao kê, Thông báo**. Hai mức giá và giới hạn này là yêu cầu đã chốt; các nhiệm vụ triển khai, nghiệm thu vẫn `[ ]` cho đến khi có bằng chứng thực tế.

## 1. Mục tiêu, phạm vi và quyết định sản phẩm

1. Mọi tài khoản Finova được tạo mới đều thuộc **Lite**; tài khoản đã tồn tại được backfill Lite mà không mất lịch sử tài chính, ví, giao dịch hay quyền đăng nhập.
2. Người dùng xem quyền lợi Lite/Premium, bảng giá theo **thời hạn**, tạo yêu cầu nâng cấp và chuyển khoản đúng số tiền/nội dung đến tài khoản nhận phí do quản trị cấu hình. Sau khi **xác minh giao dịch tiền vào hợp lệ**, hệ thống tự kích hoạt/gia hạn Premium tương ứng với đơn hàng; hiển thị ngày hết hạn và lịch sử thanh toán.
3. Quản trị hệ thống quản lý tài khoản người dùng, gói/giá, tài khoản nhận phí, đơn hàng/giao dịch/đối soát, lịch sử cấp quyền, báo cáo đăng ký, doanh thu thu tiền, truy cập và sức khỏe vận hành.
4. Đảm bảo phân quyền toàn hệ thống, bảo mật nguồn thanh toán, **chống kích hoạt trùng** khi IPN lặp/đồng bộ lịch sử trùng, và đối soát được từ tiền thực nhận → đơn hàng → lần cấp quyền.
5. Có công cụ xử lý ngoại lệ, hoàn tiền/thu hồi quyền theo quy trình có kiểm soát, cảnh báo giao dịch chưa khớp, báo cáo định kỳ và nhật ký bất biến phục vụ kiểm toán.

**Ngoài phạm vi đợt đầu:** thanh toán thẻ quốc tế, tự động trích nợ định kỳ, tính thuế/xuất hóa đơn điện tử trực tiếp, nhiều tiền tệ, hệ thống tiếp thị qua email/SMS tự động, quản trị đọc nội dung giao dịch tài chính cá nhân của người dùng. Các nghĩa vụ hóa đơn/thuế/bảo vệ dữ liệu cá nhân phải được xác minh trước khi bán thương mại.

### 1.1. Quyết định nền tảng

| Chủ đề | Quyết định đề xuất cho V1 | Lý do/điều kiện |
| --- | --- | --- |
| Phạm vi gói | **Theo User** (chính chủ tài khoản), không theo Workspace | Phù hợp yêu cầu "gói tài khoản của User"; các workspace mà user tham gia chỉ nhận quyền theo chính sách chủ sở hữu chức năng đã mô tả, tránh tự cấp Premium cho thành viên khác. |
| Mặc định | `LITE`, không thời hạn, giá 0 | Backfill nhất quán, không có trạng thái gói null. |
| Gói có phí | `PREMIUM`, có `startsAt`, `expiresAt`, lịch sử mỗi lần cấp quyền | Không lưu một cờ boolean Premium dễ sai khi hết hạn. |
| Kỳ hạn và giá đã chốt | **Premium tháng: 29.000 VNĐ / 1 tháng lịch; Premium năm: 199.000 VNĐ / 1 năm lịch (12 tháng lịch)** | Lưu `billingPeriod=MONTH/YEAR`, `periodCount=1`, cộng theo lịch Việt Nam; **không quy đổi thành 30/365 ngày cố định**. |
| Cơ chế giá | Người dùng chọn kỳ hạn từ catalog, tạo **đơn hàng** chốt `amountDueVnd`, `billingPeriod`, `periodCount` và `priceVersion` | Giá mới không sửa đơn cũ; không tính thời gian từ số tiền tự khai hay ảnh chụp chuyển khoản. |
| Ghép thanh toán | Ưu tiên **mã đơn duy nhất + đúng tài khoản nhận + đúng số tiền + tiền vào đã xác minh** | Chỉ đối soát theo số tiền có thể ghép nhầm giữa nhiều đơn. |
| Nguồn giao dịch | Adapter đọc **tài khoản thu phí của Finova** qua dịch vụ ngân hàng/provider được phép sử dụng | Phân biệt với SePay Bank Hub dùng để đọc **tài khoản cá nhân người dùng** trong `/bank-sync`; không dùng lại consent hay ledger người dùng để thu phí. |
| Gia hạn | Nếu còn Premium: cộng thời hạn từ `max(now, currentExpiresAt)`; nếu hết hạn: tính từ `now` | Đảm bảo gia hạn liên tiếp và không mất ngày đã trả tiền. |
| Truy cập | Tính `effectivePlan` từ grants hợp lệ + thời gian hiện tại ở server, áp dụng quota server-side | Gỡ/thu hồi, hết hạn có hiệu lực dù chưa chạy cron. |
| Giới hạn Lite đã chốt | **Không có Nhập sao kê, Đồng bộ sao kê và Thông báo** | Ẩn/khóa UI **và** kiểm tra entitlement trên server/API/background job; các tính năng còn lại hiện giữ như đang có. |
| Phần còn cần xác nhận | Tài khoản nhận phí/provider, quy trình hóa đơn/thuế, hoàn tiền và ngày áp dụng chính sách cho user cũ | Số tiền hiển thị/đơn hàng trước mắt là đúng **29.000/199.000 VNĐ**; không tự cộng phụ phí hoặc đổi giá khi chưa có quyết định mới. |

### 1.2. Bảng giá Premium và ma trận tính năng đã chốt

| Gói | Mã sản phẩm | Thời hạn cấp khi thanh toán hợp lệ | Số tiền chuyển khoản chính xác |
| --- | --- | --- | ---: |
| Lite | `LITE` | Không thời hạn | **0 VNĐ** |
| Premium tháng | `PREMIUM_MONTHLY` | **1 tháng lịch** | **29.000 VNĐ** |
| Premium năm | `PREMIUM_YEARLY` | **1 năm lịch** | **199.000 VNĐ** |

**Yêu cầu khởi tạo catalog:** 2 bản ghi giá Premium được publish khi đủ điều kiện bán, `currency=VND`, `priceVnd` lần lượt `29000` và `199000`, `billingPeriod=MONTH/YEAR`, `periodCount=1`; bản Lite giá 0 không cần tạo đơn hàng. Quản trị có thể điều chỉnh giá bằng **phiên bản giá mới** khi được phê duyệt, nhưng hai mức nêu trên là **giá cấu hình ban đầu bắt buộc**; chưa xác nhận mã giảm giá, gói quý hay tính năng trả góp.

| Nhóm chức năng | Lite | Premium | Cách áp dụng |
| --- | --- | --- | --- |
| Đăng nhập Google, profile, bảo vệ dữ liệu, xuất/xóa dữ liệu theo quyền | Có | Có | Không thu phí quyền riêng tư/khả năng lấy lại dữ liệu. |
| Ví, ghi thu/chi thủ công, lịch sử cơ bản, dashboard cơ bản | Có | Có | Giữ một bộ tính năng thiết yếu hữu dụng. |
| Hạn mức ví/giao dịch, khoảng thời gian báo cáo | Giữ như hiện tại | Giữ như hiện tại | Chưa áp dụng quota mới ngoài nhóm chức năng đã chỉ định. |
| Báo cáo, export, phân tích xu hướng | Có | Có | Không khóa báo cáo/Export trong Lite theo quyết định hiện tại. |
| **Nhập sao kê** (`/imports`) | **Không** | **Có** | `STATEMENT_IMPORT`: menu, page, API, xử lý import/retry đều phải được bảo vệ. |
| **Đồng bộ sao kê** (`/bank-sync`) | **Không** | **Có, khi provider hỗ trợ và user đồng ý** | `BANK_SYNC`: menu, page, API, đồng bộ thủ công/tự động và tác vụ nền kiểm tra gói. Premium không đồng nghĩa có quyền ngân hàng mặc định. |
| **Thông báo** (`/notifications`) | **Không** | **Có** | `NOTIFICATIONS`: menu, page, API và tạo thông báo tính năng được bảo vệ. Trạng thái thanh toán/đăng nhập quan trọng vẫn hiển thị qua checkout/cài đặt tài khoản. |
| Ngân sách, mục tiêu, thẻ, khoản vay, giao dịch định kỳ | Có | Có | Giữ nguyên nghiệp vụ và dữ liệu đã tạo. |

**Quy tắc chuyển gói:** trên Lite, ba feature key `STATEMENT_IMPORT`, `BANK_SYNC`, `NOTIFICATIONS` trả `enabled=false`, trên Premium đang hiệu lực trả `enabled=true` (tùy điều kiện provider/consent riêng). Khi hết Premium, **ẩn nhóm “Công cụ & thông báo”** khỏi menu desktop/mobile, chặn trang và API bằng mã lỗi nghiệp vụ `PREMIUM_REQUIRED` (`403`), kèm link nâng cấp. **Không xóa** import batch, sao kê cũ, kết nối ngân hàng, thông báo đã tồn tại. Tạm dừng job tự động và thao tác tạo/ghi nhận mới cho user Lite; worker đang chạy phải kiểm tra lại quyền trước bước ghi dữ liệu nghiệp vụ, dừng an toàn khi hết hạn và lưu checkpoint cần thiết để có thể đối soát/tiếp tục sau này. Webhook đã đến phải theo chính sách lưu bền vững, không ghi sổ/đồng bộ mới khi Lite và không ACK giả thành công. Khi Premium trở lại, cho phép tiếp tục theo trạng thái consent/provider và cơ chế đối soát an toàn. **Trạng thái đơn hàng, thanh toán, kích hoạt và hết hạn gói phải luôn xem được trong checkout/cài đặt gói kể cả khi user là Lite**, không phụ thuộc vào phân hệ Thông báo.

**Điểm chặn phát hành:** bảo vệ entitlement ở **server/API/service/worker** phải được kiểm chứng; ẩn navigation chỉ là UX. Chính sách chuyển tiếp cho người dùng đang dùng ba tính năng khi gói mới áp dụng (đặc biệt kết nối ngân hàng đã kích hoạt) phải được công bố và có lộ trình tạm dừng an toàn trước khi bật paywall đại trà.

## 2. Vai trò và phân quyền

`Membership.role` hiện tại là quyền **trong một Workspace**, tuyệt đối không được coi `OWNER` là quản trị nền tảng. Thiết kế vai trò **toàn hệ thống** riêng:

| Quyền | `SUPER_ADMIN` | `ADMIN` | `FINANCE_OPERATOR` | `ANALYST` | `USER` |
| --- | :---: | :---: | :---: | :---: | :---: |
| Dashboard tổng hợp, báo cáo đã ẩn PII | ✓ | ✓ | ✓ (phần thu phí) | ✓ | — |
| Xem danh sách người dùng và trạng thái gói | ✓ | ✓ | Theo nghiệp vụ thanh toán, tối thiểu | Chỉ aggregate | Chỉ của mình |
| Khóa/mở khóa người dùng, quản lý chính sách | ✓ | ✓ (theo policy) | — | — | — |
| Cấu hình bảng giá/entitlement | ✓ | ✓ (có audit/kiểm soát) | — | — | — |
| Cấu hình tài khoản ngân hàng nhận tiền | ✓ + phê duyệt | Đề xuất thay đổi, chờ phê duyệt | Chỉ xem số che | — | Chỉ xem hướng dẫn thanh toán công khai |
| Xem đối soát, xử lý giao dịch ngoại lệ | ✓ | ✓ | ✓ | Chỉ aggregate | Xem đơn của mình |
| Cấp/thu hồi Premium thủ công, hoàn tiền | ✓, kiểm soát độc lập | Hai bước theo hạn mức | Đề xuất xử lý | — | — |
| Phân quyền quản trị, xuất dữ liệu nhạy cảm | ✓ với xác thực lại | — | — | — | — |

- **Đăng nhập:** tiếp tục Better Auth/Google. Bootstrap quản trị bằng lệnh vận hành kiểm soát trên user ID/Google identity đã xác thực; tuyệt đối không tự nâng quyền do email do client truyền, `Membership.OWNER`, domain email hay route public.
- **Quy tắc:** kiểm tra quyền **ở server cho từng handler/service**, mặc định từ chối; menu ẩn chỉ hỗ trợ UX; xác thực lại thao tác nhạy cảm; audit gồm người thao tác, đối tượng, thay đổi trước/sau đã loại bí mật, lý do, thời điểm, request ID.
- **Bảo vệ dữ liệu:** trang admin không trả danh sách ví, số dư, thu chi, sao kê cá nhân; dữ liệu email/tên người dùng chỉ hiện với vai trò được cấp. Export nhạy cảm cần lọc trường, ghi audit, hạn chế tải hàng loạt.
- **User lifecycle:** `ACTIVE`, `SUSPENDED`, `DEACTIVATED` là trạng thái **truy cập** riêng; không xóa cứng user có thanh toán; khi khóa thì thu hồi session phù hợp và vẫn lưu lịch sử mua gói.

## 3. Nghiệp vụ end-to-end

### 3.1. Mua mới và gia hạn

1. User đăng nhập; `/pricing` hoặc `/settings/subscription` hiển thị `LITE` hoặc `PREMIUM`, hạn cuối, bảng quyền lợi và bảng kỳ hạn đang bán.
2. User chọn một kỳ hạn; backend chụp **phiên bản giá**, sinh `BillingOrder` ở `PENDING_PAYMENT`, mã tham chiếu chuyển khoản **ngẫu nhiên và duy nhất**, `amountDueVnd` nguyên và `expiresAt` của **đơn** (ví dụ 24 giờ, cấu hình). Không để client chỉ định giá/ngày hiệu lực.
3. User thấy ngân hàng nhận tiền, tên chủ tài khoản, số tài khoản đã xác minh, số tiền, nội dung chuyển khoản, QR theo chuẩn ngân hàng hỗ trợ, nút sao chép và cảnh báo về thời gian xử lý. Đơn hàng có trạng thái rõ ràng. **Không thu OTP/mật khẩu tài khoản ngân hàng.**
4. Provider đã được ủy quyền gửi IPN hoặc API lịch sử trả giao dịch **tiền vào**; backend xác thực nguồn, chuẩn hóa event, ghi inbox bền vững, trả ACK theo giao thức đã xác minh, worker đối soát với đúng mã tham chiếu, receiver, VND, số tiền và trạng thái giao dịch.
5. Nếu khớp **duy nhất, chính xác, chưa dùng**, trong **một PostgreSQL transaction** cập nhật order thành `PAID`, tạo `SubscriptionGrant` và `SubscriptionEvent`, tính/gia hạn `expiresAt`, phát outbox notification. Người dùng thấy Premium ngay từ lần kiểm tra entitlement tiếp theo.
6. Sau khi hết hạn, `effectivePlan` tự về Lite ngay khi kiểm tra thời gian; job định kỳ chỉ để phát thông báo/lưu snapshot báo cáo, không là điều kiện tiên quyết để khóa quyền đúng hạn.

**Ví dụ áp dụng đúng bảng giá:** User chọn **Premium tháng**, đơn yêu cầu chuyển đúng **29.000 VNĐ**, nội dung `FNV-ORDER-...`, sau khi đối soát hợp lệ hệ thống cấp **1 tháng lịch**. Chọn **Premium năm** thì chuyển đúng **199.000 VNĐ** và được cấp **1 năm lịch**. Nếu đang Premium còn 10 ngày, mua thêm 1 tháng sẽ cộng **một tháng lịch tính từ hạn cũ**, không mất 10 ngày còn lại. Giá và kỳ hạn phải được snapshot trong đơn hàng, có lịch sử phiên bản và không để client tự chọn số tiền.

### 3.2. Ma trận xử lý tiền vào / tình huống ngoại lệ

| Tình huống | Kết quả | Quản trị xử lý |
| --- | --- | --- |
| Mã đơn + receiver + số tiền khớp; đơn còn hạn | `PAID → GRANTED`, 1 lần | Theo dõi audit/không cần can thiệp. |
| IPN lặp hoặc IPN và polling cùng `transactionId` | 1 `PaymentEvent`, 1 order consumption, 1 grant | Không phát sinh ngày Premium thứ hai. |
| Thiếu/sai mã, nội dung không nhận dạng | `UNMATCHED`, không kích hoạt | Danh sách chờ đối soát; xác minh nguồn gốc. |
| Số tiền thiếu hoặc thừa | `AMOUNT_MISMATCH`, **không** tự suy ra kỳ hạn | Hoàn tiền hoặc ghép tay theo phê duyệt, thông báo minh bạch. |
| Đúng số tiền nhưng sai ngân hàng/tài khoản thụ hưởng hoặc giao dịch tiền ra | `REJECTED/REVIEW` | Không cấp quyền. |
| Nhiều đơn cùng số tiền | Chỉ khớp theo mã đơn duy nhất | Nếu mã trùng mơ hồ, đưa review. |
| Đơn hết hạn rồi tiền mới đến | `LATE_PAYMENT_REVIEW`; không mất dấu tiền | Theo chính sách gia hạn/hoàn tiền, không tự cấp nếu giá đã thay đổi. |
| Giao dịch chuyển trước khi tạo đơn | `UNMATCHED` | Đối soát thủ công với bằng chứng; không suy đoán. |
| Event thiếu ID provider hoặc sai kiểu/thời gian | `QUARANTINED/REVIEW` | Chỉ replay sau xác minh, fingerprint không đủ để auto-grant. |
| Nguồn chuyển khoản gửi lại sau chargeback/reversal, hoàn tiền | `DISPUTED/REFUNDED` và quy trình điều chỉnh có audit | Không xóa lịch sử; xử lý entitlement theo chính sách, tránh âm thời gian. |
| Cùng User thanh toán hai đơn hợp lệ | 2 grant nối tiếp | Serialize theo User để tránh lost update ngày hết hạn. |
| Admin cấp bù miễn phí | Grant `MANUAL`, lý do, hạn, người duyệt | Không cộng vào doanh thu thu tiền. |

**Quyết định cần phê duyệt trước release:** chính sách thanh toán thiếu/thừa, đơn quá hạn, hoàn tiền, tranh chấp, cấp bù và thời hạn hoàn tất đối soát. Không tự chuyển tiền cho user: hoàn tiền qua quy trình kiểm soát tài chính riêng.

### 3.3. Chính sách vòng đời gói

- Phân biệt `planCode` (`LITE/PREMIUM`), trạng thái đơn, trạng thái payment và trạng thái grant. Không có trạng thái Premium `ACTIVE` vĩnh viễn; miễn phí/đền bù phải có ngày hết hạn hoặc loại grant vĩnh viễn được chấp thuận riêng.
- `effectivePlan(user, nowUTC) = PREMIUM` khi có quyền chưa bị thu hồi và `startsAt <= nowUTC < expiresAt`; còn lại `LITE`. Điều kiện subscription riêng không phụ thuộc tình trạng thanh toán mới đang chờ.
- Thời gian dùng **UTC ở DB**, tính phép cộng kỳ hạn theo **lịch `Asia/Ho_Chi_Minh`** rồi chuyển lại UTC; `MONTH` cộng một tháng lịch, `YEAR` cộng một năm lịch, giữ giờ/phút/giây địa phương. Khi ngày tương ứng không tồn tại (31/01 → tháng 2; 29/02 → năm không nhuận), lấy ngày hợp lệ cuối cùng; lưu `billingAnniversaryDay` để các lần gia hạn tháng liên tiếp không bị trôi ngày neo (31/01 → 28/02 → 31/03). Định nghĩa và test cả các chuyển tiếp năm nhuận.
- Gia hạn nối tiếp: worker lấy lock/`Serializable` theo User, tính điểm bắt đầu từ `max(nowUTC, currentEffectiveExpiration)` rồi cộng **`billingPeriod`/`periodCount` của order snapshot** theo quy tắc lịch trên; cập nhật ngày neo một cách nhất quán. Thêm unique constraint `grant.orderId` để chống grant kép.
- Khi về Lite, chặn ngay `STATEMENT_IMPORT`, `BANK_SYNC`, `NOTIFICATIONS` tại server, tạm dừng sync/notification jobs cho user đó, giữ lịch sử cũ. Khi nâng cấp lại, chỉ khởi chạy tiếp các kết nối còn consent hợp lệ và xử lý bù theo chính sách đối soát.
- Mất Premium do hết hạn thì quyền nâng cao bị hạn chế; không xóa hoặc thay đổi ledger/dữ liệu đã tạo. Có màn hình giải thích và đường dẫn nâng cấp. Admin có thể xem lịch sử/khôi phục theo log.
- Khi chính sách giá/giới hạn thay đổi, đơn đã tạo giữ nguyên snapshot; entitlement thay đổi phải có `policyVersion` và kế hoạch chuyển đổi cho người dùng hiện hữu.

## 4. Thiết kế dữ liệu (Prisma/PostgreSQL mục tiêu)

**Hiện trạng đã đọc:** `User`, `Session`, `Account` của Better Auth; `Workspace`, `Membership`, `UserPreferences` và các bảng Bank Sync đã tồn tại trong `prisma/schema.prisma`. **Chưa có** `Subscription`, `BillingOrder`, `PaymentEvent` dành cho Premium. Dưới đây là **đề xuất schema**, không phải migration đã chạy.

| Model / bảng | Trường chính và ràng buộc dự kiến | Chỉ mục, lưu ý |
| --- | --- | --- |
| `AdminRoleAssignment` | `id`, `userId FK`, `role`, `status`, `assignedBy`, `createdAt`, `revokedAt` | `userId,role` unique cho bản ghi hiện hành; không dùng Membership role. |
| `UserAccessState` | `userId PK/FK`, `status`, `reason`, `changedBy`, `updatedAt` | Không sửa trực tiếp trường Better Auth làm ảnh hưởng đăng nhập. |
| `SubscriptionPlan` | `code` (`LITE`, `PREMIUM`), `displayName`, `isActive`, `sortOrder` | Plan là catalog logic, **không** sửa mã gói lịch sử. |
| `PlanPrice` | `id`, `planCode`, `billingPeriod` (`MONTH/YEAR`), `periodCount=1`, `priceVnd` (29.000/199.000 ban đầu), `currency=VND`, `version`, `effectiveFrom`, `effectiveTo`, `isPublished` | Chống hai giá đang hiệu lực trùng kỳ hạn; snapshot từng order. |
| `PlanEntitlement` | `planCode`, `featureKey` (`STATEMENT_IMPORT/BANK_SYNC/NOTIFICATIONS`), `enabled`, `policyVersion` | Unique `(planCode,featureKey,policyVersion)`; Lite `false`, Premium `true` cho ba feature key. |
| `BillingReceivingAccount` | `id`, `bankCode`, `bankName`, `accountName`, `accountNumberEncrypted`, `accountNumberLast4`, `providerAccountRef`, `status`, `effectiveFrom/To`, `createdBy/approvedBy` | Bản ghi lịch sử giữ nguyên; một default `ACTIVE` khi tạo order; **không cho phép user tự khai receiver**. |
| `BillingOrder` | `id`, `userId FK`, `orderCode unique`, `planCode`, `priceId`, `billingPeriodSnapshot`, `periodCountSnapshot`, `amountDueVnd`, `currency`, `receiverAccountId`, `status`, `createdAt`, `expiresAt`, `paidAt`, `activatedAt` | `userId,createdAt`, `status,expiresAt`; amount = VND nguyên; không mutate snapshot. |
| `BillingPaymentEvent` | `id`, `provider`, `providerAccountRef`, `providerTransactionId`, `direction`, `amountVnd`, `occurredAt`, `receivedAt`, `normalizedReference`, `rawEncryptedRef`, `verificationStatus`, `matchStatus` | Unique `(provider,providerAccountRef,providerTransactionId)` nếu ID có; một event chỉ gắn tối đa một order. |
| `PaymentAllocation` | `id`, `paymentEventId unique`, `orderId unique`, `allocatedAmountVnd`, `matchedBy`, `matchedAt`, `decision` | Tách event từ order, ngăn tái dùng tiền; ngoại lệ chuyển về hàng chờ xử lý. |
| `Subscription` | `userId PK/FK`, `planCode`, `startsAt`, `expiresAt`, `billingAnniversaryDay`, `version`, `updatedAt` | Projection/cache phục vụ đọc nhanh; **grants/events** mới là nguồn audit. |
| `SubscriptionGrant` | `id`, `userId`, `orderId nullable unique`, `grantType`, `billingPeriod`, `periodCount`, `startsAt`, `expiresAt`, `revokedAt`, `createdBy`, `reason`, `policyVersion` | Cấp thủ công không có order, bắt buộc reason+approval; serialize theo User. |
| `SubscriptionEvent` | `id`, `userId`, `grantId`, `type`, `beforeJson`, `afterJson`, `occurredAt`, `actorId`, `correlationId` | Lịch sử append-only; tránh lưu secret/PII không cần thiết. |
| `BillingInbox` / `BillingOutbox` / `BillingJob` | provider event ID, raw hash, status, attempt count, `lockedUntil`, lastErrorCode, idempotency keys | Persist trước ACK; retry backoff, lease, dead-letter, replay có quyền/audit. |
| `AdminAuditLog` | `id`, `actorId`, `action`, `resourceType`, `resourceId`, `reason`, `before/after redacted`, `requestId`, `createdAt` | Append-only, phân quyền xem, retention. Tách `AuditLog` tài chính theo workspace. |
| `ProductUsageEvent` | `id`, `userId nullable`, `sessionKey`, `eventName`, `pageKey`, `occurredAt`, `consentVersion`, `source` | Không lưu URL query chứa thông tin tài chính; event de-dup theo event key; TTL. |
| `ProductUsageDaily` | `dateVN`, `metricKey`, `segment`, `value`, `computedAt`, `sourceVersion` | Bảng aggregate tổng hợp; unique theo ngày+metric+segment; refresh idempotent. |

**Integrity:** tiền dùng `Decimal(20,0)` hoặc kiểu tiền VND nguyên đã thống nhất; kiểm tra `amount > 0`, `periodCount > 0`, `billingPeriod ∈ {MONTH,YEAR}`, `startsAt < expiresAt`; FK và unique ở DB; mọi điều chỉnh quan trọng đi trong transaction, không tin kết quả lookup trước lock. Dữ liệu thanh toán platform **không ghi vào `Transaction`, `Journal`, `Posting` thuộc Workspace user**. Doanh thu thu phí Finova thuộc báo cáo doanh thu nền tảng; không trộn báo cáo tài chính cá nhân.

**Migration/backfill:** schema mới → seed Lite/Premium catalog chưa mở bán → insert Subscription Lite cho User đã tồn tại theo batch/restartable → bắt đầu đọc entitlement với fallback Lite → bật tính năng theo flag. Có `rollback` logic tắt paywall/webhook và phục hồi schema ứng dụng tương thích; không xóa dữ liệu thanh toán sau khi phát sinh.

## 5. API và phân lớp dịch vụ dự kiến

| Method | Endpoint | Quyền / hành vi chính |
| --- | --- | --- |
| `GET` | `/api/v1/billing/plans` | Public/đăng nhập theo chính sách; chỉ trả plan/price đang publish, không lộ bản nháp. |
| `GET` | `/api/v1/me/subscription` | Session; trạng thái hiệu lực, hạn, hạn mức và tính năng. `Cache-Control: no-store`. |
| `POST` | `/api/v1/billing/orders` | User; body `{priceId}`; server snapshot catalog, quota và `Idempotency-Key`, Origin guard. |
| `GET` | `/api/v1/billing/orders` | User; chỉ các đơn của mình, phân trang + trạng thái. |
| `GET` | `/api/v1/billing/orders/:id` | User; chỉ chủ đơn; trạng thái cập nhật từ DB, polling giới hạn. |
| `POST` | `/api/webhooks/billing/:provider` | Provider; xác thực **đúng giao thức đối tác**, chống replay; raw inbox commit trước ACK. |
| `POST` | `/api/internal/billing/reconcile` | Internal worker secret + quota; poll bù theo cursor/watermark, match/retry. |
| `GET` | `/api/v1/admin/overview` | Role `ADMIN/ANALYST` theo field-level policy; KPI/time range. |
| `GET` | `/api/v1/admin/users`, `/api/v1/admin/users/:id` | Admin; search/sort/filter, phân trang cursor, masking. |
| `PATCH` | `/api/v1/admin/users/:id/access` | Admin; suspend/reactivate, lý do, audit, không tự vô hiệu hóa super admin cuối. |
| `GET/POST/PATCH` | `/api/v1/admin/plans/prices` | Admin; chỉnh bản nháp, duyệt và phát hành phiên bản giá. |
| `GET/POST/PATCH` | `/api/v1/admin/billing/receiving-accounts` | Super admin/luồng duyệt; xác thực lại, lưu bí mật mã hóa. |
| `GET` | `/api/v1/admin/billing/orders` | Finance/Admin; đối soát trạng thái, ngày, số tiền, bank, mã đơn. |
| `GET` | `/api/v1/admin/billing/payments` | Finance/Admin; xem unmatched/duplicate/refund/dispute theo mask. |
| `POST` | `/api/v1/admin/billing/payments/:id/review` | Finance/Admin; quyết định có lý do, hai bước với cấp quyền/điều chỉnh nhạy cảm. |
| `POST` | `/api/v1/admin/users/:id/subscription/grants` | Admin được cấp quyền; bù thời hạn có hạn, lý do, phê duyệt, idempotent. |
| `POST` | `/api/v1/admin/subscriptions/:id/revoke` | Cấp cao/duyệt; giữ event và quyết định thu hồi. |
| `GET` | `/api/v1/admin/analytics/{users,subscriptions,revenue,traffic,operations}` | Phân quyền theo report, filter kỳ, export aggregate. |
| `GET` | `/api/v1/admin/audit` | Super admin/auditor được cấp quyền; bộ lọc và retention. |

**Chuẩn API:** hợp đồng request/response Zod, `401/403/404/409/422/429` phân biệt rõ; idempotency key theo actor+action+payload fingerprint; mutation có `assertSameOrigin()` với session hoặc xác thực riêng cho provider/internal; correlation ID, error code, `no-store`, body size limit, pagination bounds, rate limit và audit. Không sao chép nguyên guard `requireContext()` cho admin khi nó bootstrap workspace; tạo `requireSystemRole()` độc lập dựa trên signed session và quyền DB.

**Tái sử dụng:** cơ chế durable outbox/lease, mã hóa nguồn và retry của Bank Sync có thể tái sử dụng thành thư viện kỹ thuật; dữ liệu, khóa, receiver và provider credential phải tách. Tài liệu chính thức của nhà cung cấp **phải xác minh** kiểu webhook/IPN, token/chữ ký/API key, ACK, truy vấn lịch sử, ID giao dịch, trạng thái cuối cùng và quyền dùng cho **tài khoản nhận phí** trước khi tích hợp thật.

## 6. Thiết kế giao diện

**Giao diện người dùng:** `/pricing` (hiển thị nổi bật **Lite 0 VNĐ**, **Premium 29.000 VNĐ/tháng**, **199.000 VNĐ/năm**, so sánh ba tính năng Premium); `/settings/subscription` (Lite/Premium, thời hạn theo tháng/năm lịch, nút nâng cấp/gia hạn, lịch sử cấp quyền); `/billing/checkout/:orderId` (tài khoản thụ hưởng, số tiền, mã nội dung, QR, đếm thời hạn đơn, cảnh báo chuyển đúng thông tin); `/billing/orders` (chờ thanh toán/đã nhận/kích hoạt/cần hỗ trợ). UI có loading, empty, error, offline, retry và trạng thái tiền vào không khớp; **không hiển thị “đã thanh toán” chỉ sau khi User bấm “Tôi đã chuyển”**. Với Lite, **ẩn toàn bộ nhóm điều hướng “Công cụ & thông báo”** cả desktop/mobile; truy cập trực tiếp URL ba tính năng thì hiển thị trang yêu cầu Premium, không trả dữ liệu.

**Giao diện quản trị `/admin`** có sidebar riêng; chỉ xuất hiện nếu có role hệ thống (server kiểm tra lại):

| Đường dẫn | Nội dung chính |
| --- | --- |
| `/admin` | KPI cards: tổng user, đăng ký mới, DAU/MAU, Premium đang hiệu lực, chuyển đổi, thu tiền, cảnh báo đối soát; xu hướng 7/30/90 ngày. |
| `/admin/users` và `/:id` | Search email/tên, trạng thái, ngày tạo, lần hoạt động, gói/hạn; xem timeline gói, đình chỉ/mở; không truy cập dữ liệu ví/sao kê riêng tư. |
| `/admin/plans` | Lite/Premium, bảng giá theo kỳ, phiên bản, entitlements, bản nháp, xem trước tác động, phát hành có kiểm soát. |
| `/admin/billing/accounts` | Ngân hàng nhận phí, holder, số mask, hiệu lực, thay đổi/duyệt, lịch sử; chặn tài khoản chưa xác minh. |
| `/admin/billing/orders` | Đơn hàng, filter trạng thái, nguồn, số tiền, kỳ hạn, tỷ lệ thanh toán, thời gian chờ. |
| `/admin/billing/payments` | Giao dịch vào, matched/unmatched/mismatch, xử lý ngoại lệ, replay an toàn và audit. |
| `/admin/subscriptions` | Premium còn hạn/hết hạn/gia hạn/cấp thủ công/thu hồi; theo dõi sắp hết hạn. |
| `/admin/analytics` | Tabs User, Chuyển đổi & gói, Doanh thu thu phí, Truy cập, Vận hành; export tổng hợp CSV/XLSX. |
| `/admin/audit` | Nhật ký hệ thống với actor/action/time/resource/result, bộ lọc và xuất có kiểm soát. |
| `/admin/settings` | Chính sách thời hạn đơn, cảnh báo, cấu hình provider/worker, retention, bảo vệ secret; không hiện API key gốc. |

**UI/UX:** giữ bộ nhận diện Finova, responsive 320/390/768/desktop, light/dark, bảng nhiều cột có scroll/lọc, keyboard/a11y, chart drill-down thống nhất bộ lọc. Trang thanh toán trên mobile ưu tiên **số tiền + nội dung + QR + trạng thái**; thông tin thụ hưởng lấy từ snapshot của order, không đổi dù admin cập nhật receiver sau đó.

## 7. Báo cáo, định nghĩa KPI và nguồn dữ liệu

Mọi biểu đồ cho phép lọc `start`, `endExclusive`, timezone mặc định `Asia/Ho_Chi_Minh`, độ hạt ngày/tuần/tháng, so sánh kỳ trước, xuất aggregate. Không cộng số liệu Ledger cá nhân vào doanh thu của Finova.

| Mã | Báo cáo/KPI | Định nghĩa nguồn sự thật | Tần suất/mức chi tiết |
| --- | --- | --- | --- |
| `AD-01` | Tổng người dùng / mới đăng ký | COUNT user hợp lệ; User `createdAt` trong kỳ, tách test/đã xóa theo policy | Gần realtime/ngày; theo ngày nguồn đăng ký |
| `AD-02` | Người dùng hoạt động `DAU`, `WAU`, `MAU` | Distinct `userId` có **authenticated product activity**, lần lượt 1/7/30 ngày rolling, loại job/bot | Daily rollup; retention theo cohort |
| `AD-03` | Visit, session, page view | Visit = session có ít nhất 1 page view hợp lệ; page view = sự kiện điều hướng đã khử trùng, gắn định nghĩa consent/anonymous | Hourly/daily; phân tích route nhóm, thiết bị khi cho phép |
| `AD-04` | Phễu nâng cấp | View pricing → create order → verified paid → grant Premium, cohort theo ngày phát sinh bước đầu | Daily; conversion từng bước, không đếm double cùng order |
| `AD-05` | Cơ cấu gói | User có `effectivePlan=PREMIUM` tại mốc báo cáo so với Lite; phân biệt paid/manual | Snapshot ngày; tổng nhóm = base user đủ điều kiện |
| `AD-06` | Gói bán theo kỳ hạn | COUNT paid orders và cấp quyền theo `billingPeriodSnapshot` (`MONTH/YEAR`)/`priceId`, gia hạn vs mua lần đầu | Daily/monthly |
| `AD-07` | Thu tiền thực tế | Tổng **payment allocations verified** hợp lệ theo `matchedAt` (gross collections), trừ hoàn tiền riêng để ra net | Daily/monthly; tất cả VND; đối soát ngân hàng |
| `AD-08` | Doanh thu phân bổ kỳ hạn (nếu cần) | Phân bổ doanh thu theo ngày quyền sử dụng; tách `cash collected` khỏi `recognized revenue` | Chỉ triển khai sau khi chính sách kế toán được duyệt |
| `AD-09` | Gia hạn, hủy, hết hạn | Số user gia hạn, số premium sắp hết hạn 7/30 ngày, hết hạn mà không gia hạn theo cohort | Daily, không gọi hủy với user chưa tới hạn |
| `AD-10` | Retention/churn Premium | Paid cohort kỳ đầu; retained nếu Premium trả phí tiếp trong cửa sổ định nghĩa, churn khi hết hạn + grace window | Chốt độ trễ, dùng snapshot lịch sử |
| `AD-11` | Thanh toán ngoại lệ | Count/value unmatched, under/over, late, duplicate, disputed/refunded, backlog age | Realtime/giờ, cảnh báo SLA |
| `AD-12` | Sức khỏe vận hành | IPN nhận/ACK/reject, latency xử lý, queue depth, retry/DLQ, provider API errors, reconciliation lag | Metric/alert theo giờ |
| `AD-13` | Chi phí/khả năng sử dụng hệ thống | Lượt request có auth, lỗi 4xx/5xx, thời gian xử lý, tỷ lệ trả lỗi; không thu payload người dùng | Hourly/daily, kết hợp log quan sát |
| `AD-14` | Hoạt động quản trị | Lượt đình chỉ, sửa giá, thay tài khoản thụ hưởng, manual grant/revoke, xử lý hoàn tiền, export nhạy cảm | Audit event, ngày/tháng |

**Giải thích thống kê:**

- `Premium đang hiệu lực` là **snapshot thời điểm**, không lấy tổng tất cả đơn PAID; user có 3 lần gia hạn vẫn đếm là 1 người.
- `Paid conversion` dùng distinct user chuyển Lite → Premium trả tiền lần đầu trong cohort; đơn đã trả nhưng grant lỗi phải báo riêng thay vì tăng user Premium.
- `MRR` **không mặc định bằng tổng thu tiền tháng** với gói trả trước nhiều ngày. Nếu có MRR thì định nghĩa annualized/normalized recurring revenue được bộ phận tài chính phê duyệt, gắn nhãn khác cash collected.
- `Visit` không suy ra từ bảng `Session` của Better Auth (đăng nhập ≠ lượt truy cập). Cần event instrumentation thật, cơ chế consent/retention hợp lệ và chống ghi nhiều event do reload/hydration; không hiển thị số giả khi thiếu dữ liệu.
- Daily rollup đếm distinct trên sự kiện chuẩn, giới hạn cardinality và PII; tách dữ liệu raw có TTL, báo cáo aggregate lưu lâu hơn theo chính sách. Không ghi path/query chứa mã giao dịch, số tài khoản hoặc tên file sao kê vào analytics.
- Cross-check: tổng `paid allocation` phải khớp event tiền vào đã verified theo quy tắc loại unmatched; tổng granted có `orderId` bằng số order đã kích hoạt (sau khi loại manual/điều chỉnh); chênh lệch thể hiện thành báo cáo lỗi, không tự điều chỉnh âm thầm.

## 8. Phân rã công việc — execution tracker

**Quy tắc:** 100% nhiệm vụ mới để `[ ]` tại thời điểm lập kế hoạch. Thứ tự trong từng pha là thứ tự ưu tiên; dependency phải được đóng trước khi nghiệm thu. Mỗi task bao gồm code/schema nếu áp dụng, tests, log/error handling, tài liệu và bằng chứng. Định danh `AD*` dành riêng phân hệ, tránh trùng `BS*` hoặc `SP*`.

### AD0 — Chốt yêu cầu, bảng giá, tuân thủ (6 task)

| Xong | ID | Công việc / đầu ra | Điều kiện nghiệm thu |
| --- | --- | --- | --- |
| [x] | AD0-01 | Kiểm kê auth/user/workspace/bank sync/reporting, xác định ranh giới dữ liệu | **PASS:** [ADR-FNV-ADMIN-001](ADR_FINOVA_PLATFORM_ADMIN_AND_BILLING_BOUNDARIES.md) đối chiếu schema/auth/context, quyền hệ thống vs workspace, billing vs ledger, Bank Hub vs receiver platform và dependency. |
| [ ] | AD0-02 | **Đã có yêu cầu:** Lite không có Nhập sao kê/Đồng bộ sao kê/Thông báo, các tính năng khác giữ hiện tại; đặc tả rollout, dữ liệu cũ, quy tắc khi hết hạn | Ba feature key có ma trận quyền cụ thể; chốt thời điểm chuyển tiếp user cũ và UX, có test chặn API/job. Chưa triển khai nên giữ `[ ]`. |
| [ ] | AD0-03 | **Đã có giá:** 29.000 VNĐ/tháng lịch, 199.000 VNĐ/năm lịch; seed catalog/price version, chính sách chứng từ/thuế | Hai mã kỳ hạn và giá đúng, bất biến trong order; VAT/hóa đơn và chính sách đổi giá được phê duyệt trước khi mở bán. Chưa triển khai nên giữ `[ ]`. |
| [ ] | AD0-04 | Chốt quy trình hoàn tiền/thiếu/thừa/trễ, chính sách giữ dữ liệu, khiếu nại | Có SLA, vai trò xử lý, kịch bản kiểm thử và text hỗ trợ người dùng. |
| [ ] | AD0-05 | Pháp chế/kế toán xem xét nhận tiền, chứng từ, thuế, dữ liệu cá nhân, quyền hoạt động provider | Biên bản phê duyệt trước khi mở thu phí thật. |
| [ ] | AD0-06 | Chọn provider **thu phí** và xác minh hợp đồng/webhook/polling/IPN, ID giao dịch, xác thực nguồn, coverage tài khoản nhận tiền | Contract test spec + UAT checklist, tài khoản sandbox/production tách biệt. |

### AD1 — Dữ liệu, bảo mật và nền tảng admin (8 task)

| Xong | ID | Công việc / đầu ra | Điều kiện nghiệm thu |
| --- | --- | --- | --- |
| [x] | AD1-01 | Schema/migration SystemRoleAssignment, UserAccessState, AdminAuditLog | **PASS DEV (QA-24M):** 26 migrations trên PostgreSQL QA riêng; partial unique active role, audit required fields; rollback DDL trong giao dịch và kiểm tra khôi phục nguyên schema PASS. Prisma validate/typecheck PASS. Staging restore còn theo AD6-06/08. |
| [x] | AD1-02 | Bootstrap SUPER_ADMIN bằng vận hành, tránh public role escalation | **PASS:** CLI yêu cầu user verified, transaction Serializable; integration PostgreSQL từ chối user chưa xác minh, concurrent chỉ 1 SUPER_ADMIN và 1 audit, từ chối cấp tiếp. Không có public API cấp role, access policy chặn thay đổi trạng thái Super Admin. Fixture 0/0/0 sau test. |
| [x] | AD1-03 | `requireSystemRole()`, permission matrix, guard admin page/API, CSRF/rate limit | **PASS phạm vi DEV:** 17 tests phân quyền/field projection: 401/403, USER/OWNER deny, role matrix 4 roles, Finance chỉ thấy billing KPIs, payment ID/memo masked; 73 route/90 handler & mọi admin page kiểm tra RBAC, mutation Origin, rate limit. Signed Google browser E2E tiếp tục AD6-03/04. |
| [x] | AD1-04 | Schema plan/price/entitlement/subscription/grant/event | **PASS DEV (QA-24M):** FK entitlement→plan, policyVersion≥1, VND/period/version/price/window, single published per product, trigger bất biến giá lịch sử; SQL negative tests PASS; order snapshot và grant/event đã kiểm thử integration trước đó. |
| [x] | AD1-05 | Backfill Lite cho user hiện tại, mặc định tạo user mới | **PASS:** seed theo batch 500, chạy lặp không tạo subscription trùng; bootstrap user mới tạo đúng một Lite và personal workspace; seed lại không ghi đè Premium đã trả tiền. PostgreSQL test tạo ví, giao dịch và bút toán cân bằng thật trước backfill, so snapshot bất biến sau backfill nhiều lần. |
| [x] | AD1-06 | Hệ thống entitlement server-side, `STATEMENT_IMPORT/BANK_SYNC/NOTIFICATIONS`, feature flags và no-store | **PASS DEV (QA-24G):** Ba feature guards ở API/page và transaction/worker, response `no-store`; unit cờ ON/OFF, Lite deny/Premium allow, expiry/revoke; PostgreSQL QA mới 24 migrations và integration PASS. Browser E2E riêng AD6-03/04. |
| [x] | AD1-07 | UserAccessState suspend/reactivate + revoke sessions + audit | **PASS DEV:** PostgreSQL integration kiểm tra session revoke, 403 shared API guard, rollback flag với access enforcement, reactivation và audit; billing order/grant giữ nguyên khi suspend. Các bài browser E2E được theo dõi ở AD6-03/04. |
| [x] | AD1-08 | Privacy/security audit, mã hóa receiver, RBAC deny-list, audit secret redaction | **PASS DEV (QA-24K):** PostgreSQL QA negative IDOR billing order, receiver ciphertext AES-256-GCM, Admin response mask 4 số cuối, receiver disable fail-closed, sanitized operator reasons kiểm tra ở access/action/audit; RBAC denial và Finance data isolation qua unit/route audit. 438/438 unit, typecheck/lint/Prisma, Next 55/55; browser/UAT/sign-off là gate riêng. |

### AD2 — Catalog gói, tài khoản nhận phí, checkout (8 task)

| Xong | ID | Công việc / đầu ra | Điều kiện nghiệm thu |
| --- | --- | --- | --- |
| [x] | AD2-01 | CRUD bản nháp giá, publish/unpublish có version & audit | **PASS DEV (QA-24M):** `catalog-admin.ts`, 6 API methods; role/Origin guards; QA PostgreSQL lifecycle, audit, concurrent publish, invariant 1 published/product; đơn cũ 29.000, đơn mới 39.000, idempotency, published-only catalog. UI browser E2E thuộc AD2-07/AD6-04. |
| [x] | AD2-02 | Cấu hình 1+ tài khoản nhận tiền, xác minh và quy trình hai bước khi thay đổi | **PASS DEV (QA-24L):** Đề xuất → chờ duyệt → Super Admin khác phê duyệt, self-approve/Finance bị chặn, receiver cũ disable, order trước thay đổi giữ snapshot, order mới trỏ receiver mới; Admin response chỉ `••••last4`, DB AES-GCM, disabled receiver bị từ chối xác thực. PostgreSQL integration PASS; 438 unit, 74/91 routes, Next 55/55. Xác minh sở hữu tài khoản thực với provider chờ UAT riêng. |
| [x] | AD2-03 | DB models BillingOrder, PaymentEvent, Allocation, Inbox/Outbox/Job | Schema constraints unique + indexes + chạy migration DB thực. |
| [x] | AD2-04 | Service tạo order từ `priceId`, snapshot, mã order random, TTL, idempotency | **PASS:** 4 request song song tạo 1 đơn, chụp giá 29.000 VNĐ, receiver, key và owner isolation trong PostgreSQL test. |
| [ ] | AD2-05 | Mã QR/nội dung CK và thông tin thụ hưởng từ snapshot | Đã có VietQR Quick Link theo order snapshot + fallback và unit tests; còn quét thử QR bằng app ngân hàng, mobile/browser E2E, đánh giá bên thứ ba trước khi nghiệm thu. |
| [x] | AD2-06 | UI pricing/checkout/history/responsive, pending/error/expired state | **PASS DEV (QA-26B):** Browser React/Chrome signed-session trên PostgreSQL QA: giá 29.000/199.000 VNĐ, idempotency, owner isolation, không cấp Premium khi tạo đơn, 6 trạng thái server, 1440/390/320 px Light/Dark, axe WCAG serious/critical = 0, cleanup PASS. Google OAuth thực và provider sandbox thuộc AD6-04/AD3-10. |
| [x] | AD2-07 | UI quản trị plans/receiving accounts, change preview + audit | **PASS DEV (QA-25H):** Chrome CDP signed-session QA tại cổng 31637 + PostgreSQL QA: role 403/200, preview/cancel/publish, giá đơn cũ/mới, receiver masked/snapshot/dual approval/audit, 1440/390/320 px, Light/Dark, axe WCAG AA, fixture cleanup; Google OAuth thật thuộc AD6-04. |
| [x] | AD2-08 | Trạng thái đơn tạo/đã nhận/kích hoạt/cần xử lý tại checkout và cài đặt gói; chỉ gửi thông báo tính năng khi user có entitlement | **PASS DEV (QA-25A):** Checkout và lịch sử tại cài đặt gói phân biệt đang chờ, PAID chưa có grant, Premium đã kích hoạt, cần đối soát, hết hạn, hoàn tiền. Lite xem đơn của mình; thời điểm paid/activated và effective grant độc lập; PostgreSQL integration owner isolation + durable billing notice; unit, typecheck/lint/build PASS. Provider/browser UAT thuộc AD2-05/06, AD3-10/AD6-04. |

### AD3 — Thu tiền ngân hàng và kích hoạt Premium (10 task)

| Xong | ID | Công việc / đầu ra | Điều kiện nghiệm thu |
| --- | --- | --- | --- |
| [ ] | AD3-01 | Adapter provider thu phí theo hợp đồng chính thức, env sandbox/production tách | Contract tests đúng API/ID/status/ACK, không mượn Bank Hub user token. |
| [x] | AD3-02 | IPN authenticated, bound payload + inbox commit trước ACK | **PASS phạm vi adapter SePay HMAC:** so đúng contract timestamp/raw-body trên tài liệu chính thức; unit/route test ký sai, schema sai, receiver sai, lỗi DB không ACK; PostgreSQL xác minh event commit trước ACK và replay không nhân đôi. Chưa có raw archive/polling hay provider UAT (AD3-03/10). |
| [ ] | AD3-03 | Polling/backfill có cursor/watermark/overlap cho missed IPN | Giao dịch nhận qua cả 2 đường vẫn chỉ tạo 1 canonical event. |
| [x] | AD3-04 | Durable outbox worker, retry/backoff/lease, DLQ và replay có audit | **PASS trên PostgreSQL cô lập:** outbox tạo cùng transaction grant, worker claim nguyên tử, lease 2 phút, tối đa 6 lần retry, backoff, DLQ và operator replay có audit; test takeover lease hết hạn, ngăn worker cũ, hai delivery đồng thời, crash lần thứ sáu và replay không tạo thêm notice/grant/allocation. Migration ràng buộc FK/unique/CHECK, unit API guard và production build PASS. Chưa phải provider UAT (AD3-10). |
| [x] | AD3-05 | Payment matcher đúng `reference+receiver+direction+amount+status` | **PASS lõi matcher:** unit + PostgreSQL test cho thiếu/thừa, sai receiver, tiền ra, unknown/multiple reference, thời gian/late, replay. Chỉ nhận event đã xác thực từ adapter nội bộ; provider UAT vẫn AD3-10. |
| [x] | AD3-06 | Atomic order PAID → allocation → subscription grant/event → outbox | **PASS trên PostgreSQL cô lập:** transaction Serializable ghi allocation, SubscriptionGrant, SubscriptionEvent GRANT_ACTIVATED, Subscription, order PAID, payment MATCHED, BillingOutbox và audit. Unique order/grant/event, kiểm tra 4 checkout song song, nhiều IPN/worker và renewal đồng thời. Fault injection bằng PostgreSQL trigger gây lỗi ngay khi insert SubscriptionEvent: toàn bộ trạng thái cấp quyền được rollback, payment inbox vẫn còn RECEIVED để retry; sau khi gỡ trigger retry chỉ tạo một grant/event/outbox. Migration SubscriptionEvent có backfill cho grant BANK_PAYMENT hiện hữu. Build và unit PASS. |
| [x] | AD3-07 | Gia hạn theo **tháng/năm lịch**, hết hạn tại API, revoke/manual grant audit | **PASS:** unit kiểm tra ngày neo 28/29/30/31, tháng 2 và năm nhuận theo giờ Việt Nam; PostgreSQL integration xác minh 2 đơn thanh toán/gia hạn đồng thời không mất kỳ hạn, manual grant/revoke qua 2 admin có audit, rollback khi lỗi event, hết hạn chính xác tại `expiresAt`. Snapshot ví, giao dịch và bút toán giữ nguyên sau hết hạn/thu hồi. Chỉ chứng nhận nghiệp vụ DB/API nội bộ; entitlement worker E2E thuộc AD4-07/AD6-04. |
| [ ] | AD3-08 | Hoàn tiền/dispute/late payment, dual approval và lý do | Lịch sử bất biến, báo cáo cash/grants được điều chỉnh nhất quán. |
| [ ] | AD3-09 | Admin payments/order reconciliation UI, queue exception/controlled replay | Không thể approve chính giao dịch mình đề xuất nếu policy yêu cầu 2 người. |
| [ ] | AD3-10 | UAT **thật** trên provider sandbox, nhập tiền, nhận IPN, backfill, đảo thứ tự, timeouts | Chứng cứ ID nguồn đối tác, DB/order/grant khớp; mock không đủ đóng task. |

### AD4 — Quản trị người dùng và trải nghiệm Premium (7 task)

| Xong | ID | Công việc / đầu ra | Điều kiện nghiệm thu |
| --- | --- | --- | --- |
| [x] | AD4-01 | `/admin` protected shell/menu riêng Finova, responsive/theme/a11y | **PASS DEV (QA-25E):** Browser signed session trên PostgreSQL QA riêng: USER/ANALYST bị HTTP 403 trên route ngoài quyền, không render admin shell; menu role tại 1440/390/320 px, Light/Dark, không overflow, touch target ≥44 px, axe WCAG AA serious/critical = 0; fixture cleanup PASS. 483 unit, TS/lint/Prisma, audit 79/98, build 57/57 PASS. Google OAuth E2E/staging thuộc AD6-04. |
| [x] | AD4-02 | Danh sách user search/filter/pagination/export giới hạn | **PASS DEV (QA-24N):** keyset trước/sau theo `createdAt DESC, id ASC`, cursor ràng buộc filter, index SQL QA; insert xen giữa trang không lặp; status/search; Super Admin-only CSV ≤500 dòng, formula-safe, audit không PII. API role 401/403, unit + DB integration PASS. |
| [x] | AD4-03 | User detail: gói, lifecycle, order/grant timeline, last seen | **PASS DEV (QA-24N):** effective grant, recent order/grant, 25 subscription events + 25 access events, lastSeen session/usage; từ chối USER/OWNER/FINANCE/ANALYST và anonymous trước DB; projection không chứa ví/giao dịch cá nhân; PostgreSQL QA & unit PASS. Browser OAuth E2E thuộc AD6-04. |
| [x] | AD4-04 | Quản lý suspend/reactivate và lịch sử tác động admin | **PASS DEV (QA-25D):** UI cập nhật/hồi phục status và timeline 25 sự kiện, reason 10–500, signed Google session step-up ≤5 phút (đối chiếu `createdAt`), giữ quản trị viên được bảo vệ; suspend xóa session trong transaction, reactivate không tự đăng nhập lại. PostgreSQL `admin:test-signed-session` PASS HMAC, stale/tampered sessions, Origin, RBAC, revocation và audit; 483 unit + quality gates PASS. Browser Google E2E thuộc AD6-04. |
| [x] | AD4-05 | Subscription dashboard/lịch sử gia hạn/cấp bù/thu hồi có duyệt | **PASS DEV (QA-25B):** Dashboard, timeline cấp/gia hạn/thu hồi, đề xuất/duyệt hai người, idempotency và audit. Queue phân trang theo status, keyset `(createdAt DESC, id DESC)`; PostgreSQL QA 29 migrations, 55 yêu cầu/55 sự kiện cùng timestamp, insert đồng thời, kiểm tra cursor/index/cleanup PASS; 479 unit + typecheck/lint/build PASS. Refund tiền thực thuộc AD3-08/09, browser E2E/staging riêng. |
| [x] | AD4-06 | Cài đặt gói user: giá 29.000 VNĐ/tháng, 199.000 VNĐ/năm, effectivePlan, hạn, nâng cấp/gia hạn | **PASS DEV (QA-24O):** Hai kỳ hạn luôn hiển thị, lấy phiên bản giá đang công bố; thiếu/sai giá hoặc checkout tắt thì vô hiệu hóa đặt đơn. Effective Premium/Lite và hạn giờ VN, nút gia hạn/nâng cấp, trạng thái và lịch sử đơn, thông báo kích hoạt; chỉ đọc dữ liệu cũ. 4/4 test mới, full 454/454, typecheck, lint, build 57/57 PASS. Browser/provider E2E riêng AD2-06/AD6-04. |
| [x] | AD4-07 | Chặn Lite ở `/imports`, `/bank-sync`, `/notifications` (UI + API + worker) và ẩn nhóm menu “Công cụ & thông báo” | **PASS DEV (QA-24G):** Page guard trước đọc dữ liệu, ẩn menu Lite; audit API 73/90, DB worker recheck trước ghi import/bank/notification; event PAUSED phục hồi đúng consent và không ghi trùng. SePay cron bỏ qua tài khoản bị khóa. Provider/browser E2E riêng AD6-03/04/10. |

### AD5 — Phân tích truy cập, báo cáo, cảnh báo (8 task)

| Xong | ID | Công việc / đầu ra | Điều kiện nghiệm thu |
| --- | --- | --- | --- |
| [ ] | AD5-01 | Chốt analytics taxonomy, consent/retention, anonymous policy, bot/internal exclusion | Dictionary/PRD xác định metric, privacy approval. |
| [x] | AD5-02 | Instrument pageview/session/activity từ UI/server đáng tin cậy | **PASS DEV (QA-25G):** `UsagePageview` chỉ gửi nhóm route cho API; Origin/auth, bot, route/payload không hợp lệ và feature flag OFF được kiểm thử. Unit xác nhận StrictMode remount, chuyển trang/back-forward, reload, anonymous và payload cấm dữ liệu tài chính. 496/496 unit (90 files), typecheck, lint và API guard 79/98 PASS. Browser/mobile/a11y dashboard thuộc AD5-06; consent/privacy và loại trừ nội bộ thuộc AD5-01. |
| [x] | AD5-03 | ProductUsageDaily rollup có restart/backfill, TTL partition/index | **PASS DEV (QA-24I):** receipt + daily atomic; backfill 2 ngày idempotent; 3 worker đồng thời và ghi mới không mất count; giờ VN, TTL receipt 2 ngày, daily 400 ngày, index trên thời gian; PostgreSQL QA + 418 unit + build PASS. Dùng indexed deletion thay partition; scheduler production riêng. |
| [x] | AD5-04 | KPI users/DAU/MAU/cohort/retention từ data thật | **PASS DEV (QA-25C):** Đếm tài khoản và cohort đăng ký ngày Việt Nam từ `User`, đối chiếu hoạt động `ProductUsageDaily` D0/D1/D7/D30; nhóm chưa đủ tuổi loại khỏi mẫu số, ngày rỗng và biên 00:00 Việt Nam. PostgreSQL QA fixture + 483 unit, typecheck/lint/Prisma/API guard/build PASS. Chỉ phản ánh activity ghi nhận sau consent, chưa bao gồm bot/internal exclusion AD5-01/02. |
| [ ] | AD5-05 | KPI funnel, paid plan, renew, churn, collection/refund, exception | **QA-26E — đang triển khai:** SQL theo ngày VN đã đối chiếu cohort đơn, unique paid/first/renewing, tháng/năm, gross allocation và giá trị VERIFIED/IN chưa khớp trên PostgreSQL QA. Chưa có bút toán hoàn tiền theo ngày/giá trị, net cash/net revenue, định nghĩa churn và duyệt số liệu. |
| [x] | AD5-06 | Admin dashboard + drill-down 7/30/90 ngày và filter | **PASS DEV (QA-26A):** Hai dashboard có bộ lọc 7/30/90, drill-down theo ngày, loading/empty/error và mô tả nguồn số liệu. Chrome signed-session QA trên PostgreSQL riêng: role 403/200, 1440/390/320 px Light/Dark, không overflow, filter ≥44px, Enter mở chi tiết, axe serious/critical = 0; 496 unit, typecheck/lint/API audit và Next build 57/57 PASS. Google OAuth và consent/production riêng. |
| [x] | AD5-07 | Báo cáo CSV/XLSX, scheduled aggregate/report snapshot nếu cần | CSV/XLSX on-demand 7/30/90 ngày; signed role matrix và PostgreSQL QA 24/24 migrations + aggregate reconciliation PASS; dữ liệu tổng hợp không PII, tiền gross VND, múi giờ VN. Snapshot định kỳ hiện không cần; net revenue/refund thuộc AD5-05. |
| [ ] | AD5-08 | Alert đối soát lệch, IPN down, queue lag, payment pending SLA, audit anomalies | **QA-26C, hoàn thiện lõi DEV:** 8 tín hiệu + probe HTTPS độc lập tùy chọn (3 lần lỗi); durable incident/generation, delivery theo vai trò, ACK/audit, escalation 30 phút, relay HMAC với lease/retry 6 lần/DLQ. PostgreSQL và HTTP signed-session inbox/ACK 5 vai trò PASS, có khôi phục người nhận phân công muộn, hai worker tranh lease; 499 unit, typecheck/lint/Prisma/audit 80/99, Next build 58 trang PASS. **Giữ mở:** chưa có endpoint health chính thức của SePay, relay/on-call thực tế và scheduler staging được nghiệm thu; `IPN_NO_SIGNAL` vẫn chỉ là info, không tuyên bố IPN down. |

**AD5-05 — checklist phần việc (QA-26E, 26/10/2026; task cha còn `[ ]`):**

- [x] KPI phễu đơn theo nhóm tạo trong kỳ, grant trả phí theo ngày Việt Nam, gross allocation và ngoại lệ đối soát.
- [x] Người trả phí duy nhất/lần đầu/gia hạn và grant tháng/năm; không đếm trùng người có nhiều grant. Nhóm lần đầu và gia hạn có thể giao nhau.
- [x] Giá trị VERIFIED, chiều IN, chưa MATCHED chờ đối soát; tính tổng tiền chính xác dạng chuỗi, không coi như đã phân bổ.
- [x] PostgreSQL QA cô lập (31 migrations, fixture cleanup), 499 unit, typecheck, lint, Prisma, API guards PASS; build QA 58/58 PASS sau tối ưu SQL.
- [ ] Hoàn thiện ledger hoàn tiền (ngày, số tiền, trạng thái), đối soát chi thực, net cash/net revenue và refund/dispute.
- [ ] Chốt định nghĩa churn, cửa sổ đo, renewal/reactivation và đối chiếu nghiệp vụ có xác nhận tài chính.

**AD5-08 — checklist nghiệm thu (QA-26C, 26/10/2026):**

- [x] Truy vấn 8 tín hiệu và phân biệt thiếu IPN với downtime đã xác nhận; payload tổng hợp không PII.
- [x] Migration incident/delivery/history/provider probe/relay; PostgreSQL QA 31 migrations, đóng/mở lại generation, không gửi trùng.
- [x] Cron API có Bearer secret; phát inbox theo Finance/Admin/Super Admin, bổ sung người được phân công sau khi sự cố đã mở, chuyển cấp sau 30 phút, ACK + audit.
- [x] Relay HMAC, stable idempotency key, lease cạnh tranh hai worker, retry/backoff và dead-letter ở lần thứ 6 bằng mock HTTPS.
- [x] HTTP signed-session inbox và ACK: Finance được giao, Admin chưa được giao bị chặn, Super Admin giám sát; Analyst/User 403, Origin/CSRF, ACK lặp và không PII; cleanup QA PASS.
- [x] QA-26D: snapshot cảnh báo đọc trong transaction sau advisory lock; thử Finance→Admin khi còn warning, delivery lịch sử không cấp quyền xem/ACK; kiểm thử PostgreSQL cô lập PASS.
- [x] Unit, lint, typecheck, Prisma validate, route audit và Next.js production build QA độc lập PASS.
- [ ] Xác minh URL health thực sự do SePay công bố/hỗ trợ, phân biệt health HTTP và IPN end-to-end, diễn tập phục hồi.
- [ ] Cấu hình relay nhận HMAC thật, ánh xạ trực on-call, xác thực chống replay/dedup và diễn tập ACK/chuyển cấp ngoài ứng dụng.
- [ ] Gắn scheduler staging mỗi 5 phút, cảnh báo khi scheduler ngừng chạy, diễn tập DLQ/recovery và xác nhận trách nhiệm vận hành. Billing production giữ NO-GO.

**Tiến độ AD5 (5/8):** đã có pageview đăng nhập theo nhóm trang, idempotency receipt, rollup theo ngày Việt Nam, repair/restart và indexed TTL, DAU/WAU/MAU, cohort đăng ký và retention D1/D7/D30, dashboard 7/30/90 ngày với drill-down đã nghiệm thu Chrome DEV, CSV/XLSX tổng hợp on-demand. PostgreSQL QA kiểm tra concurrency, ranh giới giờ, cohort maturity, ngày rỗng và signed-session browser role/mobile/a11y; unit API kiểm tra Origin, auth, bot, anonymous và payload cấm. AD5-08 đã có scheduler API, incident/inbox/ACK và relay bền vững được nghiệm thu QA mock; chưa có SePay health chính thức, external on-call và scheduler staging. Còn thiếu consent/privacy và loại trừ nội bộ (AD5-01), KPI refund/net cash (AD5-05), nghiệm thu vận hành AD5-08. `FINOVA_USAGE_ANALYTICS_ENABLED` giữ OFF theo mặc định.

### AD6 — Chất lượng, vận hành, phát hành (8 task)

| Xong | ID | Công việc / đầu ra | Điều kiện nghiệm thu |
| --- | --- | --- | --- |
| [x] | AD6-01 | Unit state machine, pricing snapshot, entitlement time, parser/validation | **PASS DEV (QA-24J):** 421/421 unit; validation giá bất thường, status/order parser, lịch VN, expiry-exclusive; PostgreSQL QA kiểm tra key conflict/retry, price/receiver snapshot qua repricing, zero-price reject, replay và renewal; 74/91 API audit, typecheck/lint/Prisma, Next build 55/55 PASS. Provider/browser E2E riêng AD3-10/AD6-04. |
| [x] | AD6-02 | PostgreSQL integration: 2 user, 2 admin, concurrency, FK, replay, mismatch | **PASS trên DB `finova_admin_test_20261024`:** 2 admin duyệt độc lập; nhiều user cô lập, không lộ order người khác; replay/idempotency, 4 checkout song song, 2 worker, sai tiền/receiver/direction/late, unique grant và rollback bằng PostgreSQL fault injection. Có fixture ledger cân bằng chứng minh backfill/revoke không mất dữ liệu. Không thay thế provider UAT thật hoặc Google browser E2E. |
| [x] | AD6-03 | API security: signed Better Auth session, CSRF, RBAC, session revoked, IDOR | **PASS DEV (QA-25I):** `admin:test-signed-session` trên PostgreSQL QA tách biệt PASS HMAC/tamper, stale sign-in, Origin/CSRF, 401/403/404 và `no-store` qua anonymous/OWNER/ANALYST/FINANCE/ADMIN/SUPER_ADMIN, revoked actor/session, protected IDOR, audit/dual approval. 496 unit, typecheck/lint/API audit PASS. Google OAuth thật thuộc AD6-04; security sign-off thuộc AD6-07. |
| [ ] | AD6-04 | Browser E2E Google login + Lite→order→payment sandbox→Premium→expiry, mobile | Screenshot/evidence trên desktop/390/320; không chỉ synthetic cookie. |
| [ ] | AD6-05 | Load/chaos: IPN replay, provider 401/429/503, DB outage, retry/backfill | Không mất event đã ACK, không grant kép; p95 theo SLO duyệt. |
| [ ] | AD6-06 | Ops runbook: rotate receiver/secret, sao lưu/khôi phục, DLQ replay, reconciliation, incident | Chạy diễn tập staging, phân quyền operator và lưu log. |
| [ ] | AD6-07 | Privacy/legal/security/finance acceptance, invoice/tax workflow, data deletion plan | Biên bản ký duyệt độc lập trước live thu tiền. |
| [ ] | AD6-08 | CI gates, staging HTTPS, rollout flags, production rollback/monitoring, release sign-off | `typecheck`, `lint`, unit, integration, build, route guard audit PASS + UAT provider thật. |

**Tổng cộng: 55 nhiệm vụ mới**, **36/55 `[x]` theo phạm vi nghiệm thu DEV** (AD0 1/6 + AD1 8/8 + AD2 7/8 + AD3 5/10 + AD4 7/7 + AD5 5/8 + AD6 3/8). QA-26C hoàn thiện lõi AD5-08 và checklist theo từng đầu ra, nhưng vẫn `[ ]` cho đến khi nghiệm thu on-call/health/scheduler thực tế. QA-26B nghiệm thu AD2-06; QA-26A nghiệm thu AD5-06; QA-25A/B/C/D/E/G/H/I nghiệm thu AD2-08/AD4-05/AD5-04/AD4-04/AD4-01/AD5-02/AD2-07/AD6-03. AD2-05 đã có ảnh VietQR nhưng chưa thử QR trên app ngân hàng; AD2-07/AD5-06 có browser QA signed-session, Google OAuth thật thuộc AD6-04. AD3-04 có notification outbox/PostgreSQL recovery; AD3-06 có SubscriptionEvent/rollback. AD3-09 còn thiếu dual approval/exception resolution; AD5-03 scheduler production mở; AD5-07 chỉ gross on-demand. KPI net revenue/refund và AD5-08 operational sign-off vẫn `[ ]`. **UAT provider: chưa; phát hành thu phí: NO-GO.**

## 9. Ma trận nghiệm thu nghiệp vụ tối thiểu

| Test ID | Input/luồng | Kỳ vọng bất biến |
| --- | --- | --- |
| `AT-AD01` | New Google user / legacy user backfill | Đều Lite, không mất dữ liệu cũ. |
| `AT-AD02` | User tự gọi `/admin` hoặc API admin | 403, không rò PII/KPI. |
| `AT-AD03` | Workspace OWNER gọi API admin | 403, không suy diễn system role. |
| `AT-AD04` | Đổi giá khi có pending order | Order cũ giữ nguyên snapshot tiền/kỳ hạn/receiver. |
| `AT-AD05` | Client tự sửa amount/duration/receiver | Bị từ chối; dữ liệu server authoritative. |
| `AT-AD06` | IPN sai auth, giả mạo ảnh biên lai | Không kích hoạt Premium. |
| `AT-AD07` | Provider trả đúng 1 event khớp order | Exactly one PAID allocation + grant + outbox, thời hạn đúng. |
| `AT-AD08` | IPN gửi lại 20 lần + polling nhận trùng | Vẫn một lần cấp quyền. |
| `AT-AD09` | Đúng tiền nhưng sai mã, sai receiver, sai direction | Không auto-grant, vào review/reject. |
| `AT-AD10` | Số tiền thiếu/thừa, đơn quá hạn | Giữ được giao dịch, exception queue, không gán ngày Premium tùy tiện. |
| `AT-AD11` | 2 đơn đúng thanh toán đồng thời cùng user | Cộng nối tiếp 2 thời hạn, không lost update. |
| `AT-AD12` | DB lỗi giữa nhận event và commit | Không ACK thành công trước persist; retry đúng. |
| `AT-AD13` | Crash sau PAID commit trước notify | User vẫn Premium; outbox replay an toàn. |
| `AT-AD14` | Premium hết hạn trong lúc đang đăng nhập | API nhận Lite tức thì, data còn nguyên. |
| `AT-AD15` | Admin manual grant / revoke / refund | Đúng vai trò, reason, approval, full audit, không tự tăng cash. |
| `AT-AD16` | Admin đổi tài khoản thụ hưởng | Old order giữ receiver cũ, new order dùng approved active receiver. |
| `AT-AD17` | PII/secret exposure trong response/log/export | Không có secret, masked receiver, user finance data ẩn. |
| `AT-AD18` | DAU/MAU, pageview multiple navigations/hydration | Distinct theo user/date; visit có định nghĩa, không double. |
| `AT-AD19` | 1 user gia hạn 3 lần trong tháng | Premium users = 1; orders và cash là 3 lần theo định nghĩa. |
| `AT-AD20` | Backfill outage + recovery / duplicate provider events | Không mất thu tiền, không cấp gói trùng, discrepancy alert đúng. |
| `AT-AD21` | Export nhiều dữ liệu bằng ANALYST/USER | Chỉ trường/scope cho phép, rate limit và audit. |
| `AT-AD22` | UAT sandbox từ giao dịch ngân hàng thật đến quyền Premium | Chứng minh end-to-end source ID → order → grant → dashboard. |
| `AT-AD23` | Tạo 2 đơn `PREMIUM_MONTHLY`/`PREMIUM_YEARLY` | Số tiền bắt buộc lần lượt **29.000/199.000 VNĐ**; server không cho đổi kỳ hạn/giá/amount. |
| `AT-AD24` | Kích hoạt/gia hạn vào 31/01, 28/02, 29/02 năm nhuận; hai lần gia hạn tháng | Thời hạn cộng **tháng/năm lịch** theo `Asia/Ho_Chi_Minh`, quy tắc ngày neo rõ ràng; không dùng 30/365 ngày cố định. |
| `AT-AD25` | User Lite nhấn menu, vào trực tiếp URL và gọi API Nhập sao kê, Đồng bộ sao kê, Thông báo | Ba mục bị ẩn, API trả `403 PREMIUM_REQUIRED`, background jobs không tiếp tục đồng bộ/tạo thông báo; dữ liệu cũ vẫn còn. |
| `AT-AD26` | User Premium dùng ba công cụ, hết hạn khi worker đồng bộ đang chạy, sau đó gia hạn trở lại | Premium hoạt động với consent/provider hợp lệ; hết hạn chặn ba tính năng kể cả ghi dữ liệu từ worker đang chạy; lưu checkpoint, không mất dữ liệu đã nhận bền vững; gia hạn resume có kiểm soát. |

## 10. Giai đoạn phát hành, phụ thuộc và ước lượng

| Mốc | Điều kiện | Nội dung có thể phát hành | Gate |
| --- | --- | --- | --- |
| **M1 — Admin foundation** | AD0-01/02 + AD1 | Phân quyền, user list, Lite backfill, gói ở chế độ feature flag | Không hở admin API/PII; signed auth regression. |
| **M2 — Catalog & checkout sandbox** | AD0-03/06 + AD2 | Giá, receiver, order và hướng dẫn CK, chưa thu tiền live | Snapshot + approval + sandbox flow pass. |
| **M3 — Automated activation** | AD3 + provider UAT | Tự ghép tiền, Premium, expiry/renewal, ngoại lệ | Bank-origin verified, idempotency/chaos/reconciliation pass. |
| **M4 — Admin analytics** | AD4/AD5 | Dashboard và báo cáo người dùng/gói/thu tiền/truy cập | Số liệu khớp nguồn, privacy + RBAC pass. |
| **M5 — Production** | AD6 + legal/finance/security sign-off | Mở cờ thương mại hóa cho tập user nhỏ, quan sát rồi mở dần | Tất cả gate GO; rollback plan đã diễn tập. |

**Tham chiếu ước lượng:** khoảng **6–10 tuần công** với đội backend + frontend + QA/DevOps phối hợp, **chưa tính** thời gian cấp tài khoản ngân hàng/provider, pháp lý, sandbox UAT hoặc điều chỉnh phạm vi. Đây chỉ là giả định phục vụ lập lịch; ước lượng lại sau AD0. Có thể chạy song song AD4 UI và AD5 analytics taxonomy khi AD1 bảo mật đã có.

### 10.1. Quy trình rollout an toàn

1. Feature flags mặc định: `ADMIN_ENABLED=0`, `BILLING_CHECKOUT_ENABLED=0`, `BILLING_WEBHOOK_ENABLED=0`, `PREMIUM_ENTITLEMENTS_ENFORCED=0` (tên env sẽ chốt khi coding). Chỉ bật riêng sandbox/staging trước.
2. Triển khai migration/backfill nhiều bước không phá schema cũ; chạy cohort dry-run, diff user counts, backup/restore.
3. Mở UI quản trị nội bộ; test đầy đủ RBAC, sau đó cho user xem catalog và checkout sandbox.
4. Xác minh tài khoản nhận phí và luồng tiền đầu-cuối thực tế qua provider; reconciliation report đạt, xử lý retry/lag/duplicate.
5. Mở có kiểm soát sau sign-off; đo conversion, payment unmatched backlog, variance và hỗ trợ. Khi lỗi tắt **nhận đơn mới**, giữ worker đối soát đơn đã nhận; không rollback bằng cách xóa dữ liệu thanh toán.

### 10.2. Điều kiện GO/NO-GO bắt buộc

- **NO-GO** nếu thiếu bảng giá/chính sách gói được phê duyệt, chưa có thỏa thuận đọc biến động tài khoản nhận phí, chưa có provider sandbox UAT có chứng cứ, chưa ký duyệt pháp lý/tài chính, hoặc còn đường API admin/entitlement bypass.
- **NO-GO** nếu có tình huống 1 event ghi nhận hơn 1 đơn/grant, giao dịch thiếu/thừa tự kích hoạt, bị mất event đã ACK, cross-user data leak hay thanh toán đúng không thể truy hồi sau sự cố.
- **GO** khi đủ migration, tài liệu API/runbook, audit, reconciliation, security và accessibility, signed Google session E2E, test tải/outage, HTTPS/secret rotation/observability cùng quyết định release chính thức.

## 11. Vị trí triển khai dự kiến trong repository

| Khu vực | Đầu việc dự kiến |
| --- | --- |
| `prisma/schema.prisma`, `prisma/migrations/` | System roles, catalog, orders, payment events, subscription, usage analytics + constraints. |
| `src/server/system-auth.ts`, `src/server/entitlements.ts` | System role guard độc lập workspace, effective plan, feature limit và access state. |
| `src/modules/billing/` | Catalog, checkout, payment adapter, matcher, activation transaction, worker, reversal, audit. |
| `src/modules/admin/` | Queries users/analytics, reports, field-level access, aggregate definitions. |
| `src/app/(protected)/settings/`, `src/app/(protected)/billing/`, `src/app/pricing/` | User upgrade & payment UX; cập nhật navigation. |
| `src/app/(admin)/admin/` | Protected admin layout/dashboard/pages; route group là **đề xuất**, kiểm tra Next.js docs trước khi tạo. |
| `src/app/api/v1/admin/`, `src/app/api/v1/billing/`, `src/app/api/webhooks/billing/`, `src/app/api/internal/billing/` | API public user, admin, bank IPN, worker riêng. |
| `tests/unit/`, `scripts/*integration-check.ts`, `docs/` | QA, fixtures, threat model, API contract, operations runbook, KPI dictionary. |

**Lưu ý cho Codex khi triển khai:** repository đang sử dụng Next.js **16.4.x** với lưu ý breaking changes trong `AGENTS.md`; phải đọc các tài liệu tương ứng tại `node_modules/next/dist/docs/` **trước khi viết mã Next.js**. Không đưa quyền platform admin vào `Membership.role`. Giữ các thay đổi chưa commit của người dùng và chỉ sửa file liên quan trong từng task; sau khi **hoàn thành và kiểm thử** từng task mới cập nhật đúng checkbox trong tài liệu này và tracker tổng thể.

---

**Trạng thái cập nhật 24/10/2026:** 9/55 đã nghiệm thu theo phạm vi: AD0-01, AD1-05, AD2-04, AD3-02/04/05/06/07, AD6-02. PostgreSQL cô lập kiểm chứng dual approval, thu hồi tức thời, hết hạn/gia hạn lịch Việt Nam, hoàn tác transaction, 2 workers, idempotency và snapshot ledger bất biến. **362/362 unit tests (62 file), TypeScript, toàn bộ ESLint, Prisma validate, audit 90 handlers, PostgreSQL integration và production build riêng PASS.** Chưa có UAT provider thật, signed Google browser E2E, staging HTTPS, phê duyệt pháp lý/tài chính; **production billing NO-GO, Analytics OFF**. Xem [runbook](FINOVA_ADMIN_PREMIUM_PAYMENT_RUNBOOK.md).
