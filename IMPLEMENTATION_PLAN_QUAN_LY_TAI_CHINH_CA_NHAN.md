# IMPLEMENTATION PLAN — PHẦN MỀM QUẢN LÝ TÀI CHÍNH CÁ NHÂN

> **Checkpoint 27/10/2026 — xóa ví nhập nhầm:**
> - [x] **WALLET-DEL-01 (DEV):** Thêm thao tác xóa ví, `DELETE /api/v1/wallets/[id]` có xác thực/Origin/workspace scope, xác nhận trước khi xóa, audit, giao dịch nguyên tử chỉ gỡ ví chưa phát sinh hoạt động ngoài bút toán đầu kỳ; chặn ví có giao dịch, đối soát, mục tiêu, liên kết ngân hàng, lịch định kỳ, dòng nhập hoặc bút toán khác. **539/539 unit (98 files), typecheck, ESLint, API guard audit 81 routes/102 handlers PASS.**
> - [x] **WALLET-DEL-02a (integration trên PostgreSQL):** `FINOVA_TEST_RUN=1 npm run test:integration` PASS trên Docker PostgreSQL `127.0.0.1:55433`; workspace fixture độc lập kiểm tra xóa ví trống, ví chỉ có số dư đầu kỳ, chặn ví đã chi tiêu và liên kết lịch định kỳ. Kiểm thử toàn bộ P2–P6, đồng bộ import và 72 bút toán cân đối PASS.
> - [ ] **WALLET-DEL-02b (UAT có đăng nhập):** Cần kiểm thử thao tác xóa ví trên trình duyệt bằng tài khoản thật; Safari iOS/iPadOS và datetime picker thực tế chưa nghiệm thu trên thiết bị.

- [x] **QA-26E ngày 26/10/2026 — KPI AD5-05 DEV từng phần:** Thêm số người trả phí duy nhất, lần đầu/gia hạn, grant tháng/năm và tổng VERIFIED/IN chờ đối soát theo ngày Việt Nam; không đếm trùng người, giữ đúng VND dạng decimal text. PostgreSQL QA `finova_admin_test_ad505_20261026` (31 migrations), `admin:test-billing-analytics` PASS và fixture cleanup. **499/499 unit (91 files)**, TypeScript/ESLint/Prisma/API audit **80/99** PASS; build QA **58/58** PASS sau tối ưu SQL. Tracker Admin vẫn **36/55**; task AD5-05 cha `[ ]` vì thiếu refund ledger/net revenue/churn được chốt; provider UAT/OAuth thật/staging/sign-off vẫn mở, **NO-GO**.

> **Checkpoint QA-25I ngày 25/10/2026:** Nghiệm thu **AD6-03 `[x]` theo phạm vi DEV**, `admin:test-signed-session` PASS trên DB QA: signed session/HMAC, Origin/CSRF, RBAC anonymous/OWNER/ANALYST/FINANCE/ADMIN/SUPER_ADMIN, 401/403/404, session revoke, protected IDOR, cache-private và dual approval. Regression **496/496 unit, TypeScript/ESLint/API audit 79/98 PASS**. Admin **34/55**, Bank Sync **9/45**, SePay **13**; Google OAuth/provider UAT/staging chưa nghiệm thu, production **NO-GO**.

> **Checkpoint QA-25H ngày 25/10/2026:** **AD2-07 `[x]` theo phạm vi DEV**, `admin:test-billing-browser` PASS trên PostgreSQL QA tách biệt và Chrome CDP: signed-session RBAC 403/200, preview/cancel/publish bảng giá và snapshot đơn hàng, receiver masked/snapshot/dual approval, audit, responsive 1440/390/320, Light/Dark, axe WCAG serious/critical = 0, cleanup fixture. Admin **33/55**, Bank Sync **9/45**, SePay **13**. Google OAuth E2E thực, provider UAT và staging chưa nghiệm thu; **production billing NO-GO**.

> **Checkpoint QA-25G ngày 25/10/2026:** Nghiệm thu DEV **AD5-02**: pageview nhóm route qua API xác thực, Origin/auth, bot, anonymous, StrictMode remount/reload và payload cấm dữ liệu tài chính được kiểm thử; analytics OFF mặc định không ghi dữ liệu. **496/496 unit (90 files), TypeScript/ESLint/API guard 79/98 PASS.** Admin **32/55**, Bank Sync **9/45**, SePay **13**; consent/privacy, dashboard browser/mobile/a11y, provider UAT và staging còn mở; production billing **NO-GO**.

> **Checkpoint QA-25E ngày 25/10/2026:** Nghiệm thu DEV **AD4-01**: `admin:test-shell-browser` trên PostgreSQL QA riêng PASS URL 403, menu role, desktop/mobile 1440/390/320 px, Light/Dark, touch target ≥44 px, axe serious/critical = 0 và fixture cleanup. **483/483 unit, TypeScript/ESLint/Prisma/API guard 79/98, Next build 57/57 PASS**. Cập nhật `[x]` Admin **31/55**, Bank Sync **9/45**, SePay **13**. Google OAuth/browser provider UAT/staging vẫn mở, production billing **NO-GO**.

> **Checkpoint QA-25D ngày 25/10/2026:** Nghiệm thu DEV **AD4-04**: thay đổi trạng thái truy cập bắt buộc lý do, xác minh session Google mới ≤5 phút, tự động thu hồi session khi khóa, quản trị viên được bảo vệ và hiển thị timeline audit. PostgreSQL QA `admin:test-signed-session` PASS signed/tampered/stale cookies, Origin/RBAC, suspend/reactivate và audit; **483/483 unit, TypeScript/ESLint/Prisma/API guard 79/98, build 57/57 PASS**. Admin **30/55**, Bank Sync **9/45**, SePay **13**, production billing **NO-GO**.

> **Checkpoint QA-25C ngày 25/10/2026:** Nghiệm thu DEV **AD5-04**: KPI đăng ký, DAU/WAU/MAU, cohort ngày Việt Nam và retention D1/D7/D30 (chỉ tính cohort đủ tuổi). PostgreSQL QA `admin:test-cohorts` PASS ngày trống, biên 00:00 Việt Nam, D0/D1/D7/D30 và cleanup; **483/483 unit (85 files), TypeScript/ESLint/Prisma/API guard 79/98, Next build 57/57 PASS.** Cập nhật `[x]` trong [tracker Admin/Premium](docs/FINOVA_ADMIN_PREMIUM_IMPLEMENTATION_PLAN.md). Admin **29/55**, Bank Sync **9/45**, SePay **13**; analytics vẫn OFF mặc định, production billing **NO-GO**.

> **Checkpoint QA-25B ngày 25/10/2026:** Nghiệm thu DEV **AD2-08** (trạng thái đơn thanh toán và quyền Premium thực tế) và **AD4-05** (dashboard cấp bù/gia hạn/thu hồi có duyệt, phân trang hàng chờ). PostgreSQL QA biệt lập **29/29 migrations**, `admin:test-subscriptions` 55 đề xuất và 55 sự kiện PASS; bài trạng thái đơn và Lite billing notice PASS. **479/479 unit, TypeScript/ESLint/Prisma/API guard 79/98, Next build 57/57 PASS.** Đã cập nhật `[x]` trong [tracker Admin/Premium](docs/FINOVA_ADMIN_PREMIUM_IMPLEMENTATION_PLAN.md). Admin **28/55**, Bank Sync **9/45**, SePay **13**; production billing **NO-GO**.

> **Checkpoint QA-24O ngày 24/10/2026:** Nghiệm thu DEV **AD4-06** trang quản lý gói tài khoản, hai kỳ hạn Premium và chính sách khóa checkout khi không có giá hợp lệ. Effective plan, hạn theo giờ Việt Nam, gia hạn/nâng cấp và lịch sử đơn đã có. **454/454 unit, TypeScript/ESLint/API guard 79/98, build 57/57 PASS.** Đã cập nhật `[x]` trong [tracker Admin/Premium](docs/FINOVA_ADMIN_PREMIUM_IMPLEMENTATION_PLAN.md). Admin **26/55**, Bank Sync **9/45**, SePay **13**; production billing **NO-GO**.

> **Checkpoint QA-24N ngày 24/10/2026:** Đã nghiệm thu DEV **AD4-02 và AD4-03** (quản trị danh sách/chi tiết tài khoản), đánh dấu `[x]` trong [tracker Admin/Premium](docs/FINOVA_ADMIN_PREMIUM_IMPLEMENTATION_PLAN.md). PostgreSQL QA riêng 27 migrations + `admin:test-users` PASS cho keyset cursor/index, filters, insert xen trang, export CSV giới hạn/audit và lifecycle. Test role/cross-user API 401/403 và PII projection PASS; TypeScript/ESLint/Prisma/API guard 79/98 PASS. Admin **25/55**, Bank Sync **9/45**, SePay Bank Hub **13**. Provider UAT/browser Google/staging và ký duyệt vẫn thiếu: **production NO-GO**.

> **Checkpoint QA-24M ngày 24/10/2026:** Đã nghiệm thu DEV thêm **AD1-01, AD1-04, AD2-01** (schema/ràng buộc quản trị, catalog giá phiên bản), cập nhật checkbox trong [kế hoạch Admin/Premium](docs/FINOVA_ADMIN_PREMIUM_IMPLEMENTATION_PLAN.md). PostgreSQL QA mới 26 migrations, rollback DDL rehearsal và pricing lifecycle/concurrency/snapshot integration PASS; **438/438 unit, typecheck, lint, 78/97 API guards, Next build 56/56 PASS**. Admin hiện **23/55**, Bank Sync **9/45**, SePay Bank Hub **13**; giao diện bảng giá còn browser E2E, chưa provider UAT/phê duyệt thu phí: **production NO-GO**.

> **Checkpoint QA-24L ngày 24/10/2026:** AD2-02 đã `[x]` sau integration QA hai bước duyệt receiver, chặn Finance và self-approve, chuyển receiver cũ sang DISABLED, giữ nguyên bank snapshot của order cũ và mask admin projection. **438/438 unit**, typecheck/lint/Prisma/API audit 74/91, Next build 55/55 PASS. Admin hiện **20/55**, Bank Sync **9/45**, SePay Bank Hub **13**. Chưa UAT provider thực và production sign-off; **NO-GO**.

> **Checkpoint QA-24K ngày 24/10/2026:** AD1-08 đã `[x]` sau audit privacy/IDOR/RBAC, redaction persisted access/action/audit và receiver AES-GCM/disabled verification trên PostgreSQL QA, **438/438 unit**, typecheck/lint/Prisma/API guard 74/91, Next.js build 55/55 PASS. Admin hiện **19/55**, Bank Sync **9/45**, SePay Bank Hub **13**. Thiếu provider UAT/OAuth browser/staging/production sign-off nên **production NO-GO**.

> **Checkpoint QA-24J ngày 24/10/2026:** AD6-01 đã `[x]` sau unit **421/421**, validation catalog/price snapshot, PostgreSQL QA idempotency/renewal/rollback, typecheck/lint/Prisma/API guard 74/91 và Next.js build **55/55 trang PASS**. Admin hiện **18/55**, Bank Sync **9/45**, SePay Bank Hub **13**. Các hạng mục provider UAT, OAuth browser, staging, pháp lý/tài chính chưa đạt; **production NO-GO**.

> **Checkpoint QA-24I ngày 24/10/2026:** Phân hệ Admin **17/55 nhiệm vụ `[x]`**, AD5-03 rollup/backfill/TTL vừa nghiệm thu DEV trên PostgreSQL QA riêng. Kiểm tra concurrent worker/live pageview, ranh giới ngày VN, retention 2/400 ngày, signed export; **418/418 unit, typecheck, lint, Prisma validate, API audit 74/91, Next build 55/55 PASS**. Bank Sync giữ **9/45**, SePay Bank Hub **13**. Consent/scheduler staging, Google OAuth browser, provider UAT, refund và sign-off còn mở: **production NO-GO**.

> **Phân hệ mở rộng triển khai từ 23/10/2026, cập nhật 24/10/2026:** [Quản trị hệ thống, Lite/Premium, thu phí chuyển khoản, tự động kích hoạt và dashboard vận hành — Implementation Plan 55 task](docs/FINOVA_ADMIN_PREMIUM_IMPLEMENTATION_PLAN.md). **16/55 nhiệm vụ `[x]` tại checkpoint QA-24H**; đã nghiệm thu AD5-07 báo cáo CSV/XLSX on-demand trên PostgreSQL và signed admin sessions. Chính sách chuyển tiếp, provider UAT và các gate thu tiền thật vẫn chưa đạt. Không nhầm với tiến độ Bank Sync người dùng.

> **Checkpoint hiện hành 23/10/2026:** Bank Sync **9/45** `[x]`, SePay Bank Hub **13** `[x]` (hoàn tất SP3-02 authenticated manual sync). PostgreSQL `finova_test` **16/16 migrations, 36/36 scenarios PASS**; unit **320/320** (51 files), typecheck, lint, Prisma validate, route guard audit và production build PASS. Fixture cleanup không còn user/workspace/pending outbox kiểm thử. Browser Google OAuth, UAT SePay thực, outage DB, staging và ký duyệt còn mở; npm audit chưa cung cấp báo cáo đủ và stress run song song từng có 1 retry. **G5 OPEN, G6 CONDITIONAL, G7 IN PROGRESS, P8 NOT STARTED; Production/SePay Live NO-GO.** Các checkpoint bên dưới là lịch sử.

