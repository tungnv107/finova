# FINOVA — IMPLEMENTATION PLAN: QUẢN TRỊ HỆ THỐNG, GÓI LITE/PREMIUM VÀ PHÂN TÍCH VẬN HÀNH

**Mã phân hệ:** FN-ADMIN-BILLING · **Phiên bản kế hoạch:** 1.0 · **Lập ngày:** 23/10/2026  
**Tình trạng:** ĐẶC TẢ/KẾ HOẠCH; **0 nhiệm vụ triển khai mới được nghiệm thu**; chưa tích hợp thu phí hay tự động kích hoạt Premium.  
**Liên kết:** [Kế hoạch tổng thể](../IMPLEMENTATION_PLAN_QUAN_LY_TAI_CHINH_CA_NHAN.md) · [Tracker triển khai](IMPLEMENTATION_PLAN.md) · [Kiến trúc](ARCHITECTURE.md) · [Thiết kế Bank Sync](FINOVA_BANK_SYNC_IMPLEMENTATION_PLAN.md) · [SePay Bank Hub](FINOVA_SEPAY_BANKHUB_IMPLEMENTATION_PLAN.md) · [Bảo mật](SECURITY_THREAT_MODEL.md).

> **Nguyên tắc cập nhật:** chỉ đánh dấu `[x]` sau khi có đủ mã nguồn, migration áp dụng lên DB kiểm thử, bằng chứng unit/integration hoặc E2E phù hợp và tài liệu được cập nhật. Kết quả Bank Sync/SePay hiện có **không chứng minh** đã đối soát thanh toán Premium. Chế độ production của các luồng ngân hàng hiện vẫn **NO-GO** theo các tracker nguồn.

> **Quyết định sản phẩm đã xác nhận ngày 23/10/2026:** Premium **29.000 VNĐ/1 tháng lịch** hoặc **199.000 VNĐ/1 năm lịch**; Lite **miễn phí**, **không được dùng nhóm “Công cụ & thông báo” gồm Nhập sao kê, Đồng bộ sao kê, Thông báo**. Hai mức giá và giới hạn này là yêu cầu đã chốt; các nhiệm vụ triển khai, nghiệm thu vẫn `[ ]` cho đến khi có bằng chứng thực tế.

## 1. Mục tiêu, phạm vi và quyết định sản phẩm

1. Mọi tài khoản Finova được tạo mới đều thuộc **Lite**; tài khoản đã tồn tại được backfill Lite mà không mất lịch sử tài chính, ví, giao dịch hay quyền đăng nhập.
2. Người dùng xem quyền lợi Lite/Premium, bảng giá theo **thời hạn**, tạo yêu cầu nâng cấp và chuyển khoản đúng số tiền/nội dung đến tài khoản nhận phí do quản trị cấu hình. Sau khi **xác minh giao dịch tiền vào hợp lệ**, hệ thống tự kích hoạt/gia hạn Premium tương ứng với đơn hàng; hiển thị ngày hết hạn và lịch sử thanh toán.
3. Quản trị hệ thống quản lý tài khoản người dùng, gói/giá, tài khoản nhận phí, đơn hàng/giao dịch/đối soát, lịch sử cấp quyền, báo cáo đăng ký, doanh thu thu tiền, truy cập và sức khỏe vận hành.
4. Đảm bảo phân quyền toàn hệ thống, bảo mật nguồn thanh toán, **chống kích hoạt trùng** khi IPN lặp/đồng bộ lịch sử trùng, và đối soát được từ tiền thực nhận → đơn hàng → lần cấp quyền.
5. Có công cụ xử lý ngoại lệ, hoàn tiền/thu hồi quyền theo quy trình có kiểm soát, cảnh báo giao dịch chưa khớp, báo cáo định kỳ và nhật ký bất biến phục vụ kiểm toán.

**Ngoài phạm vi đợt đầu:** thanh toán thẻ quốc tế, tự động trích nợ định kỳ, tính thuế/xuất hóa đơn điện tử trực tiếp, nhiều tiền tệ, hệ thống tiếp thị qua email/SMS tự động, quản trị đọc nội dung giao dịch tài chính cá nhân của người dùng. Các nghĩa vụ hóa đơn/thuế/bảo vệ dữ liệu cá nhân phải được xác minh trước khi bán thương mại.

### 1.1. Quyết định nền tảng

| Chủ đề | Quyết định đề xuất cho V1 | Lý do/điều kiện |
| --- | --- | --- |
| Phạm vi gói | **Theo User** (chính chủ tài khoản), không theo Workspace | Phù hợp yêu cầu "gói tài khoản của User"; các workspace mà user tham gia chỉ nhận quyền theo chính sách chủ sở hữu chức năng đã mô tả, tránh tự cấp Premium cho thành viên khác. |
| Mặc định | `LITE`, không thời hạn, giá 0 | Backfill nhất quán, không có trạng thái gói null. |
| Gói có phí | `PREMIUM`, có `startsAt`, `expiresAt`, lịch sử mỗi lần cấp quyền | Không lưu một cờ boolean Premium dễ sai khi hết hạn. |
| Kỳ hạn và giá đã chốt | **Premium tháng: 29.000 VNĐ / 1 tháng lịch; Premium năm: 199.000 VNĐ / 1 năm lịch (12 tháng lịch)** | Lưu `billingPeriod=MONTH/YEAR`, `periodCount=1`, cộng theo lịch Việt Nam; **không quy đổi thành 30/365 ngày cố định**. |
| Cơ chế giá | Người dùng chọn kỳ hạn từ catalog, tạo **đơn hàng** chốt `amountDueVnd`, `billingPeriod`, `periodCount` và `priceVersion` | Giá mới không sửa đơn cũ; không tính thời gian từ số tiền tự khai hay ảnh chụp chuyển khoản. |
| Ghép thanh toán | Ưu tiên **mã đơn duy nhất + đúng tài khoản nhận + đúng số tiền + tiền vào đã xác minh** | Chỉ đối soát theo số tiền có thể ghép nhầm giữa nhiều đơn. |
| Nguồn giao dịch | Adapter đọc **tài khoản thu phí của Finova** qua dịch vụ ngân hàng/provider được phép sử dụng | Phân biệt với SePay Bank Hub dùng để đọc **tài khoản cá nhân người dùng** trong `/bank-sync`; không dùng lại consent hay ledger người dùng để thu phí. |
| Gia hạn | Nếu còn Premium: cộng thời hạn từ `max(now, currentExpiresAt)`; nếu hết hạn: tính từ `now` | Đảm bảo gia hạn liên tiếp và không mất ngày đã trả tiền. |
| Truy cập | Tính `effectivePlan` từ grants hợp lệ + thời gian hiện tại ở server, áp dụng quota server-side | Gỡ/thu hồi, hết hạn có hiệu lực dù chưa chạy cron. |
| Giới hạn Lite đã chốt | **Không có Nhập sao kê, Đồng bộ sao kê và Thông báo** | Ẩn/khóa UI **và** kiểm tra entitlement trên server/API/background job; các tính năng còn lại hiện giữ như đang có. |
| Phần còn cần xác nhận | Tài khoản nhận phí/provider, quy trình hóa đơn/thuế, hoàn tiền và ngày áp dụng chính sách cho user cũ | Số tiền hiển thị/đơn hàng trước mắt là đúng **29.000/199.000 VNĐ**; không tự cộng phụ phí hoặc đổi giá khi chưa có quyết định mới. |

### 1.2. Bảng giá Premium và ma trận tính năng đã chốt

| Gói | Mã sản phẩm | Thời hạn cấp khi thanh toán hợp lệ | Số tiền chuyển khoản chính xác |
| --- | --- | --- | ---: |
| Lite | `LITE` | Không thời hạn | **0 VNĐ** |
| Premium tháng | `PREMIUM_MONTHLY` | **1 tháng lịch** | **29.000 VNĐ** |
| Premium năm | `PREMIUM_YEARLY` | **1 năm lịch** | **199.000 VNĐ** |

**Yêu cầu khởi tạo catalog:** 2 bản ghi giá Premium được publish khi đủ điều kiện bán, `currency=VND`, `priceVnd` lần lượt `29000` và `199000`, `billingPeriod=MONTH/YEAR`, `periodCount=1`; bản Lite giá 0 không cần tạo đơn hàng. Quản trị có thể điều chỉnh giá bằng **phiên bản giá mới** khi được phê duyệt, nhưng hai mức nêu trên là **giá cấu hình ban đầu bắt buộc**; chưa xác nhận mã giảm giá, gói quý hay tính năng trả góp.

