# Finova — Kế hoạch triển khai SePay Bank Hub Open API

**Ngày cập nhật:** 23/10/2026 · **Mức sẵn sàng:** DEV/fixture + PostgreSQL integration, **NO-GO production**. **13 nhiệm vụ đã nghiệm thu**; các bước cần SePay UAT/staging/legal vẫn mở.
**Phụ thuộc:** [Đặc tả gốc](FINOVA_DONG_BO_SAO_KE_NGAN_HANG_DESIGN.md), [Bank Sync tracker](FINOVA_BANK_SYNC_IMPLEMENTATION_PLAN.md), [Runbook](FINOVA_BANK_SYNC_RUNBOOK.md).  
**Quy ước:** `[x]` chỉ dùng khi code/tài liệu đã có và kiểm chứng tương ứng đạt; `[ ]` gồm đang làm, thiếu kiểm thử, cần thông tin đối tác hoặc UAT. Không coi unit mock là tích hợp thật.

## 1. Hợp đồng API đã đối chiếu

| Chủ đề | Đặc tả SePay Bank Hub | Cách dùng tại Finova |
|---|---|---|
| Môi trường | `https://bankhub-api-sandbox.sepay.vn/v1` và `https://bankhub-api.sepay.vn/v1` | Host cố định theo `FINOVA_SEPAY_BANKHUB_ENV`; mặc định sandbox. |
| Merchant authentication | `POST /token`, `Authorization: Basic base64(client_id:client_secret)`; kết quả có `access_token`, `ttl` theo giây | Chỉ backend gọi, Bearer token lưu trong bộ nhớ tiến trình với margin 30 giây, cấp lại một lần khi 401. Không có OAuth người dùng trong Bank Hub. |
| Tạo công ty | `POST /company/create`, `{full_name, status:"Active"}` | Mỗi Finova workspace dùng công ty riêng (`company_xid`) do **backend** tạo; không nhận XID của một workspace khác từ trình duyệt. |
| Liên kết ngân hàng | `POST /link-token/create`, `{company_xid,purpose:"LINK_BANK_ACCOUNT"}` trả `hosted_link_url` | Mở hosted link chính hãng; chỉ lấy danh sách tài khoản qua backend sau khi hoàn tất. Không tự lấy OTP/mật khẩu. |
| Danh sách tài khoản | `GET /bank-account?company_xid&page&per_page` | Backend giới hạn trang, xác thực lại `company_xid`, hiển thị số tài khoản đã che. |
| Lịch sử giao dịch | `GET /transaction?company_xid&bank_account_xid&start_transaction_date&end_transaction_date&page&per_page` | 50 dòng/trang, tối đa 20 trang/lần/tài khoản, 31 ngày/lượt; dừng khi lỗi/cross-account. |
| Biến động tức thời | IPN JSON riêng chứa `bank_account_xid`, `transaction_id`, `transfer_type`, `amount`, `transaction_date`; `Authorization: Apikey {API_KEY}` | Endpoint `/api/webhooks/sepay-bankhub/ipn`; so khớp API key hằng thời gian, xác định duy nhất tài khoản đã gắn trước ACK. Trả `{success:true}` **sau** khi commit inbox. |
| Webhook sự kiện | `BANK_ACCOUNT_LINKED`, `BANK_ACCOUNT_UNLINKED`,... dùng endpoint và secret riêng | **Khác IPN**; chưa tự suy diễn sự kiện thành giao dịch. Đồng bộ danh sách tài khoản sau hosted link bằng API đã xác thực. |
| Trạng thái/số dư | `transfer_type` credit/debit; IPN `accumulated` hiện không hỗ trợ | VND nguyên, `IN/OUT`, `BOOKED`, timestamp Việt Nam +07:00. Không dùng `accumulated=0` làm số dư thực tế. |
| Chống trùng | ID giao dịch `transaction_id` | `externalTransactionId` của bank transaction; event ID `history:` và `ipn:` riêng; trùng bản ghi về cùng bank account chỉ được ghi sổ **một lần**, luôn review-first. |

