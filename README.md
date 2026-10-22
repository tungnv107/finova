# Finova — Rõ tiền, vững tương lai

Ứng dụng quản lý tài chính cá nhân Next.js 16 / PostgreSQL / Prisma / Better Auth, giao diện tiếng Việt, sử dụng logo và màu sắc theo `FINOVA_BRAND_GUIDELINE_V2.md`. Các con số thu chi được lấy từ sổ cái PostgreSQL, không chứa giao dịch mẫu trong bản production.

**Checkpoint tài liệu và invariant 21/10/2026:** chuẩn hóa PRD/user stories, [test plan AT-01–18](docs/TEST_PLAN.md), [ADR runtime/release](docs/ADR/0006-stack-runtime-and-release.md), ERD 9 migrations và đặc tả Dashboard PostgreSQL aggregate. Unit suite **195/195** gồm 512 mẫu seeded để kiểm tra cân bằng/reversal/VND JSON; typecheck, lint, API guard audit và Prisma schema validate PASS ở local. Các gate Google authenticated E2E và HTTPS staging vẫn mở; chi tiết tại [QA](docs/TEST_REPORT.md) và [master checklist](IMPLEMENTATION_PLAN_QUAN_LY_TAI_CHINH_CA_NHAN.md).

**Trạng thái kiểm chứng 20/10/2026:** P6 import CSV/XLSX và recurring có atomic ledger post/link, PostgreSQL integration PASS (53 journals cân bằng), unit 32/32 PASS, TypeScript/ESLint PASS, đối soát dữ liệu hiện hữu sai lệch 0. Docker image `finova:phase7-atomic` build/runtime smoke PASS. Browser E2E authenticated, stress multi-instance, CSP/rate limiting và CI trên remote còn chờ nghiệm thu; chưa production-ready. Xem `docs/PHASE_REPORT.md`.

**Bổ sung P7 security (20/10/2026):** Origin validation chuẩn hóa, PostgreSQL rate limiting cho mutation/upload/export/recurring (HTTP 429 + Retry-After), CSP Report-Only và migration thứ 9 đã có. Unit **36/36**, integration tài chính **53 journals** và security concurrency PASS. `npm audit --omit=dev --omit=peer`: **0 cảnh báo** sau khi nâng `uuid` riêng cho ExcelJS. Xem phần gate chưa đạt ở `docs/PHASE_REPORT.md`; chưa production-ready.

**Bổ sung P7 anti-abuse:** Giới hạn OAuth trước đăng nhập theo PostgreSQL (600/phút toàn hệ thống; tùy chọn 30/phút/IP sau reverse proxy tin cậy), giới hạn báo cáo và danh sách giao dịch (120/phút/workspace), `Retry-After` chính xác theo cửa sổ, CLI `npm run db:prune-rate-limits`. Unit **40/40** và tích hợp PostgreSQL PASS. Thiết lập trusted proxy chỉ sau khi chặn truy cập trực tiếp app; không dùng `X-Forwarded-For` do client gửi. Chi tiết và các gate còn mở trong `docs/OPERATIONS_RUNBOOK.md`.

**Docker P7 anti-abuse:** image `finova:phase7-auth-limits` đã build và HTTP smoke PASS, dependency production 0/302 advisories. Cần nghiệm thu Google authenticated browser E2E, trusted HTTPS ingress và tải đa instance trước phát hành production.

**Kiểm chứng G7 ngày 21/10/2026:** Docker/PostgreSQL hoạt động với quyền phù hợp; 9 migrations, financial integration **59 journals cân bằng**, security integration, đối soát **0 sai lệch**, 191/191 unit tests và audit dependency runtime **0 advisory** PASS (còn **5 High dev-only** theo dõi đến 01/12/2026). Dashboard chuyển sang PostgreSQL aggregate, benchmark riêng 10.000 giao dịch cho p95 **1.711,86 → 38,97 ms**. Image Linux `finova:g7-reverify-20261021` build và HTTP smoke PASS. Xem `docs/PHASE_REPORT.md` và `artifacts/G7_PERFORMANCE_10000.json`. **G7 chưa hoàn tất, chưa production-ready.**

**Theo dõi concurrent load ngày 21/10/2026:** PostgreSQL regression mới đối chiếu Dashboard với từng Posting trên 11 cấu hình/2 workspace và PASS. Benchmark 10.000 giao dịch chạy lại 3 lần, p95 tuần tự dao động 23–242 ms; khi 4 request đồng thời xuất hiện outlier khoảng 2 giây. Đây là đo một process local, cần điều tra latency và nghiệm thu multi-instance/staging trước khi đưa vào production. Xem bảng và EXPLAIN trong `docs/PHASE_REPORT.md`.

## Chạy cục bộ

Yêu cầu Node.js >= 22, npm, Docker Desktop + Docker Compose. Cấu hình phát triển hiện dùng cổng ứng dụng `3002` và cổng PostgreSQL `55433` để không ảnh hưởng các ứng dụng cục bộ khác; có thể đổi qua `.env` và `compose.yaml`.