| Nhóm chức năng | Lite | Premium | Cách áp dụng |
| --- | --- | --- | --- |
| Đăng nhập Google, profile, bảo vệ dữ liệu, xuất/xóa dữ liệu theo quyền | Có | Có | Không thu phí quyền riêng tư/khả năng lấy lại dữ liệu. |
| Ví, ghi thu/chi thủ công, lịch sử cơ bản, dashboard cơ bản | Có | Có | Giữ một bộ tính năng thiết yếu hữu dụng. |
| Hạn mức ví/giao dịch, khoảng thời gian báo cáo | Giữ như hiện tại | Giữ như hiện tại | Chưa áp dụng quota mới ngoài nhóm chức năng đã chỉ định. |
| Báo cáo, export, phân tích xu hướng | Có | Có | Không khóa báo cáo/Export trong Lite theo quyết định hiện tại. |
| **Nhập sao kê** (`/imports`) | **Không** | **Có** | `STATEMENT_IMPORT`: menu, page, API, xử lý import/retry đều phải được bảo vệ. |
| **Đồng bộ sao kê** (`/bank-sync`) | **Không** | **Có, khi provider hỗ trợ và user đồng ý** | `BANK_SYNC`: menu, page, API, đồng bộ thủ công/tự động và tác vụ nền kiểm tra gói. Premium không đồng nghĩa có quyền ngân hàng mặc định. |
| **Thông báo** (`/notifications`) | **Không** | **Có** | `NOTIFICATIONS`: menu, page, API và tạo thông báo tính năng được bảo vệ. Trạng thái thanh toán/đăng nhập quan trọng vẫn hiển thị qua checkout/cài đặt tài khoản. |
| Ngân sách, mục tiêu, thẻ, khoản vay, giao dịch định kỳ | Có | Có | Giữ nguyên nghiệp vụ và dữ liệu đã tạo. |

**Quy tắc chuyển gói:** trên Lite, ba feature key `STATEMENT_IMPORT`, `BANK_SYNC`, `NOTIFICATIONS` trả `enabled=false`, trên Premium đang hiệu lực trả `enabled=true` (tùy điều kiện provider/consent riêng). Khi hết Premium, **ẩn nhóm “Công cụ & thông báo”** khỏi menu desktop/mobile, chặn trang và API bằng mã lỗi nghiệp vụ `PREMIUM_REQUIRED` (`403`), kèm link nâng cấp. **Không xóa** import batch, sao kê cũ, kết nối ngân hàng, thông báo đã tồn tại. Tạm dừng job tự động và thao tác tạo/ghi nhận mới cho user Lite; worker đang chạy phải kiểm tra lại quyền trước bước ghi dữ liệu nghiệp vụ, dừng an toàn khi hết hạn và lưu checkpoint cần thiết để có thể đối soát/tiếp tục sau này. Webhook đã đến phải theo chính sách lưu bền vững, không ghi sổ/đồng bộ mới khi Lite và không ACK giả thành công. Khi Premium trở lại, cho phép tiếp tục theo trạng thái consent/provider và cơ chế đối soát an toàn. **Trạng thái đơn hàng, thanh toán, kích hoạt và hết hạn gói phải luôn xem được trong checkout/cài đặt gói kể cả khi user là Lite**, không phụ thuộc vào phân hệ Thông báo.

**Điểm chặn phát hành:** bảo vệ entitlement ở **server/API/service/worker** phải được kiểm chứng; ẩn navigation chỉ là UX. Chính sách chuyển tiếp cho người dùng đang dùng ba tính năng khi gói mới áp dụng (đặc biệt kết nối ngân hàng đã kích hoạt) phải được công bố và có lộ trình tạm dừng an toàn trước khi bật paywall đại trà.

## 2. Vai trò và phân quyền

`Membership.role` hiện tại là quyền **trong một Workspace**, tuyệt đối không được coi `OWNER` là quản trị nền tảng. Thiết kế vai trò **toàn hệ thống** riêng:

| Quyền | `SUPER_ADMIN` | `ADMIN` | `FINANCE_OPERATOR` | `ANALYST` | `USER` |
| --- | :---: | :---: | :---: | :---: | :---: |
| Dashboard tổng hợp, báo cáo đã ẩn PII | ✓ | ✓ | ✓ (phần thu phí) | ✓ | — |
| Xem danh sách người dùng và trạng thái gói | ✓ | ✓ | Theo nghiệp vụ thanh toán, tối thiểu | Chỉ aggregate | Chỉ của mình |
| Khóa/mở khóa người dùng, quản lý chính sách | ✓ | ✓ (theo policy) | — | — | — |
| Cấu hình bảng giá/entitlement | ✓ | ✓ (có audit/kiểm soát) | — | — | — |
| Cấu hình tài khoản ngân hàng nhận tiền | ✓ + phê duyệt | Đề xuất thay đổi, chờ phê duyệt | Chỉ xem số che | — | Chỉ xem hướng dẫn thanh toán công khai |
| Xem đối soát, xử lý giao dịch ngoại lệ | ✓ | ✓ | ✓ | Chỉ aggregate | Xem đơn của mình |
| Cấp/thu hồi Premium thủ công, hoàn tiền | ✓, kiểm soát độc lập | Hai bước theo hạn mức | Đề xuất xử lý | — | — |
| Phân quyền quản trị, xuất dữ liệu nhạy cảm | ✓ với xác thực lại | — | — | — | — |

- **Đăng nhập:** tiếp tục Better Auth/Google. Bootstrap quản trị bằng lệnh vận hành kiểm soát trên user ID/Google identity đã xác thực; tuyệt đối không tự nâng quyền do email do client truyền, `Membership.OWNER`, domain email hay route public.
- **Quy tắc:** kiểm tra quyền **ở server cho từng handler/service**, mặc định từ chối; menu ẩn chỉ hỗ trợ UX; xác thực lại thao tác nhạy cảm; audit gồm người thao tác, đối tượng, thay đổi trước/sau đã loại bí mật, lý do, thời điểm, request ID.
- **Bảo vệ dữ liệu:** trang admin không trả danh sách ví, số dư, thu chi, sao kê cá nhân; dữ liệu email/tên người dùng chỉ hiện với vai trò được cấp. Export nhạy cảm cần lọc trường, ghi audit, hạn chế tải hàng loạt.
- **User lifecycle:** `ACTIVE`, `SUSPENDED`, `DEACTIVATED` là trạng thái **truy cập** riêng; không xóa cứng user có thanh toán; khi khóa thì thu hồi session phù hợp và vẫn lưu lịch sử mua gói.

## 3. Nghiệp vụ end-to-end

### 3.1. Mua mới và gia hạn

1. User đăng nhập; `/pricing` hoặc `/settings/subscription` hiển thị `LITE` hoặc `PREMIUM`, hạn cuối, bảng quyền lợi và bảng kỳ hạn đang bán.
2. User chọn một kỳ hạn; backend chụp **phiên bản giá**, sinh `BillingOrder` ở `PENDING_PAYMENT`, mã tham chiếu chuyển khoản **ngẫu nhiên và duy nhất**, `amountDueVnd` nguyên và `expiresAt` của **đơn** (ví dụ 24 giờ, cấu hình). Không để client chỉ định giá/ngày hiệu lực.
3. User thấy ngân hàng nhận tiền, tên chủ tài khoản, số tài khoản đã xác minh, số tiền, nội dung chuyển khoản, QR theo chuẩn ngân hàng hỗ trợ, nút sao chép và cảnh báo về thời gian xử lý. Đơn hàng có trạng thái rõ ràng. **Không thu OTP/mật khẩu tài khoản ngân hàng.**
4. Provider đã được ủy quyền gửi IPN hoặc API lịch sử trả giao dịch **tiền vào**; backend xác thực nguồn, chuẩn hóa event, ghi inbox bền vững, trả ACK theo giao thức đã xác minh, worker đối soát với đúng mã tham chiếu, receiver, VND, số tiền và trạng thái giao dịch.
5. Nếu khớp **duy nhất, chính xác, chưa dùng**, trong **một PostgreSQL transaction** cập nhật order thành `PAID`, tạo `SubscriptionGrant` và `SubscriptionEvent`, tính/gia hạn `expiresAt`, phát outbox notification. Người dùng thấy Premium ngay từ lần kiểm tra entitlement tiếp theo.
6. Sau khi hết hạn, `effectivePlan` tự về Lite ngay khi kiểm tra thời gian; job định kỳ chỉ để phát thông báo/lưu snapshot báo cáo, không là điều kiện tiên quyết để khóa quyền đúng hạn.