Nguồn: https://developer.sepay.vn/vi/bankhub/tong-quan ; https://developer.sepay.vn/vi/bankhub/api/tong-quan-api ; https://developer.sepay.vn/vi/bankhub/api/tao-token ; https://developer.sepay.vn/vi/bankhub/api/link-token/tao-link-token ; https://developer.sepay.vn/vi/bankhub/api/tai-khoan-ngan-hang/danh-sach-tai-khoan ; https://developer.sepay.vn/vi/bankhub/api/api-giao-dich/danh-sach-giao-dich ; https://developer.sepay.vn/vi/bankhub/thong-bao-bien-dong-so-du ; https://developer.sepay.vn/vi/bankhub/webhook-event .

## 2. Luồng đồng bộ

1. Người dùng vào `/bank-sync`, chọn **Tạo Hosted Link SePay**, backend tạo bản ghi kết nối PAUSED; tạo `company_xid` riêng cho workspace rồi gọi API link token. Không hiển thị client secret.
2. Người dùng hoàn tất kết nối ở SePay. Finova gọi `GET /api/v1/bank-sync/sepay/accounts` với connection do server lưu; cho chọn tài khoản đã xác minh, ví VND và đồng ý đồng bộ.
3. Finova lưu consent/audit, ánh xạ `bank_account_xid` → `bank_accounts.wallet_id` và kích hoạt connection. Cùng ví không được liên kết hai nguồn ACTIVE.
4. IPN nhận giao dịch mới; song song, đồng bộ lịch sử/backfill dùng `/v1/transaction` theo ngày và phân trang. Xác thực trước khi tiếp nhận; lưu bản gốc trong AES-256-GCM, normalize, durable outbox.
5. Worker `/api/internal/bank-sync` tạo canonical bank transaction, phát hiện trùng theo `bankAccountId + transaction_id`; chỉ đẩy vào review. Người dùng tra soát và quyết định liên kết/ghi sổ. Cutover/reversal giữ chính sách an toàn của nền tảng.
6. Nếu API/IPN thất bại: không ACK thành công, giữ nguyên cutover và không cập nhật `lastSyncedAt` khi job lỗi. Dùng lịch sử có chồng lấn để lấp khoảng trống sau sự cố.

## 3. Kế hoạch thực hiện theo sprint và điều kiện nghiệm thu

### SP0 — Xác thực phạm vi và kiến trúc

| Xong | Task | Nội dung / điều kiện nghiệm thu |
|---|---|---|
| [x] | SP0-01 | Xác minh riêng SePay **Bank Hub**; ghi chính xác base URLs, Basic→Bearer, sandbox và endpoint. Đối chiếu tài liệu chính thức. |
| [x] | SP0-02 | Xác minh `transaction_id`, `company_xid`, `bank_account_xid`, hướng tiền, phân trang, ngày lọc, đơn vị TTL. |
| [x] | SP0-03 | Phân biệt IPN biến động với webhook events; xác minh `Apikey` IPN, ACK và retry; không giả định HMAC signature IPN. |
| [ ] | SP0-04 | Merchant contract, hỗ trợ tài khoản cá nhân/doanh nghiệp, SLA/phí/quota và webhook auth cấp thực tế; đối tác xác nhận. |
| [ ] | SP0-05 | Legal/retention, chính sách xin phép đồng bộ, quyền rút lại consent, lưu trữ/xóa PII được phê duyệt. |

### SP1 — Client, chuẩn hóa và cơ chế dữ liệu

