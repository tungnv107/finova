# Finova — API authorization audit (G7 / T07.02)

**Snapshot:** 20/10/2026, repository `D:\Projects\Finova`. **42 route files:** 40 `api/v1` files (**51 exported HTTP methods**), 1 Better Auth route, 1 internal scheduler route. **Status: structural gate PASS; service-level audit PARTIAL.**

Chạy `npm run security:routes` để kiểm tra lại bằng TypeScript AST. Lệnh thất bại khi một exported v1 handler thiếu `requireContext()` hoặc mutation thiếu `assertSameOrigin()`, và khi auth/scheduler route mất kiểm soát chuyên biệt. Kiểm tra này **không chứng minh** thao tác gọi guard đúng thứ tự trên mọi nhánh, ownership ở service, SQL workspace scope, cache behavior hay response authorization thực tế.

## Endpoint inventory

| Nhóm | Route files (không bao gồm tiền tố `/api/v1`) | Methods / kiểm soát trực tiếp |
| --- | --- | --- |
| Wallets (2) | `/wallets`, `/wallets/[id]` | GET/POST, PATCH; session, Origin mutation; `ledger.ts` kiểm tra wallet/workspace |
| Transactions (3) | `/transactions`, `/transactions/[id]`, `/transactions/[id]/refunds` | GET/POST, PATCH/DELETE, POST; session, Origin, idempotency; `ledger.ts` scope và version |
| Categories (2) | `/categories`, `/categories/[id]` | GET/POST, PATCH; category workspace check |
| Budgets (2) | `/budgets`, `/budgets/[id]` | GET/POST, PATCH; scoped service/budget-category checks |
| Goals (3) | `/goals`, `/goals/[id]`, `/goals/[id]/allocations` | GET/POST, PATCH, POST; wallet ownership; advisory lock, allocation ledger-independent |
| Debts (3) | `/debts`, `/debts/[id]`, `/debts/[id]/payments` | GET/POST, PATCH, POST; payment target scoped; idempotency |
| Cards (3) | `/cards`, `/cards/[id]`, `/cards/[id]/entries` | GET/POST, PATCH, POST; card/entry scope and idempotency |
| Recurring (4) | `/recurring`, `/recurring/[id]`, `/recurring/[id]/confirm`, `/recurring/[id]/skip` | GET/POST/PUT, PATCH, POST, POST; workspace checks + atomic occurrence posting |
| Imports (6) | `/imports/columns`, `/imports/preview`, `/imports/commit`, `/imports/[id]`, `/imports/[id]/retry`, `/imports/[id]/errors.csv` | POST, POST, POST, GET, POST, GET; upload size/staging, workspace-scoped batch/error export |
| Exports (4) | `/exports/reports`, `/exports/reports.pdf`, `/exports/reports.xlsx`, `/exports/transactions.csv` | POST, GET, GET, GET; session + workspace scope; export quota and no-store |
| Reports (5) | `/reports/overview`, `/reports/trends`, `/reports/heatmap`, `/reports/budget-performance`, `/reports/net-worth` | GET; session/report quota; wallet/category filters must match workspace |
| Notifications (2) | `/notifications`, `/notifications/[id]` | GET/POST, PATCH; scoped record lookup; PATCH `read` now parsed as strict boolean |
| Me (1) | `/me` | GET; session-derived user/workspace |
| Special (2) | `/api/auth/[...all]`, `/api/internal/recurring` | Better Auth GET/POST pre-auth quotas + configured origin; internal POST bearer constant-time verification + scheduler quota |

## Kiểm soát xuyên suốt và bằng chứng