**Ví dụ áp dụng đúng bảng giá:** User chọn **Premium tháng**, đơn yêu cầu chuyển đúng **29.000 VNĐ**, nội dung `FNV-ORDER-...`, sau khi đối soát hợp lệ hệ thống cấp **1 tháng lịch**. Chọn **Premium năm** thì chuyển đúng **199.000 VNĐ** và được cấp **1 năm lịch**. Nếu đang Premium còn 10 ngày, mua thêm 1 tháng sẽ cộng **một tháng lịch tính từ hạn cũ**, không mất 10 ngày còn lại. Giá và kỳ hạn phải được snapshot trong đơn hàng, có lịch sử phiên bản và không để client tự chọn số tiền.

### 3.2. Ma trận xử lý tiền vào / tình huống ngoại lệ

| Tình huống | Kết quả | Quản trị xử lý |
| --- | --- | --- |
| Mã đơn + receiver + số tiền khớp; đơn còn hạn | `PAID → GRANTED`, 1 lần | Theo dõi audit/không cần can thiệp. |
| IPN lặp hoặc IPN và polling cùng `transactionId` | 1 `PaymentEvent`, 1 order consumption, 1 grant | Không phát sinh ngày Premium thứ hai. |
| Thiếu/sai mã, nội dung không nhận dạng | `UNMATCHED`, không kích hoạt | Danh sách chờ đối soát; xác minh nguồn gốc. |
| Số tiền thiếu hoặc thừa | `AMOUNT_MISMATCH`, **không** tự suy ra kỳ hạn | Hoàn tiền hoặc ghép tay theo phê duyệt, thông báo minh bạch. |
| Đúng số tiền nhưng sai ngân hàng/tài khoản thụ hưởng hoặc giao dịch tiền ra | `REJECTED/REVIEW` | Không cấp quyền. |
| Nhiều đơn cùng số tiền | Chỉ khớp theo mã đơn duy nhất | Nếu mã trùng mơ hồ, đưa review. |
| Đơn hết hạn rồi tiền mới đến | `LATE_PAYMENT_REVIEW`; không mất dấu tiền | Theo chính sách gia hạn/hoàn tiền, không tự cấp nếu giá đã thay đổi. |
| Giao dịch chuyển trước khi tạo đơn | `UNMATCHED` | Đối soát thủ công với bằng chứng; không suy đoán. |
| Event thiếu ID provider hoặc sai kiểu/thời gian | `QUARANTINED/REVIEW` | Chỉ replay sau xác minh, fingerprint không đủ để auto-grant. |
| Nguồn chuyển khoản gửi lại sau chargeback/reversal, hoàn tiền | `DISPUTED/REFUNDED` và quy trình điều chỉnh có audit | Không xóa lịch sử; xử lý entitlement theo chính sách, tránh âm thời gian. |
| Cùng User thanh toán hai đơn hợp lệ | 2 grant nối tiếp | Serialize theo User để tránh lost update ngày hết hạn. |
| Admin cấp bù miễn phí | Grant `MANUAL`, lý do, hạn, người duyệt | Không cộng vào doanh thu thu tiền. |

**Quyết định cần phê duyệt trước release:** chính sách thanh toán thiếu/thừa, đơn quá hạn, hoàn tiền, tranh chấp, cấp bù và thời hạn hoàn tất đối soát. Không tự chuyển tiền cho user: hoàn tiền qua quy trình kiểm soát tài chính riêng.

### 3.3. Chính sách vòng đời gói

- Phân biệt `planCode` (`LITE/PREMIUM`), trạng thái đơn, trạng thái payment và trạng thái grant. Không có trạng thái Premium `ACTIVE` vĩnh viễn; miễn phí/đền bù phải có ngày hết hạn hoặc loại grant vĩnh viễn được chấp thuận riêng.
- `effectivePlan(user, nowUTC) = PREMIUM` khi có quyền chưa bị thu hồi và `startsAt <= nowUTC < expiresAt`; còn lại `LITE`. Điều kiện subscription riêng không phụ thuộc tình trạng thanh toán mới đang chờ.
- Thời gian dùng **UTC ở DB**, tính phép cộng kỳ hạn theo **lịch `Asia/Ho_Chi_Minh`** rồi chuyển lại UTC; `MONTH` cộng một tháng lịch, `YEAR` cộng một năm lịch, giữ giờ/phút/giây địa phương. Khi ngày tương ứng không tồn tại (31/01 → tháng 2; 29/02 → năm không nhuận), lấy ngày hợp lệ cuối cùng; lưu `billingAnniversaryDay` để các lần gia hạn tháng liên tiếp không bị trôi ngày neo (31/01 → 28/02 → 31/03). Định nghĩa và test cả các chuyển tiếp năm nhuận.
- Gia hạn nối tiếp: worker lấy lock/`Serializable` theo User, tính điểm bắt đầu từ `max(nowUTC, currentEffectiveExpiration)` rồi cộng **`billingPeriod`/`periodCount` của order snapshot** theo quy tắc lịch trên; cập nhật ngày neo một cách nhất quán. Thêm unique constraint `grant.orderId` để chống grant kép.
- Khi về Lite, chặn ngay `STATEMENT_IMPORT`, `BANK_SYNC`, `NOTIFICATIONS` tại server, tạm dừng sync/notification jobs cho user đó, giữ lịch sử cũ. Khi nâng cấp lại, chỉ khởi chạy tiếp các kết nối còn consent hợp lệ và xử lý bù theo chính sách đối soát.
- Mất Premium do hết hạn thì quyền nâng cao bị hạn chế; không xóa hoặc thay đổi ledger/dữ liệu đã tạo. Có màn hình giải thích và đường dẫn nâng cấp. Admin có thể xem lịch sử/khôi phục theo log.
- Khi chính sách giá/giới hạn thay đổi, đơn đã tạo giữ nguyên snapshot; entitlement thay đổi phải có `policyVersion` và kế hoạch chuyển đổi cho người dùng hiện hữu.

## 4. Thiết kế dữ liệu (Prisma/PostgreSQL mục tiêu)

**Hiện trạng đã đọc:** `User`, `Session`, `Account` của Better Auth; `Workspace`, `Membership`, `UserPreferences` và các bảng Bank Sync đã tồn tại trong `prisma/schema.prisma`. **Chưa có** `Subscription`, `BillingOrder`, `PaymentEvent` dành cho Premium. Dưới đây là **đề xuất schema**, không phải migration đã chạy.