> **Tên dự án tạm:** FinTrack / Tài Chính Của Tôi  
> **Phiên bản tài liệu:** 1.0 · **Ngày lập:** 19/10/2026  
> **Đầu vào:** `PROMPT_XAY_DUNG_UNG_DUNG_QUAN_LY_TAI_CHINH_CA_NHAN.md`  
> **Đối tượng thực thi:** Codex / AI coding agent / đội ngũ Full-stack  
> **Trạng thái cập nhật 23/10/2026 (lịch sử):** Bank Sync **9/45** task `[x]`, SePay Bank Hub **12 task `[x]`** (SP3-05 đã nghiệm thu bằng synthetic PostgreSQL integration). `finova_test` **16/16 migrations, 31/31 scenarios PASS**, unit **320/320** (51 files) PASS; typecheck, lint, Prisma validate PASS. Có lease takeover, consent theo account và stress/HTTP 401/429/503/timeout/recovery; **chưa có SePay Sandbox UAT thật**. G5 OPEN, G6 CONDITIONAL, G7 IN PROGRESS, P8 NOT STARTED; **Production/SePay Live NO-GO**. Checkpoint cũ bên dưới giữ lịch sử.
> **Trạng thái cập nhật 23/10/2026 (lịch sử):** Bank Sync **9/45** task `[x]` và SePay Bank Hub **11 task `[x]`** (SP1-03/SP3-01 mới nghiệm thu); PostgreSQL `finova_test` **15/15 migrations, 24/24 Bank Sync scenarios PASS**, unit **314/314** (50 files) PASS. Tình huống lỗi trang lịch sử thứ hai (HTTP 503/timeout) và phục hồi đã đạt. Typecheck, lint, Prisma validate, route audit 54/69 và production build PASS ở checkpoint kiểm tra gần nhất. **G5 OPEN, G6 CONDITIONAL, G7 IN PROGRESS, P8 NOT STARTED; PRODUCTION/SEPAY LIVE NO-GO** vì còn thiếu UAT đối tác, DB outage, browser auth, HTTPS staging và sign-off. Trạng thái 22/10 bên dưới lưu như mốc lịch sử.
> **Trạng thái cập nhật 22/10/2026:** P0–P6 đã có nhiều module hoạt động và kiểm thử backend; **G5 OPEN, G6 CONDITIONAL, G7 IN PROGRESS, P8 NOT STARTED; chưa đủ điều kiện production**. Bank Sync **9/45** và SePay Bank Hub **9 task** đã nghiệm thu (tracker chuyên biệt trong `docs/`); **17/17 PostgreSQL Bank Sync integration**, **310/310 unit**, typecheck/lint/build PASS. Checkbox `[x]` của từng task chỉ xác nhận phạm vi task đã được chứng minh cục bộ; gate E2E/staging vẫn phải nghiệm thu riêng. Xem `docs/TEST_REPORT.md` và `docs/PHASE_REPORT.md`.

---

## 0. HƯỚNG DẪN SỬ DỤNG TÀI LIỆU

Đây là kế hoạch thực thi **có thể giao trực tiếp cho Codex**. Không chỉ dựng giao diện mẫu: mỗi hạng mục phải đi hết chu trình **schema → nghiệp vụ → API → UI → test → tài liệu**. Dùng Master Prompt nói trên làm nguồn yêu cầu sản phẩm; khi phát hiện mâu thuẫn, ưu tiên **đúng số liệu tài chính, an toàn dữ liệu, kết nối thật**, sau đó cập nhật Decision Log trước khi lập trình.

**Quy ước:**

- `[ ]` Chưa bắt đầu; `[x]` chỉ đánh dấu khi có bằng chứng thực tế trong repository và kết quả test.
- `P0…P8`: giai đoạn triển khai; `Txx.yy`: task có ID duy nhất.
- `P0–P3`: **MVP khả dụng**; `P4–P6`: **bản đầy đủ**; `P7–P8`: **hardening và mở rộng**.
- `MUST`: bắt buộc; `SHOULD`: nên có; `LATER`: sau bản phát hành đầu.
- Mọi thời lượng dưới đây là **ước lượng kế hoạch, không phải cam kết tiến độ**; điều chỉnh theo nguồn lực và repository thực tế.

### 0.1. Kết quả cuối cùng cần đạt

Người dùng đăng nhập Google, tạo ví, nhập thu/chi/chuyển tiền, xem số dư và dashboard **khớp 100% với dữ liệu phát sinh**, đặt ngân sách, phân tích nhiều góc nhìn, quản lý tiết kiệm/vay nợ/thẻ, nhập/xuất báo cáo và dùng trên điện thoại như PWA. Mỗi người chỉ truy cập dữ liệu của mình; mọi thay đổi nghiệp vụ có kiểm soát và có thể đối soát.

### 0.2. Không nằm trong phạm vi bản đầu

- Tự động lấy giao dịch ngân hàng, đọc SMS/Gmail, tích hợp ngân hàng mở, quét OCR hóa đơn, tư vấn đầu tư bằng AI.
- Ứng dụng iOS/Android native; hệ thống thanh toán online; mô hình SaaS thu phí.
- Đồng bộ offline có thể tạo giao dịch khi mất mạng, chia sẻ nhiều thành viên gia đình trong MVP.
- Tính tỷ giá ngoại tệ động từ nguồn bên thứ ba. Chỉ cho phép triển khai sau khi có quy tắc kiểm toán dữ liệu tỷ giá.

---

# PHẦN I. PHẠM VI, KIẾN TRÚC VÀ QUYẾT ĐỊNH THIẾT KẾ

## 1. DANH MỤC SẢN PHẨM VÀ THỨ TỰ ƯU TIÊN

| Mã | Phân hệ | Release | Ưu tiên | Tiêu chí đầu ra |
|---|---|---|---|---|
| MOD-01 | Google OAuth, session, hồ sơ | MVP | P0 | Google login thật, logout, bảo vệ API |
| MOD-02 | Onboarding, workspace cá nhân | MVP | P0 | Tạo workspace/ví ban đầu, không seed giao dịch giả |
| MOD-03 | Ví và danh mục | MVP | P0 | CRUD, archive, số dư từ ledger |
| MOD-04 | Thu/chi/chuyển ví/refund | MVP | P0 | CRUD, transaction atomic, công thức đúng |
| MOD-05 | Dashboard tổng quan | MVP | P0 | KPI, thu–chi, cashflow, donut, drill-down |
| MOD-06 | Lọc, tìm kiếm, lịch sử | MVP | P0 | URL filter, pagination, dữ liệu nhất quán |
| MOD-07 | Ngân sách và cảnh báo | V1 | P1 | Hạn mức, đã dùng, % vượt, cảnh báo |
| MOD-08 | Báo cáo chuyên sâu | V1 | P1 | 8 chủ đề, ≥10 visualizations, export |
| MOD-09 | Mục tiêu tiết kiệm | V1 | P1 | Nạp/rút, tiến độ, không ghi chi trùng |
| MOD-10 | Vay/cho vay | V1 | P1 | Dư nợ, gốc/lãi, lịch trả, đối soát |
| MOD-11 | Thẻ tín dụng | V1 | P1 | Quẹt, sao kê, thanh toán không chi trùng |
| MOD-12 | Giao dịch định kỳ | V1 | P1 | Job idempotent, dự kiến/đã phát sinh |
| MOD-13 | CSV/XLSX import, export, PDF | V1 | P1 | Bản xem trước, chống trùng, font Việt |
| MOD-14 | PWA, notification center | V1 | P1 | Cài app, mobile UX, nhắc hạn trong app |
| MOD-15 | Đa tiền tệ + tỷ giá snapshot | V1.1 | P2 | Quy đổi chính xác, cân sổ theo tiền tệ |
| MOD-16 | Gia đình, quyền owner/editor/viewer | V2 | P2 | RBAC và nhật ký thay đổi |

### 1.1. Mốc phát hành

- **MVP (cuối P3):** login Google, onboarding, ví, danh mục, thu/chi/chuyển ví/refund, báo cáo cơ bản, dashboard thật. *Không gọi là MVP hoàn thành nếu chưa kiểm thử các trường hợp tiền và bảo mật trọng yếu.*
- **V1 (cuối P6):** ngân sách, báo cáo nâng cao, mục tiêu, vay nợ, thẻ tín dụng, định kỳ, xuất/nhập, PWA.
- **Production Release (P7):** bảo mật, đối soát, hiệu năng, backup/restore, staging → production và runbook.
- **V2 (P8, tùy chọn):** gia đình, đa tiền tệ hoàn chỉnh, nâng cấp BI và phân quyền.

## 2. CÔNG NGHỆ VÀ NGUYÊN TẮC CHỌN STACK

| Lớp | Mặc định | Ghi chú triển khai |
|---|---|---|
| Frontend | Next.js App Router + TypeScript | Theo phiên bản ổn định tương thích tại lúc thực thi |
| UI / design system | Tailwind CSS + shadcn/ui + Lucide | Ưu tiên Be Vietnam Pro, mobile-first |
| Charting | Recharts | Wrapper để đồng nhất tooltip, legend, drill-down |
| API | Next.js Route Handlers; service layer | API không chứa trực tiếp business logic |
| Database | PostgreSQL | Transaction, FK, CHECK/UNIQUE, index |
| ORM | Prisma | Khóa phiên bản; kiểm tra API transaction đúng phiên bản |
| Auth | Better Auth + Google OAuth 2.0/OIDC | Session xác minh phía server |
| Validation | Zod | Chia sẻ kiểu dữ liệu; decimal nhận qua string |
| Form | React Hook Form | Validate tiếng Việt và accessible |
| Async UI | TanStack Query nếu cần | Không mặc định cache dữ liệu tài chính sai scope |
| Test | Vitest + Testing Library + Playwright | Unit, integration, E2E, security |
| CI/CD | GitHub Actions hoặc pipeline hiện hữu | lint, typecheck, test, build, scan |
| Packaging | Docker + Compose | `app`, `postgres`, optional `worker` |
| Export | CSV UTF-8 BOM, XLSX, PDF có font Việt | Server-controlled authorization |

**Quyết định bắt buộc trước coding (ADR):**

1. Dùng **PostgreSQL `NUMERIC(20,4)` + Decimal library** cho tiền, serialize JSON bằng **decimal string** (`"1500000"`), không dùng binary `float` để cộng trừ. VND chỉ chấp nhận giá trị nguyên; nếu xử lý đơn vị khác, kiểm tra quy tắc số chữ số thập phân của từng currency.
2. **MVP chỉ hạch toán VND.** Schema vẫn có trường currency để mở rộng; UI khóa/hướng dẫn rõ khi ví ngoại tệ chưa được hỗ trợ. Không đưa nhiều loại tiền vào cùng một tổng KPI. Chuyển ngoại tệ chỉ mở sau ADR đa tiền tệ, FX clearing và test.
3. Xây dựng **sổ cái kép (double-entry ledger)** bất biến: `Journal` + `Posting`, mỗi journal cân đối; số dư tính từ postings hoặc cache có reconciliation.
4. Mọi thao tác ghi thuộc một DB transaction, có **idempotency key** cho thao tác nhạy cảm và xử lý conflict/retry giới hạn.
5. `workspaceId` được lấy từ quyền của session ở server; tuyệt đối không tin scope do client khai báo nếu chưa xác minh membership.
6. Dùng múi giờ người dùng mặc định `Asia/Ho_Chi_Minh`; khoảng báo cáo `[start, end)`; ngày giao dịch (`occurredAt`) và thời điểm ghi sổ (`postedAt`) là hai thông tin khác nhau.
7. `archived`, `deleted` không đồng nghĩa xóa lịch sử tài chính; sửa/xóa nghiệp vụ tạo bút toán đảo/điều chỉnh để có audit trail.
8. Đầu ra report phải dẫn tới tập giao dịch tương ứng, không tính mỗi chart bằng quy tắc lọc khác nhau.

## 3. KIẾN TRÚC LOGIC

```mermaid
flowchart TB
    U[Trình duyệt / PWA] --> UI[Next.js UI / Components]
    UI --> AUTH[Better Auth / Google OIDC]
    UI --> API[Route Handlers / Server Actions]
    API --> GATE[Session + Authorization + Zod]
    GATE --> SVC[Business Services]
    SVC --> FIN[Ledger / Financial Rules]
    SVC --> REP[Reporting & Aggregation]
    SVC --> DB[(PostgreSQL)]
    FIN --> DB
    REP --> DB
    JOB[Scheduler / Worker] --> GATE2[Service Authorization / Job Identity]
    GATE2 --> SVC
    API --> EXP[Export CSV / XLSX / PDF]
    EXP --> REP
```

### 3.1. Cấu trúc repository đích

```text
src/
  app/
    (public)/login/page.tsx
    (protected)/dashboard/page.tsx
    (protected)/transactions/page.tsx
    (protected)/wallets/page.tsx
    (protected)/budgets/page.tsx
    (protected)/reports/page.tsx
    (protected)/goals/page.tsx
    (protected)/debts/page.tsx
    (protected)/recurring/page.tsx
    (protected)/settings/page.tsx
    api/auth/[...all]/route.ts
    api/v1/.../route.ts
  components/
    ui/ charts/ dashboard/ transactions/ wallets/ reports/ forms/
  features/
    auth/ wallets/ categories/ transactions/ ledger/
    budgets/ goals/ debts/ recurring/ reports/ import-export/
  server/
    auth/ access/ repositories/ services/ queries/ jobs/
  lib/
    db.ts decimal.ts money.ts date-range.ts errors.ts audit.ts
  schemas/
  styles/
prisma/
  schema.prisma
  migrations/
  seed.ts
scripts/
  reconcile-ledger.ts seed-demo.ts backup.sh restore.sh
public/
  icons/ manifest.webmanifest
playwright/
tests/
  unit/ integration/ e2e/ security/ performance/
docs/
  PRD.md ARCHITECTURE.md ERD.md FINANCIAL_RULES.md
  REPORT_DEFINITIONS.md API_CONTRACT.md IMPLEMENTATION_PLAN.md
  GOOGLE_OAUTH_SETUP.md SECURITY.md DEPLOYMENT.md TEST_REPORT.md ADR/
.env.example
Dockerfile
compose.yaml
README.md
```

### 3.2. Nguyên tắc phân lớp

