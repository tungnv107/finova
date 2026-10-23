# Báo cáo triển khai theo phase — Finova

**Ngày cập nhật:** 23/10/2026
**Repository:** `D:\Projects\Finova`
**Phạm vi:** P0–P7 trên môi trường phát triển; chưa nghiệm thu production.

## Checkpoint hiện hành — authenticated SePay manual sync (23/10/2026)

- **Đã nghiệm thu:** SP3-02 sau xác thực Better Auth signed session và Origin guard bằng API route thực trên PostgreSQL test; SePay **13 nhiệm vụ [x]**. Bank Sync giữ **9/45 [x]**.
- **Kiểm thử:** `finova_test` **36/36 PASS**, 16/16 migrations; fixture cleanup còn 0 workspace/user/pending outbox. Unit **320/320** (51 files), typecheck, lint, Prisma validate, route guard audit 54/69, Next production build 41/41 static pages PASS. Một stress run song song có 1 retry; independent rerun PASS.
- **Chưa đạt:** npm security audit inconclusive; Google OAuth browser E2E, SePay provider UAT, DB outage/recovery, scheduler triển khai, HTTPS staging, backup/restore và sign-off. **G5 OPEN, G6 CONDITIONAL, G7 IN PROGRESS, P8 NOT STARTED; Production/SePay Live NO-GO.** Các checkpoint sau đây là lịch sử.

## Checkpoint lịch sử — SePay lease, consent, pagination (23/10/2026)

- **Đã nghiệm thu:** SP3-05 sau stress pagination, lỗi 429/503/timeout/401 và recovery có dedupe; SePay **12 task [x]**. Bank Sync giữ **9/45 [x]** vì outage DB, các trường hợp financial E2E và điều kiện đối tác vẫn thiếu.
- **Kiểm thử:** `npm test` **320/320** (51 files), PostgreSQL `finova_test` **31/31** scenarios PASS; **16/16** migrations. TypeScript, ESLint, Prisma validate PASS. Bổ sung lease/takeover, kiểm tra consent theo từng tài khoản và ngăn watermark tiến khi revoked/paused giữa HTTP.
- **Còn mở:** Authenticated route/browser E2E (SP3-02), SePay Sandbox UAT (SP5-03), scheduler thực/backfill nhiều tháng, database outage, HTTPS staging và sign-off. **Production/SePay Live NO-GO.** Các checkpoint tiếp theo dưới đây là lịch sử.

## Checkpoint mới — SePay tenant/history và recovery (23/10/2026)

- **Đã nghiệm thu:** SP1-03 (tenant-scoped bank accounts, wrong company, concurrent claims, pagination) và SP3-01 (history theo company/account, 50 rows, 20 trang/31 ngày, DB two-page/review-first). SePay tăng **9 → 11 task [x]**; Bank Sync **9/45** không thay đổi.
- **Đã kiểm thử:** `npm test` **314/314** (50 files), PostgreSQL `finova_test` **24/24** scenarios PASS với 15/15 migrations, bao gồm 3 ca bổ sung HTTP 503/timeout ở trang thứ hai và hồi phục idempotent. Mọi kiểm thử DB dùng fixture cô lập và cleanup, không reset dữ liệu ứng dụng. TypeScript, ESLint, Prisma validate, route audit 54/69 và production build PASS ở checkpoint kiểm tra gần nhất.
- **Chưa đạt:** SP3-05 cần stress/token refresh giữa trang; Bank Sync DB outage/recovery, full finance regression, Google/browser, Hosted Link/IPN/history thực, HTTPS staging, pháp chế/security/ops approval. **G5 OPEN, G6 CONDITIONAL, G7 IN PROGRESS, P8 NOT STARTED; PRODUCTION và SEPAY LIVE NO-GO.**

## Checkpoint mới — Bank Sync/SePay DLQ replay và consent (22/10/2026)

- **Đã triển khai:** endpoint operator-only `POST /api/internal/bank-sync/replay`, Bearer secret độc lập, giới hạn payload/rate limit, Serializable requeue + BankAuditEvent; worker kiểm tra consent tại thời điểm xử lý, replay kiểm tra tài khoản gốc ACTIVE/VND. Giữ chính sách REVIEW_FIRST, không tạo journal tự động.
- **Đã kiểm thử:** `finova_test` 15/15 migrations, **17/17 PostgreSQL integration scenarios**, **310/310 unit** (50 files), typecheck/lint/build PASS; security route audit 54/69 và runtime dependencies 0 findings ở checkpoint gần nhất. Môi trường sandbox thường không truy cập được Docker DB; chạy integration với quyền phù hợp đã đạt exit code 0. Không truy cập/reset DB chính.
- **Tracker:** Bank Sync **9/45** `[x]` (đóng BS2-04); SePay Bank Hub **9 task** `[x]`, SP5-03/04/05 và các hạng mục cần đối tác vẫn mở. Runbook đã cập nhật thao tác replay có kiểm toán.
- **Release:** G5 OPEN; G6 CONDITIONAL; G7 IN PROGRESS; P8 NOT STARTED; **NO-GO** kết nối ngân hàng thật. Thiếu IPN key đúng Bank Hub, HTTPS callback, Hosted Link & history UAT thực, authenticated browser E2E, outage recovery, restore/rotation, vận hành đa instance, pháp chế và sign-off.

## Checkpoint mới — PostgreSQL 13 migrations, finance integration và benchmark (21/10/2026)

- **Migration và an toàn dữ liệu:** DB phát triển `finova` được backup custom-format 112.052 byte trước khi áp dụng ba migration (`transfer_fee`, `wallet_reconciliation`, `transaction_tags`); `prisma migrate status` **13/13 PASS**, không reset DB thật. DB `finova_bench` độc lập cũng cập nhật **13/13 migrations**. Fixture integration cũ được xác minh danh tính rồi dọn **3 workspace/3 user**; finance integration hiện PASS với **72 journals cân bằng**.
- **Tính năng và kiểm thử:** T02.07 (cây danh mục), T02.10 (transfer fee), T02.11 (đối soát ví), T02.12 (tags của thu/chi), T03.05 (drill-down danh mục), T04.10 (PDF Unicode có biểu đồ/phân trang) đã `[x]` với unit/integration/PDF smoke. Chỉnh integration XLSX tra KPI theo nhãn, sử dụng fixture ngày đã bắt đầu và kiểm tra kỳ tương lai bị từ chối. Sau thay đổi mới, `typecheck`, `lint`, `test` **267/267 trên 39 files**, `security:routes` **41 files/54 handlers**, Prisma validate PASS.
- **Benchmark:** sửa `segmentDurations[name].push` tại `scripts/benchmark-reports.ts` thành bucket động do `overview()` đã thêm `previousAggregate`, `previousWalletBalances`, `netWorth`, `matchingBudgets` và `budgetUsage`. Lần đo thành công trên `finova_bench` tạo **10k transactions/10k journals/20k postings**, kiểm tra KPI, budget và audit ledger, rồi cleanup thành công (độc lập xác nhận 0 `bench-*` workspaces/users). Dashboard tuần tự **p50/p95/p99 = 473,50/506,29/506,85 ms**; với 4/8/16 concurrent requests **p95 = 51,64/79,82/207,03 ms**, không request nào >500 ms trong 224 mẫu. Prisma query trace **5.548 events**, 1 event >500 ms. Artifact: `artifacts/G7_PERFORMANCE_10000.json`.
- **Chưa đạt SLA staging:** Goals tuần tự có p95 **4.596,70 ms**, p99 **4.750,92 ms** (outlier); dashboard tuần tự p95 lần này cao hơn một số checkpoint trước, độ trễ local biến thiên. T03.02/T03.02b được đóng cho DTO/logic và PostgreSQL benchmark; T07.06d vẫn mở cho HTTPS multi-replica load và mục tiêu thực tế. G5 **OPEN**, G6 **CONDITIONAL**, G7 **IN PROGRESS**, P8 **NOT STARTED**, production **NOT READY**.

## Checkpoint — T02.09 lịch sử số dư ví (21/10/2026)

- Đã bổ sung GET list/detail và UI chọn ví/ngày, số dư `asOf`, nhật ký posting, phân trang cursor, loading/empty/error/retry. Đọc ledger ASSET, giới hạn đến thời điểm hiện tại theo múi giờ Việt Nam; kiểm tra workspace và cursor thuộc ví; ngăn response cũ ghi đè dữ liệu khi người dùng đổi bộ lọc.
- Kiểm chứng mới: wallet detail unit/API/UI **9/9 PASS**; toàn bộ **229/229 tests (31 files)**, TypeScript, ESLint, route guards **40 route files/52 HTTP handlers**, Prisma validate PASS. PostgreSQL integration trên `finova` local **59 journals cân bằng**, có các assertion mới về lịch sử/số dư ví, opening, chuyển tiền, `asOf`, workspace isolation, cursor không hợp lệ. Script tạo và dọn fixture `integration-` riêng; không reset database.
- `docker compose ps` ở sandbox mặc định bị từ chối kết nối Docker API; kiểm tra phạm vi nâng quyền xác nhận `finova-db-1` healthy và bộ integration chạy PASS. Không sửa dịch vụ khác. Browser E2E đăng nhập thật, staging và build image sau cập nhật này chưa thử lại. Checkbox **T02.09 [x]**; các gate P2/G2/G7, production giữ OPEN/NOT READY.