| Model / bảng | Trường chính và ràng buộc dự kiến | Chỉ mục, lưu ý |
| --- | --- | --- |
| `AdminRoleAssignment` | `id`, `userId FK`, `role`, `status`, `assignedBy`, `createdAt`, `revokedAt` | `userId,role` unique cho bản ghi hiện hành; không dùng Membership role. |
| `UserAccessState` | `userId PK/FK`, `status`, `reason`, `changedBy`, `updatedAt` | Không sửa trực tiếp trường Better Auth làm ảnh hưởng đăng nhập. |
| `SubscriptionPlan` | `code` (`LITE`, `PREMIUM`), `displayName`, `isActive`, `sortOrder` | Plan là catalog logic, **không** sửa mã gói lịch sử. |
| `PlanPrice` | `id`, `planCode`, `billingPeriod` (`MONTH/YEAR`), `periodCount=1`, `priceVnd` (29.000/199.000 ban đầu), `currency=VND`, `version`, `effectiveFrom`, `effectiveTo`, `isPublished` | Chống hai giá đang hiệu lực trùng kỳ hạn; snapshot từng order. |
| `PlanEntitlement` | `planCode`, `featureKey` (`STATEMENT_IMPORT/BANK_SYNC/NOTIFICATIONS`), `enabled`, `policyVersion` | Unique `(planCode,featureKey,policyVersion)`; Lite `false`, Premium `true` cho ba feature key. |
| `BillingReceivingAccount` | `id`, `bankCode`, `bankName`, `accountName`, `accountNumberEncrypted`, `accountNumberLast4`, `providerAccountRef`, `status`, `effectiveFrom/To`, `createdBy/approvedBy` | Bản ghi lịch sử giữ nguyên; một default `ACTIVE` khi tạo order; **không cho phép user tự khai receiver**. |
| `BillingOrder` | `id`, `userId FK`, `orderCode unique`, `planCode`, `priceId`, `billingPeriodSnapshot`, `periodCountSnapshot`, `amountDueVnd`, `currency`, `receiverAccountId`, `status`, `createdAt`, `expiresAt`, `paidAt`, `activatedAt` | `userId,createdAt`, `status,expiresAt`; amount = VND nguyên; không mutate snapshot. |
| `BillingPaymentEvent` | `id`, `provider`, `providerAccountRef`, `providerTransactionId`, `direction`, `amountVnd`, `occurredAt`, `receivedAt`, `normalizedReference`, `rawEncryptedRef`, `verificationStatus`, `matchStatus` | Unique `(provider,providerAccountRef,providerTransactionId)` nếu ID có; một event chỉ gắn tối đa một order. |
| `PaymentAllocation` | `id`, `paymentEventId unique`, `orderId unique`, `allocatedAmountVnd`, `matchedBy`, `matchedAt`, `decision` | Tách event từ order, ngăn tái dùng tiền; ngoại lệ chuyển về hàng chờ xử lý. |
| `Subscription` | `userId PK/FK`, `planCode`, `startsAt`, `expiresAt`, `billingAnniversaryDay`, `version`, `updatedAt` | Projection/cache phục vụ đọc nhanh; **grants/events** mới là nguồn audit. |
| `SubscriptionGrant` | `id`, `userId`, `orderId nullable unique`, `grantType`, `billingPeriod`, `periodCount`, `startsAt`, `expiresAt`, `revokedAt`, `createdBy`, `reason`, `policyVersion` | Cấp thủ công không có order, bắt buộc reason+approval; serialize theo User. |
| `SubscriptionEvent` | `id`, `userId`, `grantId`, `type`, `beforeJson`, `afterJson`, `occurredAt`, `actorId`, `correlationId` | Lịch sử append-only; tránh lưu secret/PII không cần thiết. |
| `BillingInbox` / `BillingOutbox` / `BillingJob` | provider event ID, raw hash, status, attempt count, `lockedUntil`, lastErrorCode, idempotency keys | Persist trước ACK; retry backoff, lease, dead-letter, replay có quyền/audit. |
| `AdminAuditLog` | `id`, `actorId`, `action`, `resourceType`, `resourceId`, `reason`, `before/after redacted`, `requestId`, `createdAt` | Append-only, phân quyền xem, retention. Tách `AuditLog` tài chính theo workspace. |
| `ProductUsageEvent` | `id`, `userId nullable`, `sessionKey`, `eventName`, `pageKey`, `occurredAt`, `consentVersion`, `source` | Không lưu URL query chứa thông tin tài chính; event de-dup theo event key; TTL. |
| `ProductUsageDaily` | `dateVN`, `metricKey`, `segment`, `value`, `computedAt`, `sourceVersion` | Bảng aggregate tổng hợp; unique theo ngày+metric+segment; refresh idempotent. |

**Integrity:** tiền dùng `Decimal(20,0)` hoặc kiểu tiền VND nguyên đã thống nhất; kiểm tra `amount > 0`, `periodCount > 0`, `billingPeriod ∈ {MONTH,YEAR}`, `startsAt < expiresAt`; FK và unique ở DB; mọi điều chỉnh quan trọng đi trong transaction, không tin kết quả lookup trước lock. Dữ liệu thanh toán platform **không ghi vào `Transaction`, `Journal`, `Posting` thuộc Workspace user**. Doanh thu thu phí Finova thuộc báo cáo doanh thu nền tảng; không trộn báo cáo tài chính cá nhân.

**Migration/backfill:** schema mới → seed Lite/Premium catalog chưa mở bán → insert Subscription Lite cho User đã tồn tại theo batch/restartable → bắt đầu đọc entitlement với fallback Lite → bật tính năng theo flag. Có `rollback` logic tắt paywall/webhook và phục hồi schema ứng dụng tương thích; không xóa dữ liệu thanh toán sau khi phát sinh.

## 5. API và phân lớp dịch vụ dự kiến

| Method | Endpoint | Quyền / hành vi chính |
| --- | --- | --- |
| `GET` | `/api/v1/billing/plans` | Public/đăng nhập theo chính sách; chỉ trả plan/price đang publish, không lộ bản nháp. |
| `GET` | `/api/v1/me/subscription` | Session; trạng thái hiệu lực, hạn, hạn mức và tính năng. `Cache-Control: no-store`. |
| `POST` | `/api/v1/billing/orders` | User; body `{priceId}`; server snapshot catalog, quota và `Idempotency-Key`, Origin guard. |
| `GET` | `/api/v1/billing/orders` | User; chỉ các đơn của mình, phân trang + trạng thái. |
| `GET` | `/api/v1/billing/orders/:id` | User; chỉ chủ đơn; trạng thái cập nhật từ DB, polling giới hạn. |
| `POST` | `/api/webhooks/billing/:provider` | Provider; xác thực **đúng giao thức đối tác**, chống replay; raw inbox commit trước ACK. |
| `POST` | `/api/internal/billing/reconcile` | Internal worker secret + quota; poll bù theo cursor/watermark, match/retry. |
| `GET` | `/api/v1/admin/overview` | Role `ADMIN/ANALYST` theo field-level policy; KPI/time range. |
| `GET` | `/api/v1/admin/users`, `/api/v1/admin/users/:id` | Admin; search/sort/filter, phân trang cursor, masking. |
| `PATCH` | `/api/v1/admin/users/:id/access` | Admin; suspend/reactivate, lý do, audit, không tự vô hiệu hóa super admin cuối. |
| `GET/POST/PATCH` | `/api/v1/admin/plans/prices` | Admin; chỉnh bản nháp, duyệt và phát hành phiên bản giá. |
| `GET/POST/PATCH` | `/api/v1/admin/billing/receiving-accounts` | Super admin/luồng duyệt; xác thực lại, lưu bí mật mã hóa. |
| `GET` | `/api/v1/admin/billing/orders` | Finance/Admin; đối soát trạng thái, ngày, số tiền, bank, mã đơn. |
| `GET` | `/api/v1/admin/billing/payments` | Finance/Admin; xem unmatched/duplicate/refund/dispute theo mask. |
| `POST` | `/api/v1/admin/billing/payments/:id/review` | Finance/Admin; quyết định có lý do, hai bước với cấp quyền/điều chỉnh nhạy cảm. |
| `POST` | `/api/v1/admin/users/:id/subscription/grants` | Admin được cấp quyền; bù thời hạn có hạn, lý do, phê duyệt, idempotent. |
| `POST` | `/api/v1/admin/subscriptions/:id/revoke` | Cấp cao/duyệt; giữ event và quyết định thu hồi. |
| `GET` | `/api/v1/admin/analytics/{users,subscriptions,revenue,traffic,operations}` | Phân quyền theo report, filter kỳ, export aggregate. |
| `GET` | `/api/v1/admin/audit` | Super admin/auditor được cấp quyền; bộ lọc và retention. |

**Chuẩn API:** hợp đồng request/response Zod, `401/403/404/409/422/429` phân biệt rõ; idempotency key theo actor+action+payload fingerprint; mutation có `assertSameOrigin()` với session hoặc xác thực riêng cho provider/internal; correlation ID, error code, `no-store`, body size limit, pagination bounds, rate limit và audit. Không sao chép nguyên guard `requireContext()` cho admin khi nó bootstrap workspace; tạo `requireSystemRole()` độc lập dựa trên signed session và quyền DB.

**Tái sử dụng:** cơ chế durable outbox/lease, mã hóa nguồn và retry của Bank Sync có thể tái sử dụng thành thư viện kỹ thuật; dữ liệu, khóa, receiver và provider credential phải tách. Tài liệu chính thức của nhà cung cấp **phải xác minh** kiểu webhook/IPN, token/chữ ký/API key, ACK, truy vấn lịch sử, ID giao dịch, trạng thái cuối cùng và quyền dùng cho **tài khoản nhận phí** trước khi tích hợp thật.