| Control | Mã nguồn / kiểm chứng | Trạng thái |
| --- | --- | --- |
| Authentication | `src/server/context.ts` gọi Better Auth session; `requireContext()` dùng ở 51 v1 handlers; `security:routes` kiểm tra tự động | **Structural PASS**; Google callback/session E2E **OPEN** |
| Workspace construction | `bootstrapPersonalWorkspace()` trong `getContext()`; client không được cung cấp workspaceId tùy ý qua route | **Code reviewed**; two-account E2E **OPEN** |
| Mutation CSRF | `src/server/http.ts:assertSameOrigin`, 51-handler AST gate cho mutations; Better Auth origin riêng | **Structural PASS**; browser cross-origin regression **OPEN** |
| Input validation | Zod schemas ở finance/goals/import/report; `parseRange`, size + cursor limits; notification PATCH strict boolean | **PARTIAL**: service/schema review sâu và fuzz inputs chưa xong |
| Object ownership | `ledger.ts`, `goals.ts`, `debts.ts`, `credit-cards.ts`, `recurring.ts`, `imports.ts`; scoped `workspaceId` reads/writes | **PARTIAL**; negative cases đã PASS trên một số paths, chưa có HTTP matrix toàn bộ ID |
| Filters & read-only scope | `reporting.ts` wallet/category precheck; `analytics.ts`/`csv-export.ts` filters; exports lấy workspaceId từ session | **PARTIAL**; một số negative tests PASS; cần mở rộng mọi export/report query |
| Rate limits | `src/server/rate-limit.ts`; mutation 90, upload 12, export 20, sync 12, reports 120, pre-auth global 600/client 30 (khi ingress tin cậy), scheduler 10 | **Tested locally**: PostgreSQL security integration (12/8, 30/5, isolation, expiry); multi-instance load **OPEN** |
| Audit logging | Ledger/goals/recurring/import mutation paths tạo audit records; atomicity test có tại `integration-check.ts` | **PARTIAL**: chưa lập coverage sheet từng service mutation |
| Private responses | `respond()/failure()` private no-store; `sendExport()` private no-store; Next security headers | **Code reviewed / prior HTTP smoke**; CDN/staging cache behavior **OPEN** |
| Scheduler | `FINOVA_CRON_SECRET` Bearer, length 24+, `timingSafeEqual`, PostgreSQL quota; không sử dụng session user | **Implemented**; external job ingress/secret rotation **OPEN** |

## Service-level priority checks còn mở

1. **T07.02.a** Thêm negative tests thật qua HTTP/session cho từng `{id}`, bao gồm nested card/debt/goal/recurring, import batch và notification; cả đọc/sửa/thử ID thuộc workspace khác. Khẳng định không có side effects ngoài workspace.
2. **T07.02.b** Đối chiếu `analytics`, `net-worth`, `budgets`, `file-exports`, `csv-export` từng query với workspaceId và ownership filters; thêm kịch bản export của tenant khác (CSV/XLSX/PDF).
3. **T07.02.c** Kiểm tra request body quá lớn, sai kiểu, lạ trường và lỗi ID; có `400/403/404` rõ ràng, không lộ thông tin bản ghi khác tenant.
4. **T07.02.d** Browser session thực: Google callback, hai tài khoản, logout, refresh, rate limit, CSRF, CDN/proxy cache, cookie Secure/SameSite, audit events.

**Release decision:** kiểm kê và static guard đã thành CI gate; audit chưa kết luận toàn bộ 42 endpoints an toàn trước production. Xem `SECURITY_THREAT_MODEL.md` và `PHASE_REPORT.md` để theo dõi các blockers.

## Bổ sung regression G7 — 20/10/2026

- `scripts/integration-check.ts` có thêm fixture giao dịch độc lập của workspace B. Assertions mới xác nhận CSV không tiết lộ ID/ghi chú của workspace khác theo cả hai chiều; XLSX chi tiết và KPI của từng workspace đúng phạm vi; PDF hợp lệ được tạo riêng cho hai workspace.
- Cả `transactionsCsv`, `reportXlsx`, `reportPdf` đều có negative cases cho **foreign walletId và categoryId theo cả hai chiều**. So sánh số journal và audit log trước/sau request bị từ chối để phát hiện side effects.
- Import preview có thêm kiểm tra foreign `getImport`, `commitImport`, `retryFailedImport` không sửa batch/rows hoặc tạo journal ở hai workspace.
- **Trạng thái kiểm chứng checkpoint:** TypeScript, ESLint, static API guards và **48/48 unit tests (10 files) PASS**. Tám HTTP handler tests mới trong `tests/unit/export-routes.test.ts` kiểm tra session-derived workspace cho CSV/XLSX/PDF, unauthenticated 401 + no-store, import errors CSV foreign batch 404, scope của rows và spreadsheet formula escaping (kể cả sau whitespace). Route `src/app/api/v1/imports/[id]/errors.csv/route.ts` đã được gia cố.
- Các assertions mới trong PostgreSQL integration **CHƯA CHẠY** do DB không kết nối được. Unit handler tests dùng mocked session/database, **không thay thế authenticated Google HTTP/browser E2E**. Service-level authorization vẫn **PARTIAL**.