`route handler → authentication & scope check → request DTO/Zod → application service → domain financial rule → repository/ledger → response DTO`. UI **không** tự tính số dư kế toán bằng cách cộng các records đang hiển thị (vì có phân trang); API report **không** truy vấn dữ liệu nằm ngoài workspace. Sử dụng transactions để bảo đảm toàn vẹn, và DTO để không lộ các cột nhạy cảm.

---

# PHẦN II. THIẾT KẾ NGHIỆP VỤ VÀ DỮ LIỆU

## 4. QUY TẮC TÀI CHÍNH — PHẢI CÓ UNIT TEST TRƯỚC KHI LÀM DASHBOARD

### 4.1. Tài khoản kế toán trong sổ cái

| Account kind | Ví dụ | Bên tăng | Vai trò trong báo cáo |
|---|---|---|---|
| `ASSET` | Tiền mặt, ngân hàng, tiền gửi | Debit | Số dư tiền/tài sản |
| `LIABILITY` | Dư nợ thẻ, nợ vay | Credit | Nợ phải trả |
| `INCOME` | Lương, thưởng, quà tặng | Credit | Tổng thu nhập |
| `EXPENSE` | Ăn uống, điện nước, lãi vay | Debit | Tổng chi phí |
| `EQUITY` | Số dư đầu kỳ, điều chỉnh vốn | Credit | Đối ứng số dư ban đầu |
| `RECEIVABLE` | Tiền đã cho người khác vay | Debit | Tài sản phải thu |
| `FX_CLEARING` | Chuyển đổi tiền tệ khi được bật | Theo giao dịch | Chỉ áp dụng sau ADR đa tiền tệ |

> `Debit/Credit` là thuật ngữ kế toán nội bộ, không phải số tiền đi vào/đi ra trên UI. Report hiển thị số dương theo `normal balance` và áp dụng chính sách hoàn tiền/điều chỉnh.

### 4.2. Ma trận bút toán chuẩn

| Nghiệp vụ | Debit | Credit | Tổng thu | Tổng chi |
|---|---|---|---|---|
| Số dư ví đầu kỳ | Asset Wallet | Opening Equity | Không | Không |
| Thu lương 15.000.000 | Asset Wallet 15m | Income:Salary 15m | +15m | Không |
| Chi ăn uống 500.000 | Expense:Food 500k | Asset Wallet 500k | Không | +500k |
| Chuyển A → B 500.000 | Asset Wallet B 500k | Asset Wallet A 500k | Không | Không |
| Phí chuyển 5.000 | Expense:Fee 5k | Asset Wallet A 5k | Không | +5k |
| Hoàn chi ăn uống 100.000 | Asset Wallet 100k | Expense:Food 100k | Không | -100k chi ròng |
| Mua bằng thẻ tín dụng 1.000.000 | Expense:Shopping 1m | Liability:Card 1m | Không | +1m |
| Trả dư nợ thẻ 600.000 | Liability:Card 600k | Asset:Bank 600k | Không | Không |
| Nhận khoản vay 10.000.000 | Asset:Bank 10m | Liability:Loan 10m | Không | Không |
| Trả gốc 2m, lãi 100k | Liability:Loan 2m + Expense:Interest 100k | Asset:Bank 2.1m | Không | +100k |
| Cho người khác vay 2m | Receivable:Loan 2m | Asset:Bank 2m | Không | Không |
| Nhận hoàn gốc 2m | Asset:Bank 2m | Receivable:Loan 2m | Không | Không |
| Gửi tiền vào ví tiết kiệm | Asset:Savings | Asset:Bank | Không | Không |

**Bất biến:**

- Mỗi journal phải có **ít nhất hai postings**, tổng debit = tổng credit **theo cùng loại tiền**, tài khoản hợp lệ, không tạo journal một phía.
- Số dư ví = opening journal + tổng postings điều chỉnh đã ghi sổ (không tính `draft`/`pending`).
- Số dư của tài khoản tài sản = Debit − Credit; nợ phải trả = Credit − Debit.
- `Thu nhập` và `Chi phí` lấy từ account `INCOME`/`EXPENSE`, không suy ra đơn giản từ `wallet delta`.
- Hoàn tiền chỉ ghi đảo vào đúng nhóm chi gốc và liên kết `originalTransactionId`; các dashboard đều dùng chi **ròng** và có thể xem gross/refund nếu yêu cầu.
- Các thay đổi `edit`, `delete`, `undo` phải có **reversal journal** liên kết journal trước và ghi journal thay thế khi cần; không sửa trực tiếp postings đã posted.
- `occurredAt` của reversal sửa sai được gán **effective time của giao dịch gốc** để báo cáo hồi tố phản ánh trạng thái đúng; `createdAt`/`postedAt` giữ thời điểm thao tác để kiểm toán. Cần ADR nếu sau này có khóa sổ/closing period.
- Khi quy đổi ngoại tệ, journal vẫn phải cân theo từng currency, có tài khoản trung gian FX và snapshot tỷ giá; chưa có khả năng này thì chặn chuyển tiền chéo loại tiền.

### 4.3. Số dư, tài sản ròng và ngân sách

```text
OpeningBalance(wallet) = giá trị các opening journals ở ngày gốc
Balance(wallet, t)    = SUM(normalized asset postings with occurredAt < t)
TotalIncome(period)   = SUM(net posted INCOME accounts in [start, end))
TotalExpense(period)  = SUM(net posted EXPENSE accounts in [start, end))
Surplus(period)       = TotalIncome - TotalExpense
SavingRate(period)    = Surplus / Income * 100% khi Income > 0; ngược lại N/A
BudgetUsed            = Net eligible expenses / BudgetLimit * 100%
NetWorth(t)           = Eligible assets(t) + Receivables(t) - Liabilities(t)
CreditAvailable       = CreditLimit - CardOutstanding
```

**Diễn giải quan trọng:** Thặng dư thu–chi **không nhất thiết bằng biến động tiền**: khoản vay, trả gốc, chuyển giữa tài khoản, điều chỉnh đầu kỳ làm số dư thay đổi mà không phải thu nhập/chi phí. Báo cáo cash reconciliation dùng **postings tài sản** trong phạm vi ví đã chọn; chuyển nội bộ hai ví cùng phạm vi triệt tiêu, nhưng chuyển từ ví được chọn sang ví không chọn sẽ làm tiền trong phạm vi giảm **mà không biến thành chi phí**.

### 4.4. Số liệu thời gian và lọc

- Giao dịch lưu timestamp UTC; khi chọn `01/10–31/10` theo VN, server chuyển thành khoảng UTC `[2026-10-01T00:00:00+07:00, 2026-11-01T00:00:00+07:00)` và truy vấn `>= start AND < end`.
- So sánh kỳ trước cùng số ngày thực tế hoặc kỳ lịch tương ứng **theo lựa chọn UI**; ghi rõ loại comparison. Trường hợp previous = 0 hiển thị `Mới phát sinh/N/A`, không chia 0.
- Tổng tiền và số lượt giao dịch được trả từ server theo cùng bộ filter; khi click một point, drill-down phải tái sử dụng filter đó, **không lấy mốc ngày theo UTC trên client**.
- Tiền hiển thị `Intl.NumberFormat('vi-VN')`; không biến tiền từ Decimal về floating-point để cộng trừ. JSON serialize số tiền dạng string.
- Tổng các danh mục con, top-N + `Khác`, và tổng chi KPI phải cùng nhau bằng **chi ròng đủ điều kiện**; giải thích chính sách xử lý tổng âm do refund vượt chi trong kỳ (giữ giá trị chi ròng và cảnh báo, không âm thầm cắt về 0).

## 5. DATA MODEL / ERD THIẾT KẾ

```mermaid
erDiagram
  USER ||--o{ SESSION : has
  USER ||--o{ MEMBERSHIP : belongs
  WORKSPACE ||--o{ MEMBERSHIP : contains
  WORKSPACE ||--o{ WALLET : owns
  WORKSPACE ||--o{ CATEGORY : owns
  WORKSPACE ||--o{ TRANSACTION : owns
  WORKSPACE ||--o{ JOURNAL : owns
  TRANSACTION ||--o{ JOURNAL : posts
  JOURNAL ||--|{ POSTING : entries
  LEDGER_ACCOUNT ||--o{ POSTING : posted_to
  WALLET ||--|| LEDGER_ACCOUNT : asset_account
  WORKSPACE ||--o{ BUDGET : contains
  WORKSPACE ||--o{ GOAL : contains
  WORKSPACE ||--o{ DEBT : contains
  WORKSPACE ||--o{ RECURRING_RULE : contains
  RECURRING_RULE ||--o{ RECURRING_OCCURRENCE : generates
  WORKSPACE ||--o{ AUDIT_LOG : records
```

### 5.1. Bảng, trường trọng yếu, constraints

| Entity | Cột chính (minh họa, chưa phải SQL đầy đủ) | Index/Constraint |
|---|---|---|
| Auth `user/account/session/verification` | Các bảng do Better Auth quản lý | Không tự sửa cấu trúc nếu chưa xem adapter docs |
| `user_preferences` | userId, baseCurrency, timezone, locale, theme, budgetStartDay | UNIQUE(userId) |
| `workspaces` | id, name, type, currency, createdBy | FK creator |
| `memberships` | userId, workspaceId, role, status | UNIQUE(userId,workspaceId) |
| `wallets` | id, workspaceId, name, type, currency, ledgerAccountId, includeInAvailable, archivedAt | INDEX(workspaceId,type); UNIQUE(ledgerAccountId) |
| `categories` | id, workspaceId, parentId, kind, name, icon, color, archivedAt | FK parent + workspace consistency; prevent cycles |
| `ledger_accounts` | id, workspaceId, walletId?, kind, normalSide, currency, code | UNIQUE(workspaceId,code) |
| `transactions` | id, workspaceId, kind, categoryId?, amount, currency, occurredAt, status, merchant?, note?, originalTransactionId?, createdBy | INDEX(workspaceId,occurredAt DESC,id); FK category scoped |
| `journals` | id, workspaceId, transactionId, sequence, status, effectiveAt, postedAt, reversedJournalId?, idempotencyKey? | UNIQUE(workspaceId,idempotencyKey) khi non-null; prevent double reversal |
| `postings` | id, journalId, ledgerAccountId, side, amount, currency | CHECK(amount > 0), FK journal, account, currency scope |
| `tags`/`transaction_tags` | workspaceId, tagId, transactionId | UNIQUE(transactionId,tagId) |
| `budgets` | id, workspaceId, limitAmount, currency, startAt, endAt, scope, rolloverPolicy | CHECK(limit>0), end>start |
| `budget_categories` | budgetId, categoryId | UNIQUE(budgetId,categoryId) |
| `budget_alerts` | budgetId, periodKey, threshold, deliveredAt | UNIQUE(budgetId,periodKey,threshold) |
| `goals` | id, workspaceId, targetAmount, dueAt, state, name, linkedWalletId? | FK workspace, amount>0 |
| `goal_allocations` | id, goalId, transactionId?, allocatedAmount, happenedAt | Idempotency key; không cộng hai lần với ví |
| `debts` | id, workspaceId, kind, counterparty, principal, rate, rateBasis, dueAt, ledgerAccountId | FK scoped account |
| `debt_events` | id, debtId, transactionId, type, principalPart, interestPart | CHECK(principalPart>=0 etc.) |
| `card_statements` | id, cardWalletId, cycleStart, cycleEnd, dueAt, statementAmount | UNIQUE(cardWalletId,cycleStart) |
| `recurring_rules` | id, workspaceId, rrule, nextRunAt, mode, templateJson, enabled | INDEX(nextRunAt,enabled) |
| `recurring_occurrences` | id, ruleId, occurrenceKey, status, createdTransactionId? | UNIQUE(ruleId,occurrenceKey) |
| `notifications` | id, workspaceId, userId, eventKey, type, readAt | UNIQUE(eventKey,userId) |
| `audit_logs` | id, workspaceId, actorId, action, objectType, objectId, beforeHash, afterHash, occurredAt | Append-only; INDEX(workspaceId,occurredAt) |
| `import_jobs` | id, workspaceId, hash, mappingJson, status, processedCount, errorCount | Scoped and idempotent |

**DB checklist:**

- [ ] FK chặt chẽ, unique idempotency, trường không âm/phạm vi hợp lệ.
- [ ] Enforce workspace scope ở **service**; với quan hệ cross-table cần kiểm tra workspace owner để chống gán category/wallet của người khác.
- [ ] Tạo index tổng hợp `(workspaceId, occurredAt, id)` và index cho category/wallet + báo cáo.
- [ ] Migration rollback strategy và backup trước migration không đảo ngược được.
- [ ] Seed danh mục mặc định cho workspace mới; **không seed demo transactions cho tài khoản thực**.
- [ ] Audit ledger balance bằng DB-level check/trigger hoặc một **posting service** được khóa quyền và test, bảo đảm không có đường ghi bypass.

### 5.2. Giao dịch cập nhật/sửa/xóa

1. Kiểm tra session → membership → ownership `transactionId` trong cùng workspace.
2. Validate input, chính sách ledger, danh mục, ví, currency và số tiền.
3. Tạo mutation record với `idempotencyKey`; kiểm tra key cũ để trả kết quả cũ nếu retry.
4. Khóa row/transaction phù hợp; thực hiện **cùng một DB transaction**: đảo journal trước (khi sửa), tạo transaction state mới, tạo journal/postings mới, audit log, outbox event nếu có.
5. Validate cân bút toán trước commit; abort toàn bộ nếu không đạt.
6. Sau commit invalidation cache dashboard/budget theo workspace và affected dates; phản hồi DTO + phiên bản thực thể.
7. Nếu request đồng thời, dùng optimistic concurrency (`version`) hoặc serializable transaction có retry giới hạn; không tạo double posting.

### 5.3. Kịch bản đặc biệt cần ADR riêng

