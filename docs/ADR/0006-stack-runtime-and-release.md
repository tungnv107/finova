# ADR-0006 — Runtime stack, auth/session và quy trình triển khai V1

**Ngày:** 21/10/2026. **Status:** Accepted for local implementation; staging target/production acceptance pending.

## Context

Finova cần số tiền VND chính xác, giữ session Google OIDC phía server và triển khai PostgreSQL/Next.js có thể đối soát và rollback an toàn. Quyết định hạ tầng phải phù hợp mã nguồn hiện tại và tránh tự nhận đã nghiệm thu môi trường chưa dựng.

## Quyết định

1. **Runtime:** Node 22, Next.js 16 App Router, React 19, TypeScript strict, Prisma 6.19.3, PostgreSQL 17. Lockfile npm và `npm ci` trong CI/Docker; kiểm tra changelog và test trước khi nâng phiên bản.
2. **Auth/session:** Better Auth 1.7.11, Prisma adapter và Google OIDC (`openid email profile`). Cookie/session server-managed, auth context được derive server-side. Dùng HTTPS + Secure/HttpOnly/SameSite phù hợp ở staging; kiểm chứng callback/state/logout/expiry trên hai tài khoản thật trước G7. Không có password/session test bypass trong runtime.
3. **Jobs:** Cron/API route có Bearer secret, PostgreSQL rate limit; recurring và import dùng idempotency keys, posting trong Serializable transaction, retry. Không cam kết exactly-once đa instance cho tới khi HTTP/worker concurrency được nghiệm thu staging.
4. **Triển khai:** Multi-stage Docker non-root Next.js image; PostgreSQL riêng; migration job tách khỏi web qua Compose profile `release`, không chạy tự động cùng mỗi replica. `FINOVA_CONTAINER_DATABASE_URL` phải khai báo tường minh; không fallback DSN. App sau ingress HTTPS/private network và trusted headers được kiểm soát, cần WAF, monitoring, secret manager và encrypted offsite backup.
5. **Release/rollback:** CI lint, typecheck, unit, migration/integration/route security audit, build. Chụp backup và xác minh database đích trước `prisma migrate deploy`; chỉ rollback sang image tương thích schema, diễn tập restore trên DB cách ly; không dùng `migrate reset` hoặc `db push` để rollback production.
6. **Local Windows:** Prisma host DSN dùng `127.0.0.1:55433` với pool ví dụ 16; Compose nội bộ dùng hostname `db:5432`. Tổng connection pool phải tính theo số replicas, dự phòng migrations và monitoring. Kết quả local không được suy diễn thành SLA HTTPS.

## Chưa quyết định và điều kiện nghiệm thu

Hosting vendor, public domain, edge/WAF provider, RPO/RTO, retention, number of replicas và production connection budget phải được phê duyệt khi thiết kế staging. Secret đã từng lộ qua hội thoại cần được thay trước staging/production. Chưa có authenticated E2E Google, HTTPS multi-replica acceptance, offsite restore, CI remote green và sign-off. G7 giữ **IN PROGRESS**.

**Tham chiếu:** [Kiến trúc](../ARCHITECTURE.md), [OAuth](../GOOGLE_OAUTH_SETUP.md), [triển khai](../DEPLOYMENT.md), [runbook](../OPERATIONS_RUNBOOK.md), [test plan](../TEST_PLAN.md).