## Cập nhật mới nhất — P7 dependency remediation (20/10/2026)

- **Thay đổi đã áp dụng:** nâng `vitest` lên **5.0.5** (phù hợp Node 22 và peer range Better Auth), override riêng `@prisma/config → deepmerge-ts` sang **8.0.2**; giữ nguyên Prisma Client/CLI **6.19.3**, Next.js/ESLint **16.4.2**, schema và dữ liệu tài chính. `package-lock.json` đã đồng bộ, Docker `npm ci` thành công.
- **Full-tree npm audit:** từ **11** (2 critical, 8 high, 1 moderate) còn **5 high, 0 critical, 0 moderate**. Cả 5 là cùng một advisory gốc `GHSA-vfj7-8cjw-p6xm` trong chuỗi *dev-only*: `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces@3.0.3`. `braces` chưa có phiên bản npm được vá tại thời điểm rà soát. Đã thử override plugin 14.2.35 + `glob` 10.5.0 để đưa audit về 0, nhưng ESLint Next 16 lỗi `Plugin "plugin:@next" not found`; phương án đó **đã được hoàn nguyên**. Không ghi nhận 5 node cascade như 5 lỗ hổng độc lập.
- **CI:** thêm `npm run security:audit` vào `.github/workflows/ci.yml`. Lệnh yêu cầu audit production **0 cảnh báo**, thất bại khi registry không trả báo cáo hợp lệ, chặn mọi advisory mới/khác chuỗi được nhận diện; chỉ theo dõi riêng 5 node `braces` dev-only và tự hết hạn điều kiện theo dõi ngày **01/12/2026**. Kết quả vẫn hiển thị 5 cảnh báo, không sửa/che kết quả `npm audit` gốc. Cần thay bằng bản vá chính thức hoặc dependency chain an toàn trước hạn rà soát.
- **Quality gates:** `npm run db:generate`, `npx prisma validate`, `npm run typecheck`, `npm run lint`, `npm run test` (**40/40**), `FINOVA_TEST_RUN=1 npm run test:security-integration` (**PASS** quota đa instance/pre-auth) và `FINOVA_TEST_RUN=1 npm run test:integration` (**53 journals balanced**) đều **PASS**. `npx prisma migrate status` **9/9 up-to-date**, `npm run db:reconcile` **1 journal, sai lệch 0**. Không sửa migration hoặc ghi dữ liệu mẫu production.
- **Docker:** `finova:phase7-dependency-fixes` digest `sha256:60b3d0aa18c063474ad7ba10fd7ea5d68e0ae7892f75c76f942545aafb13a7df` **build PASS** (Node 22, Next.js 16.4.2, 27 static/generated pages, npm ci); production pruning **302 packages, 0 vulnerabilities**. Image không chứa `.env`, `vitest`, Prisma CLI, ESLint hoặc `braces`. HTTP smoke cô lập tại `127.0.0.1:3003` **PASS**: `/login` 200, manifest 200, `/api/v1/wallets` không xác thực 401, `nosniff`, `DENY`, CSP Report-Only và no-store có mặt; container smoke đã xóa. Đổi `vitest.config.ts` thành `vitest.config.mjs` để loại warning Vite native config; 40 unit tests vẫn PASS. Chưa xác nhận callback Google có session thực và không bật CSP enforcement.
- **Gate:** G7 tiếp tục **IN PROGRESS**. Còn browser E2E có session thật, CSP enforcement, trusted HTTPS ingress/WAF, load test thực tế, CI trên remote, accessibility/mobile, backup offsite và monitoring. Không chứng nhận production-ready.

## Bổ sung P7 — bảo vệ OAuth và truy vấn nặng (20/10/2026)

- **Mã đã triển khai:** Rate limit PostgreSQL atomic trước xác thực cho Better Auth `POST /api/auth/*` và `GET /api/auth/callback/*`: trần chia sẻ **600/phút**, và **30/phút/client IP** nếu cấu hình reverse proxy đáng tin cậy. `GET /api/auth/get-session` không bị giới hạn để tránh ảnh hưởng polling. Không mặc định tin `X-Forwarded-For`; chỉ chấp nhận một IP IPv4/IPv6 hợp lệ từ `FINOVA_TRUSTED_CLIENT_IP_HEADER` khi ingress tự ghi đè header và chặn truy cập trực tiếp. Header được cấu hình nhưng thiếu/sai trả **503** trên request được bảo vệ.
- **Báo cáo:** `GET /api/v1/reports/*` và danh sách `GET /api/v1/transactions` sử dụng quota theo user/workspace **120/phút**, đồng thời đã gắn quota cho `GET /api/v1/imports/:id/errors.csv` thuộc nhóm export. Mọi khóa chỉ lưu SHA-256; các thao tác tải dữ liệu vẫn yêu cầu session hợp lệ.
- **429:** PostgreSQL xác định chính xác số giây còn lại đến hết cửa sổ 60 giây và trả qua `Retry-After` (1–60 giây). Request không hợp lệ vẫn tiêu hao quota theo chính sách phòng chống abuse. Lỗi kết nối DB không được bỏ qua giới hạn.
- **Vận hành:** bổ sung `npm run db:prune-rate-limits` để xóa riêng quota hết hạn theo lịch, độc lập với thành công của đồng bộ recurring. Không thay đổi schema hoặc ledger, không có migration mới.
- **Kiểm chứng lượt này:** TypeScript **PASS**; ESLint **PASS**; unit **40/40 PASS**; PostgreSQL security integration **PASS** (upload **12 nhận/8 từ chối**; pre-auth theo client **30 nhận/5 từ chối**, quota báo cáo, isolation, expiry); PostgreSQL financial integration **PASS, 53 journals balanced**; migration **9/9 up-to-date**, ledger hiện hữu **1 journal, sai lệch 0**; cleanup quota **PASS, 0 bucket hết hạn**. Docker Linux build **PASS** với image `finova:phase7-auth-limits` (`sha256:cad03b5e277e6c983e2a054b009dbf0aa00caf7ddb8a13626833fcc3495eb584`), production dependencies **302 packages / 0 vulnerabilities**. HTTP smoke **PASS**: `/login` 200, manifest 200, API wallets/reports chưa auth 401, mutation thiếu Origin 403, Origin hợp lệ nhưng chưa auth 401, CSP Report-Only có mặt. Container thử nghiệm trên 3003 và env tạm đã xóa; `finova-db-1` vẫn healthy.
- **Giới hạn:** Quota OAuth chung bảo vệ mức cơ bản nhưng có nguy cơ bị tiêu hết dưới tấn công volumetric. Chưa xác nhận reverse proxy production, WAF, OAuth callback/session thực với browser, CSP enforcement và multi-instance load. **G7 tiếp tục IN PROGRESS; chưa production-ready.**
- **Phụ thuộc:** `npm ci` trong build stage báo **11 vulnerabilities (1 moderate, 8 high, 2 critical)** trên toàn bộ cây build/dev/peer; bước `npm prune --omit=dev --omit=peer` của image runtime còn **0 vulnerabilities / 302 packages**. Cần tiếp tục xử lý audit của toolchain trong vòng nâng cấp phụ thuộc có kiểm thử; không dùng `npm audit fix --force`.

## Cập nhật P7 security hardening — 20/10/2026