- **Opening balance:** nhập số dư tạo journal tài sản ↔ equity; chỉnh sửa số dư đầu kỳ bằng reversible adjustment, không sửa trực tiếp asset cache.
- **Archive wallet:** không cho tạo giao dịch mới; giao dịch cũ và báo cáo lịch sử vẫn còn.
- **Refund:** có `originalTransactionId`, không vượt mức hoàn còn lại **trừ khi policy cho phép, lúc đó cảnh báo/approval**.
- **Credit card:** ví thẻ map với liability account, hạn mức tín dụng **không phải tài sản**. Khi tạo thẻ có dư nợ đầu kỳ: liability ↔ equity theo đúng bên.
- **Loan:** theo dõi người vay và người cho vay; trả lãi là expense hoặc income, trả gốc là balance sheet movement.
- **Savings goal:** đóng góp ưu tiên tạo **allocation** ràng buộc vào ví thực (memo earmarking) hoặc chuyển sang ví tiết kiệm thật; một phương án được chọn trong ADR để không tăng tài sản ảo.
- **Multi-currency:** V1.1 thiết kế journal cân trong từng currency với clearing accounts; thống nhất lưu base-value/reporting-value theo tỷ giá snapshot và kiểm thử gain/loss. MVP phải **chặn các luồng chưa hỗ trợ** thay vì cộng số tiền sai.

---

# PHẦN III. THIẾT KẾ GIAO DIỆN, API VÀ REPORTING

## 6. SƠ ĐỒ MÀN HÌNH VÀ HÀNH TRÌNH NGƯỜI DÙNG

```mermaid
flowchart LR
  L[Đăng nhập Google] --> O[Onboarding]
  O --> D[Dashboard]
  D --> T[Giao dịch]
  D --> W[Ví]
  D --> B[Ngân sách]
  D --> R[Báo cáo]
  D --> G[Mục tiêu]
  D --> N[Vay nợ / Thẻ]
  D --> Q[Định kỳ]
  D --> S[Cài đặt]
  R -->|Drill-down với bộ lọc| T
  B -->|Xem các khoản vượt| T
  W -->|Xem lịch sử ví| T
```

### 6.1. Các trang và thành phần

| Trang/Route | Thành phần quan trọng | Trạng thái kiểm thử |
|---|---|---|
| `/login` | CTA Google; login error; loading | callback, cancel, no env |
| `/onboarding` | Stepper: profile → ví → category/budget tùy chọn | resume khi reload, không nhân đôi |
| `/dashboard` | Date toolbar, filter ví, 8 KPI, 5 chart MVP, hoạt động gần đây | empty/1/10k transactions |
| `/transactions` | Tabs thu/chi/chuyển, table timeline, search/filter, quick-add | edit/delete/refund/pagination |
| `/wallets` | Wallet cards, balance, create, archive, transfer | tất cả money flow |
| `/budgets` | Tổng hạn mức, category bars, alerts, drill-down | 80/100/>100% |
| `/reports` | 8 report tabs, date compare, chart + data table, export | totals match |
| `/goals` | Progress, contributions, remaining/forecast | no double counting |
| `/debts` | Loans, cards, schedule, payment dialog | gốc/lãi/thẻ |
| `/recurring` | Rule CRUD, upcoming, confirm/skip occurrences | idempotent |
| `/settings` | Hồ sơ, danh mục, dữ liệu, privacy, xóa tài khoản | confirmation/access |

### 6.2. Quy chuẩn UI/UX

- **Desktop:** sidebar thống nhất; header global filters; KPI responsive 4 cột × 2 hàng hoặc 4–6 KPI tùy độ rộng; chart 2 cột; bảng xem đầy đủ.
- **Mobile:** navigation cuối màn hình, FAB `+`, form thu chi trong sheet, tối thiểu 360px; chart tối ưu scroll/tooltip cho touch.
- **Thiết kế:** nền sáng mặc định, dark mode thực sự; tiếng Việt, Be Vietnam Pro; thu nhập xanh lá, chi phí đỏ **kèm ký hiệu/nhãn**, tránh chỉ dựa màu.
- **Biểu đồ:** title, đơn vị, period, legend, tooltip, click-to-filter, dữ liệu rỗng, skeleton, error/retry, bàn phím và bảng dữ liệu thay thế.
- **Giao dịch:** nhập nhanh dưới 5 bước tương tác thông thường; submit xong có toast, refresh đúng KPI/ledger, chống double click.
- **Privacy:** tùy chọn ẩn số tiền trên màn hình; không đưa dữ liệu nhạy cảm vào error tracking/browser analytics.

## 7. API CONTRACT MẶC ĐỊNH

Định dạng phản hồi thành công:

```json
{
  "data": {},
  "meta": { "requestId": "uuid", "currency": "VND", "timezone": "Asia/Ho_Chi_Minh" }
}
```

Định dạng lỗi:

```json
{
  "error": { "code": "VALIDATION_ERROR", "message": "Dữ liệu không hợp lệ", "details": [] },
  "requestId": "uuid"
}
```

**Quy tắc:** `401` chưa đăng nhập, `403` không đủ quyền, `404` tài nguyên không thuộc scope (không lộ danh tính tài nguyên người khác), `409` conflict/idempotency, `422` nghiệp vụ không hợp lệ, `429` rate limit. Request mutate có CSRF handling phù hợp, `Idempotency-Key` với nghiệp vụ ledger/recurring/import, có correlation/request ID; `amount` luôn là **string**.

| Method | Endpoint | Mô tả | Phase |
|---|---|---|---|
| Auth | `/api/auth/[...all]` | Better Auth route | P1 |
| GET/PATCH | `/api/v1/me`, `/api/v1/preferences` | Hồ sơ/cài đặt | P1 |
| GET/POST | `/api/v1/wallets` | Danh sách/tạo ví | P2 |
| GET/PATCH | `/api/v1/wallets/:id` | Chi tiết/sửa/archive | P2 |
| GET/POST | `/api/v1/categories` | Danh mục phân cấp | P2 |
| GET/POST | `/api/v1/transactions` | Giao dịch filter/search/create | P2 |
| GET/PATCH/DELETE | `/api/v1/transactions/:id` | Chi tiết/sửa/soft delete | P2 |
| POST | `/api/v1/transfers` | Chuyển giữa ví | P2 |
| POST | `/api/v1/transactions/:id/refunds` | Hoàn tiền | P2 |
| GET | `/api/v1/wallets/:id/balance` | Số dư từ ledger | P2 |
| GET | `/api/v1/reports/overview` | KPI dashboard | P3 |
| GET | `/api/v1/reports/income-expense-series` | Thu–chi theo thời gian | P3 |
| GET | `/api/v1/reports/cashflow-series` | Xu hướng dòng tiền | P3 |
| GET | `/api/v1/reports/category-breakdown` | Chi phí theo danh mục | P3 |
| GET | `/api/v1/reports/top-transactions` | Chi lớn nhất | P3 |
| GET/POST/PATCH | `/api/v1/budgets[/:id]` | Ngân sách | P4 |
| GET | `/api/v1/reports/budget-performance` | Tiến độ ngân sách | P4 |
| GET | `/api/v1/reports/heatmap` | Calendar heatmap | P4 |
| GET | `/api/v1/reports/trends` | 6–12 tháng | P4 |
| GET | `/api/v1/reports/net-worth` | Tài sản ròng | P5 |
| GET/POST/PATCH | `/api/v1/goals[/:id]` | Mục tiêu | P5 |
| POST | `/api/v1/goals/:id/allocations` | Nạp/rút mục tiêu | P5 |
| GET/POST/PATCH | `/api/v1/debts[/:id]` | Vay và cho vay | P5 |
| POST | `/api/v1/debts/:id/payments` | Trả gốc/lãi | P5 |
| POST | `/api/v1/cards/:id/payments` | Thanh toán thẻ | P5 |
| GET/POST/PATCH | `/api/v1/recurring[/:id]` | Lịch định kỳ | P6 |
| POST | `/api/v1/recurring/:id/confirm` | Xác nhận kỳ dự kiến | P6 |
| POST | `/api/v1/imports/preview` | Xem trước file | P6 |
| POST | `/api/v1/imports/commit` | Ghi nhận có kiểm soát | P6 |
| GET | `/api/v1/exports/transactions.csv` | Export CSV | P4/P6 |
| POST | `/api/v1/exports/reports` | Excel/PDF theo filter | P4/P6 |
| POST | `/api/v1/admin/reconcile` | **Không public**; lệnh/service quản trị có auth riêng | P7 |

**Query thống nhất:** `start=YYYY-MM-DD&endExclusive=YYYY-MM-DD&walletIds=...&categoryIds=...&tags=...&compare=previous_period&granularity=day|week|month`; đối với period tham số `endExclusive` là ngày đầu tiên không thuộc khoảng. Pagination cursor (`cursor`, `limit <= 100`), sort whitelist, đặt giới hạn date range thích hợp để tránh query nặng. Không bao giờ nhận `userId` từ URL để xác thực người gọi.

### 7.1. Ví dụ request tạo chi tiêu

```json
{
  "kind": "expense",
  "walletId": "wallet-id",
  "categoryId": "category-food-id",
  "amount": "250000",
  "currency": "VND",
  "occurredAt": "2026-10-19T12:00:00+07:00",
  "note": "Ăn trưa"
}
```

Server nhận → xác thực → xác minh ví/category trong workspace → Decimal validate → ghi journal hai postings → commit → invalidation report; **không cho client gửi tài khoản ledger tùy ý**.

## 8. THIẾT KẾ DASHBOARD VÀ REPORT — ĐẶC TẢ THI CÔNG

### 8.1. Bộ lọc dùng chung

- Kỳ nhanh: hôm nay, 7 ngày, 30 ngày, tháng này, tháng trước, quý, năm, tùy chọn; so sánh kỳ trước.
- Ví: tất cả hoặc multi-select; danh mục/tag loại giao dịch; lưu filter lên URL; mỗi KPI/chart dùng filter chuẩn hóa cùng chỗ.
- Chart click → `/transactions?start=...&endExclusive=...&walletIds=...&categoryIds=...` để drill-down có thể đối chiếu.
- Chính sách cache: query key bao gồm workspace, date range, currency, walletIds, categoryIds, tagIds; invalidate theo ảnh hưởng của mutation. Không cache global có thể gây lọt dữ liệu giữa user.

### 8.2. Data contracts và các visualizations

| Mã | Visualization / DTO | Logic chính | Interaction | Phase |
|---|---|---|---|---|
| KPI-01 | Thu nhập | Tổng net INCOME | Xem danh sách thu | P3 |
| KPI-02 | Chi tiêu | Tổng net EXPENSE | Xem danh sách chi/refund | P3 |
| KPI-03 | Thặng dư | Income − Expense | Tooltip công thức | P3 |
| KPI-04 | Tỷ lệ tiết kiệm | surplus/income nếu income>0 | N/A khi không xác định | P3 |
| KPI-05 | Tiền khả dụng | Sum eligible asset wallet balances tại ngày kết thúc | Xem theo ví | P3 |
| KPI-06 | Tài sản ròng | Assets + receivable − liabilities | Chọn phạm vi tài sản | P5 |
| KPI-07 | Ngân sách sử dụng | net expenses covered by budget / limit | Xem chi vượt | P4 |
| KPI-08 | Chi bình quân/ngày | net expense / số ngày trôi qua trong kỳ được chọn | Tooltip mẫu số | P3 |
| CH-01 | Thu vs Chi: grouped bar | Group interval, two series | Click cột/series | P3 |
| CH-02 | Dòng tiền/thặng dư: line/area | Net income − expense theo từng bucket | Toggle series & range | P3 |
| CH-03 | Donut cơ cấu chi | Category hierarchy, % và amount | Click phần bánh → transaction | P3 |
| CH-04 | Thanh số dư từng ví | Ledger balance per wallet | Click ví | P3 |
| CH-05 | Top 10 khoản chi | Top posted expenses by amount | Xem giao dịch | P3 |
| CH-06 | Heatmap chi tiêu | Tổng chi ròng/ngày địa phương | Hover/click ngày | P4 |
| CH-07 | Budget progress/bullet | Actual vs planned theo category | Drill-down | P4 |
| CH-08 | Xu hướng 6–12 tháng | income/expense/surplus series | Period switch | P4 |
| CH-09 | Goal progress | Savings allocated / target | Vào chi tiết goal | P5 |
| CH-10 | Debt/cards due | Outstanding/next repayment | Xem lịch và trả nợ | P5 |
| CH-11 | Waterfall số dư | Opening + wallet inflows/outflows = closing | Giải thích từng nhóm biến động | P8 |
| CH-12 | Treemap/Sankey | Distribution of eligible category spend | Tương tác filter | P8 |

### 8.3. Quy tắc KPI/nguyên tắc reconciliation

- `sum(categoryNetExpense) == expenseKpi` khi cùng report scope; nhóm `Khác` vẫn chứa đủ giao dịch.
- `total wallet balance` không cộng credit limit, không trừ nợ hai lần; `net worth` tính liabilities riêng.
- `cash movement != income-expense surplus` khi có loan principal/transfer phạm vi hẹp; cung cấp report **điều hòa biến động số dư**:

```text
Opening scoped wallet balance
+ Asset inflows from income/refund/loan/transfer-in/adjustments
- Asset outflows from expense/loan principal/transfer-out/adjustments
= Closing scoped wallet balance
```

- `expense chart` cho giao dịch bằng thẻ ghi nhận chi phí tại **ngày quẹt**, không tại ngày thanh toán dư nợ; trả thẻ chỉ ảnh hưởng ví ngân hàng và liability.
- `savings` là surplus kinh tế theo định nghĩa, không đồng nghĩa chuyển sang tài khoản tiết kiệm; card giải thích tránh hiểu nhầm.
- Chart axes và tooltip có đơn vị `₫`, giá trị lớn viết tắt nhưng hover hiển thị đầy đủ.

### 8.4. Các trang báo cáo chuyên sâu cần hoàn tất trong P4/P5

