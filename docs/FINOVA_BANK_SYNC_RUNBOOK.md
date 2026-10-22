# Finova — Runbook nhập sao kê và sandbox bank sync

**22/10/2026 · Chỉ dành cho quản trị ứng dụng/DB.** Finova chưa nghiệm thu kết nối ngân hàng thực tế. Sandbox HMAC nội bộ khác cơ chế SePay Bank Hub. Xem [kế hoạch triển khai SePay](FINOVA_SEPAY_BANKHUB_IMPLEMENTATION_PLAN.md) trước khi bật provider.

## Cấu hình

1. Cấp `DATABASE_URL` vào database môi trường thử nghiệm đã backup. Không áp migration trên production trước khi kiểm tra dữ liệu hiện hữu và diễn tập khôi phục.
2. Sinh key: `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`; lưu kết quả vào secret manager dưới tên `FINOVA_BANK_EVENT_KEY`. Đừng đưa key vào log/repository. Key AES-256-GCM phải là 32 byte sau Base64 decode; thiếu key sẽ chặn webhook/import để tránh lưu plaintext.
3. Đặt `FINOVA_BANK_SANDBOX_ENABLED=1` và `FINOVA_BANK_SANDBOX_SECRET` tối thiểu 32 ký tự **chỉ trên môi trường development**, cùng `FINOVA_CRON_SECRET` tối thiểu 24 ký tự cho scheduler nội bộ. Sandbox không hoạt động khi `NODE_ENV=production`.
4. Kiểm tra `npx prisma validate`, `npx prisma migrate status`, sau đó thử nghiệm `npx prisma migrate deploy` tại staging. Hai migration: `20261022145000_bank_sync_foundation` và `20261022153000_bank_sync_integrity`. Migration mới đặt unique partial index một active account mapping/ ví và một link/ nguồn. Nếu dữ liệu vi phạm uniqueness, phải tra soát trước khi apply.
5. Start app với cấu hình origin/Better Auth hợp lệ. Mở `/bank-sync`, nhập CSV/XLSX và ánh xạ cột; preview/commit phải cùng tệp và mapping. Mỗi dòng vào outbox và phải được người dùng xác nhận trước khi ghi vào ledger.

## Worker, quan sát và xử lý sự cố

- Scheduler gọi `POST /api/internal/bank-sync` với `Authorization: Bearer <FINOVA_CRON_SECRET>` trong kênh nội bộ có giới hạn truy cập. Worker xử lý tối đa 20 outbox entries mỗi lần; response gồm `processed`, `retried`. SePay có thao tác lấy lịch sử thủ công qua `/api/v1/bank-sync/connections/[id]/sync` và endpoint cron `POST /api/internal/sepay-bankhub` dùng cùng Bearer secret. Cron SePay hiện tự chạy thêm một lượt worker 20 outbox entries sau polling (bao gồm IPN đã nhận), trả `inbox.processed/retried`; khi backlog cao vẫn cần gọi worker độc lập. Cần cấu hình scheduler thực, chưa kiểm chứng staging.
- Theo dõi bảng `bank_sync_outbox` theo `status`: `PENDING`, `PROCESSING`, `RETRY`, `DLQ`, `DONE` và `nextAttemptAt`/`leaseUntil`; bảng `bank_raw_events` có `processingStatus` và `attemptCount`; bảng `bank_review_items` có quyết định cần xác nhận. Không hiển thị raw ciphertext hoặc thông tin định danh đầy đủ ra logs/metrics.
- `RETRY` được đặt backoff, tối đa 5 lần rồi `DLQ`. **Không sửa/xóa raw evidence, link hay journal trực tiếp.** Để replay cần xác định nguyên nhân, bảo đảm nguyên trạng payload/id, đối chiếu ledger/link, có quyền quản trị và audit thao tác. Giao diện replay hạn chế vẫn chưa triển khai: chưa sử dụng SQL thủ công để requeue trên production.
- Khi provider outage: tạm dừng connection, giữ inbox, khôi phục khi consent còn hiệu lực; kiểm tra gap/range sau hồi phục. Với SePay có thể backfill thủ công từng cửa sổ tối đa 31 ngày. Cron mới chỉ bù lịch sử gần đây có overlap; khoảng trống cũ cần thao tác riêng.

## SePay Bank Hub — cấu hình chuẩn bị nghiệm thu sandbox

1. Được SePay cấp **merchant** `client_id`/`client_secret` dành riêng cho Bank Hub sandbox và **IPN Apikey** đúng merchant. Giữ trong secret manager; chỉ đưa vào biến môi trường server. Đặt `FINOVA_SEPAY_BANKHUB_ENV=sandbox`, `FINOVA_SEPAY_BANKHUB_ENABLED=1` **chỉ khi đã có credential và `FINOVA_BANK_EVENT_KEY`**.
   **Phân biệt ba loại khóa:** Bank Hub `client_id`/`client_secret` dùng để xin Bearer token từ `/v1/token`; khóa `API Access` ở my.sepay.vn dùng cho **SePay API v1/v2**, không thay thế khóa IPN Bank Hub. IPN `Authorization: Apikey ...` phải dùng khóa riêng do SePay cấp cho merchant. Có thể mở giao diện liên kết trong sandbox với IPN chưa cấu hình để thử Hosted Link, nhưng **không coi realtime IPN đã hoạt động**; cron/history cũng phải nghiệm thu riêng. Không đưa bất kỳ khóa nào vào frontend hoặc tài liệu công khai.
