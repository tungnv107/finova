# Finova — Kế hoạch triển khai đồng bộ sao kê ngân hàng

**Cập nhật:** 22/10/2026 · **Nguồn yêu cầu:** [Đặc tả đồng bộ sao kê](FINOVA_DONG_BO_SAO_KE_NGAN_HANG_DESIGN.md), Phần VI.  
**Trạng thái:** Đang triển khai (**3/45 nhiệm vụ đã nghiệm thu**); **chưa đủ điều kiện phát hành kết nối ngân hàng thật**.  
**Quy tắc nghiệm thu:** `[x]` chỉ khi phần việc được thực hiện và đã có kiểm tra phù hợp; `[ ]` là còn thiếu triển khai, kiểm thử hoặc điều kiện nghiệm thu. Không suy diễn việc schema hợp lệ thành migration đã áp dụng.

## 1. Phạm vi, quyết định và phụ thuộc

- **MVP đang thực hiện:** nhập tệp CSV/XLSX → preview → mã hóa raw event → durable inbox/outbox → review thủ công → liên kết/ghi sổ qua **double-entry ledger**. Sandbox webhook HMAC chỉ để thử nghiệm nội bộ và bị khóa ở production.
- **Ngoài phạm vi đã xác nhận:** chưa có hợp đồng, tài khoản thử nghiệm hoặc khóa/API chính thức với bất kỳ ngân hàng/aggregator nào; không công bố hỗ trợ ngân hàng thật, không thu OTP/mật khẩu, không tự động điều chỉnh số dư.
- **Chính sách ghi sổ:** `REVIEW_FIRST`, người dùng duyệt từng dòng `BOOKED`; `PENDING`, `REVERSED`, xung đột và trước cutover cần xử lý đặc biệt. Lựa chọn `HYBRID` trong đặc tả là mục tiêu sau khi có kiểm thử đầy đủ.
- **Tiền tệ:** chỉ VND nguyên, decimal; thời điểm nguồn có offset và được lưu UTC; đối chiếu cutover theo ngày người dùng chọn.
- **Điều kiện kỹ thuật:** Next.js 16 App Router, React 19, PostgreSQL, Prisma 6, Better Auth, Vitest; hướng dẫn Next từ `node_modules/next/dist/docs/` phải đọc trước khi thay API Next.
- **Phụ thuộc triển khai:** BS0 → BS1 → BS2 → BS3 → BS4 → BS5; BS2-06/BS3 OAuth/BS4 polling/BS5-06 chỉ bắt đầu sau khi đối tác xác nhận quyền truy cập và cung cấp tài liệu/credentials hợp lệ.

## 2. Sprint/task tracker — 45 nhiệm vụ

Ký hiệu cột: **ĐK** = điều kiện/phụ thuộc; **Kiểm chứng** = cách nhận bằng chứng nghiệm thu. Mọi task đã có code nhưng thiếu kiểm tra vẫn để `[ ]`.

### BS0 — Nghiên cứu & quyết định (6)

| Hoàn thành | ID | Kết quả cần bàn giao | ĐK | Kiểm chứng / vướng mắc |
|---|---|---|---|---|
| [ ] | BS0-01 | Bản đồ kiến trúc ledger, import, auth, model cùng đối chiếu tài liệu gốc | — | Đã khảo sát mã nguồn; còn thiếu biên bản xác nhận đầy đủ Master Plan và Brand Guideline |
| [ ] | BS0-02 | Bảng so sánh provider thật: quyền cá nhân, hai chiều, consent, phí, SLA, API docs có dẫn nguồn | Pháp lý/đối tác | Chưa có xác nhận hợp đồng và coverage cụ thể |
| [ ] | BS0-03 | ADR data contract, các trạng thái, cutover, fingerprint/idempotency và chuẩn bút toán | BS0-01 | DTO/thiết kế có rồi; cần duyệt policy reversal/refund |
| [ ] | BS0-04 | Threat model, đánh giá pháp lý, consent, retention, xóa dữ liệu | BS0-02 | Phải có review pháp chế và chủ quản dữ liệu |
| [ ] | BS0-05 | Wireframe đầy đủ 6 màn + responsive, brand review | BS0-01 | UI MVP `/bank-sync` mới là một phần |
| [ ] | BS0-06 | Fixture synthetic, thử nghiệm HMAC/import, mô tả release gate | BS0-03 | Fixture ký HMAC và 4 route tests đạt; thiếu DB-backed signed-webhook E2E và staging |