| Xong | Task | Nội dung / điều kiện nghiệm thu |
|---|---|---|
| [x] | SP1-01 | `sepay/client.ts`: fixed host, Basic token, Bearer, cache TTL, re-auth 401, timeout, lỗi an toàn; unit mock đạt. |
| [x] | SP1-02 | `sepay/mapper.ts`: Zod payload IPN/history, ngày +07, VND nguyên, credit/debit, `transaction_id`; test malformed/negative/timestamp đạt. |
| [x] | SP1-03 | Tenant-scoped company/account listing, masking và xác minh company ID; unit negative pagination/malformed/429/503, PostgreSQL kiểm tra workspace A/B, sai company ID và concurrent wallet claims. |
| [ ] | SP1-04 | Company creation và Hosted Link thật; mock contract đã viết nhưng cần credential sandbox và kiểm thử liên kết. |
| [ ] | SP1-05 | Migrations/deploy staging, FK, account-wallet unique, event idempotency, encrypted raw evidence; cần DB-backed E2E. |

### SP2 — Consent, ánh xạ, giao diện

| Xong | Task | Nội dung / điều kiện nghiệm thu |
|---|---|---|
| [ ] | SP2-01 | Tạo company riêng cho workspace, cấp Hosted Link; cần xác minh link theo vòng đời thật và rollback khi API lỗi. |
| [ ] | SP2-02 | Lấy danh sách tài khoản sau Hosted Link, che số tài khoản, chỉ cho map ví BANK/VND; cần browser + DB UAT. |
| [ ] | SP2-03 | Ghi consent/audit evidence và xác minh sự kiện liên kết qua SePay; cần legal approval + DB tests. |
| [ ] | SP2-04 | Đã viết Hosted Link `UNLINK_BANK_ACCOUNT` theo account, xác minh `active=0`, ngừng mapping/consent và cho tái liên kết cùng ví. Còn thiếu provider webhook, DB E2E và xác minh UAT thật với ngân hàng. |
| [ ] | SP2-05 | UI mobile/a11y, lỗi link expired, empty account, multi-bank; kiểm thử browser đầy đủ. |

### SP3 — Đồng bộ sao kê theo Open API

| Xong | Task | Nội dung / điều kiện nghiệm thu |
|---|---|---|
| [x] | SP3-01 | Query lịch sử tenant/account-scoped, 50 rows/page, tối đa 20 trang/lần và 31 ngày; unit bounds/marker, PostgreSQL 2 trang, overlap dedup và review-first PASS. |
| [x] | SP3-02 | Manual sync route dùng Better Auth signed session và Origin guard thực; 36/36 PostgreSQL integration PASS, trong đó 5 tình huống HTTP authenticated kiểm tra 401/403, cookie sai, cross-workspace 404, job/watermark, sync lặp idempotent, thu hồi consent 409 và REVIEW_FIRST. Unit route 6/6 PASS. Google OAuth browser E2E vẫn thuộc UAT/SP5-03, không được suy diễn từ synthetic session. |
| [ ] | SP3-03 | Đồng bộ tăng dần tự động (cron) có overlap và endpoint nội bộ; code đã viết, cần scheduler thực và DB replay/gap detection trước nghiệm thu. |
| [ ] | SP3-04 | Backfill nhiều tháng với cửa sổ nhỏ, resume/cursor, kiểm tra tổng số trang, thứ tự thời gian và job metrics. |
| [x] | SP3-05 | PostgreSQL synthetic integration PASS: 20 trang × 10 dòng, replay 200 dòng, 429/503/timeout trang 2, token 401 refresh và 401 lặp, giới hạn 21 trang, recovery không double-post; **không thay thế SePay Sandbox UAT thật** (SP5-03). |

### SP4 — IPN realtime, dedupe, ledger