1. **Thu–chi:** category/source/time, kỳ so sánh; table breakdown + click-through.
2. **Dòng tiền và số dư:** per-wallet và toàn workspace, opening/closing reconciliation.
3. **Ngân sách:** kế hoạch–thực tế, threshold, chi ròng theo category, so sánh.
4. **Danh mục:** hierarchy, category share, top transactions, `Khác` mở được.
5. **Thời gian:** weekday/week/month, heatmap, ngày nhiều chi.
6. **Tài sản và công nợ:** phân bổ tài sản/nợ, net worth, dữ liệu giá trị tự nhập được gắn nhãn.
7. **Tiết kiệm:** goals, còn thiếu, tỷ lệ hoàn thành, mức cần góp mỗi kỳ.
8. **Vay nợ/thẻ:** dư gốc, lịch trả, lãi thực tế, sao kê và upcoming dues.

### 8.5. Export

- CSV: UTF-8 BOM và escape injection khi ô bắt đầu `=`, `+`, `-`, `@`; chỉ xuất cột đã quy định và trong workspace.
- XLSX: sheets `Tổng quan`, `Thu chi`, `Theo danh mục`, `Giao dịch chi tiết`, `Định nghĩa chỉ số`; số tiền nên là numeric cell xuất từ Decimal đúng quy tắc (không mất độ chính xác trong dải được hỗ trợ) hoặc text khi vượt dải an toàn.
- PDF: header tài khoản/tên báo cáo, ngày kết xuất, filter, KPI, biểu đồ/bảng, footer trang; font hiển thị tiếng Việt, kiểm tra A4 và bảng dài.
- Export dùng cùng reporting service với màn hình, đối chiếu tổng tiền tự động. File xuất không chứa secret, token, thông tin người dùng khác.

---

# PHẦN IV. WORK BREAKDOWN STRUCTURE — CÁC PHASE TRIỂN KHAI

## 9. TỔNG THỂ LỘ TRÌNH

| Phase | Mục tiêu | Thời lượng dự kiến* | Phụ thuộc | Gate |
|---|---|---:|---|---|
| **P0** | Khảo sát, PRD, ADR, ERD, kiến trúc | 3–5 ngày làm việc | Repo/access | G0 |
| **P1** | Foundation + Google Auth + onboarding | 5–8 ngày | P0 | G1 |
| **P2** | Ledger + ví + category + transaction | 10–15 ngày | P1 | G2 |
| **P3** | Dashboard thật + drill-down + báo cáo MVP | 7–10 ngày | P2 | **G3: MVP** |
| **P4** | Ngân sách + báo cáo chuyên sâu + export | 8–12 ngày | P3 | G4 |
| **P5** | Mục tiêu + vay nợ + thẻ tín dụng | 10–15 ngày | P2/P4 | G5 |
| **P6** | Recurring + import + notification + PWA | 7–12 ngày | P3/P5 | G6: V1 |
| **P7** | Bảo mật, test, performance, triển khai | 7–12 ngày | P0–P6 | G7: Production |
| **P8** | Đa tiền tệ/family/advanced BI (optional) | Phụ thuộc phạm vi | P7 | G8: V2 |

\* Phương án **một lập trình viên full-stack có kinh nghiệm sử dụng coding agent**, các hạng mục có thể song song nếu tăng nhân sự. Không đưa P8 vào cam kết phát hành V1. Không dùng mốc ngày tuyệt đối trước khi khảo sát repo.

## 10. P0 — KHẢO SÁT, CHỐT TÀI LIỆU VÀ KỊCH BẢN NGHIỆP VỤ

**Đầu vào:** Master Prompt, repository (nếu có), yêu cầu Google Login + báo cáo chi tiết.  
**Đầu ra:** Tài liệu được liên kết với backlog, ADR và data model trước khi thay đổi code lõi.

- [x] **T00.01 — Inventory repository:** liệt kê framework, scripts, DB, auth, packages, migrations, CI, docker, component conventions; không ghi đè code có sẵn.
- [x] **T00.02 — Gap analysis:** so sánh Master Prompt với tính năng hiện tại; `docs/GAP_ANALYSIS.md` có `existing/missing/risk/dependency`.
- [x] **T00.03 — PRD & user stories:** `docs/PRD.md` đã có persona, 3 hành trình, phạm vi/non-goals, 10 user story IDs và mapping AT-01–18 (21/10/2026).
- [x] **T00.04 — ADR tài chính:** decimal strategy, double-entry ledger, correction model, VND MVP, date/time, wallet/credit card boundaries.
- [x] **T00.05 — ADR hạ tầng:** `docs/ADR/0006-stack-runtime-and-release.md` xác định stack/version, session, jobs, Compose/migration, backup/rollback và các quyết định hosting còn mở; accepted cho local, staging phải duyệt riêng (21/10/2026).
- [x] **T00.06 — ERD + schema outline:** mô tả quan hệ, unique/FK/index, transactions; vẽ ERD Mermaid và mô tả mở rộng family/multi-currency.
- [x] **T00.07 — API contract:** naming, input/output decimal string, pagination, errors, authorization, idempotency.
- [x] **T00.08 — Reporting spec:** mỗi KPI/chart định nghĩa toán học, source ledger, filter, timezone, drilldown, negative/zero cases.
- [x] **T00.09 — UX wireframe:** layout desktop/mobile, login, onboarding, ví, giao dịch, dashboard, reports.
- [x] **T00.10 — Test plan & fixtures:** `docs/TEST_PLAN.md` có AT-01–18, fixture policy, mapping và ma trận invariant; `tests/unit/ledger.test.ts` có 512 kịch bản seeded/reversal/JSON chạy PASS local (21/10/2026). Các ca AT cần môi trường thực vẫn mở.
- [x] **T00.11 — Plan & dependency graph:** ghi backlog theo thứ tự thực hiện; quyết định MVP release boundary.

**Nghiệm thu G0:**

- [x] Các tài liệu `PRD`, `ARCHITECTURE`, `ERD`, `FINANCIAL_RULES`, `REPORT_DEFINITIONS`, `API_CONTRACT`, `IMPLEMENTATION_PLAN` có trong `docs/` và được đối chiếu nội dung cốt lõi (21/10/2026).
- [ ] 100% chỉ số bắt buộc có công thức; các tình huống loan/card/transfer/refund có ví dụ debit/credit.
- [ ] Không còn mâu thuẫn quan trọng chưa giải quyết về money precision, base currency, date filter, ownership.

## 11. P1 — NỀN TẢNG, AUTH, WORKSPACE VÀ ONBOARDING

**Dependency:** G0. **Yêu cầu quan trọng:** login Google phải hoạt động thực khi có credentials; không tạo nút login giả.

### 11.1. Khởi tạo hệ thống

- [ ] **T01.01 — Bootstrap project:** Next.js App Router, TypeScript strict, `src/`, alias, lint/formatter.
- [ ] **T01.02 — UI foundations:** Tailwind, shadcn/ui, Be Vietnam Pro, theme light/dark, design tokens, iconography; tiếng Việt đúng.
- [ ] **T01.03 — App shell:** sidebar desktop, mobile bottom nav, topbar, skeleton, error boundary, toaster, confirm dialog.
- [x] **T01.04 — Docker local:** Postgres, service web, healthcheck, volume; `.env.example`; scripts setup.
- [x] **T01.05 — DB & migrations:** Prisma schema auth/workspace/preferences, migration, seeding danh mục template nếu đã có schema.
- [x] **T01.06 — CI baseline:** lint + typecheck + unit test + build pipeline.

### 11.2. Google OAuth 2.0 / OIDC

- [x] **T01.07 — Better Auth setup:** auth instance, database adapter, google provider, auth route.
- [x] **T01.08 — Google Cloud setup guide:** OAuth Web Client, authorized redirect URIs, consent, test users; ghi chính xác `http://localhost:3000/api/auth/callback/google` và production `${BASE_URL}/api/auth/callback/google` khi base path mặc định.
- [ ] **T01.09 — Auth screens:** Google sign-in, loading/error/cancel, logout, expired session, forbidden.
- [x] **T01.10 — Server-side guards:** verify session ở DAL/server, auth guard trên từng route/action, policy 401/403/404.
- [x] **T01.11 — First login lifecycle:** workspace cá nhân, default preferences, category system copy/idempotent bootstrap; không tự tạo giao dịch/số dư giả.
- [ ] **T01.12 — Security checks:** HttpOnly cookie, Secure HTTPS, SameSite/CSRF thích hợp, OAuth state/PKCE theo thư viện; secrets không nằm client.

### 11.3. Onboarding và profile

- [ ] **T01.13 — Onboarding wizard:** tên, currency VND, timezone `Asia/Ho_Chi_Minh`, ví đầu tiên, opening balance.
- [ ] **T01.14 — Onboarding resume:** reload, back/forward, không tạo nhiều workspace/ví do submit hai lần.
- [ ] **T01.15 — Profile/settings:** avatar, nickname, locale, theme, ngày bắt đầu ngân sách.
- [ ] **T01.16 — Automated auth tests:** user session, created workspace, scope guards, logout; fake OAuth chỉ ở test automation, không giả tính năng trong runtime.

**Nghiệm thu G1:** đăng nhập thật với Google trên local/staging sau cấu hình; người dùng mới có workspace riêng; người không login không đọc được endpoint; giao diện đủ responsive; CI baseline xanh. **Nếu chưa có Google Client ID/Secret:** chỉ đánh dấu `code-complete, pending external credentials`, không ghi “Google Login đã xác nhận hoạt động”.

## 12. P2 — FINANCIAL CORE: VÍ, DANH MỤC, TRANSACTION VÀ LEDGER

**Dependency:** G1. **Không triển khai dashboard với data mock trước khi xong P2.**

### 12.1. Engine và data constraints

- [x] **T02.01 — Ledger schema:** ledger account, journal, posting, opening equity, income, expense, liability, receivable; constraints.
- [x] **T02.02 — Money/domain utils:** Decimal, sign normalization, VND integer validation, serialize string, formatted number.
- [x] **T02.03 — Posting engine:** validate journal balance, journal immutability, all postings persisted atomically, service-level API.
- [x] **T02.04 — Reversal/adjustment:** edit/delete/undo journal history, audit trail, effectiveAt vs postedAt.
- [x] **T02.05 — Idempotency/concurrency:** header key, unique constraint, detect repeated submit, row/version conflict behavior, retry policy.
- [x] **T02.06 — Reconciliation CLI:** recalculates wallet balance from ledger; flags mismatched cached balances or unbalanced journals; exit non-zero on errors.

### 12.2. Danh mục và ví

- [x] **T02.07 — Categories:** seed danh mục tiếng Việt, nested tree, CRUD, archive, safe foreign keys. Unit và PostgreSQL integration xác minh cây không vòng, parent cùng workspace/kind, archive và lịch sử ledger (21/10/2026).
- [x] **T02.08 — Wallet CRUD:** cash/bank/e-wallet/savings, currency VND MVP, opening journal, archived status, cards deferred P5.
- [x] **T02.09 — Balances API + UI:** list/detail wallet, current and as-of balance, history from ledger, loading/empty/error.
- [x] **T02.10 — Transfer:** same-currency two-wallet atomic journal, optional transaction fee expense, transfer detail. PostgreSQL integration kiểm tra fee, edit, idempotency và sổ cái cân bằng (21/10/2026).
- [x] **T02.11 — Wallet reconciliation UI:** nhập số dư thực tế, ghi adjustment có reason và audit, không ghi thu nhập giả. PostgreSQL integration kiểm tra tăng/giảm/khớp số dư, stale balance, duplicate key và cross-workspace (21/10/2026).

### 12.3. Thu chi

- [x] **T02.12 — Income/Expense creation:** form nhập nhanh, amount/date/category/wallet/note/tags; validation. Integration xác nhận lưu/sửa tags và bút toán, 267 unit tests PASS (21/10/2026).
- [x] **T02.13 — Transaction list:** tìm kiếm, lọc thời gian/ví/category/kind, sort, cursor pagination, grouped date.
- [x] **T02.14 — Edit/archive/soft delete:** reverse + repost, confirm dialog, fix affected aggregates.
- [x] **T02.15 — Refund:** liên kết giao dịch gốc, partial/full refund, net expense/ledger correct.
- [x] **T02.16 — Ownership tests:** client A không dùng wallet/category/transaction của B bằng cách đổi ID trong API.
- [x] **T02.17 — Ledger financial fixture:** chạy các case opening, salary/expense, transfer, correction/refund, idempotent retry, backdate.
- [ ] **T02.18 — E2E basic flow:** login test identity → ví → chi/thu → chuyển → xem số dư → sửa/delete.

**Nghiệm thu G2:** test ví A 2m, B 1m, chuyển 500k kết quả 1.5m/1.5m; thu lương 15m, chi 500k: đúng thu/chi; sửa + hoàn tiền cập nhật ledger; mọi posting cân; user data không vượt scope; CI và migration chạy từ DB trống.

## 13. P3 — DASHBOARD THẬT, BÁO CÁO MVP, DRILL-DOWN

**Dependency:** G2. **Gate quan trọng nhất của MVP.**

- [x] **T03.01 — Reporting query foundation:** date normalization, workspace scope, wallet/category filters, Decimal aggregation, pure service test.
- [x] **T03.02 — Overview DTO:** 8 KPI (những KPI phụ thuộc P4/P5 hiển thị trạng thái “chưa cấu hình”/ẩn hợp lý, không giả số); comparison logic. Unit và PostgreSQL integration PASS; benchmark 10k dữ liệu thật trên DB cách ly PASS (21/10/2026). Chưa phải nghiệm thu SLA staging.
  - [x] **T03.02a — DTO/UI và kiểm thử logic độc lập:** 8 KPI, kỳ trước cùng số ngày lịch Việt Nam, baseline 0 trả `null`, net worth toàn workspace, ngân sách không cộng trùng, trạng thái chưa cấu hình; có unit tests và kiểm tra tĩnh 21/10/2026.
  - [x] **T03.02b — Nghiệm thu PostgreSQL & hiệu năng sau thay đổi:** financial integration PASS (72 journals cân bằng, refund/filter/budget/workspace); 13/13 migrations. Benchmark độc lập `finova_bench` 10k transactions/10k journals/20k postings PASS, concurrency 4/8/16 p95 51,64/79,82/207,03 ms và 0 request >500 ms; fixture cleanup xác minh 0 workspace/user (21/10/2026). Goals tuần tự vẫn có outlier p95 4.596,70 ms, cần theo dõi ở T07.06d; không suy diễn SLA production.