## 6. Thiết kế giao diện

**Giao diện người dùng:** `/pricing` (hiển thị nổi bật **Lite 0 VNĐ**, **Premium 29.000 VNĐ/tháng**, **199.000 VNĐ/năm**, so sánh ba tính năng Premium); `/settings/subscription` (Lite/Premium, thời hạn theo tháng/năm lịch, nút nâng cấp/gia hạn, lịch sử cấp quyền); `/billing/checkout/:orderId` (tài khoản thụ hưởng, số tiền, mã nội dung, QR, đếm thời hạn đơn, cảnh báo chuyển đúng thông tin); `/billing/orders` (chờ thanh toán/đã nhận/kích hoạt/cần hỗ trợ). UI có loading, empty, error, offline, retry và trạng thái tiền vào không khớp; **không hiển thị “đã thanh toán” chỉ sau khi User bấm “Tôi đã chuyển”**. Với Lite, **ẩn toàn bộ nhóm điều hướng “Công cụ & thông báo”** cả desktop/mobile; truy cập trực tiếp URL ba tính năng thì hiển thị trang yêu cầu Premium, không trả dữ liệu.

**Giao diện quản trị `/admin`** có sidebar riêng; chỉ xuất hiện nếu có role hệ thống (server kiểm tra lại):

| Đường dẫn | Nội dung chính |
| --- | --- |
| `/admin` | KPI cards: tổng user, đăng ký mới, DAU/MAU, Premium đang hiệu lực, chuyển đổi, thu tiền, cảnh báo đối soát; xu hướng 7/30/90 ngày. |
| `/admin/users` và `/:id` | Search email/tên, trạng thái, ngày tạo, lần hoạt động, gói/hạn; xem timeline gói, đình chỉ/mở; không truy cập dữ liệu ví/sao kê riêng tư. |
| `/admin/plans` | Lite/Premium, bảng giá theo kỳ, phiên bản, entitlements, bản nháp, xem trước tác động, phát hành có kiểm soát. |
| `/admin/billing/accounts` | Ngân hàng nhận phí, holder, số mask, hiệu lực, thay đổi/duyệt, lịch sử; chặn tài khoản chưa xác minh. |
| `/admin/billing/orders` | Đơn hàng, filter trạng thái, nguồn, số tiền, kỳ hạn, tỷ lệ thanh toán, thời gian chờ. |
| `/admin/billing/payments` | Giao dịch vào, matched/unmatched/mismatch, xử lý ngoại lệ, replay an toàn và audit. |
| `/admin/subscriptions` | Premium còn hạn/hết hạn/gia hạn/cấp thủ công/thu hồi; theo dõi sắp hết hạn. |
| `/admin/analytics` | Tabs User, Chuyển đổi & gói, Doanh thu thu phí, Truy cập, Vận hành; export tổng hợp CSV/XLSX. |
| `/admin/audit` | Nhật ký hệ thống với actor/action/time/resource/result, bộ lọc và xuất có kiểm soát. |
| `/admin/settings` | Chính sách thời hạn đơn, cảnh báo, cấu hình provider/worker, retention, bảo vệ secret; không hiện API key gốc. |

**UI/UX:** giữ bộ nhận diện Finova, responsive 320/390/768/desktop, light/dark, bảng nhiều cột có scroll/lọc, keyboard/a11y, chart drill-down thống nhất bộ lọc. Trang thanh toán trên mobile ưu tiên **số tiền + nội dung + QR + trạng thái**; thông tin thụ hưởng lấy từ snapshot của order, không đổi dù admin cập nhật receiver sau đó.

## 7. Báo cáo, định nghĩa KPI và nguồn dữ liệu

Mọi biểu đồ cho phép lọc `start`, `endExclusive`, timezone mặc định `Asia/Ho_Chi_Minh`, độ hạt ngày/tuần/tháng, so sánh kỳ trước, xuất aggregate. Không cộng số liệu Ledger cá nhân vào doanh thu của Finova.

| Mã | Báo cáo/KPI | Định nghĩa nguồn sự thật | Tần suất/mức chi tiết |
| --- | --- | --- | --- |
| `AD-01` | Tổng người dùng / mới đăng ký | COUNT user hợp lệ; User `createdAt` trong kỳ, tách test/đã xóa theo policy | Gần realtime/ngày; theo ngày nguồn đăng ký |
| `AD-02` | Người dùng hoạt động `DAU`, `WAU`, `MAU` | Distinct `userId` có **authenticated product activity**, lần lượt 1/7/30 ngày rolling, loại job/bot | Daily rollup; retention theo cohort |
| `AD-03` | Visit, session, page view | Visit = session có ít nhất 1 page view hợp lệ; page view = sự kiện điều hướng đã khử trùng, gắn định nghĩa consent/anonymous | Hourly/daily; phân tích route nhóm, thiết bị khi cho phép |
| `AD-04` | Phễu nâng cấp | View pricing → create order → verified paid → grant Premium, cohort theo ngày phát sinh bước đầu | Daily; conversion từng bước, không đếm double cùng order |
| `AD-05` | Cơ cấu gói | User có `effectivePlan=PREMIUM` tại mốc báo cáo so với Lite; phân biệt paid/manual | Snapshot ngày; tổng nhóm = base user đủ điều kiện |
| `AD-06` | Gói bán theo kỳ hạn | COUNT paid orders và cấp quyền theo `billingPeriodSnapshot` (`MONTH/YEAR`)/`priceId`, gia hạn vs mua lần đầu | Daily/monthly |
| `AD-07` | Thu tiền thực tế | Tổng **payment allocations verified** hợp lệ theo `matchedAt` (gross collections), trừ hoàn tiền riêng để ra net | Daily/monthly; tất cả VND; đối soát ngân hàng |
| `AD-08` | Doanh thu phân bổ kỳ hạn (nếu cần) | Phân bổ doanh thu theo ngày quyền sử dụng; tách `cash collected` khỏi `recognized revenue` | Chỉ triển khai sau khi chính sách kế toán được duyệt |
| `AD-09` | Gia hạn, hủy, hết hạn | Số user gia hạn, số premium sắp hết hạn 7/30 ngày, hết hạn mà không gia hạn theo cohort | Daily, không gọi hủy với user chưa tới hạn |
| `AD-10` | Retention/churn Premium | Paid cohort kỳ đầu; retained nếu Premium trả phí tiếp trong cửa sổ định nghĩa, churn khi hết hạn + grace window | Chốt độ trễ, dùng snapshot lịch sử |
| `AD-11` | Thanh toán ngoại lệ | Count/value unmatched, under/over, late, duplicate, disputed/refunded, backlog age | Realtime/giờ, cảnh báo SLA |
| `AD-12` | Sức khỏe vận hành | IPN nhận/ACK/reject, latency xử lý, queue depth, retry/DLQ, provider API errors, reconciliation lag | Metric/alert theo giờ |
| `AD-13` | Chi phí/khả năng sử dụng hệ thống | Lượt request có auth, lỗi 4xx/5xx, thời gian xử lý, tỷ lệ trả lỗi; không thu payload người dùng | Hourly/daily, kết hợp log quan sát |
| `AD-14` | Hoạt động quản trị | Lượt đình chỉ, sửa giá, thay tài khoản thụ hưởng, manual grant/revoke, xử lý hoàn tiền, export nhạy cảm | Audit event, ngày/tháng |

**Giải thích thống kê:**

- `Premium đang hiệu lực` là **snapshot thời điểm**, không lấy tổng tất cả đơn PAID; user có 3 lần gia hạn vẫn đếm là 1 người.
- `Paid conversion` dùng distinct user chuyển Lite → Premium trả tiền lần đầu trong cohort; đơn đã trả nhưng grant lỗi phải báo riêng thay vì tăng user Premium.
- `MRR` **không mặc định bằng tổng thu tiền tháng** với gói trả trước nhiều ngày. Nếu có MRR thì định nghĩa annualized/normalized recurring revenue được bộ phận tài chính phê duyệt, gắn nhãn khác cash collected.
- `Visit` không suy ra từ bảng `Session` của Better Auth (đăng nhập ≠ lượt truy cập). Cần event instrumentation thật, cơ chế consent/retention hợp lệ và chống ghi nhiều event do reload/hydration; không hiển thị số giả khi thiếu dữ liệu.
- Daily rollup đếm distinct trên sự kiện chuẩn, giới hạn cardinality và PII; tách dữ liệu raw có TTL, báo cáo aggregate lưu lâu hơn theo chính sách. Không ghi path/query chứa mã giao dịch, số tài khoản hoặc tên file sao kê vào analytics.
- Cross-check: tổng `paid allocation` phải khớp event tiền vào đã verified theo quy tắc loại unmatched; tổng granted có `orderId` bằng số order đã kích hoạt (sau khi loại manual/điều chỉnh); chênh lệch thể hiện thành báo cáo lỗi, không tự điều chỉnh âm thầm.