| Xong | Task | Nội dung / điều kiện nghiệm thu |
|---|---|---|
| [x] | SP4-01 | IPN authenticated, bounded raw payload, mapped account, durable inbox before `success:true`; HTTP IPN synthetic + PostgreSQL integration PASS, wrong auth/malformed/revoked bị từ chối, encrypted event/outbox commit trước ACK. Chưa có IPN do SePay thật phát. |
| [x] | SP4-02 | SePay IPN redelivery, IPN+poll cùng transaction ID, concurrent deliveries; PostgreSQL test 8 webhook đồng thời, 2 workers, duplicate IPN HTTP, canonical IPN/history dedupe PASS. |
| [ ] | SP4-03 | Encrypted audit raw, reject wrong auth/cross-tenant, không log bearer/key/PII; security integration. |
| [ ] | SP4-04 | Review-first và ledger invariant, transfer hai chiều, stale status/reversal, cutover, idempotent posting; financial regression DB. |
| [ ] | SP4-05 | Event-webhook riêng cho unlink/reactivate, xác thực theo phương thức SePay cấp; cần tài liệu payload auth + E2E. |

### SP5 — Kiểm thử và phát hành

| Xong | Task | Nội dung / điều kiện nghiệm thu |
|---|---|---|
| [x] | SP5-01 | Typecheck, lint, unit suite PASS: 51/51 files, 320/320 tests; production build PASS với dist riêng (23/10/2026). |
| [x] | SP5-02 | Prisma migrations apply và integration PostgreSQL riêng; `finova_test` 16/16 migrations, 31/31 Bank Sync scenarios PASS, fixture cleanup. DB ứng dụng đã backup/apply 15 migrations ở checkpoint trước; staging thuộc SP5-05. |
| [ ] | SP5-03 | UAT sandbox Hosted Link với tài khoản test hợp lệ, IPN thực, lịch sử phân trang, user flow responsive. |
| [ ] | SP5-04 | Security audit, secret management, consent, tenant A/B, production build và backup/restore drill. |
| [ ] | SP5-05 | Staging đối tác/pháp chế ký duyệt, production flag riêng, rollout/rollback có giám sát; chỉ bật Live sau GO. |

## 4. Những phần đã đặt vào mã nguồn

- `src/modules/bank-sync/sepay/client.ts`: Merchant HTTP client có mocked contract test.
- `src/modules/bank-sync/sepay/mapper.ts`: Mapper payload lịch sử và IPN theo tài liệu.
- `src/modules/bank-sync/sepay/service.ts`: Backend company/link/account/consent và đồng bộ có job.
- `src/app/api/v1/bank-sync/sepay/{link,accounts}`: Tạo Hosted Link và quản lý account mapping.
- `src/app/api/v1/bank-sync/sepay/{unlink,refresh}`: Hosted Link hủy theo tài khoản có xác thực workspace và làm mới trạng thái sau khi SePay báo `active=0`; tài khoản bị thu hồi ở Finova sẽ giải phóng ví.
- `src/app/api/v1/bank-sync/connections/[id]/sync`: Manual backfill trong workspace.
- `src/app/api/webhooks/sepay-bankhub/ipn`: Endpoint IPN riêng, ACK sau durable persistence.
- `src/app/api/internal/sepay-bankhub`: Scheduler được xác thực để bù lịch sử 7 ngày gần nhất với 2 ngày overlap (tối đa 5 kết nối/lượt), sau đó xử lý tối đa 20 outbox entries sang hàng đợi duyệt; cần cấu hình lịch ngoài ứng dụng.
- `src/modules/bank-sync/{domain,adapters,service}.ts`: Provider registry, persistence và worker reuse.
- `src/components/bank-sync-manager.tsx`, trang `/bank-sync`, `.env.example`: Giao diện/cấu hình có feature flag.
- `tests/unit/sepay-bankhub.test.ts`: Fixture cho Basic/Bearer, 401, timeout, cross-tenant, IPN và mapper.

## 5. Kiểm thử, điều kiện phát hành