### BS1 — Nền tảng dữ liệu, nhập sao kê (9)

| Hoàn thành | ID | Kết quả cần bàn giao | ĐK | Kiểm chứng / vướng mắc |
|---|---|---|---|---|
| [ ] | BS1-01 | Migrations 4 bảng kết nối & composite workspace foreign keys | BS0-03 | `prisma/schema.prisma`, 2 SQL migrations; **chưa apply DB** |
| [ ] | BS1-02 | Immutable raw event + bank transaction, source version, indexes | BS1-01 | Schema và encryption đã viết; cần database integration/append-only policy |
| [ ] | BS1-03 | Link, review, audit, snapshot, outbox + FK | BS1-01 | Schema/migration đã viết; cần apply/kiểm chứng FK |
| [x] | BS1-04 | Normalized DTO/Zod, VND nguyên, timestamp có offset, fingerprint | BS0-03 | `src/modules/bank-sync/domain.ts`; unit tests `bank-sync-domain.test.ts` đạt |
| [x] | BS1-05 | CSV/XLSX adapter, mapping/preview, invalid row report, file/hash validation | BS1-04 | `statement.ts`, `bank-sync-manager.tsx`; unit `bank-sync-statement.test.ts` và bộ `import-files` đạt, typecheck/lint đạt; browser UAT ở BS3 |
| [ ] | BS1-06 | Dedupe provider/file/cross-file + manual matching an toàn | BS1-02 | Fingerprint và duplicate blocking có mã; cần thử DB concurrent/replay |
| [ ] | BS1-07 | Atomic source link/ledger, transfer/refund, no double count | BS1-06 | `service.ts`, `ledger.ts`; reversal/refund chưa hoàn chỉnh |
| [ ] | BS1-08 | Lịch sử + bộ lọc + detail read-only và metadata edit | BS1-07 | Có lọc chiều/trạng thái/từ khóa, xem chi tiết 50 nguồn gần nhất; còn thiếu phân trang server, sửa metadata và UAT |
| [ ] | BS1-09 | Unit + DB integration và concurrency/replay financial tests | BS1-01–08 | Unit đã có, DB không kết nối được nên chưa đủ |

### BS2 — Webhook/sandbox và worker (8)

| Hoàn thành | ID | Kết quả cần bàn giao | ĐK | Kiểm chứng / vướng mắc |
|---|---|---|---|---|
| [x] | BS2-01 | Adapter interface/capability registry + synthetic fixture | BS1-04 | `adapters.ts` có interface/allowlist/fixture ký; 2 test contract đạt, không đăng ký provider thật |
| [ ] | BS2-02 | POST raw webhook, bounded payload, verify trước ACK | BS2-01 | Route tests đã đạt các nhánh 202/200/400/401/403/404/413/500; cần DB integration để xác nhận durable commit trước ACK |
| [ ] | BS2-03 | Provider-specific verifier, rotation, negative vectors | Hợp đồng provider | Chỉ có HMAC *nội bộ*, không được dùng cho provider thật |
| [ ] | BS2-04 | Durable inbox/outbox, retries, lease, DLQ, replay hạn chế | BS1-02 | Mã worker có; thiếu DB outage/replay test/admin replay |
| [ ] | BS2-05 | Tenant-scoped mapping và authorization | BS1-01 | Composite FKs có; thiếu tenant A/B integration tests |
| [ ] | BS2-06 | Adapter đối tác được cấp phép | Hợp đồng + credentials | **BLOCKED: chưa có quyền kết nối thật** |
| [ ] | BS2-07 | Đồng bộ trạng thái, dashboard/budget cache sau ledger commit | BS1-07 | Dùng ledger sẵn; cần smoke end-to-end |
| [ ] | BS2-08 | Webhook forgery/replay/malformed/outage E2E | BS2-02–05 | HMAC, malformed, oversized, disabled và simulated DB failure route tests đạt; DB replay/outage E2E còn thiếu |

### BS3 — Kết nối, consent, trải nghiệm (7)

