# Finova — Đối soát thanh toán Premium: trạng thái triển khai và vận hành thử

**QA-26D (26/10/2026):** Đọc tín hiệu trong transaction Serializable sau advisory lock của scheduler; chặn Finance warning lịch sử được xem/ACK bằng vai trò ADMIN mới. Integration monitor PostgreSQL QA và HTTP signed-session operations, toàn bộ 499/499 unit (91 files), typecheck/targeted lint, Prisma validate, API guard audit 80 route/99 handler và Next production build cô lập 58 trang PASS. Không thay đổi cấu hình production hoặc kết luận UAT thực tế.

**Nguồn đối chiếu SePay (26/10/2026):** SePay công bố [trang trạng thái hệ thống](https://sepay.vn/status) và [hướng dẫn giám sát webhook](https://developer.sepay.vn/vi/sepay-webhooks/giam-sat), có nhật ký delivery, cảnh báo Telegram/Slack/Discord khi webhook gửi lỗi liên tiếp và phát lại. Operator có thể dùng để đối chiếu khi điều tra IPN. Health check được SePay mô tả trong tài liệu giám sát là kiểm tra **endpoint nhận webhook phía merchant**, không tương đương API health của hạ tầng SePay; status HTML trả HTTP `200` cũng không xác nhận mọi ngân hàng và IPN khỏe. Chưa tìm thấy tài liệu cam kết một API health độc lập đủ dùng cho `FINOVA_BILLING_PROVIDER_HEALTH_URL`; tiếp tục bỏ trống cấu hình này đến khi có xác minh từ SePay. Thiết lập cảnh báo webhook gốc của SePay và kiểm tra thực nhận on-call trong staging vẫn là điều kiện nghiệm thu mở.

**QA-26C (26/10/2026), AD5-08:** Bộ giám sát vận hành đã có incident/generation, inbox riêng theo quyền, xác nhận ACK có audit, chuyển cấp 30 phút, provider health probe tùy chọn và relay HMAC bền vững. Kiểm thử PostgreSQL isolated, signed-session HTTP inbox/ACK, retry 503, 2 worker tranh lease, late-role delivery, 6 lần thử/DLQ và privacy **PASS**. Typecheck, lint, 499 unit, Prisma validate, route audit 80/99, Next production build QA 58 trang **PASS**. Chưa nghiệm thu địa chỉ health chính thức, relay đến on-call thật hoặc scheduler staging: **AD5-08 `[ ]`**, billing production **NO-GO**.

## Giám sát cảnh báo thanh toán — cấu hình và xử lý sự cố AD5-08

Luồng: scheduler độc lập **5 phút/lần** → `POST /api/internal/billing/operations` → quét tín hiệu tổng hợp + kiểm tra provider (nếu có endpoint) → PostgreSQL `BillingOperationalIncident` + `BillingOperationalHistory` → `BillingOperationalDelivery` theo tài khoản trực → `BillingOperationalRelay` → HTTPS relay on-call (nếu cấu hình). Operator mở `/admin/billing/operations/inbox` để xem cảnh báo đã được phân công và ACK; Super Admin có thể giám sát toàn bộ. Phân công ưu tiên Finance cho mức warning/info, Finance và Admin cho critical, dự phòng Super Admin khi không có người nhận; sau **30 phút chưa ACK** sẽ chuyển cấp Super Admin. Mỗi lần quét tiếp tục cấp delivery cho người vừa được phân công; khóa `(incidentId, generation, userId)` ngăn lặp. Sự cố tự đóng khi tín hiệu biến mất; nếu tái diễn sẽ mở generation mới. ACK chỉ xác nhận đã tiếp nhận, không làm biến mất tín hiệu.

Cấu hình server-only trong secret manager (không commit/ghi log giá trị): `FINOVA_BILLING_ALERTS_ENABLED=0` mặc định; `FINOVA_CRON_SECRET` dài ít nhất 24 ký tự; `FINOVA_BILLING_ALERT_RELAY_URL` URL HTTPS công khai do đơn vị vận hành kiểm soát; `FINOVA_BILLING_ALERT_RELAY_SECRET` ít nhất 32 ký tự; `FINOVA_BILLING_PROVIDER_HEALTH_URL` là **endpoint HTTPS chính thức của SePay** sau khi xác minh hợp đồng. Không đặt URL giả định kiểu `/health` vào staging/production. Nếu không có endpoint hợp lệ, bỏ trống biến provider; khi đó không được kết luận provider hay IPN đã ngừng. Cần xác minh tài khoản trực, bảng phân quyền còn hiệu lực và kênh dự phòng **trước khi bật flag**.

Lên lịch từ scheduler HTTPS có kiểm soát với cron `*/5 * * * *`, phương thức `POST`, header `Authorization: Bearer <FINOVA_CRON_SECRET>`. Scheduler phải giám sát **lần thành công gần nhất** và cảnh báo qua kênh khác khi không chạy được sau hơn 10 phút; nếu chính scheduler chết, hàng relay không tự xử lý. HTTP `200` kèm `opened/resolved/escalated/delivered/recipientGaps/relay`; `recipientGaps > 0` nghĩa là sự cố thiếu người nhận, cần bố trí ca trực. `relay.enabled=false` báo chưa cấu hình kênh độc lập. Không coi `200` của scheduler hoặc HTTP health endpoint là xác nhận webhook/IPN nhận đủ tiền.

Relay gửi JSON dạng sự cố tổng hợp, không có user ID, số tài khoản, giao dịch hoặc nội dung chuyển khoản. Đầu nhận phải xác thực `X-Finova-Alert-Signature: sha256=<hex>` bằng HMAC-SHA256 trên chuỗi **`X-Finova-Alert-Timestamp + "." + raw_body`**, kiểm tra cửa sổ thời gian chống replay, dedupe vĩnh viễn hoặc theo retention đủ dài bằng `X-Finova-Alert-Idempotency-Key` (`eventId` trong payload), rồi ánh xạ `audience` (`FINANCE_OPERATOR`, `ADMIN`, `SUPER_ADMIN`) sang lịch trực thực tế. HTTP 2xx chỉ nghĩa là **relay đã nhận**, không chứng minh người trực đã đọc; ACK trong Finova được audit riêng. Đầu nhận phải xử lý gửi lặp sau timeout/mất kết nối và không giữ thông tin tài chính cá nhân. Tuyệt đối không bật relay khi chưa chứng minh HMAC/dedup/ack đến người trực thật.

Relay dùng lease 2 phút, tối đa **6** lần thử, backoff 15 giây nhân đôi (trần 30 phút), trạng thái `PENDING` → `DELIVERED` hoặc `DEAD`; việc đóng incident hủy các job `PENDING`, còn request HTTP đã bay có thể đến đích. Dùng khóa idempotency tại đầu nhận để tránh gây cảnh báo lặp khi response 2xx bị mất hoặc worker cũ hoàn tất sau lease expiry. Tra cứu `BillingOperationalRelay` với `state='DEAD'` theo ngày, `lastErrorCode`, `incidentId`, `generation`, `attempts`; đối chiếu `BillingOperationalHistory` và logs relay. Việc đưa lại job từ `DEAD` về `PENDING` **chưa có API operator**: DBA chỉ được làm trên staging/production theo quy trình sự cố được phê duyệt, ghi ticket, kiểm tra incident còn mở/đúng generation, giữ nguyên `id` idempotency, đặt lại `attempts`, `leaseOwner`, `leaseUntil`, `deadLetterAt`, `nextAttemptAt` trong transaction có audit thủ công; nếu không đủ bằng chứng hãy để `DEAD` và escalated thủ công. Không tự động replay giao dịch thanh toán từ thao tác relay.

Provider probe yêu cầu HTTPS thuộc domain `sepay.vn`, không credential/port riêng/redirect, timeout 4,5 giây. **Ba lần kiểm tra không thành công liên tiếp** mới mở `PROVIDER_PROBE_FAILURE`; một lần khỏe sẽ đóng sự cố. Tín hiệu `IPN_NO_SIGNAL` được xếp **info**, chỉ nói rằng có đơn chờ nhưng thiếu giao dịch xác thực mới; không chứng minh SePay ngừng hoạt động. Khi nghi ngờ mất IPN, kiểm tra logs webhook/HMAC, scheduler đối soát, kết nối ngân hàng và xác minh trạng thái với provider; phải có provider history polling/backfill mới đủ bằng chứng về completeness.

Kiểm thử DEV: `npm run admin:test-monitor` trên DB cô lập `finova_admin_test_monitor_20261026`, `npm run admin:test-operations` trên DB `finova_admin_test_ad206_20261026`; cả hai script chặn mọi tên DB khác và chỉ dọn fixture QA. Bật đúng Next.js QA ở `localhost:31646` cho HTTP signed-role tests. Đã xác nhận lỗi socket Docker trong sandbox tiêu chuẩn, test cần quyền kết nối localhost Docker; build Windows với output `.next-admin-ops-verify` cũng cần quyền tạo thư mục để tránh `EPERM`. **Chưa chạy UAT thực tế** relay/health/scheduler. Giữ mọi flag thu phí production OFF đến khi AD6/staging sign-off.

**QA-26B ngày 26/10/2026:** `admin:test-checkout-browser` PASS nghiệm thu AD2-06 trên desktop/mobile với giá, lịch sử, idempotency, 6 trạng thái và WCAG. `admin:test-operations` PASS trên QA DB 29 migrations sau khi sửa dọn personal workspace trước user: 8 tín hiệu cảnh báo, quyền Super Admin/Admin/Finance, chặn Analyst/User, dashboard tổng hợp không PII. **Đây vẫn là dashboard khi operator mở trang** `/admin/billing/operations`; chưa có delivery/ack độc lập hay provider heartbeat để chứng minh IPN down, vì vậy AD5-08 còn mở. Không cấu hình cron gửi cảnh báo production và không diễn giải `IPN_NO_SIGNAL` là sự cố provider đã xác nhận. Billing production NO-GO.

**QA-24L ngày 24/10/2026:** AD2-02 nghiệm thu DEV trên PostgreSQL QA: proposal/dual approval, Finance deny, rotate tài khoản nhận tiền (receiver cũ DISABLED, receiver mới ACTIVE), order cũ giữ snapshot, order mới dùng receiver mới; Admin list chỉ hiện `••••last4`. 438 unit, typecheck/lint/Prisma/API guard 74/91 và Next build 55/55 PASS. **Admin 20/55; provider/bank UAT chưa thực hiện; production NO-GO.**

**QA-24K ngày 24/10/2026:** AD1-08 nghiệm thu DEV: kiểm tra PostgreSQL QA receiver ciphertext AES-256-GCM/last4 mask, disabled receiver từ chối xác minh, cross-user billing IDOR, operator reason lưu vào access/action/audit đã che credentials và số tài khoản. 438/438 unit, typecheck/lint/Prisma, API audit 74/91 và Next build 55/55 PASS. **Admin 19/55; production NO-GO, giữ feature flags thanh toán OFF.**

**Cập nhật:** 23/10/2026 · **Môi trường:** phát triển/kiểm thử · **Thu phí production:** NO-GO.

**QA-24J ngày 24/10/2026:** AD6-01 đã nghiệm thu DEV: unit 421/421, PostgreSQL QA integration kiểm tra price snapshot qua đổi catalog, retry/conflict idempotency, zero-price reject, gia hạn/thời hạn VN, trạng thái bất hợp lệ và replay; TypeScript, lint, Prisma, API audit 74/91 và build Next 55/55 PASS. Chưa thử giao dịch SePay thật, browser OAuth hay phục hồi PostgreSQL outage; **giữ feature flags thu phí production OFF**.

## Những gì đang hoạt động

- Catalog Premium tháng **29.000 VNĐ** và năm **199.000 VNĐ**, Lite miễn phí; checkout tạo mã `FNV` duy nhất, chốt giá/kỳ hạn/tài khoản nhận tiền trong order.
- Chức năng nội bộ `recordVerifiedBankCredit()` trong `src/modules/billing/reconciliation.ts` lưu **giao dịch đã được provider xác thực** dưới khóa duy nhất `(provider, receiverAccountId, providerTransactionId)`. Nếu sự kiện lặp, trả về sự kiện cũ; nếu cùng ID nhưng số tiền/nội dung/thời gian khác, báo xung đột.
- `reconcileVerifiedBankCredit(eventId)` đọc sự kiện ở trạng thái `RECEIVED`, yêu cầu `verificationStatus=VERIFIED`, giải mã mã đơn từ nội dung chuyển khoản, so đúng người thụ hưởng, hướng tiền vào, giá VND, tình trạng và hạn đơn. Việc ghép sự kiện, cấp quyền, gia hạn gói, cập nhật order và ghi audit diễn ra trong **một transaction PostgreSQL Serializable**; unique constraint chống cấp trùng.
- Premium gia hạn theo **tháng/năm lịch giờ Việt Nam**, sử dụng ngày kỷ niệm gói, không cộng 30/365 ngày. `getEffectiveSubscription()` xác định quyền dựa trên grants còn hiệu lực khi gọi API.
- Quản trị xem giao dịch tại `/admin/billing/payments` hoặc `/api/v1/admin/billing/payments` (chỉ `SUPER_ADMIN`, `ADMIN`, `FINANCE_OPERATOR`). Tab ngoại lệ dùng `?review=1`; không hiển thị nội dung chuyển khoản thô, số tài khoản hay ID giao dịch đầy đủ. Vai trò `ANALYST` không đọc dữ liệu từng giao dịch.
- Webhook thu phí `/api/webhooks/billing/sepay` dùng xác thực HMAC-SHA256 với `X-SePay-Signature: sha256=<hex>` và `X-SePay-Timestamp`: chữ ký là HMAC trên **`{timestamp}.{raw_body}`**, độ lệch thời gian tối đa 300 giây. Đã đối chiếu [hướng dẫn xác thực SePay](https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc) và [payload/ACK](https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook) (23/10/2026). Chỉ nhận JSON <=16 KiB, kiểm tra accountNumber thuộc receiver đã phê duyệt, lưu event idempotent trong DB **trước** khi trả `200 {"success":true}`. Không cấp Premium tại webhook.
- Worker `/api/internal/billing/reconcile` cần Bearer `FINOVA_CRON_SECRET` tối thiểu 24 ký tự; có DB lease 2 phút, atomic claim, backoff 15 giây nhân đôi đến tối đa 30 phút, tối đa **6 lần xử lý**. Giao dịch lỗi nhiều lần chuyển dead-letter (`deadLetteredAt`), không cản các giao dịch khác. Bảng Admin hiển thị số lần thử và trạng thái worker.
- Operator có quyền `SUPER_ADMIN`, `ADMIN` hoặc `FINANCE_OPERATOR` có thể **requeue sự kiện đã xác minh và đang ở DLQ** bằng `POST /api/v1/admin/billing/payments/{id}/requeue` với `{"reason":"Lý do điều tra dài tối thiểu 12 ký tự"}` cùng signed session, Origin ứng dụng và JSON. Requeue tạo audit, đặt lịch xử lý lại; **không cấp Premium bằng tay**, không cho replay giao dịch đã MATCHED.
- **Thông báo kích hoạt Premium bền vững:** transaction đối soát đồng thời ghi `PaymentAllocation`, `SubscriptionGrant`, `SubscriptionEvent` loại `GRANT_ACTIVATED`, `Subscription`, trạng thái order/event, `BillingOutbox` và audit. Worker xử lý `BillingOutbox` bằng atomic claim, lease 2 phút, retry exponential (tối đa 6 lần) và `BillingNotice` duy nhất theo order. Insert notice và chuyển outbox sang `DELIVERED` thuộc **cùng một transaction Serializable**. Lease hết hạn ở lần thử cuối được tự chuyển vào DLQ, không bị claim quá ngân sách retry; notice đã gửi không được nhân đôi khi chạy đồng thời.
- Người dùng có thể xem xác nhận kích hoạt/gia hạn tại `/settings/subscription`, kể cả khi gói đã trở về Lite. Đây là **thông báo trạng thái tài khoản**, tách biệt quyền `NOTIFICATIONS` của Premium. Quản trị xem DLQ tại `/admin/billing/notices` hoặc `GET /api/v1/admin/billing/notices`; `POST /api/v1/admin/billing/notices/{id}/requeue` chỉ nhận operator có quyền, Origin đáng tin cậy và lý do 12–500 ký tự. Mọi replay có audit, chỉ đưa notice vào hàng chờ; **không thay đổi grant/giao dịch**.
- Migration `20261023180000_billing_outbox_integrity` thêm FK từ outbox/notice đến user, order và outbox gốc, unique notice/order cùng CHECK cho kind, trạng thái, số lần thử và trạng thái giao hàng. Trường lỗi chỉ ghi mã nội bộ, không lưu exception message.
- Migration `20261023183000_subscription_event_history` bổ sung `SubscriptionEvent` (FK đến user/grant/order, unique theo grant/kind và order/kind) và backfill lịch sử `GRANT_ACTIVATED` cho grant ngân hàng đã có trước migration. Trong DB kiểm thử riêng, trigger cố ý làm lỗi khi tạo event cho thấy allocation, grant, trạng thái đơn, subscription và outbox được rollback; event ngân hàng đã xác thực vẫn còn để retry an toàn.

## Trạng thái khớp và hành động

| Trạng thái | Ý nghĩa | Quy trình |
| --- | --- | --- |
| `RECEIVED` | Đã lưu sự kiện xác thực, chưa ghép | Xử lý lại bằng worker được kiểm soát ở bước sau. |
| `MATCHED` | Đã ghép duy nhất, order `PAID`, có allocation và grant | Kiểm tra bảng đối soát và audit. |
| `UNMATCHED` | Không nhận dạng được một mã đơn duy nhất | Tra soát tham chiếu với ngân hàng; không tự cấp gói. |
| `REVIEW_AMOUNT` | Sai số tiền, kể cả thiếu/thừa | Xác minh và quyết định hoàn tiền/điều chỉnh theo chính sách được duyệt. |
| `REVIEW_RECEIVER` | Sai tài khoản nhận hoặc tiền tệ | Xác minh nguồn; không tự cấp gói. |
| `REVIEW_DIRECTION` | Không phải tiền vào | Không cấp quyền. |
| `REVIEW_TIMING` | Tiền chuyển trước khi lập đơn | Đưa vào xử lý ngoại lệ. |
| `LATE_PAYMENT_REVIEW` | Tiền đến tại hoặc sau lúc đơn hết hạn | Đối soát giá cũ/hoàn tiền theo chính sách. |
| `REVIEW_ORDER_STATUS` | Đơn đã trả tiền hoặc trạng thái không phù hợp | Kiểm tra thanh toán trùng và hoàn tiền. |

## Ranh giới tin cậy và điều kiện mở bán

**Đã có webhook SePay HMAC, worker đối soát và durable notification outbox/worker có lease/retry/DLQ trên dữ liệu giả lập; chưa có provider sandbox/live UAT thực tế, polling/backfill, hoàn tiền, duyệt ngoại lệ hai người, theo dõi/sử dụng tài khoản nhận tiền thật và phê duyệt kế toán/pháp lý.** `recordVerifiedBankCredit()` là API nội bộ, chỉ gọi sau khi nguồn dữ liệu đã được xác thực; không nối trực tiếp với request từ trình duyệt, ảnh biên lai hoặc callback không xác thực. `providerAccountRef` là `BillingReceivingAccount.id` được adapter đáng tin cậy ánh xạ từ tài khoản nhận tiền Finova; không sử dụng token Bank Hub cá nhân. SePay HMAC đã **xác minh trên tài liệu chính thức**, nhưng chưa thay thế UAT thực tế.

Lưu ý: hiện lưu **canonical payment event đã chuẩn hóa**, chưa lưu bản raw payload có kiểm soát truy cập riêng và chưa có cơ chế truy vấn lịch sử SePay để phát hiện webhook bị mất. Cần hoàn thiện trước khi mở bán. Giữ `FINOVA_BILLING_SEPAY_WEBHOOK_ENABLED=0` đến lúc cấu hình webhook HMAC thật và thử nghiệm end-to-end với provider. Các khóa `FINOVA_BILLING_SEPAY_WEBHOOK_SECRET`, `FINOVA_BILLING_SEPAY_RECEIVER_ID`, `FINOVA_CRON_SECRET` phải tách khỏi khóa Bank Hub của user và không commit vào repository.

Giữ `FINOVA_BILLING_CHECKOUT_ENABLED=0` trong môi trường kinh doanh. Chỉ mở sau khi hoàn tất các mục AD3/AD6, chứng minh ACK sau khi commit inbox, retry khi downtime, provider sandbox UAT và quyết định phát hành. Việc chạy test bằng fixture chỉ chứng minh lõi matcher, **không chứng minh đã thu tiền thật**.

## Kiểm thử lặp lại

Từ `D:\Projects\Finova`:

```powershell
npm run typecheck
npm test -- tests/unit/admin-usage-domain.test.ts tests/unit/admin-usage-route.test.ts tests/unit/admin-access-policy.test.ts tests/unit/billing-domain.test.ts tests/unit/billing-reconciliation-retry.test.ts tests/unit/billing-sepay-webhook.test.ts tests/unit/billing-sepay-route.test.ts tests/unit/billing-outbox-retry.test.ts tests/unit/billing-outbox-route.test.ts tests/unit/billing-outbox-list-route.test.ts
npx eslint src/modules/billing/outbox.ts src/app/api/v1/admin/billing/notices/route.ts tests/unit/billing-outbox-list-route.test.ts scripts/admin-premium-integration-check.ts
npm run security:routes
```

Kiểm thử tích hợp chỉ chạy trên **PostgreSQL thử nghiệm độc lập** đã áp dụng migration; script tự chặn mọi tên database không khớp `finova_admin_test_*`:

```powershell
# Chỉ chạy nếu database finova_admin_test_20261023 đã được tạo; tuyệt đối không dùng database production.
# DATABASE_URL phát sinh bên dưới được gán trực tiếp, không in mật khẩu ra console.
$env:DATABASE_URL = node --env-file-if-exists=.env -e "const u=new URL(process.env.DATABASE_URL);u.pathname='/finova_admin_test_20261023';process.stdout.write(u.toString())"
try {
  npx prisma migrate deploy
  if ($LASTEXITCODE -ne 0) { throw "ISOLATED_MIGRATION_FAILED" }
  npm run admin:test-integration
  if ($LASTEXITCODE -ne 0) { throw "ISOLATED_INTEGRATION_FAILED" }
} finally {
  Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
}
```

Đã áp dụng migration `20261023174000_billing_notification_outbox`, `20261023180000_billing_outbox_integrity` và `20261023183000_subscription_event_history` trên DB `finova_admin_test_20261023`. Integration test xác minh idempotent checkout (4 yêu cầu đồng thời), người khác không đọc được đơn, 2 bước cấu hình receiver, khóa phiên, sai/thiếu số tiền, sai receiver, tiền ra, mã không nhận diện, thanh toán trễ, event replay, atomic grant, **2 đơn gia hạn đồng thời**, webhook HMAC hợp lệ/sai chữ ký/sai receiver, **2 worker đồng thời**, lease độc quyền, retry + DLQ sau 6 lỗi, requeue có audit. Kiểm tra mở rộng: claim cạnh tranh, takeover sau hết lease, worker cũ không giao/hoãn được notice, hai giao hàng đồng thời chỉ một thành công, worker crash ở lần thử cuối được đưa vào DLQ và replay không tạo grant trùng. Fault injection chặn INSERT SubscriptionEvent, chứng minh các ghi nhận kích hoạt Premium rollback toàn bộ, inbox vẫn bền vững và retry chỉ cấp một lần. Test tạo dữ liệu fixture mới mỗi lần, không chạy trên DB có người dùng thật.

**Kết quả mới 24/10/2026:** **362/362 unit tests (62 file)**, TypeScript, toàn bộ ESLint, Prisma validate, audit **90 HTTP handlers**, Next.js production build thư mục riêng **PASS**. PostgreSQL integration trên `finova_admin_test_20261024` **PASS**, kiểm tra thêm Lite seed/backfill idempotent, giữ nguyên Premium đã kích hoạt, bootstrap user mới, ví/giao dịch/bút toán cân bằng không đổi qua seed, hết hạn và thu hồi grant; dual approval, gia hạn song song, rollback và replay vẫn PASS. Đã nghiệm thu theo phạm vi AD1-05, AD3-07, AD6-02. Build lần đầu gặp EPERM trong sandbox Windows; build lại thành công bằng quyền truy cập phù hợp. **Chưa có giao dịch provider thật hay signed Google browser E2E; không mở thu phí production.**

**Kết quả lịch sử 23/10/2026:** Prisma validate/generate PASS; TypeScript PASS; targeted ESLint PASS; **37/37 unit tests trên 10 file PASS**; PostgreSQL migration và integration PASS; audit **86 HTTP handlers PASS**; **Next.js production build PASS** với distDir riêng và quyền ghi phù hợp trên Windows. `tsconfig.json` đã được khôi phục sau khi Next.js tự động thêm đường dẫn sinh build. Không coi fixture, route mock DB failure hoặc kiểm tra tài liệu là provider UAT.

## Thống kê truy cập (Admin analytics — pilot)

- Flag `FINOVA_USAGE_ANALYTICS_ENABLED=0` mặc định. Khi bật, thành phần `UsagePageview` trên khu vực đăng nhập gửi một sự kiện trên mỗi lần đổi trang; chỉ lưu **nhóm chức năng được cho phép** (không chứa ID tài khoản/đơn hàng, URL gốc, query string, IP hay chi tiết tài chính). API `/api/v1/usage/pageview` yêu cầu signed session, đúng Origin; bỏ qua user-agent bot.
- `ProductPageviewReceipt` chống đếm trùng theo `(userId, navigationId)`. `ProductUsageDaily` tăng lượt xem trang và cập nhật hoạt động theo **ngày Việt Nam** trong cùng transaction. Dashboard Admin/Analyst báo DAU, MAU (distinct user trong 30 ngày), số lượt xem trang 30 ngày và bảng 7 ngày. Tài khoản Finance chỉ nhìn dashboard thu phí, không có người dùng/traffic.
- Endpoint nội bộ `POST /api/internal/usage/prune` yêu cầu `Authorization: Bearer FINOVA_CRON_SECRET` (secret tối thiểu 24 ký tự). Mỗi lần chạy, job trước hết **backfill idempotent** từ `ProductPageviewReceipt` còn lưu trong cửa sổ 2 ngày, sau đó xóa receipt cũ hơn **2 ngày** và summary `ProductUsageDaily` cũ hơn **400 ngày**. Cơ chế TTL dùng index `ProductPageviewReceipt.createdAt` và `ProductUsageDaily.dayVn`, hiện **không partition**. `backfilledDays`, `receipts`, `daily` trong response là số dòng ảnh hưởng. Backfill không làm giảm pageViews khi có worker/ghi mới cạnh tranh; `firstSeenAt`/`lastSeenAt` không được cập nhật lùi. **Giới hạn:** khi receipt đã quá 2 ngày và bị xóa, không thể dựng lại pageview gốc từ aggregate; không thể khôi phục toàn bộ lịch sử nếu có mất dữ liệu trước đó. Cần cấu hình lịch chạy scheduler có auth riêng và diễn tập restore trước khi bật production. Không có anonymous tracking, session duration, cohort retention hay consent preference ở giai đoạn này; analytics flag vẫn OFF.
- DB thử nghiệm áp dụng `20261023171000_admin_usage_daily`; kiểm thử PostgreSQL xác minh idempotency 3 request song song → 1 pageview, 2 điều hướng → 2 views/ngày, dữ liệu xuất hiện trong DAU/MAU. **QA-24I** trên DB cô lập `finova_admin_test_export_20261024_1200` xác minh phục hồi rollup bị thiếu, replay không ghi thừa, 3 worker repair đồng thời với pageview trực tiếp, cutoff receipt 2 ngày, chuyển ngày tại 17:00 UTC, retention 400 ngày và index thực tế. `npm run admin:test-export` PASS; 418 unit, lint/typecheck, Prisma validate, API audit và 55-page Next build PASS. Đây là số liệu hoạt động **đã đăng nhập**, không tương đương unique website visitors.

## Các bước tiếp theo bắt buộc

1. Xác minh hợp đồng và cơ chế chứng thực của provider thu phí cho **tài khoản nhận tiền của Finova**; thiết kế contract adapter dựa trên tài liệu thực tế.
2. Thêm raw ingress archive có phân quyền/retention và polling/backfill SePay (overlap/cursor); kiểm thử downtime kéo dài, crash sau ACK trên môi trường provider thực tế và xử lý giao dịch đến trước order.
3. Xây dựng xử lý ngoại lệ, hoàn tiền/dispute và dual approval; dashboard hiện chỉ đọc.
4. Kiểm thử signed Better Auth API/browser, phân quyền, dữ liệu cá nhân, tải/khôi phục và UAT provider trước khi bật checkout.