1. `npm install`
2. `Copy-Item .env.example .env` (nếu `.env` chưa tồn tại), tạo `BETTER_AUTH_SECRET` mạnh. Mật khẩu PostgreSQL trong `DATABASE_URL` phải khớp `POSTGRES_PASSWORD` của Compose. Trên Windows, dùng `127.0.0.1:55433` cho Prisma; `localhost` có thể được phân giải sang IPv6 `::1`, khiến lần kết nối lạnh bị chậm. Khi bật Compose profile `app`, cấp riêng `FINOVA_CONTAINER_DATABASE_URL` với host `db:5432` và đúng mật khẩu; nếu thiếu, app từ chối khởi động.
3. `docker compose up -d db` (chỉ khởi động PostgreSQL của Finova).
4. `npx prisma migrate deploy` và `npm run db:generate`.
5. Tạo OAuth 2.0 Client loại Web application trong Google Cloud Console. Điền `GOOGLE_CLIENT_ID` và `GOOGLE_CLIENT_SECRET` vào `.env`. Redirect URI: `http://localhost:3002/api/auth/callback/google`. Authorized JavaScript origin: `http://localhost:3002`. Không yêu cầu quyền Gmail/Drive.
6. `npm run dev -- -p 3002`, vào `http://localhost:3002`. Google Sign-in chỉ hoạt động khi đã có credentials hợp lệ.

Migrations là mã nguồn có kiểm soát tại `prisma/migrations/`; triển khai bằng `prisma migrate deploy`, không dùng `db push` trên production. Nếu chưa có Google credentials, màn hình đăng nhập báo rõ trạng thái thiếu cấu hình, không tạo session giả. Workspace cá nhân và danh mục mặc định được tạo sau đăng nhập; bước onboarding yêu cầu tạo ví đầu tiên. Không tạo ví hay giao dịch giả.

**Cấu hình Prisma pool:** `.env.example` đặt `connection_limit=16` theo đo đạc cục bộ G7. Chẩn đoán bổ sung trên Windows chứng minh `localhost` (DNS trả IPv6) có thể làm `$connect` mất ~2,3 giây và mở 16 connection mất ~2,04 giây; với cùng pool 16, đổi riêng host thành `127.0.0.1` giảm tương ứng còn ~18/20 ms. Đây là sửa cấu hình **đường kết nối host Windows**, không phải kết quả benchmark HTTPS hay SLA production. Với PostgreSQL mặc định `max_connections=100`, tính tổng `connection_limit × số replica` và dự phòng cho migrations/monitoring; điều chỉnh theo tài nguyên DB thay vì mặc định dùng 16 cho mọi môi trường.

### Kiểm tra

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:oauth       # Khởi tạo Google OAuth/guard trên server localhost đang chạy
npm run test:browser     # Chrome headless, login responsive 1440/390/320 trên server đang chạy
$env:FINOVA_TEST_RUN='1'; npm run test:integration  # CHỈ chạy trên PostgreSQL phát triển
$env:FINOVA_TEST_RUN='1'; npm run test:security-integration  # Quota PostgreSQL, khóa tạm
npm run db:reconcile
```

Script tích hợp tạo các workspace tạm có tiền tố `integration-`, kiểm tra số dư và đối soát sổ cái, sau đó xóa riêng dữ liệu thử. **Không chạy trên production.** `db:reconcile` là lệnh chỉ đọc. Browser smoke cần Chrome hoặc Edge trên Windows (có thể đặt `CHROME_PATH`), sử dụng profile tạm và không đăng nhập; ảnh kiểm tra trong `artifacts/qa`. OAuth smoke kiểm tra khởi tạo và quyền truy cập trước đăng nhập, **không thay thế kiểm thử Google callback/session/logout bằng tài khoản thật**. Xem `docs/PHASE_REPORT.md` để biết trạng thái kiểm chứng gần nhất và các chặn hiện tại.

## Tài liệu

- `docs/PRD.md`: phạm vi sản phẩm và nghiệm thu.
- `docs/ARCHITECTURE.md`: kiến trúc thực hiện.
- `docs/ERD.md`: mô hình dữ liệu triển khai.
- `docs/FINANCIAL_RULES.md`: quy tắc sổ cái kép.
- `docs/REPORT_DEFINITIONS.md`: công thức dashboard và giới hạn.
- `docs/API_CONTRACT.md`: API hiện có.
- `docs/IMPLEMENTATION_PLAN.md`: phase P0–P8 và công việc còn thiếu.
- `docs/GAP_ANALYSIS.md`, `docs/PHASE_REPORT.md`: chênh lệch so với đặc tả và kết quả thực tế.
- `docs/OPERATIONS_RUNBOOK.md`: backup/restore, kiểm tra phát hành và rollback P7.
- `docs/TEST_PLAN.md`: 18 acceptance cases, fixtures và invariant regression; `docs/ADR/0006-stack-runtime-and-release.md`: quyết định stack và các điều kiện triển khai.

Hai đặc tả gốc tại thư mục gốc được giữ nguyên. Google credentials đang được cấu hình cục bộ trong `.env`; không commit tệp này vào Git. Vì Google Client Secret đã được chia sẻ trong cuộc trò chuyện, nên xoay vòng secret trước khi triển khai production.
# G7 hardening / audit (20/10/2026)

Chạy `npm run security:routes` để kiểm kê guard HTTP v1, `npm run security:audit` để xác minh dependency advisories và `npm run db:reconcile` để đối soát 11 nhóm tài chính (read-only). Xem [`docs/SECURITY_THREAT_MODEL.md`](docs/SECURITY_THREAT_MODEL.md) và [`docs/AUTHORIZATION_AUDIT.md`](docs/AUTHORIZATION_AUDIT.md) về bảo mật/ownership và các bước nghiệm thu còn mở. **G7 đang triển khai; chưa đủ điều kiện production.**