- **Thực thi:** thêm PostgreSQL `ApiRateLimit` qua migration mới `20261020121500_api_rate_limit` (migration thứ 9, đã áp dụng); bộ đếm atomic UPSERT, quota theo tài khoản/workspace, 60 giây: mutation 90, CSV/XLSX upload 12, recurring sync 12, export 20, scheduler sau Bearer xác thực 10. Vượt quota trả 429/`Retry-After: 60`. Không sửa ledger hay dữ liệu tài chính đã ghi.
- **Origin/Auth:** cấu hình Origin từ `BETTER_AUTH_URL` dùng chung; production thiếu/sai cấu hình trả 503 đối với mutation hoặc auth endpoint, Origin không hợp lệ trả 403. Bỏ fallback sai cổng 3000. Better Auth/Google callback còn chờ E2E đăng nhập thật.
- **Security headers:** bổ sung CSP **Report-Only** mặc định, bật enforcement qua `FINOVA_CSP_ENFORCE=1` sau khi QA trình duyệt và đối chiếu vi phạm CSP. Đã có `nosniff`, `DENY`, Referrer/Permissions Policy, cache `private, no-store` trên responses.
- **Tests:** `npm run typecheck` **PASS**, `npm run lint` **PASS**, unit **36/36 PASS**. PostgreSQL security integration **PASS: 12 yêu cầu đồng thời được nhận, 8 nhận HTTP 429, quota độc lập và expiry**. P2–P6 integration **PASS 53 journals cân bằng** (bao gồm XLSX), `npx prisma migrate status` **9 migrations up-to-date** và `npm run db:reconcile` **1 journal, sai lệch 0**.
- **Dependencies:** scoped override `exceljs → uuid@11.1.1`, kiểm thử ExcelJS/XLSX PASS; `npm audit --omit=dev --omit=peer` trên host **0 advisories**. Audit toàn cây vẫn có cảnh báo ở nhóm Prisma/Vitest, cần kiểm tra phát hành/image runtime và vòng đời dependency trước production. Không dùng `npm audit fix --force`.
- **Docker image cuối:** `finova:phase7-security` (`sha256:a78ae94848f34fbe0bcabbcdb29776d5e180ab5ab7ee4dcde8c262405b0179c4`) build Linux **PASS**, `npm ci` với lockfile chuẩn **PASS**; `npm prune --omit=dev --omit=peer` kiểm tra 302 packages, **0 vulnerabilities**. HTTP smoke container tạm port `3003` **PASS**: `/login` 200, manifest 200, wallets chưa auth 401, thiếu/sai Origin 403, Origin hợp lệ nhưng chưa auth 401 và có CSP Report-Only. Đã dọn smoke container và tệp env tạm.
- **Gate:** G7 vẫn **IN PROGRESS**. Chưa chứng nhận CSP enforcement, Google authenticated browser E2E, pre-auth abuse defense qua trusted proxy, tải đa instance thực tế, mobile/accessibility, CI chạy trên remote, chính sách backup offsite/HTTPS/monitoring.

## Cập nhật mới nhất — 20/10/2026, P6/P7

- **Atomic posting (mới nhất):** `createTransactionInDb()` cho phép service Import và Recurring ghi double-entry ledger trong chính PostgreSQL transaction xử lý staging/occurrence. `serializable()` retry xung đột P2034/P2002, không dùng nested Prisma transactions. Import khóa dòng `VALID`, liên kết `transactionId` và cập nhật `IMPORTED` atomically; cùng `sourceHash` ở các batch đồng thời sẽ chỉ tạo một transaction, batch còn lại chuyển `DUPLICATE`. Recurring claim/post/link/audit commit atomically; hỗ trợ liên kết lại giao dịch từ luồng cũ nếu đã có idempotency key.
- **Kiểm chứng mới nhất:** `npm run typecheck`, `npm run lint`, `npm run test` **32/32 PASS**; PostgreSQL integration **PASS, 53 journals cân bằng**. Bổ sung test hai batch preview trước khi commit đồng thời, recurring lỗi giữa chừng và retry, import lỗi đầu vào rồi retry, ép rollback sau khi đã tạo journal nhưng chưa commit, và phục hồi dữ liệu legacy post-before-link không tạo journal thứ hai. `npx prisma migrate status` **8 migrations up-to-date**; `npm run db:reconcile` **1 journal, sai lệch 0**. Không cần migration mới cho refactor.
- **P6:** Bổ sung nhập XLSX từ trang tính hiển thị đầu tiên qua endpoint đọc tiêu đề, staging, preview, commit và retry; từ chối ô công thức và tệp quá 5 MB / 10.000 dòng. CSV và XLSX sử dụng cùng quy tắc idempotency, không ghi ledger khi preview. Có API `/api/v1/imports/columns`, giao diện và bộ kiểm thử mới.
- **Kết quả trước đợt atomic posting:** `npm run typecheck` PASS; `npm run lint` PASS; unit tests **32/32 PASS**; PostgreSQL integration P2–P6 **PASS, 47 journals cân bằng** (có XLSX/retry và workspace isolation); `npx prisma migrate status` PASS **8 migrations**; `npm run db:reconcile` PASS, **1 journal hiện có, sai lệch 0**.
- **P7:** Backup và restore vào database tạm đã kiểm chứng. Docker Linux image mới `finova:phase7-atomic` (digest `sha256:33b08c851ec46dca47a172b8fc3a3d9c09a9353b7b6d0ad2c5816119eea6fe52`) **build PASS**, runtime smoke sau pruning **PASS**: healthy, `/login` 200, manifest 200, API wallets chưa đăng nhập 401, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, Prisma Client load được, `.env` không nằm trong image. Container thử nghiệm tạm cổng 3003 đã dừng và bị xóa. `npm prune --omit=dev --omit=peer --legacy-peer-deps` còn **2 moderate** trong log audit. CI YAML parse được, có runbook `docs/OPERATIONS_RUNBOOK.md`.
- **Còn mở:** 2 cảnh báo dependency moderate chưa xử lý; browser E2E qua Google session thật, PWA/mobile, CSP/rate limit, stress đa instance, performance và CI chạy thực tế trên GitHub. **G6 CONDITIONAL, G7 IN PROGRESS; chưa production-ready.**

## Trạng thái và điều kiện nghiệm thu

| Phase | Đã triển khai | Kết quả kiểm chứng / Gate |
| --- | --- | --- |
| P0 — Kiến trúc và quy tắc | PRD, gap analysis, ERD P0–P5, implementation plan, ADR, API contract, financial rules | Tài liệu đối chiếu với Prisma và code, đạt phần thiết kế |
| P1 — Auth và onboarding | Next.js/Prisma/PostgreSQL, Better Auth Google OIDC, workspace cá nhân, tạo ví đầu tiên | Người dùng xác nhận đã chạy thử Google Login; OAuth initiation, state cookie, guards và login responsive PASS; **assistant chưa nghiệm thu độc lập callback/session/logout qua browser** |
| P2 — Sổ cái/ví/giao dịch | Double-entry, reversal, refund, category, transfer, idempotency, concurrency và tenant isolation | PostgreSQL integration PASS; chờ authenticated browser E2E |
| P3 — Dashboard dữ liệu thật | KPI, đồ thị, lọc ngày/ví/danh mục và drill-down từ ledger | Integration đối soát PASS; chờ authenticated browser E2E |
| P4 — Ngân sách và báo cáo | Budget alerts, trends/heatmap, CSV/XLSX/PDF exports, API/UI | PostgreSQL integration PASS; chờ browser E2E |
| P5 — Goals, debts, cards, net worth | Migration, service, API/UI, earmarking, debt interest, hạn mức, sao kê ước tính, net worth | Integration PASS; **gate G5 chưa đóng** do Google session thật và browser E2E chưa nghiệm thu |
| P6 — Recurring/import/PWA | Recurring rule/occurrence + scheduler, thông báo, CSV/XLSX staging/commit/retry, atomic post/link, API/UI, manifest/service worker/public offline fallback | PostgreSQL integration **PASS 53 journals cân bằng**; G6 **CONDITIONAL** do browser PWA/mobile E2E và stress đa instance còn mở |
| P7 — Hardening/deployment | Deferred journal invariant, security headers, Docker Linux, CI workflow, backup/restore drill, runbook | Docker `finova:phase7-atomic` build và runtime smoke PASS; backup/restore PASS; dependency audit còn 2 moderate, acceptance production chưa đạt |
| P8 — Mở rộng | Chưa bắt đầu | Chưa đạt |

## Môi trường và dữ liệu

- PostgreSQL 17 riêng của Finova: `finova-db-1` healthy, `127.0.0.1:55433`, database `finova`; ứng dụng cấu hình cổng `3002`. Cổng 3000 thuộc dự án khác.
- Tám migrations từ `20261019174000_init` đến `20261020094500_csv_import` đã áp dụng theo log migrate deploy trước P6; kiểm tra `migrate status` trong sandbox thường lỗi không truy cập được PostgreSQL, cần chạy lại qua quyền truy cập môi trường. **Không chạy migrate reset/xóa volume.**
- Các bài kiểm thử dùng `FINOVA_TEST_RUN=1` tạo workspace/user tạm trong DB phát triển và dọn đúng phạm vi tạo ra sau khi hoàn tất. Không có số dư/giao dịch demo trong production; seed mặc định chỉ thêm metadata danh mục.
- Credentials Google nằm tại `.env` cục bộ, không ghi trong báo cáo hoặc source.

## Kiểm thử đã chạy ngày 20/10/2026

| Kiểm tra | Kết quả | Nội dung |
| --- | --- | --- |
| `npm run typecheck` | **PASS** | TypeScript strict |
| `npm run lint` | **PASS** | ESLint |
| `npm run test` | **PASS 32/32** | Ledger, timezone/date, debt/card, recurrence, CSV/XLSX import, upload limits |
| `FINOVA_TEST_RUN=1 npm run test:integration` | **PASS: 47 journals cân bằng** | P2–P6; workspace isolation, idempotency, concurrency, recurring, CSV/XLSX preview/commit/retry |
| `npm run db:reconcile` | **PASS** | 1 journal hiện có, sai lệch 0 |
| `npx prisma migrate status` | **PASS** | 8 migrations, schema up to date |
| `npm run db:generate` và `npx prisma validate` | **PASS** | Prisma Client 6.19.3 và schema hợp lệ |
| `docker build -t finova:phase7 .` | **PASS** | Next.js 16.4.2 production build Linux, 26/26 static pages; thêm API `/api/v1/imports/columns` |
| `npm run test:oauth` | **PASS initiation/guards** | Google callback URL, state cookie, scopes, session rỗng khi chưa login, private/no-store |
| `npm run test:browser` | **PASS login** | Chrome 1440×900, 390×844, 320×700, không tràn ngang; click Google kích hoạt điều hướng OAuth |
| Google login callback/session/logout thực tế | **NGƯỜI DÙNG ĐÃ THỬ; CHƯA NGHIỆM THU ĐỘC LẬP** | Người dùng xác nhận đã chạy thử Google; chưa có kịch bản/biên bản browser E2E của assistant |
| Authenticated browser E2E | **CHƯA CHẠY** | Onboarding → ví → thu/chi → dashboard → goals/debts/cards |