- [x] **T03.03 — Revenue/Expense bar:** daily/weekly/monthly group, compact currency, tooltip amounts.
- [x] **T03.04 — Surplus/Cashflow line:** tách excess income/expense và biến động số dư; đặt nhãn rõ.
- [x] **T03.05 — Donut category:** net category expenditure + top N + `Khác`, children, drill-down. Decimal hierarchy, hoàn tiền âm, bảng số liệu và điều hướng direct/subtree được kiểm tra unit; PostgreSQL xác nhận aggregate categories (21/10/2026).
- [x] **T03.06 — Wallet balances chart:** asset wallet balances tại cutoff, thẻ credit chưa được tính như cash.
- [x] **T03.07 — Top transactions/recent list:** navigate filtered transaction detail, no N+1.
- [x] **T03.08 — Global filters:** persisted URL, `endExclusive`, wallet multi-select, apply uniformly charts/cards.
- [ ] **T03.09 — UI interactive state:** loading, no data, permission lost, retry, mobile tooltips, chart table accessibility.
- [x] **T03.10 — Cross-component reconciliation:** tổng donut = expense KPI; chart series bucket sum = income/expense, test after mutation/refund.
- [x] **T03.11 — Performance baseline:** 10k demo transactions trong fixture cách ly, truy vấn profile và index.
- [ ] **T03.12 — E2E report:** Add/Edit/Refund transaction → KPI update → click chart → transaction list filtered accurately.

**Nghiệm thu G3 — Mốc MVP:** đăng nhập, tạo ví, ghi giao dịch, xem dashboard gồm KPI + 5 visualizations với dữ liệu thật, tương tác filter/drill-down, test cân sổ và cách ly người dùng đã đạt. Dashboard không có dữ liệu giả/ngày ảo, không Infinity/NaN.

## 14. P4 — NGÂN SÁCH, BÁO CÁO NÂNG CAO VÀ EXPORT

- [x] **T04.01 — Budgets DB & scope:** per category/group/total; kiểm tra double-count ngân sách lồng nhau.
- [x] **T04.02 — Budget UI CRUD:** hạn mức, kỳ, percentage, remaining, overview và detail.
- [x] **T04.03 — Threshold engine:** 50/80/100/>100%, event dedup theo budget/period/threshold; có trường hợp vượt do refund/đổi giao dịch.
- [x] **T04.04 — Budget reporting:** actual vs plan, trend, bộ lọc nhất quán với expense KPI.
- [x] **T04.05 — Heatmap chart:** ngày VN, local-day aggregation, tooltip, click day filter.
- [x] **T04.06 — Historical trends:** 6/12 tháng, comparison, prior zero, chuyển năm.
- [x] **T04.07 — Report tabs:** Thu–chi, Dòng tiền/Số dư, Ngân sách, Danh mục, Thời gian; export CTA.
- [x] **T04.08 — CSV export:** UTF-8 BOM, Excel-compatible, chống formula injection, exact filtered rows.
- [x] **T04.09 — XLSX export:** summary + detail + formulas dictionary; correct VND values and unicode.
- [x] **T04.10 — PDF export:** tiếng Việt, biểu đồ thanh SVG server-side có nhãn/số tiền, A4, phân trang/header/footer, generated-at/filter header; top 7 Decimal, refund âm, 42/100 danh mục và kiểm tra PNG trực quan PASS (21/10/2026).
- [x] **T04.11 — Verify export data:** số báo cáo = số Excel/PDF, chỉ data thuộc workspace, hỗ trợ file rỗng.
- [ ] **T04.12 — Report quality E2E:** category report, heatmap, compare, export, mobile.

**Nghiệm thu G4:** Ngân sách ăn uống 1m, chi 800k → 80%; thêm 300k → 110%, cảnh báo đúng; 5 report tabs đủ; CSV/XLSX/PDF tiếng Việt đúng và khớp API/UI; category totals khớp.

## 15. P5 — MỤC TIÊU, VAY NỢ, THẺ TÍN DỤNG VÀ TÀI SẢN RÒNG

### 15.1. Goals

- [x] **T05.01 — Goals model:** target, due, goal state, contribution/allocations, linked wallets.
- [x] **T05.02 — Goal UI:** create/edit/archive, progress, money remaining, projection explicitly labeled ước tính.
- [x] **T05.03 — Goal accounting:** allocate/release không tạo thu/chi; nếu chuyển ví có underlying transfer journal.
- [x] **T05.04 — Goal regression tests:** chống double-count asset/net worth; sửa/xóa contribution không lệch.

### 15.2. Debts

- [x] **T05.05 — Debt types:** borrow / lend, principal, counterparty, start, due, annual rate and method.
- [x] **T05.06 — Debt lifecycle:** disbursement, principal repayment, interest payment, loan closure, overpayment policy.
- [x] **T05.07 — Repayment schedule:** fixed principal hoặc declining balance theo ADR có phương pháp tính và timezone.
- [x] **T05.08 — Debt UI:** balance/principal/interest, upcoming dues, payment history, overdue.
- [x] **T05.09 — Unit tests:** nhận 10m không tăng income; trả 2m gốc + 100k lãi chỉ 100k expense; dư 8m.

### 15.3. Credit cards & net worth

- [x] **T05.10 — Card model:** card account as liability; limit, statement cycle, due date, starting debt.
- [x] **T05.11 — Credit spending/payments:** purchase refund, liabilities, bank-to-card repayment, payment over outstanding validation.
- [x] **T05.12 — Card UI + statements:** outstanding, available, current statement, upcoming due, activity.
- [x] **T05.13 — Net worth report:** assets/receivables − liabilities, compare dates, wallet inclusion settings.
- [ ] **T05.14 — E2E debt/card:** 1m card spend + 600k payment → expense 1m, outstanding 400k; loan payment as above.

**Nghiệm thu G5:** goals không đếm tiền hai lần; loan/card flows ghi journal cân, báo cáo thu/chi/net worth không nhầm gốc và lãi; thông tin số dư thẻ hợp lý.

## 16. P6 — GIAO DỊCH ĐỊNH KỲ, IMPORT, NHẮC VIỆC, PWA

- [x] **T06.01 — Rule schema:** RRULE/recurrence subset, timezone, start/end, auto vs confirmation, template validation.
- [x] **T06.02 — Occurrence generator:** unique `(ruleId,periodKey)` idempotency, concurrency safe, retry-safe worker.
- [x] **T06.03 — Recurring UI:** upcoming, edit, pause, skip, confirm, history, errors.
- [x] **T06.04 — Forecast separation:** future pending occurrences không vào actual income/expense, dashboard luôn phân nhãn dự kiến/thực tế.
- [x] **T06.05 — Notifications in-app:** ngân sách, ngày trả nợ, recurring due, read/unread, dedup.
- [x] **T06.06 — Import preview:** CSV/XLSX parsing, encoding, header mapping, validation per-row, duplicate identification, reject formula payload.
- [x] **T06.07 — Import commit:** batch job + transaction boundaries, imported rows through posting engine, stable source hash/idempotency, downloadable error report.
- [ ] **T06.08 — PWA:** manifest, installable icons, service worker strategy chỉ cache static assets, bảo vệ private data; offline state rõ, **không nói hỗ trợ offline mutations**.
- [ ] **T06.09 — Mobile polish:** touch targets, form keyboard, chart overflow, safe area, accessibility.
- [ ] **T06.10 — Regression:** worker chạy 2 lần không nhân đôi; import retry không nhân đôi; 10k rows không làm treo web.

**Nghiệm thu G6 — V1 feature complete:** toàn bộ module P1–P6 chạy; job idempotent, import có preview, notification thực, PWA cài được và dữ liệu tài chính không bị lộ bởi service worker/cache.

## 17. P7 — BẢO MẬT, ĐỐI SOÁT, HIỆU NĂNG VÀ TRIỂN KHAI

- [x] **T07.01 — Threat modeling:** account takeover, IDOR, CSRF, XSS, injection, token leakage, unsafe import, export access.
- [ ] **T07.02 — Authorization audit:** kiểm tra **mọi** route/service/read/write/export/job; thử ID của user B trong user A.
- [ ] **T07.03 — Session & OAuth validation:** production HTTPS, cookies, callback domain, logout, stale/expired, revoked session.
- [ ] **T07.04 — Secret/config hardening:** `.env` untracked, secret rotation guide, logs redaction, no sensitive values in build.
- [x] **T07.05 — Data integrity suite:** ledger zero imbalance, unlinked posting, duplicate occurrence, repeat mutation, stale balances. Nghiệm thu PostgreSQL 21/10/2026: 59 journals cân bằng; rollback corruption probes/recurring/import/concurrency PASS; `db:reconcile` 11 phép kiểm tra, 1 journal hiện hữu, 0 sai lệch. Số dư tính từ ledger, không có cached wallet balance riêng.
- [ ] **T07.06 — Load/performance tests:** 10k transactions/account baseline; capture real p50/p95 and slow queries; index optimization.
  - [x] **T07.06a — Baseline DB cách ly:** 10.000 transactions, 10.000 journals, 20.000 postings, dashboard/report p50/p95/p99, `EXPLAIN ANALYZE`, cleanup fixture xác minh (`artifacts/G7_PERFORMANCE_10000.json`).
  - [x] **T07.06b — Local concurrent diagnostics:** đo 4/8/16 request, tách aggregate/ví/giao dịch/top expenses, DB ping/sleep, event loop, prewarm pool; tái hiện outlier ~2 giây, ghi `docs/PHASE_REPORT.md`.
  - [x] **T07.06c — Root cause và tối ưu cold connection cục bộ:** Windows/Docker Desktop `localhost` resolve IPv6 trước cổng DB publish IPv4. Với cùng pool 16, chuyển `DATABASE_URL` host sang `127.0.0.1` giảm Prisma `$connect()` **2.307,64 → 17,92 ms**, 16 kết nối lạnh **2.043,92 → 20,04 ms**. Benchmark regression `finova_bench` (10k/10k/20k) dashboard đồng thời 4/8/16 p95 **64,85/89,34/174,53 ms**, 0 request >500 ms; fixture cleanup 0. Đây là sửa local cold path, chưa phải SLA/staging (21/10/2026).
    - [x] **T07.06c1 — SQL/query timeline và pool comparison:** đo Prisma QueryEvent (không lưu SQL parameters), giữ fixture 10k và cleanup PASS; 3.800 query events baseline không có truy vấn >500 ms khi Dashboard có spike ~2 giây. So sánh `connection_limit=8/16`; cả hai không còn slow requests trong các lượt local 4/8/16. Cấu hình mẫu giới hạn 16 kết nối/replica.
    - [x] **T07.06c2 — DNS/TCP, IPv4 cold/warm regression:** đo Windows pool mặc định/16 với `localhost`/`127.0.0.1` và Linux `db:5432`; SQL QueryEvent không >500 ms. Đã đổi host DB trong `.env.example`/local `.env`; TypeScript, ESLint, 191 tests và API guard audit PASS. Một outlier Goals p99 4.686,06 ms còn cần theo dõi trong T07.06d.
  - [ ] **T07.06d — Staging load acceptance:** đo HTTP/HTTPS nhiều replica, p50/p95/p99, pool/DB metrics và ngưỡng nghiệm thu theo tải thực tế.
- [ ] **T07.07 — Accessibility/responsive:** keyboard, focus, contrast, mobile 360/390/768/1280/1440, color not exclusive.
- [ ] **T07.08 — Docker production:** multi-stage build, non-root, health checks, db migrations in release procedure, compose profiles.
  - [x] **T07.08a — Image và HTTP runtime smoke cục bộ:** `finova:g7-profile-20261021` build Linux PASS; container non-root healthy; `/login` và manifest 200, API chưa đăng nhập 401, mutation thiếu Origin 403 và Origin hợp lệ/chưa đăng nhập 401; CSP Report-Only, DENY, nosniff, no-store; Prisma Client load PASS, không có `.env`/Vitest/Prisma CLI; container tạm đã xóa (21/10/2026).
  - [x] **T07.08b — Compose app và migration job cục bộ:** profile `app`/`release` validate PASS; image migration build PASS; `migrate status` và `migrate deploy` qua Compose trên DB riêng `finova_bench` (9 migrations, 0 pending) PASS. `app` profile chạy image `finova:g7-poolprofile-20261021` non-root/healthy, HTTP 200/401/403 + security headers PASS, Prisma query xác nhận DB `finova_bench`; container tạm đã dọn (21/10/2026).
  - [ ] **T07.08c — Release/deployment acceptance trên staging:** kiểm chứng migration, rollback tương thích schema, secrets/runtime, HTTPS và smoke staging theo runbook. Chưa thử trên môi trường đích; T07.10/T07.11 vẫn mở.
- [ ] **T07.09 — Database backup/restore:** backup command, encrypted/offsite storage recommendation, verify restore on isolated DB; measure restore time.
- [ ] **T07.10 — Staging deployment:** public domain, valid HTTPS, Google OAuth production-like callback, smoke tests with test user.
- [ ] **T07.11 — Production release checklist:** env, DB backup, migration, deploy, smoke, rollback, observability.
- [ ] **T07.12 — Final documentation:** README, HOWTO, API, architecture, QA report, known issues, operation runbook.

**Nghiệm thu G7:** CI xanh; actual OAuth validated ở đúng domain; financial tests green; zero critical/high known security issues; backup restore **thực sự đã thử**; performance có số đo và test report; đã chạy smoke test deployment. Không tự xưng `production-ready` khi gate chưa đạt.