**Checkpoint hiện hành 23/10/2026 — signed-session manual sync:** PostgreSQL `finova_test` **36/36 PASS** (5 kiểm tra authenticated API route mới), 16/16 migrations; unit **320/320** (51 files), typecheck, lint, Prisma validate, guard audit 54/69 và production build (41/41 static pages) PASS. Đã xác minh cleanup: 0 fixture workspace, 0 fixture user, 0 pending outbox. Đóng **SP3-02 [x]**, tổng **13 nhiệm vụ SePay [x]**; Bank Sync giữ **9/45 [x]**. Synthetic Better Auth session và SePay HTTP mock chỉ chứng nhận route/API, **chưa chứng nhận Google OAuth browser hay SePay UAT thật**. Dependency audit inconclusive do npm audit không trả báo cáo đầy đủ; một lượt stress khi kiểm thử đồng thời phát sinh 1 outbox retry, sau đó lượt độc lập PASS 36/36, cần giám sát độ ổn định dưới tải. **Production/SePay Live NO-GO.**

**Checkpoint bổ sung 23/10/2026 (lịch sử):** Unit **320/320 (51 files)**, SePay Manual Sync Route **6/6** (trong unit); PostgreSQL `finova_test` **31/31** Bank Sync scenarios PASS, **16/16** Prisma migrations. Bổ sung job lease/takeover, consent theo từng tài khoản, thu hồi consent trong HTTP, 401 lặp, 21-page limit và stress 200 giao dịch; typecheck, lint, Prisma validate PASS. **SP3-05 [x]**, tổng **12 task SePay [x]**. HTTP SePay trong integration là giả lập; SP3-02 vẫn chờ authenticated route E2E, SP5-03/04/05 chờ UAT/staging/sign-off. **Production/SePay Live NO-GO.**

**Checkpoint trước đó (lưu lịch sử):**

**Checkpoint 23/10/2026:** Unit **314/314 (50 files)**; PostgreSQL Bank Sync integration **24/24** trên `finova_test`, trong đó có tenant/company ownership, concurrent attach, lịch sử 2 trang, overlap, 429, lỗi 503/timeout giữa trang, recovery và ledger không ghi sổ trùng. `typecheck`, `lint`, `prisma validate`, route audit **54 files/69 handlers** và production build PASS ở checkpoint kiểm tra gần nhất. **SP1-03/SP3-01 [x]**, tổng SePay **11 task [x]**. Đây là bằng chứng tích hợp DB thật với HTTP SePay giả lập; Hosted Link/IPN/history do SePay Sandbox thật phát và nghiệm thu vận hành chưa có. SP3-05, SP5-03/04/05 vẫn mở.

**Checkpoint lịch sử 22/10/2026 (giữ nguyên):**

**Đã chạy trên máy phát triển (22/10/2026):** `npm test` **310/310 PASS (50/50 files)**; `npm run typecheck`, `npm run lint`, `npx prisma validate`, `npm run build` **PASS**, bao gồm routes `/sepay/{unlink,refresh}`. `npm run security:routes` **54 route files/69 handlers PASS**. `npm run security:audit` PASS: production dependency 0 findings; 5 dev-only nodes theo dõi có hạn. PostgreSQL `finova_test` đã có **15/15 migrations**, `npm run test:bank-sync:integration` **13/13 PASS** trên DB thật (fixture synthetic, cleanup), gồm HTTP SePay IPN authenticated/ACK after durable persistence và concurrency/retry. Chưa sử dụng tài khoản SePay thật.

SP5-02 đã có bằng chứng PostgreSQL thật. SP5-03 giữ mở vì synthetic HTTP IPN không tương đương IPN/Hosted Link/history do SePay Sandbox gửi.

**Môi trường hiện tại:** Container `finova-db-1` PostgreSQL 17 healthy, cổng `127.0.0.1:55433`; chạy lệnh trong sandbox thường bị từ chối Docker/TCP, kiểm thử DB thành công qua quyền phù hợp. Windows production build PASS khi chạy với quyền tương ứng. **Không dùng migrate reset** trên DB hiện có.