## 8. Phân rã công việc — execution tracker

**Quy tắc:** 100% nhiệm vụ mới để `[ ]` tại thời điểm lập kế hoạch. Thứ tự trong từng pha là thứ tự ưu tiên; dependency phải được đóng trước khi nghiệm thu. Mỗi task bao gồm code/schema nếu áp dụng, tests, log/error handling, tài liệu và bằng chứng. Định danh `AD*` dành riêng phân hệ, tránh trùng `BS*` hoặc `SP*`.

### AD0 — Chốt yêu cầu, bảng giá, tuân thủ (6 task)

| Xong | ID | Công việc / đầu ra | Điều kiện nghiệm thu |
| --- | --- | --- | --- |
| [ ] | AD0-01 | Kiểm kê auth/user/workspace/bank sync/reporting, xác định ranh giới dữ liệu | ADR mô tả quyền global vs workspace, billing vs ledger và dependency hiện hữu. |
| [ ] | AD0-02 | **Đã có yêu cầu:** Lite không có Nhập sao kê/Đồng bộ sao kê/Thông báo, các tính năng khác giữ hiện tại; đặc tả rollout, dữ liệu cũ, quy tắc khi hết hạn | Ba feature key có ma trận quyền cụ thể; chốt thời điểm chuyển tiếp user cũ và UX, có test chặn API/job. Chưa triển khai nên giữ `[ ]`. |
| [ ] | AD0-03 | **Đã có giá:** 29.000 VNĐ/tháng lịch, 199.000 VNĐ/năm lịch; seed catalog/price version, chính sách chứng từ/thuế | Hai mã kỳ hạn và giá đúng, bất biến trong order; VAT/hóa đơn và chính sách đổi giá được phê duyệt trước khi mở bán. Chưa triển khai nên giữ `[ ]`. |
| [ ] | AD0-04 | Chốt quy trình hoàn tiền/thiếu/thừa/trễ, chính sách giữ dữ liệu, khiếu nại | Có SLA, vai trò xử lý, kịch bản kiểm thử và text hỗ trợ người dùng. |
| [ ] | AD0-05 | Pháp chế/kế toán xem xét nhận tiền, chứng từ, thuế, dữ liệu cá nhân, quyền hoạt động provider | Biên bản phê duyệt trước khi mở thu phí thật. |
| [ ] | AD0-06 | Chọn provider **thu phí** và xác minh hợp đồng/webhook/polling/IPN, ID giao dịch, xác thực nguồn, coverage tài khoản nhận tiền | Contract test spec + UAT checklist, tài khoản sandbox/production tách biệt. |

### AD1 — Dữ liệu, bảo mật và nền tảng admin (8 task)

| Xong | ID | Công việc / đầu ra | Điều kiện nghiệm thu |
| --- | --- | --- | --- |
| [ ] | AD1-01 | Schema/migration AdminRole, UserAccessState, AdminAuditLog | Prisma validate, DB constraints, migrate/rollback drill. |
| [ ] | AD1-02 | Bootstrap SUPER_ADMIN bằng vận hành, tránh public role escalation | Không user nào tự nâng role; bảo vệ super admin cuối. |
| [ ] | AD1-03 | `requireSystemRole()`, permission matrix, guard admin page/API, CSRF/rate limit | Test 401/403, USER và OWNER bị từ chối, mỗi role chỉ xem trường được phép. |
| [ ] | AD1-04 | Schema plan/price/entitlement/subscription/grant/event | FK/unique/range, bản giá bất biến và policy version được test DB. |
| [ ] | AD1-05 | Backfill Lite cho user hiện tại, mặc định tạo user mới | Backfill chạy lại không trùng, mọi user có effective Lite, không ảnh hưởng Ledger. |
| [ ] | AD1-06 | Hệ thống entitlement server-side, `STATEMENT_IMPORT/BANK_SYNC/NOTIFICATIONS`, feature flags và no-store | Lite deny 3 feature keys, Premium allow khi còn hạn; test hết hạn/thu hồi, API/job bypass, bật/tắt flag an toàn. |
| [ ] | AD1-07 | UserAccessState suspend/reactivate + revoke sessions + audit | User bị khóa không gọi API thành công; không xóa purchase history. |
| [ ] | AD1-08 | Privacy/security audit, mã hóa receiver, RBAC deny-list, audit secret redaction | Negative IDOR + admin data isolation + log scanning pass. |

### AD2 — Catalog gói, tài khoản nhận phí, checkout (8 task)

| Xong | ID | Công việc / đầu ra | Điều kiện nghiệm thu |
| --- | --- | --- | --- |
| [ ] | AD2-01 | CRUD bản nháp giá, publish/unpublish có version & audit | Giá cũ vẫn giữ cho order, user chỉ đọc phiên bản published. |
| [ ] | AD2-02 | Cấu hình 1+ tài khoản nhận tiền, xác minh và quy trình hai bước khi thay đổi | Không đổi receiver của order đã tạo, mask dữ liệu admin/read, không lộ token. |
| [ ] | AD2-03 | DB models BillingOrder, PaymentEvent, Allocation, Inbox/Outbox/Job | Schema constraints unique + indexes + chạy migration DB thực. |
| [ ] | AD2-04 | Service tạo order từ `priceId`, snapshot, mã order random, TTL, idempotency | 2 request đồng thời không nhân bản order với cùng key; không sửa tiền từ client. |
| [ ] | AD2-05 | Mã QR/nội dung CK và thông tin thụ hưởng từ snapshot | QR/bank info đúng, copy đúng, không chứa URL/chìa khóa nhạy cảm. |
| [ ] | AD2-06 | UI pricing/checkout/history/responsive, pending/error/expired state | E2E desktop/mobile, accessibility và trạng thái thực từ API. |
| [ ] | AD2-07 | UI quản trị plans/receiving accounts, change preview + audit | Vai trò phù hợp chỉnh/duyệt, USER không vào được. |
| [ ] | AD2-08 | Trạng thái đơn tạo/đã nhận/kích hoạt/cần xử lý tại checkout và cài đặt gói; chỉ gửi thông báo tính năng khi user có entitlement | User Lite vẫn tra cứu được trạng thái mua Premium; không tuyên bố đã trả tiền khi user chỉ upload ảnh/bấm nút. |

### AD3 — Thu tiền ngân hàng và kích hoạt Premium (10 task)

| Xong | ID | Công việc / đầu ra | Điều kiện nghiệm thu |
| --- | --- | --- | --- |
| [ ] | AD3-01 | Adapter provider thu phí theo hợp đồng chính thức, env sandbox/production tách | Contract tests đúng API/ID/status/ACK, không mượn Bank Hub user token. |
| [ ] | AD3-02 | IPN authenticated, bound payload + inbox commit trước ACK | Bad secret/signature/schema bị từ chối; DB thất bại không ACK thành công. |
| [ ] | AD3-03 | Polling/backfill có cursor/watermark/overlap cho missed IPN | Giao dịch nhận qua cả 2 đường vẫn chỉ tạo 1 canonical event. |
| [ ] | AD3-04 | Durable outbox worker, retry/backoff/lease, DLQ và replay có audit | Crash/retry/2 worker không tạo cùng allocation hai lần. |
| [ ] | AD3-05 | Payment matcher đúng `reference+receiver+direction+amount+status` | Sai/mờ/thừa/thiếu/late/ambiguous vào review; test fixture đầy đủ. |
| [ ] | AD3-06 | Atomic order PAID → allocation → subscription grant/event → outbox | Concurrent IPN/checkout/worker chỉ 1 grant/order, rollback toàn bộ khi lỗi. |
| [ ] | AD3-07 | Gia hạn theo **tháng/năm lịch**, hết hạn tại API, revoke/manual grant audit | 2 order một user không mất kỳ hạn; kiểm tra ngày 28/29/30/31, tháng 2, năm nhuận; không xóa dữ liệu khi về Lite. |
| [ ] | AD3-08 | Hoàn tiền/dispute/late payment, dual approval và lý do | Lịch sử bất biến, báo cáo cash/grants được điều chỉnh nhất quán. |
| [ ] | AD3-09 | Admin payments/order reconciliation UI, queue exception/controlled replay | Không thể approve chính giao dịch mình đề xuất nếu policy yêu cầu 2 người. |
| [ ] | AD3-10 | UAT **thật** trên provider sandbox, nhập tiền, nhận IPN, backfill, đảo thứ tự, timeouts | Chứng cứ ID nguồn đối tác, DB/order/grant khớp; mock không đủ đóng task. |