**Lưu ý môi trường:** Sandbox thường trả Prisma P1001 và Docker API permission denied dù container healthy. Integration và đối soát đã chạy thành công qua quyền phù hợp. Build ở sandbox thường bị Windows EPERM tại `.next/types/app/api/v1`; chạy lại với quyền phù hợp đã PASS. OAuth smoke lần đầu bị từ chối kết nối do cổng 3002 chưa có server; sau khi khởi chạy `next start -p 3002`, OAuth và browser smoke đều PASS. Các lỗi này được khắc phục bằng thao tác tương ứng, không sửa dữ liệu người dùng.

## Các điều chỉnh nghiệp vụ P5

- Thêm phép tính `estimatedStatementRemaining`: dư nợ tại chốt trừ thanh toán sau chốt và hoàn tiền gắn với giao dịch mua thuộc sao kê đã chốt; không dùng hoàn tiền mua hàng kỳ mới để giảm nghĩa vụ ước tính kỳ cũ. Giữ riêng `outstanding` hiện tại, `lastStatementBalance` và số ước tính còn lại.
- Bổ sung unit tests cho số dư sao kê sau thanh toán/hoàn, kiểm soát kết quả không âm.
- Bổ sung kiểm thử tích hợp **hai thanh toán gốc tranh chấp cùng khoản nợ**, **hai hoàn tiền tranh chấp cùng giao dịch mua**, và **sao kê có thanh toán + hoàn tiền qua ngày chốt**.
- Cập nhật ERD và ADR cho earmarking mục tiêu, công nợ/lãi/lịch dự phóng, thẻ tín dụng và net worth.

## Giới hạn cần xử lý trước khi đạt G5/production

1. **Google OIDC:** Cần đăng nhập tương tác bằng tài khoản thật để xác minh callback, session tồn tại, logout, hai tài khoản và cách ly trên browser. Kiểm thử URL/state ở bước initiation chưa thay thế được bước này.
2. **Browser E2E:** Kiểm tra authenticated flows desktop/mobile gồm ví, thu chi, sửa/hủy/hoàn, ngân sách, goals, debts, cards, dashboard và xuất báo cáo.
3. **Nghiệp vụ:** Lịch trả nợ là dự phóng gốc cố định từ hợp đồng ban đầu; chưa phân bổ trả trước, trả thiếu và lãi suất thay đổi. Sao kê là ước tính sổ cái, không thay bản sao kê và số tối thiểu do ngân hàng xác nhận. Không tự ghi lãi dự phóng vào ledger.
4. **Hardening:** Backup/restore, rate limit/anti-abuse, CI, load tests, security headers, accessibility và deploy HTTPS/cookie cần nghiệm thu.

## Kết quả P6 ngày 20/10/2026

- Schema: `RecurringRule`, `RecurringOccurrence`, `Notification`, `ImportBatch`, `ImportRow`. Giữ migrations P6 đã áp dụng; Prisma Client sử dụng output `generated/prisma-client` và alias `@finova/prisma`.
- API/UI: recurring schedule/sync/confirm/skip/pause, CSV UTF-8 preview/staging/commit/report lỗi, thông báo có đánh dấu đã đọc/chưa đọc. Forecast không ảnh hưởng tài chính actual; chỉ posted transaction mới sinh journal.
- PWA: `public/sw.js` chỉ lưu `offline.html` và app icons công khai, không cache dữ liệu tài chính hoặc API. Có registration client-side; chưa chứng nhận khả năng cài đặt trên thiết bị thật.
- Quality mới nhất: `npm run typecheck` **PASS**, `npm run lint` **PASS**, `npm run test` **32/32 PASS**. Đã sửa cấu hình Vitest và ESLint để hỗ trợ generated Prisma Client và bỏ qua script chẩn đoán trong `artifacts/`.
- Integration mới nhất: `FINOVA_TEST_RUN=1 npm run test:integration` **PASS trên PostgreSQL thật, 47 journals cân bằng**; bao gồm P2–P5 và recurring idempotency/concurrent claims/stale-worker recovery/skip/future, CSV/XLSX preview không ghi sổ, duplicate/commit/retry/đồng thời, notifications dedup/read/isolation. Script chỉ tạo và dọn workspace riêng.
- Giới hạn: worker trên nhiều instance chưa stress/load; batch commit và cập nhật ImportRow chưa atomic hoàn toàn; trình duyệt Google authenticated E2E, responsive PWA installability còn mở. G6 conditional, chưa production-ready.

**Gate:** P2–P6 backend/database tích hợp đã đạt trong môi trường dev; **G5/G6 browser acceptance và production readiness vẫn mở**.
# Cập nhật G7 — authorization và data-integrity audit (20/10/2026)

- **Mã mới:** `scripts/audit-api-routes.mjs` và lệnh `npm run security:routes`, đã gắn CI, quét **40 route files v1 / 51 HTTP handlers**: mỗi handler gọi `requireContext`, mỗi mutation gọi `assertSameOrigin`; kiểm tra cấu trúc riêng cho 2 route auth/scheduler. **PASS**. Scope/ownership bên trong service còn cần E2E và test mở rộng. Notification PATCH giờ kiểm tra `read` bằng Zod strict boolean.
- **Đối soát PostgreSQL:** `scripts/reconcile-ledger.ts` có **11 kiểm tra** (bổ sung VOID còn journal active và liên kết reversal cùng transaction); sửa PostgreSQL correlation bằng `LATERAL`; đối soát read-only trên DB dev hiện hữu **PASS: 1 journal, 0 sai lệch**; **9 migrations up to date**. Đã export `auditLedger()` để gọi bên trong test transaction.
- **Regression:** financial integration **PASS 53 journals balanced**, đối soát toàn bộ workspace test không false positive; kiểm tra cố ý làm hỏng reversal posting, VOID active và import link trong transaction **rollback** đều phát hiện đúng và không để lại dữ liệu sai. Security integration **PASS** quota 12 nhận/8 từ chối, pre-auth client 30 nhận/5 từ chối, workspace isolation/expiry. `npm run typecheck`, `npm run lint`, 40/40 unit tests và `npm run security:routes` **PASS**.
- **Dependency audit mới:** `npm run security:audit` **PASS có điều kiện**: runtime **0 advisory**, còn **5 High dev-only** theo dõi đến **01/12/2026**. Không coi 5 findings đã được vá.
- **Tài liệu G7 mới:** `docs/SECURITY_THREAT_MODEL.md`, `docs/AUTHORIZATION_AUDIT.md`. Gate G5 **OPEN**, G6 **CONDITIONAL**, G7 **IN PROGRESS**; chưa nghiệm thu authenticated Google E2E, multi-instance load 10k, accessibility/mobile/PWA, enforced CSP, HTTPS ingress, encrypted offsite backup, CI remote, Docker build/smoke sau thay đổi này hoặc production release.

## G7 checkpoint — export isolation và benchmark fixture safety (20/10/2026)

**Mã thay đổi:**

- `scripts/integration-check.ts`: thêm giao dịch workspace B độc lập và negative matrix CSV/XLSX/PDF cho wallet/category thuộc workspace khác; đối chiếu KPI/chi tiết XLSX, ID/note CSV hai chiều; khẳng định denied exports không thay journal/audit log. Import negative matrix bổ sung kiểm tra foreign read/commit/retry không thay batch/rows/journal.
- `scripts/benchmark-reports.ts`: cleanup fixture bằng transaction duy nhất với kiểm tra `createdById`, xử lý user/workspace tạo dở, xác minh xóa sạch fixture; báo lỗi riêng cleanup và bảo toàn lỗi benchmark; chỉ ghi artifact đo p50/p95/p99 khi cleanup thành công. Không sửa ledger nghiệp vụ hoặc dữ liệu sản xuất.