**GO/NO-GO:** Live là **NO-GO** cho đến khi có merchant credentials, IPN key do SePay cấp, cấu hình IPN public HTTPS, consent/coverage xác thực và đủ toàn bộ SP5. App mặc định `FINOVA_SEPAY_BANKHUB_ENABLED=0`, `FINOVA_SEPAY_BANKHUB_ENV=sandbox`.

**Lưu ý phát triển:** Raw `eventId` của lịch sử/IPN nay có dạng `history:{bank_account_xid}:{transaction_id}` hoặc `ipn:{bank_account_xid}:{transaction_id}` để tránh va chạm ID khi nhiều ngân hàng cùng một company dùng chung mã giao dịch. Khi chạy lại lịch sử từng được nhập dưới dạng cũ, hệ thống có thể sinh thêm raw event; canonical transaction vẫn dedupe theo `bankAccountId + externalTransactionId` và người dùng phải duyệt trước ghi sổ. Cần chứng minh bằng DB E2E trước khi live.

### Cập nhật cấu hình Sandbox ngày 22/10/2026

- [x] Cặp Merchant Bank Hub Sandbox được cài trong `.env` cục bộ (file được `.gitignore` và `.dockerignore` loại trừ); gọi `POST /v1/token` trả HTTP `201`, phản hồi có `access_token` và `ttl`. Không lưu token phản hồi.
- [x] Sinh `FINOVA_BANK_EVENT_KEY` AES-256 và `FINOVA_CRON_SECRET` riêng cho máy phát triển; bật `FINOVA_SEPAY_BANKHUB_ENABLED=1`, giữ `FINOVA_SEPAY_BANKHUB_ENV=sandbox`. Docker app profile được truyền đủ các biến tương ứng.
- [x] Tạo backup trước migration và áp dụng thành công `20261022145000_bank_sync_foundation`, `20261022153000_bank_sync_integrity`; `prisma migrate status` cho biết 15/15 migrations đã áp dụng. Backup lưu tại `artifacts/backups/` cục bộ; không đưa vào Git.
- [x] Unit SePay liên quan: 4 files / 17 tests PASS; `prisma validate` PASS; `docker compose config --quiet` PASS.
- [ ] Chưa có **IPN Apikey Bank Hub**; khóa SePay **API Access v1/v2** khác IPN, không được nhập thay. Cần SePay cấp khóa IPN và xác nhận HTTPS callback.
- [ ] Chưa hoàn thành user-authenticated Hosted Link UAT, IPN và history end-to-end bằng Sandbox với workspace thật. **SP5-02 đã đạt PostgreSQL integration synthetic; SP5-03 vẫn mở** tới khi UAT đối tác thực tế.

### Checkpoint bổ sung: PostgreSQL/HTTP synthetic IPN (22/10/2026)

- Bổ sung `scripts/bank-sync-integration-check.ts` và fixture cleanup an toàn, chỉ sử dụng `finova_test`; **13/13 PASS**, gồm HTTP IPN với khóa thử nghiệm, encrypted raw event, durable outbox, redelivery, cross-workspace/revoked consent, worker lease/DLQ, stale status và transfer ledger cân bằng.
- Migrations 15/15 đã apply; production build/typecheck/lint/310 unit tests/schema/route audit đều PASS; security audit runtime 0, theo dõi 5 dev-only nodes. Không đưa API key/IPN key vào Git hoặc tài liệu.
- Các mục SP1-05 (deploy staging), SP4-03/04 (security/full financial regression), SP5-03/04/05 (real UAT, review, release) vẫn **[ ]** đến khi vượt toàn bộ tiêu chí, kể cả pháp chế và môi trường HTTPS.

**Cảnh báo vận hành:** Việc bật sandbox ở môi trường phát triển **không cho phép Production** và không chứng minh khả năng đọc tài khoản ngân hàng thật. Các khóa đã đưa qua kênh trao đổi nên cân nhắc cấp lại trước khi triển khai public; tuyệt đối không sao chép credential vào tài liệu, frontend hoặc logs.