### Checkpoint xác minh checklist 21/10/2026

- [x] **T07.07a — Login responsive/keyboard cục bộ:** Chrome headless PASS ở 7 viewport (320, 360, 390, 430, 768, 1280, 1440 px), không tràn ngang, nút Google ≥44 px, Tab/focus rõ, font và CSS thực; OAuth navigation PASS (`artifacts/qa/browser-smoke.json`). Đây là phần kiểm thử của T07.07; phần authenticated pages/screen reader còn mở.
- [x] **T07.07b — PWA cache privacy cục bộ:** manifest/icons HTTP 200; Chrome Cache Storage chỉ có `/offline.html` và hai icon public; 3 unit regression bảo đảm worker bỏ qua API/auth/finance/mutation, navigation offline dùng trang chung. **Chưa chứng nhận** cài PWA và offline navigation trên thiết bị thật.
- [x] **T07.07c — Dashboard UI-305 empty/data states cục bộ (22/10/2026):** giữ số dư ví khi không có thu chi trong kỳ, một CTA group thay cho các chart rỗng, phân biệt transfer-only và bút toán thu/chi triệt tiêu về 0; `tests/unit/dashboard-empty-state.test.tsx` 4/4 PASS. Tổng **273/273 unit tests (41 files)**, lint/typecheck, production build 27 static pages, audit API 41 route/54 handler và public browser smoke 13 viewport PASS.
- [ ] **T07.07d — Authenticated/real-device acceptance:** cần Chrome QA có phiên Google hợp lệ, screenshot protected 320–1440px Light/Dark, VoiceOver/TalkBack, Lighthouse, iOS Safari/Android Chrome, so khớp số dư/giao dịch trên workspace thử nghiệm; không dùng dữ liệu tài chính giả để đóng gate.
- [x] **T07.07e — Public browser QA runner diagnosis và regression (22/10/2026):** tái hiện sandbox `EACCES` khi gọi localhost, xác nhận `npm run test:browser:local` chạy thành công khi có quyền loopback (13/13 viewport, axe 4 tổ hợp, theme, PWA, Google OAuth initiation); cập nhật `scripts/run-browser-smoke-local.mjs` để dừng sớm và báo đúng quyền kết nối bị từ chối. Đây là xác minh công cụ QA công khai, không thay thế T07.07d.
- [x] **T07.07f — Bố cục bộ lọc và ngày/giờ responsive (27/10/2026, kiểm thử Chrome cục bộ):** bổ sung quy tắc chống tràn cho `.filterbar`, `.form-grid`, native date/datetime/month trên iPad/iPhone, bottom sheet có cuộn và safe area; bộ lọc SePay tự xuống một cột khi vùng chứa hẹp. `npm run test:ui:forms` PASS 10 độ rộng 320–1440 px, 4 mẫu form/bộ lọc mỗi độ rộng; `npm run test:browser` PASS 13 viewport. Đây là hồi quy bố cục bằng Chrome và CSS thực, chưa thay thế nghiệm thu Safari/iPadOS có đăng nhập thuộc T07.07d.
- [x] **T07.12a — Bộ tài liệu triển khai và QA:** `docs/GOOGLE_OAUTH_SETUP.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/TEST_REPORT.md` được rà soát; cập nhật tracker, README và báo cáo phase. T07.12 tổng thể giữ mở đến khi hoàn thành release evidence và nghiệm thu thực tế.
- [x] **T07.12b — Đồng bộ đặc tả và regression cục bộ:** PRD, test plan AT-01–18, ADR-0006, architecture/ERD 9 migrations, report aggregate/8 recent, API contract, README, QA/tracker nhất quán với mã nguồn; 512-case ledger sweep và `npm run test` 195/195, typecheck/lint/route audit/Prisma validate PASS. Build Windows còn lỗi socket ngoài workspace, T07.12 parent và release evidence giữ `[ ]`.

**Gates chạy lại:** `typecheck`, `lint`, `test` (194/194, 20 files), `security:routes` (40 route files/51 handlers), `test:oauth` và `test:browser` PASS ngày 21/10/2026. PostgreSQL/Docker/10k performance có biên bản checkpoint trước trong cùng ngày; không chạy lại DB benchmark trong lượt checklist này. Mục G7, Google two-account session, HTTPS multi-replica, secret rotation, offsite backup, CI remote và production release vẫn `[ ]`.

**Checkpoint mới 22/10/2026 (UI-305 và QA runner):** kết quả UI-305 273/273 tests, typecheck/lint, build và `security:routes` đều PASS. Đã kiểm tra lại wrapper `test:browser:local`: PASS toàn bộ public browser smoke khi localhost được phép; khi sandbox hạn chế, Node fetch trả `EACCES` IPv4/IPv6 và wrapper nay báo đúng nguyên nhân, không còn phải đợi hết 40 lần probe. `test:ui:auth` vẫn `BLOCKED_AUTH` do Chrome CDP QA `127.0.0.1:9222` trả `ECONNREFUSED`, chưa có bằng chứng phiên Google hợp lệ. Các checkbox G5/G6/G7/P8 và nghiệm thu thiết bị thật giữ nguyên trạng thái mở.

## 18. P8 — MỞ RỘNG CÓ KIỂM SOÁT (KHÔNG CHẶN V1)

- [ ] **T08.01 — Multi-currency ADR & implementation:** minor units/precision, FX snapshot, FX clearing, gains/losses, reconciliation theo từng loại tiền.
- [ ] **T08.02 — Family workspace:** invites, roles, ownership/permission migration, audit per member.
- [ ] **T08.03 — Advanced BI:** treemap, waterfall, Sankey, forecast phân nhãn.
- [ ] **T08.04 — Advanced settings:** ngân sách rollover, attachment private storage, export JSON backup.
- [ ] **T08.05 — Native mobile feasibility:** nếu cần, giữ backend services và auth compatibility.

---

# PHẦN V. KIỂM THỬ, CHẤT LƯỢNG VÀ NGHIỆM THU

## 19. TEST STRATEGY

| Tầng | Nội dung | Công cụ ví dụ | Chạy khi |
|---|---|---|---|
| Unit | Decimal, date, classifications, journal balance, budget, loan/card formulas | Vitest | Mỗi PR |
| Integration | PostgreSQL thật, migrations, authorization, ledger, API reports | Vitest + isolated DB | Mỗi PR/CI |
| Contract | Zod, DTO, amount string, error status, report filter shapes | API tests | Mỗi PR |
| E2E | Google test login flow; CRUD, dashboard, chart drill-down, export | Playwright | Phase gate/CI |
| Security | IDOR, CSRF, injection, session, export leak, import payloads | Automated + manual | P1/P2/P7 |
| Performance | Query plan, 10k tx, concurrent mutations/reports, export | Custom benchmark | P3/P7 |
| Operational | Docker, migrations, backup/restore, failed release rollback | Staging smoke | P7 |

### 19.1. Ma trận 18 acceptance test bắt buộc

| ID | Fixture / Thao tác | Kết quả mong đợi | Gate |
|---|---|---|---|
| AT-01 | Google login user mới | Có workspace, no fake tx | G1 |
| AT-02 | User A truy cập data B | 403/404, zero disclosure | G1/G2/G7 |
| AT-03 | Opening A=2m, B=1m; transfer 500k | A=1.5m, B=1.5m; income/expense=0 | G2 |
| AT-04 | Lương 15m, ăn uống 500k | Income=15m, expense=500k, surplus=14.5m | G2/G3 |
| AT-05 | Edit expense 500k→300k | Wallet, ledger, budget, donut =300k | G2/G4 |
| AT-06 | Refund 100k trên 300k | Net expense=200k toàn hệ thống | G2/G3 |
| AT-07 | Budget=1m, expense=800k→1.1m | 80%→110%, cảnh báo đúng | G4 |
| AT-08 | CC charge=1m, payment=600k | Expense=1m, debt=400k | G5 |
| AT-09 | Borrow=10m, principal=2m, interest=100k | Income=0 vì vay, expense interest=100k, debt=8m | G5 |
| AT-10 | Job recurring chạy 2 lần | Đúng 1 occurrence/transaction kỳ đó | G6 |
| AT-11 | Income=0 hoặc previous=0 | N/A/Mới phát sinh; no NaN/Infinity | G3 |
| AT-12 | Filter một ví, transfer ra ví ngoài scope | Balance scoped giảm, expense không đổi | G3 |
| AT-13 | Leap year, month-end, UTC +07 | Giao dịch thuộc đúng ngày địa phương | G2/G3 |
| AT-14 | Compare donut/table/KPI sau refund | Tổng hợp khớp nhau | G3/G4 |
| AT-15 | Export CSV/XLSX/PDF | UTF-8 tiếng Việt, đúng filter, ownership | G4 |
| AT-16 | Bundle/session | Không lộ Client Secret/private data | G1/G7 |
| AT-17 | Missing OAuth env | Có lỗi cấu hình rõ, không bypass auth | G1 |
| AT-18 | E2E wallet→expense→chart→edit→export | State chuyển đúng, không mock money | G4/G7 |

### 19.2. Property-based / invariant tests (khuyến nghị bắt buộc)

- [x] Sum debits = sum credits cho từng journal/currency; 512 kịch bản VND pseudo-random seeded ở cấp hàm cho income/expense/transfer/refund, đảo bút toán correction và round-trip JSON, `tests/unit/ledger.test.ts` PASS ngày 21/10/2026. PostgreSQL deferred trigger/reconcile có chứng cứ local riêng; chưa thay thế E2E.
- [ ] Không có bút toán sở hữu workspace sai, không có posting tài khoản không thuộc journal workspace.
- [ ] Tạo lại request với `Idempotency-Key` giống nhau không làm số dư đổi tiếp.
- [ ] Thao tác đồng thời trên cùng wallet không thể làm mất posting hoặc nhân đôi journal.
- [ ] Số dư lấy từ cached aggregate (nếu có) luôn bằng replay từ ledger.
- [ ] `Income + Expense` calculations không phụ thuộc thứ tự phân trang/trả records.
- [ ] `sum(values across chart buckets) = totals` cho đúng filter và policy refund.
- [ ] Backdated edit/refund làm các báo cáo liên quan cập nhật đúng phạm vi ngày lịch sử.
- [ ] Số tiền không bị biến dạng khi serialize/deserialize qua JSON với giá trị lớn.

## 20. MỤC TIÊU PHI CHỨC NĂNG (CHƯA PHẢI SỐ LIỆU ĐÃ ĐẠT)

| Yêu cầu | Mục tiêu đo lường lúc nghiệm thu | Cách kiểm chứng |
|---|---|---|
| Phân tách dữ liệu | Không có lỗ hổng truy cập chéo workspace đã phát hiện trong test matrix | IDOR tests trên mỗi endpoint |
| Tính đúng tài chính | 100% fixture trọng yếu và ledger invariants đạt | Automated + reconciliation |
| API reports | Mục tiêu p95 < 800ms ở workload 10k tx/user trong test environment được ghi rõ | Load test + DB query plan |
| Dashboard interactive | Mục tiêu p95 ready < 3s trên môi trường/thiết bị giả lập được công bố | Lighthouse + browser timings |
| Report totals | 100% report/chart/export totals khớp cùng filter | Contract/integration E2E |
| Accessibility | Mục tiêu WCAG 2.2 AA các luồng chính, không critical Axe violations | axe/Playwright + manual |
| Availability | Đặt SLO vận hành sau khi có production traffic | Observability |
| RPO/RTO | Đề xuất RPO ≤ 24h, RTO ≤ 4h; chỉ công bố khi đã thử restore | Restore drill |
| Browser/mobile | Chrome, Edge, Firefox, Safari hiện đại; viewport ≥360px | Cross-browser E2E |

> Các chỉ tiêu hiệu năng là **target đề xuất**; không tuyên bố đã đáp ứng nếu chưa test. Kết quả phải ghi CPU/RAM/DB size/dataset/cấu hình server.

## 21. SECURITY & PRIVACY CHECKLIST

- [ ] Google scopes chỉ `openid`, `email`, `profile`; không tự xin Gmail/Drive/bank.
- [ ] Session server-side; HttpOnly/Secure cookie trên HTTPS, SameSite phù hợp OAuth; cookie & session lifecycle tested.
- [ ] `BETTER_AUTH_URL` trùng origin thật; allowlist callback URLs rõ ràng.
- [ ] Credentials chỉ server ENV/secret store, không bundle client, không commit `.env`.
- [ ] Authorization ở DAL/service/route: `userId` và `workspaceId` suy từ session + membership, không tin UI.
- [ ] Every operation respects wallet/category/transaction workspace FK and ownership.
- [ ] CSRF for mutations, `state`/PKCE OAuth theo thư viện, input validation, rate limit endpoint nhạy cảm.
- [ ] CSP, security headers, XSS sanitization (notes), safe CSV/PDF/XLSX export.
- [ ] No sensitive finance values/tokens in logs, client analytics, error trackers.
- [ ] Không dùng public object URL cho hóa đơn (khi triển khai attachment).
- [ ] Data deletion workflow có reauthentication/confirmation thích hợp và ghi nhận status; backup retention được công bố rõ.
- [ ] Database user quyền tối thiểu; access secrets rotated; PostgreSQL không mở cổng internet không cần thiết.

---

# PHẦN VI. VẬN HÀNH, PHỤ THUỘC VÀ KẾ HOẠCH LÀM VIỆC

## 22. CẤU HÌNH GOOGLE OAUTH VÀ ENV

### 22.1. `.env.example` tối thiểu

```dotenv
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=replace_with_secure_random_value
GOOGLE_CLIENT_ID=replace_with_google_client_id
GOOGLE_CLIENT_SECRET=replace_with_google_client_secret
DATABASE_URL=postgresql://finance_user:change_me@localhost:5432/personal_finance
TZ=Asia/Ho_Chi_Minh
```