| Hoàn thành | ID | Kết quả cần bàn giao | ĐK | Kiểm chứng / vướng mắc |
|---|---|---|---|---|
| [ ] | BS3-01 | Verified bank list và feature flags | BS0-02 | Danh sách `verifiedBanks` đang rỗng an toàn |
| [ ] | BS3-02 | Wizard select/scope/OAuth/accounts/wallet/settings | BS3-01 | Chưa thể triển khai provider flow thật |
| [ ] | BS3-03 | PKCE/state, evidence, token vault, TTL, mapping | Provider docs | Chưa có OAuth provider thật; sandbox consent chỉ giả lập |
| [ ] | BS3-04 | Pause/resume/revoke/reconnect/refresh | BS3-03 | Có pause/resume/revoke nội bộ, chưa có provider refresh |
| [ ] | BS3-05 | Last sync, job/history/error UX | BS2-04 | Thông tin connection cơ bản, job view còn thiếu |
| [ ] | BS3-06 | Tenant/CSRF/token/callback replay tests | BS3-03 | Chưa có test OAuth và tenant DB |
| [ ] | BS3-07 | 360px/mobile + keyboard + brand V2 QA | BS3-02 | Chưa browser/mobile/a11y UAT |

### BS4 — Đối soát tài chính (8)

| Hoàn thành | ID | Kết quả cần bàn giao | ĐK | Kiểm chứng / vướng mắc |
|---|---|---|---|---|
| [ ] | BS4-01 | Pagination/cursor/backfill/overlap/retry | Provider history API | Chưa có provider polling |
| [ ] | BS4-02 | So sánh số dư as-of, gap detection, snapshot | BS4-01 | Model snapshot, chưa có worker |
| [ ] | BS4-03 | Cutover dry-run + tác động opening balance/rollback | BS1-07 | Guard trước cutover có; chưa có dry-run/rollback |
| [ ] | BS4-04 | Hai bank sources ↔ một transfer journal | BS1-07 | Cho phép LINK vế còn lại, đã chặn liên kết lặp một vế; cần DB E2E |
| [ ] | BS4-05 | Category rule engine và user override | BS1-07 | Model rule có, engine/UI chưa có |
| [ ] | BS4-06 | Review inbox/API/UI + conflict-safe audit | BS1-06–07 | Đã có code, cần đồng thời/tenant integration |
| [ ] | BS4-07 | PENDING/BOOKED/reversal/refund/card/loan | BS4-06 | Đã thêm chuyển trạng thái PENDING/UNKNOWN → BOOKED, nhận diện REVERSED, chặn stale/reopen (unit pass); chưa có compensating journal/refund/card/loan và DB tests |
| [ ] | BS4-08 | Financial regressions, backfill/replay, ledger invariant | BS4-01–07 | Chưa có full financial suite |

### BS5 — Vận hành và phát hành (7)

| Hoàn thành | ID | Kết quả cần bàn giao | ĐK | Kiểm chứng / vướng mắc |
|---|---|---|---|---|
| [ ] | BS5-01 | Burst/load, lock contention, queue lag test | BS2-04 | Chưa stress DB |
| [ ] | BS5-02 | Threat model, rotation, PII/logs, tenant review | BS0-04 | Audit dependency chưa đủ báo cáo; thiếu security sign-off |
| [ ] | BS5-03 | Metrics/alerts, DLQ admin replay/status | BS2-04 | Chưa có admin UI/alerting |
| [ ] | BS5-04 | Backup/restore drill, schema rollout/rollback, key rotation | BS1-03 | Runbook có, chưa kiểm chứng restore/rotation |
| [ ] | BS5-05 | Runbook incident/outage/consent/missing transactions | BS2-04 | Đã viết [runbook](FINOVA_BANK_SYNC_RUNBOOK.md), cần kiểm thử diễn tập |
| [ ] | BS5-06 | Staging provider hợp lệ và giao dịch được phép | BS2-06 | **BLOCKED: provider access** |
| [ ] | BS5-07 | UAT, pháp lý, security, release GO/NO-GO | BS5-01–06 | Chưa đủ điều kiện |

## 3. Thứ tự công việc tiếp theo và tiêu chí hoàn tất

**Ưu tiên P0 (trước staging):** (1) kết nối PostgreSQL thử nghiệm, chạy `prisma migrate deploy/status`, kiểm tra composite FKs và unique partial index; (2) viết DB integration cho same-event replay, hai worker, hai source giống nhau, tenant A/B, transfer hai đầu và cân bằng ledger; (3) triển khai reversal bằng compensating journal và refund/card/loan flows; (4) kiểm tra raw event encryption/retention và incident logging. Mọi sai lệch tài chính phải fail closed.

