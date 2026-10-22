# Finova — quy trình triển khai staging và phát hành

**Chưa có staging/release acceptance.** Các lệnh dưới đây là quy trình áp dụng sau khi đã chuẩn bị domain, ingress HTTPS, secret store, PostgreSQL riêng và kế hoạch rollback. Không chạy với `finova` development database để thử nghiệm phát hành. Chi tiết tại [runbook](OPERATIONS_RUNBOOK.md).

1. Ghi nhận image digest, migration version, phụ thuộc/runtime audit, CI kết quả và rollback image tương thích. Cấp `DATABASE_URL`/`FINOVA_CONTAINER_DATABASE_URL`, `FINOVA_MIGRATION_DATABASE_URL`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, Google OAuth credentials và cron secret cho staging bằng secret manager. `FINOVA_CONTAINER_DATABASE_URL` phải tường minh; Compose không fallback DSN mặc định.
2. Chạy `docker compose --profile app config --quiet` và `docker compose --profile release config --quiet`; xác nhận DB đích bằng một truy vấn read-only trước khi migrate. Tạo backup custom archive/checksum và diễn tập restore trên DB **cách ly**, đo RTO/RPO phù hợp chính sách.
3. Chỉ sau khi xác nhận DB và backup, thực hiện migration không phá hủy bằng `docker compose --profile release run --rm migrate` với `FINOVA_MIGRATION_DATABASE_URL` của môi trường đã duyệt. Không dùng `migrate reset`, `db push` hoặc restore đè dữ liệu để rollback schema.
4. Đưa app image đã kiểm chứng lên staging qua `docker compose --profile app up -d app` hoặc orchestrator phù hợp; ingress HTTPS trỏ đến app private, không expose DB/app trực tiếp ra Internet. Kiểm tra health, `GET /login`/manifest `200`, API unauthenticated `401`, mutation sai Origin `403`, headers, cookie và Google callback.
5. Kiểm thử hai Google users, financial flows, IDOR, PWA/mobile/a11y, CSP, WAF, rate limit, backup/offsite restore và tải đồng thời nhiều instance; ghi p50/p95/p99, pool/DB metrics, logs/alerts và biên bản smoke. Chỉ bật enforced CSP khi trình duyệt không ghi nhận vi phạm cần thiết.
6. Đưa traffic vào sau khi checklist và người chịu trách nhiệm ký nghiệm thu; lưu báo cáo và theo dõi tỷ lệ lỗi. Khi lỗi, rollback về **image cũ tương thích schema** và xác minh lại. Mọi phục hồi dữ liệu cần kế hoạch riêng vì có thể làm mất các giao dịch phát sinh sau backup.

Kết quả kiểm thử Compose image/migration **cục bộ** ngày 21/10/2026 chỉ sử dụng `finova_bench`, không chứng nhận staging. Xem [test report](TEST_REPORT.md) về hạng mục còn mở.