2. Cấu hình tại SePay IPN public HTTPS: `POST https://<your-host>/api/webhooks/sepay-bankhub/ipn`, `Authorization: Apikey <FINOVA_SEPAY_BANKHUB_IPN_API_KEY>`. Đây là webhook **biến động giao dịch**, không phải webhook event liên kết. IPN chỉ ACK thành công sau khi ghi sự kiện mã hóa + outbox thành công. Không lộ API key trong URL, nhật ký hoặc frontend.
3. Trong `/bank-sync`, tạo Hosted Link; hoàn tất ở SePay, trở lại tải danh sách tài khoản đã liên kết, chọn ví BANK/VND, đánh dấu consent và gắn tài khoản; chỉ khi ACTIVE mới gọi đồng bộ lịch sử. IPN không cho phép định tuyến tài khoản bằng tham số người gọi cung cấp. Mỗi lượt scheduler SePay cũng đối chiếu trạng thái tài khoản từ API đã xác thực để dừng các tài khoản được báo `active=0` trước khi tải lịch sử.
4. Chạy job đồng bộ lịch sử theo cửa sổ 1–31 ngày, kiểm tra `bank_sync_jobs`, `bank_raw_events`, `bank_sync_outbox`, `bank_transactions`, `bank_review_items`. Chạy worker cho đến khi backlog hết; đối chiếu `transaction_id` cùng lúc từ IPN/lịch sử để xác nhận không ghi hai lần vào ledger. Thông tin `accumulated` IPN chưa hỗ trợ, **không dùng** để sửa số dư ví.
5. `PAUSE` ngừng tiếp nhận tại Finova nhưng giữ nguyên ánh xạ ví; `REVOKE` thu hồi consent **ở Finova** và vô hiệu hóa ánh xạ tài khoản để giải phóng ví, vẫn giữ giao dịch nguồn/ledger để kiểm toán. Để hủy tại SePay/ngân hàng, trên `/bank-sync` chọn **Hủy trên SePay** cho tài khoản, mở Hosted Link `UNLINK_BANK_ACCOUNT`, hoàn tất trên SePay rồi chọn **Kiểm tra trạng thái SePay**; backend chỉ vô hiệu hóa account nếu API SePay xác nhận `active=0` và thu hồi consent account tương ứng. Nếu chưa xác nhận trạng thái, Finova chưa tự coi luồng hủy là thành công. Chưa nghiệm thu sandbox/đối tác; một số ngân hàng chỉ ngắt trong Bank Hub, không nhất thiết chấm dứt quyền ở phía ngân hàng.
6. Không bật production flag hoặc tích hợp ngân hàng thật cho người dùng cho đến khi sandbox UAT, staging DB, phân quyền tenant, incident recovery, retention/legal approval và backup/restore đạt.
- Khi consent hết hạn/thu hồi: không nhận nguồn mới; cần nhà cung cấp cho consent mới theo tài liệu chính thức. Với tệp người dùng nhập, quyền sử dụng nguồn khác với OAuth và phải được ghi rõ.
- Khi thiếu giao dịch: so sánh sao kê với giao dịch nguồn và ledger, đối chiếu mốc cutover và trùng file; không âm thầm cộng số dư hoặc tạo bút toán sửa chênh lệch.
- Khi nhận `PENDING`, `REVERSED` hoặc xung đột mã: chỉ tra soát. **Chưa có bút toán bù tự động.** Không xác nhận thủ công như một khoản thu/chi thông thường để tránh sai sổ.

## Backup, phục hồi, bảo mật khóa

- Backup PostgreSQL đồng bộ schema, ledger và 13 bảng bank-sync; kiểm thử restore vào DB riêng, bao gồm raw ciphertext và tất cả mapping/link. Ghi lại migration version và restore point. Chỉ rollback qua quy trình DBA; không chạy `migrate reset` lên dữ liệu thật.
- Backup `FINOVA_BANK_EVENT_KEY` bằng secret manager có phân quyền và phiên bản. Mất khóa đồng nghĩa không giải mã được raw events. **Chưa có công cụ online key rotation/re-encryption**, vì vậy không thay khóa cho đến khi đã thiết kế, thực hiện thử và xác minh quy trình chuyển khóa có audit. Nếu nghi lộ khóa, hạn chế ingress, bảo vệ bản sao và lập kế hoạch tái mã hóa dưới kiểm soát sự cố.
- Kiểm tra quyền truy cập workspace tại mọi endpoint. Chữ ký sandbox gồm `x-finova-timestamp`, `x-finova-signature`, `x-finova-connection-id`; HMAC được tính trên timestamp + newline + **raw bytes**; timestamp chỉ hợp lệ trong ±300 giây. Không dùng secret ký của sandbox làm khóa mã hóa hay cron secret.
- Lập chính sách retention, xóa dữ liệu, xuất dữ liệu, consent và đối chiếu yêu cầu pháp chế trước khi phát hành. Xóa sự kiện nguồn có liên kết journal phải giữ đầy đủ audit và khả năng kiểm toán; chức năng xóa vẫn chưa được triển khai.

## GO/NO-GO

Chỉ phát hành khi database migrations staging, kiểm thử tenant isolation, replay, double-post, transfer hai phía, reversal, security audit, backup/restore và browser UAT đạt. **Kết nối ngân hàng thật** cần thêm hợp đồng/ủy quyền, provider verifier chuẩn, chứng cứ consent, sandbox credentials chính thức và nghiệm thu pháp chế. Khi những điều kiện này chưa đạt, giữ phần kết nối tự động tắt.
