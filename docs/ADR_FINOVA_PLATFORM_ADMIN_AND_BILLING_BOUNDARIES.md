# ADR — Ranh giới dữ liệu và quyền quản trị Finova

**Mã:** ADR-FNV-ADMIN-001 · **Ngày:** 23/10/2026 · **Trạng thái:** Chấp nhận cho thiết kế/triển khai kỹ thuật; chưa phải phê duyệt thu phí production.

## Bối cảnh và kiểm kê repository

Finova đang sử dụng **Next.js 16.4.2**, **Better Auth** với Google OAuth, **Prisma/PostgreSQL**, và mô hình một `Workspace` cá nhân được khởi tạo sau khi có signed session. `User`, `Session`, `Account` là dữ liệu nhận dạng/đăng nhập toàn ứng dụng. `Membership.role` chỉ áp dụng trong một workspace; `Workspace.createdById` xác định chủ sở hữu dữ liệu cá nhân. `Transaction`, `Journal`, `LedgerAccount`, `Posting`, ví, nhập sao kê và Bank Sync gắn workspace.

Các phụ thuộc đã đối chiếu trong mã nguồn:

| Thành phần | Nguồn hiện tại | Ranh giới |
| --- | --- | --- |
| Session và OAuth | `src/server/auth.ts`, `src/server/context.ts`, `src/server/bootstrap.ts` | Better Auth xác thực người dùng; bootstrap workspace cá nhân, preferences và Lite projection. |
| Quyền workspace | `prisma/schema.prisma` (`Membership`, `Workspace`), `src/server/context.ts` | `OWNER` của workspace không cấp quyền quản trị nền tảng. |
| Quyền hệ thống | `src/server/system-auth.ts`, `src/server/admin-page.ts`, `src/modules/admin/access-policy.ts` | `SystemRoleAssignment` có `SUPER_ADMIN`, `ADMIN`, `FINANCE_OPERATOR`, `ANALYST`; API/page tra quyền trực tiếp từ DB. |
| Người dùng và khóa tài khoản | `src/modules/admin/users.ts`, `src/server/context.ts` | `UserAccessState` kiểm soát truy cập và thu hồi session; dữ liệu mua gói giữ lại. |
| Catalog và thuê bao | `prisma/schema.prisma`, `src/modules/billing/domain.ts`, `src/modules/billing/service.ts`, `src/server/premium.ts` | Giá và đơn hàng theo user; grants có ngày hết hạn; Lite không có ba feature Premium khi bật enforcement. |
| Nhập/đồng bộ/Thông báo | `src/app/api/v1/imports`, `src/app/api/v1/bank-sync`, `src/server/notifications.ts`, `src/modules/bank-sync` | Kiểm tra entitlement ở page/API/service và tại transaction ghi dữ liệu cần bảo vệ. |
| Thu phí nền tảng | `src/modules/billing/sepay-webhook.ts`, `src/modules/billing/reconciliation.ts`, `src/app/api/webhooks/billing/sepay` | Nhận sự kiện thanh toán qua receiver của Finova, xác thực rồi đối soát và cấp grant. |
| Báo cáo admin | `src/modules/admin/overview.ts`, `src/modules/admin/usage.ts`, `src/app/(protected)/admin` | KPI người dùng, khoản thu từ `PaymentAllocation`; usage chỉ là dữ liệu hoạt động đã đăng nhập khi bật flag. |

## Quyết định kiến trúc

