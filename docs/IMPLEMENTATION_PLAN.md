# Kế hoạch triển khai thực tế theo phase — Finova

**Phân hệ đề xuất mới (23/10/2026):** [FN-ADMIN-BILLING — Quản trị, Lite/Premium, chuyển khoản, auto-activation và báo cáo vận hành](FINOVA_ADMIN_PREMIUM_IMPLEMENTATION_PLAN.md), **0/55 task `[x]`**; chỉ là kế hoạch, chưa triển khai thanh toán. Checklist/chứng cứ theo tracker chuyên biệt, không cộng vào các con số Bank Sync/SePay phía dưới.

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