### AD4 — Quản trị người dùng và trải nghiệm Premium (7 task)

| Xong | ID | Công việc / đầu ra | Điều kiện nghiệm thu |
| --- | --- | --- | --- |
| [ ] | AD4-01 | `/admin` protected shell/menu riêng Finova, responsive/theme/a11y | Non-admin không render data, direct URL 403, mobile usable. |
| [ ] | AD4-02 | Danh sách user search/filter/pagination/export giới hạn | Test PII field authorization, truy vấn index, cursor ổn định. |
| [ ] | AD4-03 | User detail: gói, lifecycle, order/grant timeline, last seen | Không xem chi tiết tài chính cá nhân; cross-user access denied. |
| [ ] | AD4-04 | Quản lý suspend/reactivate và lịch sử tác động admin | Required reason, step-up ở thay đổi nhạy cảm, audit đầy đủ. |
| [ ] | AD4-05 | Subscription dashboard/lịch sử gia hạn/cấp bù/thu hồi có duyệt | Quyền cấp bù theo role, duplicate submission an toàn. |
| [ ] | AD4-06 | Cài đặt gói user: giá 29.000 VNĐ/tháng, 199.000 VNĐ/năm, effectivePlan, hạn, nâng cấp/gia hạn | UI đúng 2 kỳ hạn, ngày hết hạn theo giờ VN, không mất dữ liệu. |
| [ ] | AD4-07 | Chặn Lite ở `/imports`, `/bank-sync`, `/notifications` (UI + API + worker) và ẩn nhóm menu “Công cụ & thông báo” | Không bypass bằng direct API/webhook/job; worker tái kiểm tra entitlement trước ghi dữ liệu và checkpoint an toàn nếu gói hết hạn giữa tác vụ; Premium được dùng khi provider/consent cho phép; Lite vẫn dùng module khác. |

### AD5 — Phân tích truy cập, báo cáo, cảnh báo (8 task)

| Xong | ID | Công việc / đầu ra | Điều kiện nghiệm thu |
| --- | --- | --- | --- |
| [ ] | AD5-01 | Chốt analytics taxonomy, consent/retention, anonymous policy, bot/internal exclusion | Dictionary/PRD xác định metric, privacy approval. |
| [ ] | AD5-02 | Instrument pageview/session/activity từ UI/server đáng tin cậy | Test double mount/reload/bot/anonymous, không thu dữ liệu giao dịch. |
| [ ] | AD5-03 | ProductUsageDaily rollup có restart/backfill, TTL partition/index | Daily distinct và timezone VN kiểm chứng DB thực. |
| [ ] | AD5-04 | KPI users/DAU/MAU/cohort/retention từ data thật | Reconcile với user/events; test các ngày rỗng và timezone edge. |
| [ ] | AD5-05 | KPI funnel, paid plan, renew, churn, collection/refund, exception | SQL aggregate và đối soát payment/order/grant; không double count. |
| [ ] | AD5-06 | Admin dashboard + drill-down 7/30/90 ngày và filter | Loading/empty/error/tooltip nguồn định nghĩa, mobile và a11y. |
| [ ] | AD5-07 | Báo cáo CSV/XLSX, scheduled aggregate/report snapshot nếu cần | Ràng buộc RBAC, định dạng VND/timezone, xuất không lộ PII. |
| [ ] | AD5-08 | Alert đối soát lệch, IPN down, queue lag, payment pending SLA, audit anomalies | Mô phỏng outage, xác minh thông báo đúng người vận hành. |

### AD6 — Chất lượng, vận hành, phát hành (8 task)

| Xong | ID | Công việc / đầu ra | Điều kiện nghiệm thu |
| --- | --- | --- | --- |
| [ ] | AD6-01 | Unit state machine, pricing snapshot, entitlement time, parser/validation | Edge cases ngày giờ, giá 0/null, trạng thái sai, idempotency. |
| [ ] | AD6-02 | PostgreSQL integration: 2 user, 2 admin, concurrency, FK, replay, mismatch | Test transaction rollback, 2 workers, unique grant, isolation. |
| [ ] | AD6-03 | API security: signed Better Auth session, CSRF, RBAC, session revoked, IDOR | USER/OWNER/ANALYST/FINANCE/SUPER_ADMIN ma trận 401/403/404. |
| [ ] | AD6-04 | Browser E2E Google login + Lite→order→payment sandbox→Premium→expiry, mobile | Screenshot/evidence trên desktop/390/320; không chỉ synthetic cookie. |
| [ ] | AD6-05 | Load/chaos: IPN replay, provider 401/429/503, DB outage, retry/backfill | Không mất event đã ACK, không grant kép; p95 theo SLO duyệt. |
| [ ] | AD6-06 | Ops runbook: rotate receiver/secret, sao lưu/khôi phục, DLQ replay, reconciliation, incident | Chạy diễn tập staging, phân quyền operator và lưu log. |
| [ ] | AD6-07 | Privacy/legal/security/finance acceptance, invoice/tax workflow, data deletion plan | Biên bản ký duyệt độc lập trước live thu tiền. |
| [ ] | AD6-08 | CI gates, staging HTTPS, rollout flags, production rollback/monitoring, release sign-off | `typecheck`, `lint`, unit, integration, build, route guard audit PASS + UAT provider thật. |

**Tổng cộng: 55 nhiệm vụ mới** (AD0 6 + AD1 8 + AD2 8 + AD3 10 + AD4 7 + AD5 8 + AD6 8). Khi báo cáo tiến độ, ghi tách `đã code`, `đã test`, `đã UAT provider`, `đã phát hành` và số `[x]/55`; tuyệt đối không đánh dấu hoàn tất chỉ vì có giao diện hoặc mock webhook.

## 9. Ma trận nghiệm thu nghiệp vụ tối thiểu