1. **Tách vai trò toàn hệ thống khỏi vai trò trong workspace.** Chỉ signed Better Auth session và `SystemRoleAssignment` chưa thu hồi mới được vào route `/admin`, sau đó áp dụng permission theo từng trang/API. Không suy luận quyền từ email, domain, client claim hoặc `Membership.OWNER`. `FINANCE_OPERATOR` chỉ xem dữ liệu thu phí; `ANALYST` chỉ đọc số liệu tổng hợp, không truy cập thông tin người dùng có thể nhận diện.
2. **Thuê bao thuộc `User`.** Mỗi user có mặc định Lite; Premium có hạn qua `SubscriptionGrant` còn hiệu lực và không bị thu hồi. `Subscription` là projection hỗ trợ UI; thời gian và quyền dựa trên grant, không dựa vào cờ do client gửi. Giá 29.000 VNĐ/tháng và 199.000 VNĐ/năm; kỳ hạn là tháng/năm lịch theo UTC+07.
3. **Ledger cá nhân và thanh toán Finova là hai miền dữ liệu riêng.** Các bảng `BillingReceivingAccount`, `BillingOrder`, `BillingPaymentEvent`, `PaymentAllocation`, `SubscriptionGrant`, `AdminAuditLog` thuộc platform. Không ghi tiền Premium vào `Transaction`, `Journal` hay `Posting` của user. Doanh thu admin lấy từ phân bổ thanh toán đã được xác minh, không cộng số dư ví của người dùng.
4. **SePay Bank Hub của người dùng và SePay thu phí là hai tích hợp riêng.** Consent/token để đọc tài khoản cá nhân không được sử dụng để theo dõi tài khoản nhận phí Finova. Receiver phải được đề xuất, duyệt hai người và snapshot vào đơn; đơn cũ giữ nguyên receiver. Ingress đối soát chỉ nhận sự kiện tiền vào đã xác thực từ provider, chống replay, transaction serializable bảo đảm một payment event chỉ cấp một grant/order.
5. **Giới hạn Lite thực thi tại server.** Khi `FINOVA_PREMIUM_ENTITLEMENTS_ENFORCED=1`, ba feature `STATEMENT_IMPORT`, `BANK_SYNC`, `NOTIFICATIONS` chỉ cho Premium còn hạn. Worker phải kiểm tra lại tại thời điểm ghi. Không xóa sao kê, kết nối hay lịch sử khi hết hạn. Trạng thái order và subscription luôn xem được từ Lite.
6. **Analytics theo nguyên tắc tối thiểu dữ liệu.** `ProductPageviewReceipt` chỉ dùng dedup ngắn hạn; `ProductUsageDaily` tổng hợp user/ngày Việt Nam. Không lưu IP, raw path, query string, tên file hay giá trị giao dịch. Không coi Better Auth session là visit; DAU/WAU/MAU chỉ là distinct user đã đăng nhập có hoạt động đo được. `FINOVA_USAGE_ANALYTICS_ENABLED=0` cho đến khi privacy/consent được duyệt.

## Phương án đã loại và hệ quả

- Dùng `Membership.OWNER` làm platform admin: có thể tạo lỗ hổng nâng quyền cho mọi chủ ví cá nhân.
- Chỉ lưu `User.isPremium` boolean: không thể xác định hết hạn, gia hạn, nguồn cấp và thu hồi theo audit.
- Ghép thanh toán theo số tiền/ảnh biên lai: không xác minh được tiền thực nhận hoặc chủ đơn, dễ cấp trùng.
- Dùng Bank Sync consent của người dùng để nhận doanh thu nền tảng: trộn phạm vi dữ liệu và khóa nhà cung cấp.
- Thu chi Finova vào ledger người dùng: sai báo cáo tài chính cá nhân và khó đối soát.

Hệ quả kỹ thuật: thêm schema/migration platform, bootstrap role đặc quyền qua CLI, khoá truy cập đa lớp, integration test DB cô lập, feature flags rollout và runbook phục hồi. Phát hành thu phí cần provider UAT thật, raw archive, polling/backfill, durable outbox, chính sách xử lý ngoại lệ, kiểm thử bảo mật và phê duyệt pháp lý/tài chính. Các việc này được theo dõi riêng ở AD0–AD6 và **không được mặc nhiên coi là hoàn thành bởi ADR**.

## Quy tắc nghiệm thu và tham chiếu

- ADR này hoàn thành **AD0-01** về kiểm kê hiện trạng và ranh giới dữ liệu. Đã đối chiếu `schema.prisma`, auth/context/bootstrap, modules admin/billing/bank-sync, API và report hiện có.
- Trạng thái implementation, kiểm thử unit/PostgreSQL và các lỗ hổng phát hành ghi tại [Implement Plan](FINOVA_ADMIN_PREMIUM_IMPLEMENTATION_PLAN.md) và [Payment Runbook](FINOVA_ADMIN_PREMIUM_PAYMENT_RUNBOOK.md).
- Không cấp quyền production hay chạy migration trên DB có người dùng thật từ ADR này.