Khi triển khai thực tế, **không** sử dụng chuỗi placeholder làm secret hoặc password; config validation phải thất bại rõ ràng tại startup nếu production thiếu biến. DB URL trên là ví dụ local; dùng network name `postgres` trong Compose khi web chạy trong container.

### 22.2. Checklist cấu hình Google Cloud

1. Tạo project Google Cloud, cấu hình OAuth consent screen và test users theo trạng thái ứng dụng.
2. Tạo OAuth Client ID loại **Web application**.
3. Authorized redirect URI cho local: `http://localhost:3000/api/auth/callback/google`.
4. Authorized redirect URI cho production: `https://YOUR_DOMAIN/api/auth/callback/google`.
5. Đặt `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` vào private environment.
6. Test chọn account, consent, success/cancel/callback mismatch, logout, session expiry.
7. Nếu có thay đổi auth base path hoặc hostname, cập nhật Authorized redirect URI tương ứng.

**Lưu ý:** Google sign-in chỉ xác thực danh tính; **không cấp quyền truy cập tài khoản ngân hàng hay Gmail**. Không lưu Google tokens trong localStorage.

## 23. DOCKER, MIGRATION, SEED VÀ DEPLOYMENT

### 23.1. Local runbook (đầu ra cần được hiện thực)

```bash
cp .env.example .env
# Điền secret thật; cấu hình Google OAuth client
# Tên command chỉ mang tính kế hoạch, phải đối chiếu package.json thực tế

docker compose up -d postgres
npm install
npx prisma migrate dev
npm run dev

npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

Nếu repo có package manager khác, dùng lockfile hiện hữu, không trộn npm/pnpm/yarn. `prisma migrate dev` **chỉ development**; production dùng migration deployment workflow phù hợp và backup trước khi áp dụng.

### 23.2. Release procedure

1. Tạo/tag commit/release artifact có checksum và migration ID.
2. CI chạy lint, typecheck, unit, integration, E2E (mức thích hợp), build, vulnerability scan.
3. Backup PostgreSQL + xác minh có thể đọc file backup; chụp trạng thái schema hiện tại.
4. Triển khai staging, chạy migrations, Google callback smoke, basic financial workflow.
5. Phê duyệt production gate; deploy phiên bản có tag; DB migration backward-compatible khi khả thi.
6. Smoke: `/login`, Google login, tạo ví, ghi khoản chi test trong account test, dashboard, report, export, logout; xóa fixture an toàn.
7. Monitor errors/latency/ledger balance; rollback app khi cần; **không hứa rollback DB migration tự động** nếu thay đổi dữ liệu không đảo ngược.
8. Lưu `TEST_REPORT.md`, release note, build SHA và known issues.

### 23.3. Backup and data protection

- Backup tự động theo lịch phù hợp, có encryption và giới hạn truy cập; retention được cấu hình và ghi rõ.
- Verify **restore** trên database cô lập trước khi đánh dấu gate.
- Reconciliation hàng ngày/định kỳ: số journal lệch, wallet balance mismatch, recurring duplicated, non-posted orphan.
- Test safe log redaction; alert khi job thất bại, migration lỗi, reconcile lệch.

## 24. DEPENDENCY GRAPH, RISKS VÀ QUẢN LÝ THAY ĐỔI

```mermaid
flowchart LR
 P0[P0 Architecture & Rules] --> P1[P1 Auth & Foundation]
 P1 --> P2[P2 Ledger + Transactions]
 P2 --> P3[P3 Dashboard MVP]
 P3 --> MVP{{MVP Gate}}
 MVP --> P4[P4 Budget + Reports]
 P4 --> P5[P5 Goals + Debt + Cards]
 P5 --> P6[P6 Recurring + Import + PWA]
 P6 --> P7[P7 Security + Release]
 P7 --> P8[P8 Optional V2]
```

| Risk | Xác suất/Tác động | Biện pháp | Điểm chặn |
|---|---|---|---|
| Ledger sai dẫn đến sai dashboard | Trung bình/Rất cao | ADR bút toán, invariant tests, reconciliation, financial fixture | G2 |
| Số dư tính trùng do transfer, card, loan | Cao/Cao | Double-entry, loại INCOME/EXPENSE rõ, regression tests | G2/G5 |
| OAuth callback mismatch hoặc thiếu Google credentials | Trung bình/Trung bình | `.env.example`, setup guide, staging login thật, callback URL | G1/G7 |
| Lộ dữ liệu khác workspace | Trung bình/Rất cao | Scoped repository, server DAL, cross-user negative tests | G1/G7 |
| Chart và báo cáo lệch số liệu | Cao/Cao | Shared reporting service, test sum-to-total, single filter builder | G3/G4 |
| Đa tiền tệ làm sai định giá | Cao/Cao | Hoãn tới V1.1, khóa UI trước khi được hỗ trợ | G2/P8 |
| Nhiều phase làm dở, không release | Cao/Cao | Vertical slice, gate bắt buộc, MVP freeze trước khi mở rộng | Mọi gate |
| Import/recurring sinh bản ghi trùng | Trung bình/Cao | Idempotency + unique occurrence/source row key | G6 |
| Báo cáo lớn chậm | Trung bình/Trung bình | Index, aggregation, pagination, profiling 10k records | G3/G7 |
| Backup không restore được | Trung bình/Rất cao | Automated restore drill, runbook và cảnh báo | G7 |

**Change control:** bất kỳ thay đổi nào ảnh hưởng `financial classification`, `ledger posting`, `currency conversion`, `report definitions`, `authorization` phải có ADR cập nhật, migration impact, regression test, review tài chính trước khi merge.

## 25. DEFINITION OF DONE CHUNG CHO TỪNG TASK

Một task chỉ `DONE` khi có đủ:

- [ ] Source code có thật, được liên kết vào route/UI/service tương ứng.
- [ ] Input validation, backend auth/scope, error cases đầy đủ.
- [ ] Database migration/transaction chính xác; không để state lệch nếu request lỗi.
- [ ] UI responsive, tiếng Việt, loading/empty/error/success, không placeholder như chức năng đã triển khai.
- [ ] Unit/integration hoặc E2E phù hợp được bổ sung và **đã chạy**, kèm kết quả.
- [ ] Lint + typecheck + build thành công, không lỗi blocking.
- [ ] Có hướng dẫn chạy, ENV mới, quyết định thiết kế cập nhật nếu có.
- [ ] Không dùng mock data cho tài khoản thật, không secret hardcoded, không fake screenshot để nghiệm thu.

## 26. MẪU BÁO CÁO CUỐI PHASE CHO CODEX

```markdown
# PHASE REPORT — P{N}

## 1. Phạm vi thực hiện
- Task IDs: ...
- Commit / changed files: ...

## 2. Kết quả thực tế
| Task | Status | File/Component | Evidence |
|---|---|---|---|
| Txx.yy | Done/Partial/Blocked | ... | test logs / URL / DB query |

## 3. Test đã chạy
| Command | Result | Test count | Evidence |
|---|---|---|---|
| npm run test | PASS/FAIL/NOT RUN | ... | ... |

## 4. Các trường hợp chưa hoàn tất
- ... (nêu đúng sự thật, lý do, rủi ro)

## 5. Credential / công việc phía người triển khai
- ...

## 6. Kết luận gate
- G{N}: PASS / CONDITIONAL / FAIL
- Bằng chứng: ...
- Phase tiếp theo: ...
```

## 27. CHECKLIST BÀN GIAO

- [ ] Repository Git với README và commit history rõ ràng.
- [x] `docs/PRD.md`, `ARCHITECTURE.md`, `ERD.md`, `FINANCIAL_RULES.md`, `REPORT_DEFINITIONS.md`, `API_CONTRACT.md` (file hiện hữu, đã rà soát checkpoint 21/10/2026).
- [x] `docs/GOOGLE_OAUTH_SETUP.md`, `SECURITY.md`, `DEPLOYMENT.md`, `TEST_REPORT.md` (file hiện hữu; nghiệm thu staging vẫn tách riêng).
- [ ] Database schema, migration được kiểm tra từ database trống, seed danh mục mặc định.
- [ ] Next.js frontend các trang đã phát hành, API/backend thật, chart/report đúng.
- [ ] Dockerfile, Compose, `.env.example`, backup + restore script, CI pipeline.
- [ ] Unit/integration/E2E regression suite, ledger reconciliation command, staging smoke report.
- [ ] Không có dữ liệu giả ẩn trên production, chức năng chưa triển khai có trạng thái đúng.

---

# PHẦN VII. LỆNH GIAO VIỆC CHO CODEX

## 28. PROMPT KHỞI ĐỘNG TOÀN DỰ ÁN

> Sao chép đoạn dưới đây vào Codex **sau khi đã đặt hai file Markdown tại repository**.

```text
Bạn là Principal Software Architect, Senior Full-stack Engineer, Fintech Domain Engineer,
QA Lead và DevOps Engineer.

Hãy đọc đầy đủ:
1. PROMPT_XAY_DUNG_UNG_DUNG_QUAN_LY_TAI_CHINH_CA_NHAN.md
2. IMPLEMENTATION_PLAN_QUAN_LY_TAI_CHINH_CA_NHAN.md

THỰC THI, KHÔNG CHỈ PHÂN TÍCH:
- Kiểm tra repo và tái sử dụng cấu trúc/stack hiện có nếu phù hợp.
- Tuân theo task IDs, dependency, phase gates trong Implementation Plan.
- Bắt đầu P0, ghi tài liệu thiết kế/ADR/ERD/financial rules, tiếp đến triển khai P1.
- Với mỗi tính năng: DB migration -> service/ledger -> API -> UI -> automated test -> docs.
- Đăng nhập Google qua Better Auth/OIDC, không giả lập success khi thiếu credentials.
- Dashboard và báo cáo phải dùng dữ liệu PostgreSQL thật và cùng logic ledger; không mock sản xuất.
- Giao dịch phải double-entry/atomic/idempotent; không đếm transfer, loan principal,
  credit-card payment thành income/expense.
- MVP hạch toán VND; không triển khai đa tiền tệ nửa vời.
- Mọi API check user session + workspace membership trên server.
- Mỗi phase phải chạy test/lint/typecheck/build phù hợp, trình bày kết quả thực tế.
- Không đánh dấu DONE hoặc PASS khi chưa có bằng chứng.
- Không bỏ qua phase gate khi test tài chính hoặc bảo mật chưa đạt.
- Chỉ yêu cầu tôi cung cấp Google OAuth credentials/domain/prod secrets khi cần.

Ngay bây giờ:
1. Đọc codebase và lập GAP_ANALYSIS.md.
2. Tạo/cập nhật các tài liệu P0.
3. Triển khai P1 và báo cáo theo mẫu Phase Report.
4. Nếu P1 đạt gate, tiếp tục P2; nếu có blocker, nêu rõ phần hoàn tất và blocker,
   không tuyên bố ứng dụng đã chạy thành công khi chưa kiểm chứng.
```

## 29. PROMPT TIẾP TỤC TỪNG PHASE

```text
Hãy tiếp tục phase P{N} theo IMPLEMENTATION_PLAN_QUAN_LY_TAI_CHINH_CA_NHAN.md.
Đầu tiên đọc Phase Report/ADR hiện tại, kiểm tra commit và tests từ phase trước.
Triển khai lần lượt tất cả task T{NN}.xx theo vertical slices hoàn chỉnh.
Không sửa logic financial core nếu thiếu regression tests. Không tạo giao diện giả.
Sau khi code xong, chạy lint, typecheck, unit/integration/E2E áp dụng cho phase.
Kết thúc bằng bảng Task ID - Status - Changed Files - Test Evidence, thống kê
các kiểm thử thật sự đã chạy, các lỗi hoặc cấu hình còn thiếu và gate PASS/FAIL.
```

## 30. PROMPT RÀ SOÁT CHẤT LƯỢNG TRƯỚC PRODUCTION

```text
Đóng vai Fintech Security Auditor và Financial Software QA Lead.
Audit toàn repo theo 4 hướng: (1) cân và tính đúng ledger, (2) phân quyền và
cross-workspace isolation, (3) dashboard/report/export reconciliation, (4)
OAuth/security/backup/recovery/performance.

Tạo danh sách vấn đề có severity, nơi phát sinh, bước reproduce và cách sửa.
Ưu tiên sửa Critical/High, bổ sung regression tests, chạy lại test và thống kê
kết quả. Không kết luận production-ready nếu chưa thử restore backup,
chưa xác minh Google OAuth trên domain triển khai hoặc còn lỗi báo cáo tài chính.
```

---

## 31. TÀI LIỆU THAM KHẢO KỸ THUẬT CHÍNH THỨC

- Better Auth – Google provider, callback và `BETTER_AUTH_URL`: <https://better-auth.com/docs/authentication/google>
- Google – OpenID Connect: <https://developers.google.com/identity/openid-connect/openid-connect>
- Next.js – Authentication và secure DAL: <https://nextjs.org/docs/app/guides/authentication>
- Next.js – Route Handlers: <https://nextjs.org/docs/app/getting-started/route-handlers>
- Prisma ORM – Transactions: <https://www.prisma.io/docs/orm/fundamentals/transactions>
- PostgreSQL – Numeric types: <https://www.postgresql.org/docs/current/datatype-numeric.html>
- OWASP – Session Management: <https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html>
- OWASP – Access Control: <https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html>

**Lưu ý tương thích:** API hỗ trợ transaction/isolations có thể khác giữa các phiên bản ORM (đặc biệt khi đổi phiên bản chính). Khi bắt đầu code phải khóa phiên bản và xác minh tính năng thực tế trong tài liệu đúng phiên bản, không copy code transaction từ bản khác.

---

> **Nguyên tắc kết thúc:** Sản phẩm được đánh giá bằng **tính đúng tài chính + an toàn dữ liệu + báo cáo đối chiếu được + hoạt động thật**, không phải bằng số lượng màn hình đã dựng.