**Ưu tiên P1:** UI filter/detail/mobile, reconciliation snapshot + cutover dry-run, category rule engine, pagination/history jobs, cleanup policy. OAuth/PKCE và polling chỉ triển khai theo adapter chính thức sau hợp đồng.

**Chuỗi test:** `npx prisma validate` → `npm run typecheck` → `npm run lint` → `npm run test` → DB integration (cần DB) → `npm run build` → `npm run security:audit` → browser smoke + UAT. `FINOVA_NEXT_DIST_DIR` có thể tách output nhưng **chưa giải quyết được EPERM trên Windows**, cần xử lý quyền/lock ở môi trường build hoặc chạy CI Linux để xác minh.

**Release gate:** chỉ GO khi migration staging, replay/duplicate/transfer/tenant tests, rollback drill, security audit, consent/legal và provider-specific real sandbox E2E cùng đạt. Nếu chưa có đối tác hợp lệ, chỉ được phát hành phần **nhập sao kê thủ công** sau UAT riêng; giao diện không ngụ ý đã có auto bank integration.

## 4. Bằng chứng kiểm thử hiện tại (22/10/2026)

| Hạng mục | Kết quả | Giới hạn |
|---|---|---|
| Prisma schema | PASS `npx prisma validate` | SQL migrations chưa apply vào DB |
| TypeScript | PASS `npm run typecheck` | Phụ thuộc Prisma Client đã generate trước đó |
| ESLint | PASS toàn repo (đã loại `.next*/**` khỏi lint) | Sau sửa một lỗi render purity do `Date.now()` trong client component |
| Unit tests | PASS **46 files / 293 tests** | 18 bank-sync tests: domain, statement, adapter và webhook route có mock; chưa có bank-sync DB tests |
| Production build | **BLOCKED** `EPERM mkdir .next-bank-sync-validation-20261022/types/app/api/v1` | Đã thử isolated build; build chưa đạt trên Windows |
| Security audit | **INCOMPLETE** `npm audit` không trả báo cáo vulnerability đầy đủ | Không thể kết luận sạch lỗ hổng |
| Database migration | **BLOCKED** `prisma migrate status: Schema engine error` | Docker Engine trả `permission denied` qua named pipe |
| Git change status | **UNAVAILABLE** thư mục làm việc không có `.git` | Không thể cung cấp diff/commit status |

### Bổ sung đã kiểm chứng trong lần cập nhật này

- `src/modules/bank-sync/adapters.ts`: định nghĩa adapter contract/registry rõ ràng, chỉ chấp nhận `SANDBOX` hoặc `STATEMENT_IMPORT`; fixture HMAC dùng test nội bộ. `tests/unit/bank-sync-adapters.test.ts` kiểm chứng capability và chữ ký.
- `src/app/api/webhooks/bank-sync/[provider]/route.ts`: chuyển route giả lập sang adapter; `tests/unit/bank-sync-webhook-route.test.ts` kiểm thử chữ ký sai, JSON lỗi, giới hạn body, thiếu connection, sandbox tắt, lặp event và trường hợp persistence từ chối. Kiểm thử dùng mock nên chưa đại diện cho tính bền vững DB.
- `src/modules/bank-sync/domain.ts` và `service.ts`: xử lý tiến trình trạng thái `BOOKED`/`REVERSED` có review thủ công, không tự tạo bút toán đảo; bỏ trạng thái `NOT_BOOKED` đã lỗi thời khi đã BOOKED. `tests/unit/bank-sync-domain.test.ts` có negative vectors.
- `/bank-sync`: ngày cutover được chuẩn bị từ server để tránh `Date.now()` trong React render; chi tiết chứng từ/bộ lọc trong 50 dòng nguồn gần nhất; sửa lựa chọn thao tác trên bản ghi không đủ điều kiện BOOKED.

### Rủi ro còn tồn tại

- Sao kê không có transaction ID ngân hàng ổn định: fingerprint chỉ hỗ trợ **phát hiện khả năng trùng**; giao dịch gần giống nhau cần review, không được tự gộp.
- Hệ thống không tự động đảo bút toán khi provider trả `REVERSED`; trường hợp này được đưa vào review và chặn ghi sổ trực tiếp.
- Mã hóa raw events dùng một khóa AES-GCM; thay khóa khi còn dữ liệu sẽ làm mất khả năng đọc nếu chưa có quy trình re-encrypt; xem runbook.
- API và UI MVP chưa đủ tiêu chí UX đầy đủ của thiết kế (6 màn, filter, history, reconciliation, rules).