**Kiểm chứng checkpoint:** `npm run typecheck` **PASS**; `npm run lint` **PASS**; `npm run test` **48/48 PASS (10 files)**; bổ sung 8 HTTP handler unit tests cho export/import boundary và CSV formula escaping (mocked session/DB, không thay thế Google E2E); `npm run security:routes` **PASS** (40 v1 route files, 51 handlers); `npx prisma validate` **PASS**. Kiểm thử mới là PostgreSQL integration, **chưa được chạy** do kết nối DB thất bại. `npx prisma migrate status` trả `Schema engine error`, Prisma read probe trả `Can't reach database server at localhost:55433`. `docker ps` trả `permission denied` tại Docker Desktop Linux API. `npm run security:audit` trả lỗi do không có vulnerability report hoàn chỉnh; chưa thể tái xác minh số cảnh báo. `npm run build` **FAIL** do Windows `EACCES: permission denied, readlink` tại một socket cũ `AppData/Local/docker-secrets-engine.stale-*/engine.sock` bên ngoài workspace; image Docker cũ không xác minh được source hiện tại.

**Performance 10.000:** **NOT RUN**; chưa có p50/p95/p99, chưa xác minh fixture cleanup qua DB thực hoặc EXPLAIN ANALYZE. **Runtime Docker image mới:** **NOT SMOKED**. **Authenticated Google/browser E2E:** **OPEN**. **Gate:** G5 OPEN, G6 CONDITIONAL, G7 IN PROGRESS, production NOT READY. P8 chưa bắt đầu.

## G7 checkpoint — export async error boundary & negative filter coverage (20/10/2026)

**Sửa lỗi thực tế:** HTTP unit negative tests phát hiện ba route `GET /api/v1/exports/reports.xlsx`, `GET /api/v1/exports/reports.pdf`, `POST /api/v1/exports/reports` không `await` Promise của `sendExport()` trong `try/catch`, nên lỗi ownership 404 không đi qua `failure()`. Đã sửa cả ba route và bổ sung regression 404/private no-store (CSV/XLSX/PDF/POST), cùng import errors CSV 401. **Kiểm chứng:** `npm run typecheck` PASS; `npm run lint` PASS; `npm run test` **53/53 PASS (10 files)**; `npm run security:routes` PASS (40 files/51 handlers).

**Bổ sung chưa nghiệm thu DB:** PostgreSQL integration có thêm negative filters hai workspace cho overview/heatmap/trends/transaction page; benchmark tăng kiểm chứng số lượng 10k transactions / 10k journals / 20k postings và xác minh user fixture email trước cleanup. Cổng PostgreSQL `localhost:55433` vẫn không kết nối, Docker API bị từ chối; yêu cầu đọc-only nâng quyền Docker bị **automatic approval review từ chối xử lý do giới hạn sử dụng**, thao tác **không thực thi**. Security audit không có npm report đầy đủ; không có artifact benchmark mới, Docker image mới hoặc authenticated Google E2E. **G5 OPEN — G6 CONDITIONAL — G7 IN PROGRESS — production NOT READY; P8 NOT STARTED.**


## G7 explicit JSON parse boundary (20/10/2026)

- `src/server/http.ts`: bounded `readJsonBody()` đọc stream tối đa 64 KiB; 23 JSON API route files chuyển sang helper. Lỗi parser JSON/UTF-8: HTTP 400 `INVALID_JSON`; request lớn: HTTP 413 `SIZE`. SyntaxError không thuộc parser được ghi nhận như lỗi hệ thống.
- Unit tests mới/mở rộng: 9 PATCH mutation handlers với malformed JSON, wallet oversized, JSON parser encoding/size/internal errors. **175/175 tests (14 files), TypeScript, ESLint, static API guards (40 v1 files/51 handlers), Prisma validate PASS.** Đây là HTTP/parser regression, không chứng minh Google hoặc database tenant isolation.
- Trạng thái kiểm tra runtime: TCP PostgreSQL `127.0.0.1:55433` trả False; Docker API `permission denied`; do đó PostgreSQL integration, reconciliation, 10k benchmark, Docker image mới và Google authenticated E2E vẫn OPEN. Audit bảo mật mới chưa chứng nhận sạch.
- **G5 OPEN — G6 CONDITIONAL — G7 IN PROGRESS — P8 NOT STARTED — production NOT READY.**


## G7 follow-up — 176 tests and EXPLAIN plan capture (20/10/2026)

- Thêm static accessibility regression quét 11 form components và 91 inputs/selects/textareas, xác nhận label liên kết hoặc label bao quanh hợp lệ; test kiểm tra tất cả trường hiện có và cho phép thêm trường hợp lệ.
- Bổ sung hai representative read-only `EXPLAIN ANALYZE, BUFFERS, FORMAT JSON` vào benchmark 10k, sau khi đo các service paths và trước cleanup. Artifact `G7_PERFORMANCE_10000.json` chỉ được phát hành sau fixture cleanup. **Chưa có execution plan hay latency mới** do PostgreSQL 55433 không thể kết nối.
- Gate gần nhất: **176/176 tests (15 files), typecheck, lint, security:routes PASS**. `security:audit` **FAIL/INCONCLUSIVE**: npm không trả báo cáo vulnerability đầy đủ. Docker API tiếp tục permission denied. G5 OPEN, G6 CONDITIONAL, G7 IN PROGRESS; production NOT READY.


### G7 local browser runtime probe — 3012 (20/10/2026)

- Port 3002: `next dev` trả `EADDRINUSE :::3002` dù TCP probe IPv4 không thấy listener; không dừng hoặc can thiệp tiến trình khác.
- Server Finova `next dev -p 3012 -H 127.0.0.1` khởi động thành công (Next.js Ready), nhưng `FINOVA_BROWSER_URL=http://127.0.0.1:3012 npm run test:browser` **FAIL trước HTTP request** do `fetch` lỗi `connect EACCES 127.0.0.1:3012` trong runtime. Không có bằng chứng browser page PASS từ lần thử này.
- Đã dừng server thử nghiệm và dọn `AGENTS.md` tự động sinh bởi `next dev` (tệp không có trong inventory ban đầu). Không thay đổi cổng hay OAuth credentials trong source. Authenticated E2E tiếp tục OPEN.

## G7 recurring date-range integrity — 20/10/2026 (checkpoint mới nhất)

- **Lỗi nghiệp vụ đã khắc phục:** Rút ngắn `RecurringRule.endDate` trước đây giữ lại các `RecurringOccurrence` PENDING/PROCESSING sinh từ lịch cũ. Khi đến hạn, xác nhận thủ công hoặc worker có thể ghi transaction/journal dù kỳ đã nằm ngoài thời gian hiệu lực.
- **Mã nguồn:** `src/server/recurring.ts` xóa các kỳ dự báo chưa hạch toán vượt `endDate` trong cùng Serializable transaction với thay đổi rule và audit log, giới hạn `workspaceId` + `ruleId`, giữ nguyên kỳ POSTED/SKIPPED. Khi kéo dài lịch trở lại, `generateOccurrences()` có thể sinh lại dự báo. `processOccurrence()` kiểm tra cả `startDate` và `endDate` trước khi claim và ghi sổ, trả `409 RULE_DATE_RANGE` nếu gặp kỳ cũ không hợp lệ. Các giao dịch đã POSTED vẫn giữ nguyên lịch sử.
- **Regression:** `tests/unit/recurring-date-boundary.test.ts` thêm 4 test cho cleanup theo scope/status, kéo dài lịch không xóa dữ liệu, stale occurrence không sinh side effect, và lịch sử POSTED. `scripts/integration-check.ts` thêm trường hợp thu hẹp / tái mở lịch, kỳ stale được tạo lại, kiểm tra số journal không đổi và dự báo được tái sinh. Phần PostgreSQL integration mới **CHƯA CHẠY**.
- **Bằng chứng kiểm tra:** `npm run typecheck` **PASS**; `npm run lint` **PASS**; `npm run test` **180/180 (16 files) PASS**; `npm run security:routes` **PASS** (40 v1 files / 51 handlers); `npx prisma validate` **PASS** (có cảnh báo cấu hình Prisma 7 trong tương lai).
- **Blockers hiện tại:** TCP `127.0.0.1:55433` **False** nên chưa thể chạy PostgreSQL integration, ledger reconciliation và benchmark 10k. `docker ps` **FAIL**: permission denied trên `dockerDesktopLinuxEngine`. `npm run security:audit` **FAIL/INCONCLUSIVE**: thiếu báo cáo đầy đủ từ npm registry. `npm run build` **FAIL**: Windows webpack `EACCES readlink` tại `AppData/Local/docker-secrets-engine.stale-recovery-20261018-094039/engine.sock` bên ngoài workspace. Không xóa hay sửa socket ngoài dự án.
- **Gate:** G5 **OPEN**, G6 **CONDITIONAL**, G7 **IN PROGRESS**, P8 **NOT STARTED**, production **NOT READY**. Chưa có xác nhận authenticated Google browser E2E, benchmark 10k, Docker runtime sau thay đổi hoặc kiểm toán dependency hoàn chỉnh.

### G7 — Serializable financial retries và concurrency regression (20/10/2026)