## Tiếp tục G7 — async export error boundary (20/10/2026)

- Unit HTTP regression phát hiện `GET /exports/reports.xlsx`, `GET /exports/reports.pdf` và `POST /exports/reports` trả về Promise từ `sendExport()` mà chưa `await` bên trong `try/catch`. Khi bộ lọc thuộc workspace khác bị service từ chối, lỗi `HttpError(404)` thoát ra ngoài handler thay vì trả JSON lỗi riêng tư.
- Đã sửa ba handlers dùng `return await sendExport(...)` để `failure()` chuyển lỗi thành HTTP 404 với `private, no-store`. Bổ sung kiểm thử 404 cho CSV/XLSX/PDF và POST export, cùng 401 cho import errors CSV. **53/53 unit tests (10 files), TypeScript, ESLint và static API guards PASS.**
- Mở rộng PostgreSQL integration negative matrix cho overview, heatmap, trends và trang giao dịch hai chiều workspace A/B; chưa chạy vì DB không kết nối được. Authorization service-level vẫn **PARTIAL**, browser Google hai tài khoản vẫn **OPEN**.

## G7 bounded JSON boundary regression (20/10/2026)

- 18 ID/nested HTTP handlers có mocked regression về session workspace, URL ID, origin/unauthenticated 403/401, foreign denial 404, no-store; idempotency key trên các financial nested operations. Mocked denial chỉ xác nhận error mapping, chưa chứng minh ownership thật.
- 9 PATCH ID handlers có regression malformed JSON trả 400 và không gọi service. 23 JSON routes chung bounded parser 64 KiB, 400 JSON/UTF-8 invalid, 413 oversized; không phân loại sai SyntaxError lập trình.
- CardsManager/DebtsManager có static AST regression xác minh 33 explicit label-control associations; browser accessibility chưa chạy.
- **Evidence:** 175/175 tests (14 files), typecheck, lint, route guards 40/51 và Prisma validate PASS. PostgreSQL 55433 không kết nối, Docker API permission denied; tenant isolation DB và Google two-account browser E2E còn OPEN. Service-level audit giữ trạng thái PARTIAL.


### G7 follow-up — global native control label coverage (20/10/2026)

`financial-form-label-coverage.test.ts` xác minh toàn bộ 91 native controls của 11 components có tên truy cập từ htmlFor/id, aria-label/aria-labelledby hoặc label bao quanh. Đây là kiểm tra JSX AST, không chứng minh screen-reader hay focus behavior. **Latest: 176/176 tests (15 files), TypeScript/ESLint/static route guard PASS.** G7 service ownership PostgreSQL và two-account Google E2E vẫn OPEN.

### Recurring rule boundary audit — 20/10/2026

`updateRule()` giờ chỉ xóa forecast kỳ sau `endDate` của đúng workspace/rule, trạng thái PENDING/PROCESSING và chưa có `transactionId`; các kỳ đã POSTED giữ nguyên. `processOccurrence()` từ chối lịch ngoài `startDate`/`endDate` bằng `409 RULE_DATE_RANGE` trước bước claim/ledger, kể cả forecast cũ còn lưu trong DB. Bốn unit tests mới xác nhận scope của cleanup, không xóa khi gia hạn, không ghi sổ cho kỳ cũ và bảo toàn posted history. Đã thêm kịch bản integration PostgreSQL cho chu trình rút ngắn/gia hạn nhưng **chưa thực thi** vì database không kết nối. Latest local gates: **180/180 tests (16 files), typecheck, lint, 40/51 static guards, prisma validate PASS**. Security/service runtime acceptance và Google hai tài khoản tiếp tục **OPEN**.