| Test ID | Input/luồng | Kỳ vọng bất biến |
| --- | --- | --- |
| `AT-AD01` | New Google user / legacy user backfill | Đều Lite, không mất dữ liệu cũ. |
| `AT-AD02` | User tự gọi `/admin` hoặc API admin | 403, không rò PII/KPI. |
| `AT-AD03` | Workspace OWNER gọi API admin | 403, không suy diễn system role. |
| `AT-AD04` | Đổi giá khi có pending order | Order cũ giữ nguyên snapshot tiền/kỳ hạn/receiver. |
| `AT-AD05` | Client tự sửa amount/duration/receiver | Bị từ chối; dữ liệu server authoritative. |
| `AT-AD06` | IPN sai auth, giả mạo ảnh biên lai | Không kích hoạt Premium. |
| `AT-AD07` | Provider trả đúng 1 event khớp order | Exactly one PAID allocation + grant + outbox, thời hạn đúng. |
| `AT-AD08` | IPN gửi lại 20 lần + polling nhận trùng | Vẫn một lần cấp quyền. |
| `AT-AD09` | Đúng tiền nhưng sai mã, sai receiver, sai direction | Không auto-grant, vào review/reject. |
| `AT-AD10` | Số tiền thiếu/thừa, đơn quá hạn | Giữ được giao dịch, exception queue, không gán ngày Premium tùy tiện. |
| `AT-AD11` | 2 đơn đúng thanh toán đồng thời cùng user | Cộng nối tiếp 2 thời hạn, không lost update. |
| `AT-AD12` | DB lỗi giữa nhận event và commit | Không ACK thành công trước persist; retry đúng. |
| `AT-AD13` | Crash sau PAID commit trước notify | User vẫn Premium; outbox replay an toàn. |
| `AT-AD14` | Premium hết hạn trong lúc đang đăng nhập | API nhận Lite tức thì, data còn nguyên. |
| `AT-AD15` | Admin manual grant / revoke / refund | Đúng vai trò, reason, approval, full audit, không tự tăng cash. |
| `AT-AD16` | Admin đổi tài khoản thụ hưởng | Old order giữ receiver cũ, new order dùng approved active receiver. |
| `AT-AD17` | PII/secret exposure trong response/log/export | Không có secret, masked receiver, user finance data ẩn. |
| `AT-AD18` | DAU/MAU, pageview multiple navigations/hydration | Distinct theo user/date; visit có định nghĩa, không double. |
| `AT-AD19` | 1 user gia hạn 3 lần trong tháng | Premium users = 1; orders và cash là 3 lần theo định nghĩa. |
| `AT-AD20` | Backfill outage + recovery / duplicate provider events | Không mất thu tiền, không cấp gói trùng, discrepancy alert đúng. |
| `AT-AD21` | Export nhiều dữ liệu bằng ANALYST/USER | Chỉ trường/scope cho phép, rate limit và audit. |
| `AT-AD22` | UAT sandbox từ giao dịch ngân hàng thật đến quyền Premium | Chứng minh end-to-end source ID → order → grant → dashboard. |
| `AT-AD23` | Tạo 2 đơn `PREMIUM_MONTHLY`/`PREMIUM_YEARLY` | Số tiền bắt buộc lần lượt **29.000/199.000 VNĐ**; server không cho đổi kỳ hạn/giá/amount. |
| `AT-AD24` | Kích hoạt/gia hạn vào 31/01, 28/02, 29/02 năm nhuận; hai lần gia hạn tháng | Thời hạn cộng **tháng/năm lịch** theo `Asia/Ho_Chi_Minh`, quy tắc ngày neo rõ ràng; không dùng 30/365 ngày cố định. |
| `AT-AD25` | User Lite nhấn menu, vào trực tiếp URL và gọi API Nhập sao kê, Đồng bộ sao kê, Thông báo | Ba mục bị ẩn, API trả `403 PREMIUM_REQUIRED`, background jobs không tiếp tục đồng bộ/tạo thông báo; dữ liệu cũ vẫn còn. |
| `AT-AD26` | User Premium dùng ba công cụ, hết hạn khi worker đồng bộ đang chạy, sau đó gia hạn trở lại | Premium hoạt động với consent/provider hợp lệ; hết hạn chặn ba tính năng kể cả ghi dữ liệu từ worker đang chạy; lưu checkpoint, không mất dữ liệu đã nhận bền vững; gia hạn resume có kiểm soát. |

## 10. Giai đoạn phát hành, phụ thuộc và ước lượng

| Mốc | Điều kiện | Nội dung có thể phát hành | Gate |
| --- | --- | --- | --- |
| **M1 — Admin foundation** | AD0-01/02 + AD1 | Phân quyền, user list, Lite backfill, gói ở chế độ feature flag | Không hở admin API/PII; signed auth regression. |
| **M2 — Catalog & checkout sandbox** | AD0-03/06 + AD2 | Giá, receiver, order và hướng dẫn CK, chưa thu tiền live | Snapshot + approval + sandbox flow pass. |
| **M3 — Automated activation** | AD3 + provider UAT | Tự ghép tiền, Premium, expiry/renewal, ngoại lệ | Bank-origin verified, idempotency/chaos/reconciliation pass. |
| **M4 — Admin analytics** | AD4/AD5 | Dashboard và báo cáo người dùng/gói/thu tiền/truy cập | Số liệu khớp nguồn, privacy + RBAC pass. |
| **M5 — Production** | AD6 + legal/finance/security sign-off | Mở cờ thương mại hóa cho tập user nhỏ, quan sát rồi mở dần | Tất cả gate GO; rollback plan đã diễn tập. |

**Tham chiếu ước lượng:** khoảng **6–10 tuần công** với đội backend + frontend + QA/DevOps phối hợp, **chưa tính** thời gian cấp tài khoản ngân hàng/provider, pháp lý, sandbox UAT hoặc điều chỉnh phạm vi. Đây chỉ là giả định phục vụ lập lịch; ước lượng lại sau AD0. Có thể chạy song song AD4 UI và AD5 analytics taxonomy khi AD1 bảo mật đã có.

### 10.1. Quy trình rollout an toàn

1. Feature flags mặc định: `ADMIN_ENABLED=0`, `BILLING_CHECKOUT_ENABLED=0`, `BILLING_WEBHOOK_ENABLED=0`, `PREMIUM_ENTITLEMENTS_ENFORCED=0` (tên env sẽ chốt khi coding). Chỉ bật riêng sandbox/staging trước.
2. Triển khai migration/backfill nhiều bước không phá schema cũ; chạy cohort dry-run, diff user counts, backup/restore.
3. Mở UI quản trị nội bộ; test đầy đủ RBAC, sau đó cho user xem catalog và checkout sandbox.
4. Xác minh tài khoản nhận phí và luồng tiền đầu-cuối thực tế qua provider; reconciliation report đạt, xử lý retry/lag/duplicate.
5. Mở có kiểm soát sau sign-off; đo conversion, payment unmatched backlog, variance và hỗ trợ. Khi lỗi tắt **nhận đơn mới**, giữ worker đối soát đơn đã nhận; không rollback bằng cách xóa dữ liệu thanh toán.

### 10.2. Điều kiện GO/NO-GO bắt buộc

- **NO-GO** nếu thiếu bảng giá/chính sách gói được phê duyệt, chưa có thỏa thuận đọc biến động tài khoản nhận phí, chưa có provider sandbox UAT có chứng cứ, chưa ký duyệt pháp lý/tài chính, hoặc còn đường API admin/entitlement bypass.
- **NO-GO** nếu có tình huống 1 event ghi nhận hơn 1 đơn/grant, giao dịch thiếu/thừa tự kích hoạt, bị mất event đã ACK, cross-user data leak hay thanh toán đúng không thể truy hồi sau sự cố.
- **GO** khi đủ migration, tài liệu API/runbook, audit, reconciliation, security và accessibility, signed Google session E2E, test tải/outage, HTTPS/secret rotation/observability cùng quyết định release chính thức.

## 11. Vị trí triển khai dự kiến trong repository

| Khu vực | Đầu việc dự kiến |
| --- | --- |
| `prisma/schema.prisma`, `prisma/migrations/` | System roles, catalog, orders, payment events, subscription, usage analytics + constraints. |
| `src/server/system-auth.ts`, `src/server/entitlements.ts` | System role guard độc lập workspace, effective plan, feature limit và access state. |
| `src/modules/billing/` | Catalog, checkout, payment adapter, matcher, activation transaction, worker, reversal, audit. |
| `src/modules/admin/` | Queries users/analytics, reports, field-level access, aggregate definitions. |
| `src/app/(protected)/settings/`, `src/app/(protected)/billing/`, `src/app/pricing/` | User upgrade & payment UX; cập nhật navigation. |
| `src/app/(admin)/admin/` | Protected admin layout/dashboard/pages; route group là **đề xuất**, kiểm tra Next.js docs trước khi tạo. |
| `src/app/api/v1/admin/`, `src/app/api/v1/billing/`, `src/app/api/webhooks/billing/`, `src/app/api/internal/billing/` | API public user, admin, bank IPN, worker riêng. |
| `tests/unit/`, `scripts/*integration-check.ts`, `docs/` | QA, fixtures, threat model, API contract, operations runbook, KPI dictionary. |

**Lưu ý cho Codex khi triển khai:** repository đang sử dụng Next.js **16.4.x** với lưu ý breaking changes trong `AGENTS.md`; phải đọc các tài liệu tương ứng tại `node_modules/next/dist/docs/` **trước khi viết mã Next.js**. Không đưa quyền platform admin vào `Membership.role`. Giữ các thay đổi chưa commit của người dùng và chỉ sửa file liên quan trong từng task; sau khi **hoàn thành và kiểm thử** từng task mới cập nhật đúng checkbox trong tài liệu này và tracker tổng thể.

---

**Trạng thái tại ngày lập:** hoạch định hoàn thành; phát triển **0/55**, UAT thu phí **chưa thực hiện**, chưa có bằng chứng kích hoạt Premium tự động, **production billing NO-GO**.