- `src/server/ledger.ts`: chuyển create/edit/void/refund transactions sang `serializable()` dùng chung (Serializable isolation, retry giới hạn khi PostgreSQL trả P2034/P2002); mỗi lần retry chạy lại toàn bộ kiểm tra version, số tiền còn được hoàn, sổ cái và audit trong transaction mới. Hết lượt retry trả lỗi xung đột cho HTTP layer; không chấp nhận ghi một phần.
- `tests/unit/serializable-retry.test.ts`: 4 regression tests cho retry P2034/P2002, không retry lỗi nghiệp vụ và giới hạn 5 lần. `scripts/integration-check.ts`: thêm tranh chấp hai edit cùng version, hai void cùng version, hai generators tạo forecast, generator đồng thời với rút ngắn/tạm dừng recurring; xác minh số journal, trạng thái cuối cùng và uniqueness. Các kịch bản PostgreSQL mới **chưa được thực thi**.
- **Kiểm chứng mới:** `npm run typecheck` **PASS**; `npm run lint` **PASS**; `npm run test` **186/186 (17 files) PASS**; `npm run security:routes` **PASS** (40 files/51 handlers); `npx prisma validate` **PASS**.
- **Hạ tầng:** TCP PostgreSQL `127.0.0.1:55433` **không kết nối**; Docker API **permission denied**; `npm run security:audit` **FAIL/INCONCLUSIVE** vì npm không cung cấp vulnerability report đầy đủ. PostgreSQL integration, ledger reconciliation, benchmark 10k, Docker Linux runtime và Google authenticated browser E2E vẫn chưa tái nghiệm thu.
- **Gate:** G5 **OPEN** — G6 **CONDITIONAL** — G7 **IN PROGRESS** — P8 **NOT STARTED** — production **NOT READY**.


### G7 — Budget aggregate và alert reconciliation (20/10/2026)

- Đã chuyển báo cáo ngân sách sang một phép PostgreSQL SUM(NUMERIC) cho TOTAL/CATEGORY/GROUP, xử lý DEBIT/CREDIT bao gồm reversal và refund, cô lập workspace. Đồng bộ BudgetAlert trong cùng Serializable transaction và gom alert operations thành batch, bảo toàn reachedAt khi kích hoạt lại.
- Đã loại ngân sách lưu trữ khỏi truy vấn cảnh báo mới và sửa nhãn OVER100 thành >100%.
- Bổ sung 5 unit tests, kịch bản PostgreSQL GROUP có số chi thực và concurrent report reads, thêm budget performance p50/p95/p99 cùng EXPLAIN vào benchmark trên finova_bench. Phần PostgreSQL integration/benchmark mới chưa chạy.
- Gates đạt: npm run typecheck, npm run lint, npm run test (191/191, 19 files), npm run security:routes (40 files/51 handlers), npx prisma validate.
- Blockers hiện tại: PostgreSQL localhost:55433 TCP False; Docker API permission denied; dependency audit thiếu vulnerability report đầy đủ; npm run build thất bại EACCES readlink tại C:\Users\TUNGNV\AppData\Local\docker-secrets-engine.stale-20261013\engine.sock ngoài workspace. Chưa có PostgreSQL integration mới, ledger reconciliation, 10k benchmark, Docker runtime smoke hay Google authenticated E2E.
- Tiếp theo: khôi phục hạ tầng an toàn; chạy G7 DB/concurrency/reconciliation, benchmark 10k, Docker Linux smoke, two-account Google browser E2E, accessibility/PWA, security audit, HTTPS staging, rotation secret, offsite backup và release acceptance. G5 OPEN, G6 CONDITIONAL, G7 IN PROGRESS, P8 NOT STARTED; production NOT READY.

## G7 — khôi phục Docker, đo 10.000 giao dịch và tối ưu dashboard (21/10/2026)

- **Môi trường:** Docker API bị `permission denied` trong sandbox; chạy với quyền phù hợp đã xác nhận `finova-db-1` healthy (`127.0.0.1:55433`), 9/9 migration up-to-date. Không khởi động lại container khác hoặc reset dữ liệu.
- **Gates:** TypeScript, ESLint, 191/191 unit tests (19 files), `security:routes` (40 file/51 handler), Prisma validate PASS; PostgreSQL financial integration **59 journals balanced** gồm tranh chấp Serializable, recurring và hai workspace. Security integration PASS (upload 12 nhận/8 từ chối; pre-auth 30 nhận/5 từ chối; Retry-After/isolation). Đối soát read-only sau thử nghiệm **1 journal, 0 sai lệch** (11 kiểm tra). Fixture `integration-%` trên `finova` và `bench-%` trên `finova_bench` đều còn **0 workspace**.
- **Audit:** `npm run security:audit` PASS theo policy hiện có: dependency production **0 findings**; **5 High dev-only** thuộc chuỗi `GHSA-vfj7-8cjw-p6xm` vẫn cần rà soát vào 01/12/2026.
- **Tối ưu mã nguồn:** `src/server/reporting.ts` thay việc tải toàn bộ `Posting` của kỳ về Node bằng truy vấn PostgreSQL `SUM` theo ngày Việt Nam, account và danh mục; giữ dấu Nợ/Có kể cả hoàn/hủy, Decimal, fallback expense không có Category, kiểm tra wallet/category theo workspace. Ma trận PostgreSQL integration PASS sau thay đổi.
- **Benchmark thực đo:** DB riêng `finova_bench`, **10.000 transactions / 10.000 journals / 20.000 postings**, cleanup PASS. Trên 20 mẫu tuần tự (2 warmups), dashboard **p50 1.630,46 → 17,42 ms**, **p95 1.711,86 → 38,97 ms**, **p99 1.767,12 → 39,31 ms**. Các đường khác sau tối ưu: budget p95 37,43 ms; heatmap p95 31,81 ms; CSV export p95 673,91 ms (5 mẫu). Baseline: `artifacts/G7_PERFORMANCE_10000_BEFORE_AGGREGATE.json`; kết quả/EXPLAIN: `artifacts/G7_PERFORMANCE_10000.json`. Đây là local sequential benchmark, chưa phải SLA multi-instance/staging.
- **Docker Linux source mới:** `finova:g7-reverify-20261021`, digest `sha256:e431d46af7889c7cf33edb5c2be5b08f56a410184d00afed8ea1f189e6283eee`. Next.js build 27 trang static/generated; production prune **302 packages, 0 vulnerabilities**. Runtime HTTP smoke tạm tại `127.0.0.1:3003` PASS: `/login` 200, manifest 200, GET wallets chưa đăng nhập 401, POST thiếu Origin 403, Origin hợp lệ nhưng chưa đăng nhập 401; CSP Report-Only, `DENY`, `nosniff` hiện diện. Image không chứa `.env`/Vitest và có Prisma Client; smoke container đã dọn.
- **Gate còn mở:** Google callback/session/logout bằng hai tài khoản, authenticated browser E2E/PWA/accessibility/mobile, concurrent multi-instance load, enforced CSP, trusted HTTPS ingress/WAF và monitoring, encrypted offsite backup, remote CI, rotate OAuth Client Secret và release acceptance. **G5 OPEN — G6 CONDITIONAL — G7 IN PROGRESS — P8 NOT STARTED — production NOT READY.**

## G7 tiếp tục — dashboard regression và local concurrent load (21/10/2026)

- **Docker/PostgreSQL:** Docker Desktop Linux Engine truy cập thành công khi chạy với quyền phù hợp; `finova-db-1` healthy; 9 migrations up-to-date. `npm run db:reconcile` đọc 1 journal hiện hữu, **0 sai lệch/11 kiểm tra**. Prisma validate PASS. Truy cập database trực tiếp trong sandbox mặc định còn bị hạn chế.
- **Regression mới:** `scripts/integration-check.ts` so sánh các KPI thu/chi, surplus, chuỗi theo ngày Việt Nam và breakdown danh mục của SQL aggregate với phép cộng độc lập từng Posting trên PostgreSQL thực. Đã kiểm chứng **11 cấu hình** qua 2 workspace: lọc ví/danh mục/kết hợp, reversal, refund, edit/void, import, chi phí ledger-only và ranh giới tháng. Integration PASS **59 journals balanced**; TypeScript, ESLint, 191/191 unit tests (19 files) và route guard audit (40 files/51 handlers) PASS.
- **Benchmark bổ sung:** `scripts/benchmark-reports.ts` đo `overview()` trên **một process Node.js** với 4/8/16 requests đồng thời, 8 rounds mỗi mức; kiểm tra expense KPI ở mọi lượt và lưu EXPLAIN ANALYZE đúng truy vấn aggregate. Đã chạy độc lập 3 lần trên `finova_bench` (10.000 transactions/10.000 journals/20.000 postings), tất cả PASS và cleanup thành công. `bench-%` và `integration-%` còn **0 workspace** sau kiểm thử.

  | Lần đo | Dashboard tuần tự p95 | Đồng thời 4 p95 | Đồng thời 8 p95 | Đồng thời 16 p95 |
  | --- | ---: | ---: | ---: | ---: |
  | 1 | 242,40 ms | 2.033,49 ms | 59,22 ms | 102,30 ms |
  | 2 | 229,96 ms | 2.050,54 ms | 2.027,31 ms | 147,13 ms |
  | 3 | 23,22 ms | 2.046,21 ms | 374,32 ms | 523,75 ms |

- **Đánh giá:** SQL aggregate đo `EXPLAIN ANALYZE` gần nhất **17,14 ms** (10.000 journals); tuy nhiên độ trễ service biến thiên lớn và xuất hiện outlier ~2 giây khi đồng thời. Chưa xác định nguyên nhân ở Prisma pool, môi trường Windows/Docker hoặc layer khác. Kết quả **không đủ chứng nhận SLA hay multi-instance stress**; cần profile connection acquisition, query và scheduling, sau đó đo trên staging nhiều replica qua HTTPS/HTTP thực.
- **Artifacts:** `artifacts/G7_PERFORMANCE_10000_CONCURRENT_FIRST.json` giữ lần 1; `artifacts/G7_PERFORMANCE_10000.json` giữ lần 3 cùng dashboard EXPLAIN; lần 2 đã ghi bảng ở trên. Baseline trước tối ưu còn trong `artifacts/G7_PERFORMANCE_10000_BEFORE_AGGREGATE.json`. p95 **38,97 ms** ở checkpoint trước là một phép đo cụ thể, không đại diện cho mọi lần chạy.
- **Security:** `npm run security:audit` PASS khi có kết nối registry; runtime **0 findings**, còn **5 High dev-only** (`GHSA-vfj7-8cjw-p6xm`) theo dõi đến 01/12/2026. Chỉ thay đổi scripts kiểm thử/benchmark và tài liệu trong lượt này; Docker runtime image G7 đã xác minh ở checkpoint trước.

**Gate:** G5 **OPEN**, G6 **CONDITIONAL**, G7 **IN PROGRESS**, P8 **NOT STARTED**, production **NOT READY**. Tiếp tục điều tra spike concurrent load, authenticated Google hai tài khoản, acceptance trình duyệt/mobile/PWA, bảo mật HTTPS staging, rotation secret, offsite backup và CI/release.

## G7 — phân rã dashboard latency và kiểm thử integrity (21/10/2026)

- Instrumentation tùy chọn ở `overview()` đo riêng `aggregate`, `walletBalances`, `transactionPage`, `topExpenses`, không đổi kết quả/kế toán. Benchmark đo cùng Prisma pool, thêm `dbPing`, SQL `pg_sleep(0.05)`, event-loop delay/utilization và prewarm 16 truy vấn; chỉ lưu artifact sau fixture cleanup.
- **Trước prewarm (lần profiling):** concurrency 4 p95 **2.031,54 ms**, 2/32 request >500 ms; concurrency 8 p95 **88,86 ms**, 2/64 request >500 ms. Slow requests thuộc nhánh ví hoặc giao dịch, aggregate p95 tương ứng 47,56/80,41 ms; SQL `EXPLAIN ANALYZE` **19,16 ms**. DB ping p95 ~1–2 ms, SQL ngủ 50 ms p95 ~53 ms, event loop tối đa ~12–15 ms ở các vòng có spike.
- **Sau prewarm:** prewarm 16 SQL ngủ 50 ms có p95 **2.081,59 ms**; dashboard đồng thời 4 p95 **2.036,54 ms**, đồng thời 8 p95 **2.072,10 ms**, đồng thời 16 p95 **148,83 ms**. Slow samples vẫn ở `transactionPage` hoặc `walletBalances`; SQL aggregate `EXPLAIN ANALYZE` **37,32 ms**. Prewarm đơn thuần **không xử lý** spike. Chưa đủ bằng chứng quy trách nhiệm cho Prisma pool, PostgreSQL, Windows/Docker networking hay giới hạn môi trường.
- **Regression:** `npm run typecheck`, `npm run lint`, `npm run test` (**191/191**), `npm run security:routes` (**40 files/51 handlers**) PASS sau instrument; PostgreSQL integration **59 journals balanced** PASS, `db:reconcile` **1 journal/11 checks/0 findings**, security integration quota/isolation PASS; `finova_bench` 9 migrations up to date. Benchmark artifact cuối cùng `artifacts/G7_PERFORMANCE_10000.json` (10k/10k/20k fixture, cleanup PASS).
- **Checklist:** T07.05 và T07.06a/b đã đánh dấu `[x]` trong master plan; T07.06c/d, authenticated browser, CI remote, staging và release gate còn `[ ]`. G5 OPEN, G6 CONDITIONAL, G7 IN PROGRESS; production NOT READY.

## G7 — Docker image runtime smoke (21/10/2026)

- **Image xác minh:** `finova:g7-profile-20261021` (`sha256:9e67007748ffa5e65935c9de4b046dc150c0559ff0fd4225f86506e7ca8f46d8`), container tạm `finova-g7-profile-smoke` chạy bằng user `node`, healthcheck **healthy** tại `127.0.0.1:3003`.
- **HTTP PASS:** `/login` và `/manifest.webmanifest` **200**; GET `/api/v1/wallets` chưa xác thực **401**; POST `/api/v1/wallets` thiếu Origin **403**, Origin hợp lệ nhưng chưa xác thực **401**. `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, CSP Report-Only hiện diện; API private dùng `Cache-Control: no-store`.
- **Runtime image PASS:** Node load được `/app/generated/prisma-client/client.js` và Prisma engine, không có `.env`, Vitest hoặc Prisma CLI trong image. Container tạm đã dừng/tự xóa; các container đang chạy khác giữ nguyên. Secret runtime trong smoke là giá trị tạm, không nhúng vào image và không sử dụng database thật.
- **Checklist:** T07.08a `[x]`. T07.08b vẫn `[ ]` do chưa có release migrations, Compose application profile, rollback và HTTPS staging acceptance. **G7 IN PROGRESS / production NOT READY**.

## G7 — Prisma query timeline và pool sizing (21/10/2026)

- **Phạm vi:** ba lượt độc lập trên `finova_bench`, mỗi lượt tạo 10.000 transactions / 10.000 journals / 20.000 postings, KPI/ledger validation và cleanup fixture PASS. Bật `FINOVA_BENCH_PROFILE=1` để lấy Prisma QueryEvent timing (không ghi SQL/parameters). PostgreSQL `max_connections=100`. Số liệu sau warmup một process Windows/Prisma/Docker Desktop, chưa có HTTP/multi-replica acceptance.

  | Prisma pool | Dashboard concurrent 4 p95 | Concurrent 8 p95 | Concurrent 16 p95 | Request >500 ms (4/8/16) | Prewarm 16 p95 |
  | --- | ---: | ---: | ---: | --- | ---: |
  | Mặc định | 2.032,76 ms | 57,63 ms | 118,10 ms | 2/2/0 | 2.081,59 ms (checkpoint trước) |
  | `connection_limit=8` | 50,54 ms | 145,84 ms | 293,46 ms | 0/0/0 | 106,05 ms |
  | `connection_limit=16` | 58,17 ms | 87,70 ms | 170,94 ms | 0/0/0 | 2.083,84 ms |

- **Query timing:** mặc định **3.800** Prisma query events, p95 **52 ms**, p99 **92 ms**, **0 event >500 ms**; các request Dashboard trễ ~2.032–2.042 ms đều có query event duration lớn nhất chỉ **38 ms** trong cửa sổ đó. Pool 8 có 3.789 events, 0 >500 ms; pool 16 có 3.789 events, 0 >500 ms. Điều này đặt phần chờ ở ngoài thời gian thực thi SQL được Prisma báo cáo; khả năng xảy ra khi mở/nhận connection từ pool, nhưng chưa đo tách bạch connection establishment, Windows/Docker transport hay engine scheduling.
- **Thay đổi:** `.env.example` thêm `connection_limit=16` để khống chế số connection/replica, có hướng dẫn budgeting trong README/runbook. Không sửa credentials `.env` hay production DB. Với pool 16, spike ban đầu vẫn có thể xuất hiện trong prewarm, nên không coi đây là khắc phục triệt để cold startup.
- **Artifacts:** `artifacts/G7_PERFORMANCE_10000_QUERY_TRACE_DEFAULT.json`, `_POOL8.json`, `_POOL16.json`; `artifacts/G7_PERFORMANCE_10000.json` chứa lượt pool16. Cả ba chỉ được ghi sau cleanup fixture thành công.
- **Checklist:** đánh dấu **T07.06c1** (trace + so sánh pool), giữ **T07.06c/d** mở đến khi có quan sát connection startup/transport và staging multi-instance, T07.08b và release acceptance vẫn mở. **G7 IN PROGRESS, production NOT READY.**

## G7 — Compose profiles và migration job trên database cách ly (21/10/2026)

- **Build và kiểm tra cấu hình:** `docker compose config --quiet`, `--profile app config --quiet`, `--profile release config --quiet` PASS; image job `finova-migrate:latest` từ build stage thành công. Job migration chỉ chạy khi gọi profile `release`, và production image không cài Prisma CLI.
- **Migration thực thi qua Compose:** cung cấp `FINOVA_MIGRATION_DATABASE_URL` dành riêng cho `db:5432/finova_bench`; `prisma migrate status` xác nhận **9 migrations/up-to-date**; job `prisma migrate deploy` PASS với **0 pending**. Không migration hay reset database chính.
- **App runtime Compose:** dùng image `finova:g7-poolprofile-20261021` digest `sha256:2f06ef31edb574e910681ffaaeb88eea02fe355e3847d4b27d3943b7873c24bf`, container tạm cổng `127.0.0.1:3004`, user `node`, trạng thái **healthy**. GET `/login` và manifest **200**; GET wallets không đăng nhập **401**; POST thiếu Origin **403**, Origin hợp lệ/chưa đăng nhập **401**; `DENY`, `nosniff`, CSP Report-Only PASS. Prisma query từ chính container PASS và xác nhận database `finova_bench`; không sử dụng dữ liệu thật. Container app và các migration job thử nghiệm đã tự xóa; PostgreSQL `finova-db-1` còn healthy.
- **Regression sau profiler:** `typecheck`, `lint`, **191/191 unit tests**, `security:routes` **40 files/51 handlers**, `prisma validate` PASS; PostgreSQL financial integration **59 journals balanced**, security integration quota/isolation PASS; reconciliation **1 journal/11 checks/0 findings**. Docker Linux build 27/27 pages, production pruning 302 packages/0 vulnerabilities, image mới HTTP smoke PASS.
- **Checkbox tại checkpoint Compose:** T07.08b Compose/migration cục bộ **[x]**; T07.08c staging release **[ ]**, T07.06c/d lúc đó **[ ]**. **G5 OPEN / G6 CONDITIONAL / G7 IN PROGRESS / P8 NOT STARTED / production NOT READY**.

## G7 — phân biệt IPv6/IPv4 và khắc phục cold Prisma connection (21/10/2026)

- **Giải thích outlier ~2 giây:** `localhost:55433` trên Windows resolve IPv6 family 6, trong khi DB của Docker Desktop chỉ publish `127.0.0.1:55433`. TCP/DNS probe riêng tối đa ~6,43 ms (pool 16), nhưng Prisma `$connect` 2.307,64 ms và cold wave 16 truy vấn 2.043,92 ms. Khi giữ pool 16 và chỉ đổi URL host sang `127.0.0.1` (DNS family 4), `$connect` còn 17,92 ms, cold wave 20,04 ms; warm wave 2,11 ms. Lượt lặp độc lập xác nhận cùng xu hướng: localhost 2.043,37/2.063,61 ms so với IPv4 14,18/16,48 ms, lưu tại `artifacts/G7_PRISMA_NETWORK_WINDOWS_LOCALHOST_16.json` và `artifacts/G7_PRISMA_NETWORK_WINDOWS_IPV4_16.json`. Pool mặc định đối chứng: `localhost` 2.870,11/2.050,39 ms, IPv4 15,50/16,85 ms. Không có Prisma SQL event >500 ms trong các lượt chẩn đoán. Bằng chứng chỉ ra sự tương tác của resolution IPv6 với đường kết nối Prisma qua Docker Desktop; chưa phân biệt chính xác cơ chế fallback trong Prisma engine.
- **Linux đối chứng:** container Node 22 trên network `db:5432` đo cold wave 16 yêu cầu 41,02 ms và không có SQL event >500 ms; `$connect` 654,54 ms trong lượt này (checkpoint trước 69,23 ms), event-loop max 385,35 ms. Đo Linux có biến thiên startup, nhưng không tái hiện 2 giây cold wave của Windows `localhost`.
- **Thay đổi:** `.env.example` và local `.env` chỉ chuyển host DSN Windows sang `127.0.0.1` (giữ credentials); Compose app bỏ fallback DSN/mật khẩu mẫu và có startup guard thoát exit 1 nếu thiếu `FINOVA_CONTAINER_DATABASE_URL`. Compose config PASS, guard test PASS; với URL nội bộ trỏ `finova_bench` thì `/login` HTTP 200, Prisma Client từ chính container xác nhận `current_database() = finova_bench` và container QA được xóa. Profile migration vẫn tách biệt.
- **Regression 10k riêng `finova_bench`:** tạo 10.000 transactions/10.000 journals/20.000 postings; dashboard tuần tự p50/p95/p99 **220,20/232,53/233,23 ms**; dashboard đồng thời 4/8/16 request p95 **64,85/89,34/174,53 ms**, p99 **66,48/91,56/177,08 ms**, **0 request >500 ms** trên 224 mẫu concurrent. Prisma 3.786 query events, 0 >500 ms. Artifact `artifacts/G7_PERFORMANCE_10000.json`; script cleanup PASS và kiểm tra read-only độc lập còn **0 `bench-*` workspace**. Chỉ là Node local benchmark, không đại diện HTTPS nhiều replica.
- **Ngoại lệ còn theo dõi:** Goals trong 20 mẫu tuần tự có p95 20,04 ms nhưng p99 **4.686,06 ms** (một outlier). Cần lấy trace/đo lại dưới tải staging ở T07.06d trước khi kết luận SLA hệ thống. Không suy diễn đã khắc phục mọi outlier.
- **Regression/checkbox:** TypeScript, ESLint, **191/191 unit tests (19 files)**, `security:routes` **40 files/51 handlers** và Prisma schema validate PASS; ledger reconciliation read-only **1 journal/11 checks/0 sai lệch**. `finova-db-1`, toàn bộ Fleet 2F và MyDrive containers tiếp tục healthy. T07.06c và T07.06c2 **[x]** do có before/after, config fix và benchmark hậu kiểm; T07.06d, T07.08c, G7 và production acceptance vẫn **[ ]**. **G5 OPEN / G6 CONDITIONAL / G7 IN PROGRESS / P8 NOT STARTED / production NOT READY**.

## Checkpoint P0 / đặc tả / invariant — 21/10/2026

- **Hoàn tất tài liệu:** T00.03 PRD có persona, 3 journeys, 10 stories; T00.05 ADR-0006; T00.10 test plan 18 ca với fixture và mức chứng cứ. Đồng bộ `ARCHITECTURE`, `ERD` (9 migrations), `REPORT_DEFINITIONS` (PostgreSQL aggregate và 8 recent), `API_CONTRACT`, `GAP_ANALYSIS`, README và tracker. T07.12b tài liệu cục bộ `[x]`; T07.12 release tổng thể `[ ]`.
- **Bổ sung kiểm thử:** 512 case pseudo-random seeded trong một unit test, gồm INCOME/EXPENSE/TRANSFER/REFUND, reversal cân/triệt tiêu và VND qua JSON string; chạy toàn bộ **195/195 tests/20 files PASS**, riêng ledger **9/9 PASS**.
- **Static gates:** `typecheck`, `lint`, `security:routes` (40 route files/51 handlers) và `prisma validate` PASS sau chỉnh sửa. `npm run build` trên Windows **FAIL** ở Webpack do `EACCES readlink` tại `C:\Users\TUNGNV\AppData\Local\docker-secrets-engine.stale-recovery-20261018-094039\engine.sock` ngoài workspace; không sửa/xóa socket của ứng dụng khác. Docker Linux build PASS là **checkpoint trước**, chưa build lại sau lần cập nhật tài liệu/test này.
- **Không chạy lại:** PostgreSQL integration/reconcile, benchmark, Docker runtime, Google browser. Bằng chứng 59 journals/11 reconciliation checks/10k/local image thuộc các lần kiểm thử trước cùng ngày; không nhận là mới.
- **Gate:** G0 còn rà soát tính đầy đủ công thức và ví dụ; G5 **OPEN**, G6 **CONDITIONAL**, G7 **IN PROGRESS**, P8 **NOT STARTED**. Cần Google thật hai session/IDOR, authenticated E2E, PWA/a11y, staging HTTPS/CSP/WAF, multi-replica SLA, offsite restore, secret rotation, remote CI, rollback và sign-off. **Production NOT READY**.
# Dashboard — nhóm kỳ thu–chi và số dư theo ví (21/10/2026)

- T03.03 `[x]`: thêm lựa chọn ngày/tuần/tháng, tuần bắt đầu thứ Hai, aggregate bằng Decimal giữ đúng số tiền cả khi kỳ hoàn tiền âm; trục VND compact, tooltip đầy đủ, bảng dữ liệu có thể mở bằng bàn phím.
- T03.06 `[x]`: trực quan hóa số dư từng ví tài sản ASSET tại `endExclusive`, kể cả ví lưu trữ; thẻ tín dụng/liability tách ngoài, số VND gốc có trong danh sách và link drill-down ví giữ bộ lọc thời gian.
- Mới kiểm chứng: TypeScript/ESLint PASS, 220/220 unit tests trên 28 files PASS, security route guard 40 files/51 handlers PASS, Prisma schema validate PASS. Test thêm cho cross-year Mondays, month aggregation, refund và việc không đưa CREDIT vào số dư cash.
- **Chưa kiểm chứng lại:** authenticated browser E2E, PostgreSQL fixture/reconcile, Docker Linux build, benchmark. T03.02, T03.05, T03.09, T03.12 và các release gate vẫn `[ ]`; G5 OPEN, G6 CONDITIONAL, G7 IN PROGRESS, production NOT READY.

