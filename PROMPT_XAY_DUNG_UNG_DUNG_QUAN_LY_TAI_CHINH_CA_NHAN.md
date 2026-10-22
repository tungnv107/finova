# MASTER PROMPT — XÂY DỰNG ỨNG DỤNG QUẢN LÝ TÀI CHÍNH CÁ NHÂN

> Có thể dán toàn bộ nội dung tài liệu này vào Codex, Claude Code hoặc AI coding agent. Đây là yêu cầu triển khai **phần mềm hoạt động thực tế**, không chỉ dựng giao diện hoặc viết bản đề xuất.

## 0. VAI TRÒ & NGUYÊN TẮC THỰC HIỆN

Bạn là **Principal Software Architect, Senior Full-stack Engineer, Product Designer (Fintech UX/UI), QA Lead và DevOps Engineer**. Nhiệm vụ: thiết kế, hiện thực, kiểm thử và đóng gói một ứng dụng **quản lý tài chính cá nhân** chất lượng production-ready, ưu tiên người dùng Việt Nam.

Tham khảo ý tưởng chức năng từ **Money Lover** và **Sổ Thu Chi MISA (MISA MoneyKeeper/My Money)**: ghi chép thu chi, ví tiền, hạn mức chi tiêu, tài chính gia đình, theo dõi nợ, tiết kiệm, báo cáo trực quan. **Không sao chép mã nguồn, logo, tên thương hiệu, hình ảnh bản quyền hoặc bố cục độc quyền** của hai sản phẩm; xây dựng thương hiệu và thiết kế riêng.

**Yêu cầu bắt buộc:**
1. Viết **mã chạy thật, kết nối cơ sở dữ liệu thật**, không chỉ mockup, không chỉ giao diện tĩnh.
2. Mọi màn hình và hành động chính phải kết nối backend, có CRUD, validation, trạng thái loading/empty/error/success.
3. Tính toán tài chính phải chính xác, nhất quán và có test; không sử dụng số thực dấu phẩy động để tính tiền.
4. Hệ thống đăng nhập thực sự bằng **Google OAuth 2.0 / OpenID Connect**.
5. **Dashboard và báo cáo trực quan chi tiết** là chức năng ưu tiên cao nhất, không phải phần bổ sung.
6. Phát triển theo từng giai đoạn, hoàn thiện chức năng đã làm trước khi mở rộng; không để nút bấm giả hoặc dữ liệu giả trong giao diện production.
7. Tự kiểm tra repository hiện có và tuân thủ cấu trúc/stack đang hoạt động nếu repo đã tồn tại. Nếu repo trống, sử dụng stack mặc định bên dưới.
8. Không hỏi lại các vấn đề có thể quyết định theo mặc định; ghi rõ giả định. Chỉ cần yêu cầu người dùng cung cấp credentials thật khi đến bước tích hợp/deploy.

## 1. ĐỊNH HƯỚNG SẢN PHẨM

- **Tên tạm:** FinTrack / Tài Chính Của Tôi (đặt trong biến cấu hình, có thể đổi thương hiệu sau).
- **Loại sản phẩm:** Web App responsive + Progressive Web App (PWA), thiết kế mobile-first, hoạt động tốt trên máy tính, tablet, điện thoại. Có cơ sở kiến trúc để bổ sung mobile native sau.
- **Ngôn ngữ mặc định:** Tiếng Việt chuẩn, dấu đầy đủ; chuẩn bị i18n để hỗ trợ English.
- **Tiền tệ mặc định:** VND; dấu phân cách nghìn theo Việt Nam (ví dụ: 12.500.000 ₫); hỗ trợ thiết lập tiền tệ theo từng ví.
- **Múi giờ mặc định:** `Asia/Ho_Chi_Minh`, cho phép đổi theo người dùng; xử lý ngày giờ UTC ở backend và quy đổi theo múi giờ khi tổng hợp báo cáo.
- **Đối tượng:** cá nhân đi làm, hộ gia đình, người có nhiều tài khoản ngân hàng/tiền mặt, người muốn lập ngân sách, theo dõi tiết kiệm và vay nợ.
- **Mô hình:** nhiều người dùng; dữ liệu tách biệt; mỗi người có workspace cá nhân, có thể tạo workspace gia đình (giai đoạn mở rộng) với quyền hạn rõ ràng.

**Mục tiêu trải nghiệm:** Người dùng có thể ghi một khoản chi thông thường trong vài thao tác, hiểu ngay tháng này đã tiêu bao nhiêu, tiêu cho việc gì, đã vượt ngân sách chưa, còn bao nhiêu tiền và tình hình tài chính thay đổi ra sao.

## 2. CÔNG NGHỆ MẶC ĐỊNH

Nếu chưa có dự án/stack sẵn, sử dụng:

| Lớp | Công nghệ |
|---|---|
| Frontend/full-stack | Next.js App Router, React, TypeScript (phiên bản ổn định, tương thích ở thời điểm triển khai) |
| UI | Tailwind CSS, shadcn/ui, Radix UI, Lucide Icons |
| Dashboard/chart | Recharts cho biểu đồ phổ biến; xây component chuyên dụng cho biểu đồ nâng cao/heatmap nếu cần |
| Backend | Next.js Route Handlers/Server Actions có kiểm soát authorization; lớp business service tách biệt |
| Database | PostgreSQL |
| ORM/migrations | Prisma ORM (hoặc ORM đồng nhất hiện có nếu repository đã dùng ORM khác) |
| Đăng nhập | Better Auth hỗ trợ đăng nhập Google; xác minh phiên ở server |
| Validation | Zod, dùng chung các schema phù hợp cho frontend/backend |
| Data fetching | Server Components + TanStack Query khi thực sự cần cache/cập nhật dữ liệu tương tác |
| Forms | React Hook Form + Zod |
| Testing | Vitest/Jest, React Testing Library, Playwright E2E |
| Export | CSV/XLSX bằng thư viện phù hợp; PDF server-side có font hỗ trợ tiếng Việt |
| Deployment | Dockerfile + Docker Compose, `.env.example`, hướng dẫn triển khai VPS/cloud |

**Lưu ý:**
- Không khóa vào một số phiên bản package chưa được kiểm chứng; tra cứu bản ổn định và tài liệu chính thức trước khi cài đặt.
- PostgreSQL lưu giá trị tiền bằng `NUMERIC(20,4)` hoặc minor units kiểu `BIGINT`, tùy chiến lược thống nhất. Tất cả tính toán phải dùng Decimal/BigInt chính xác; không dùng `number` JavaScript để cộng/trừ số tiền.
- Dữ liệu tài chính không lấy từ localStorage như nguồn dữ liệu chính; cơ sở dữ liệu backend là nguồn sự thật.
- Redis, hàng đợi, storage object, email delivery là thành phần **tùy chọn** chỉ bổ sung nếu cần; không làm phức tạp MVP.

## 3. TỔNG QUAN THIẾT KẾ GIAO DIỆN

Thiết kế theo phong cách **modern personal finance / fintech dashboard**, tối giản, rõ ràng, tin cậy, trực quan, thân thiện; **không sao chép giao diện** Money Lover hay MISA.

- Desktop: sidebar cố định hoặc thu gọn bên trái; header chứa chọn khoảng thời gian, workspace/ví, tìm kiếm, thông báo, avatar; main content với card KPI và biểu đồ.
- Mobile: bottom navigation 4–5 mục chính; nút `+` thêm giao dịch nổi bật; form thu chi dạng bottom sheet hoặc toàn màn hình.
- Light mode mặc định; dark mode đầy đủ; lưu sở thích.
- Bảng màu gợi ý: primary xanh dương `#2563EB`, positive xanh lá `#16A34A`, negative đỏ `#DC2626`, warning cam `#F59E0B`, nền sáng `#F8FAFC`. Màu không phải kênh truyền đạt duy nhất; thêm label/icon.
- Typography tiếng Việt: Be Vietnam Pro hoặc Inter hỗ trợ tiếng Việt; số KPI nổi bật, phân cấp rõ.
- Responsive thực sự; loading skeleton, empty states hướng dẫn bắt đầu, empty charts có lời giải thích; toast; confirmation dialog cho hành động xóa; accessibility cơ bản (keyboard/focus/ARIA/contrast).
- Người dùng bấm vào **bất kỳ KPI hoặc phần dữ liệu báo cáo** hợp lệ sẽ drill-down đến danh sách giao dịch đã lọc tương ứng.
- **Không hiển thị dữ liệu mẫu dưới danh nghĩa dữ liệu của người dùng.** Seed demo chỉ ở môi trường development/demo và có nhãn rõ.

### Menu chính

1. Tổng quan (Dashboard)
2. Giao dịch (Thu/Chi/Chuyển tiền)
3. Ví & tài khoản
4. Ngân sách
5. Báo cáo & phân tích
6. Mục tiêu tiết kiệm
7. Vay nợ & thẻ tín dụng
8. Giao dịch định kỳ & nhắc việc
9. Gia đình/Chia sẻ (giai đoạn nâng cao)
10. Cài đặt & dữ liệu

## 4. ĐĂNG NHẬP GOOGLE — BẮT BUỘC CHẠY THẬT

Thực hiện **Google OAuth 2.0 / OpenID Connect** qua Better Auth và Google Cloud OAuth Client:

- Màn hình `/login`: logo sản phẩm riêng, giới thiệu ngắn, nút **Tiếp tục với Google** đúng hướng dẫn thương hiệu của Google.
- Luồng: click Google -> chọn tài khoản, consent khi cần -> callback server -> xác nhận danh tính từ provider -> tạo/tìm user -> thiết lập session an toàn -> onboarding lần đầu hoặc chuyển dashboard.
- Đăng nhập lần đầu tự tạo hồ sơ mặc định và workspace cá nhân; không tạo dữ liệu giao dịch giả.
- Lưu ID định danh Google provider (`sub`/providerAccountId), email, trạng thái xác minh, tên/avatar; không dùng email một mình làm định danh Google bất biến.
- Không yêu cầu truy cập Gmail, Google Drive, danh bạ hoặc thông tin ngân hàng; chỉ scopes cần thiết (`openid`, `email`, `profile`).
- Session an toàn bằng cookie `HttpOnly`, `Secure` trên HTTPS, `SameSite` phù hợp luồng OAuth; kiểm tra session ở **server** và authorization cho từng request.
- Có chống CSRF cho các thao tác thay đổi dữ liệu, bảo vệ luồng OAuth với state/PKCE theo hỗ trợ thư viện, giới hạn tần suất tại các endpoint nhạy cảm.
- Có đăng xuất, trang hồ sơ, tùy chọn xóa tài khoản/xóa dữ liệu có xác nhận và ghi log an toàn.
- Không lưu access token/refresh token trong localStorage; không log credentials/token; không commit `.env`.
- Mỗi truy vấn dữ liệu phải gắn `userId`/`workspaceId` hợp lệ và kiểm tra quyền sở hữu trên server. Không tin `userId` từ request của client.
- Thông báo rõ lỗi hủy login, mất mạng, callback lỗi, phiên hết hạn. Không giả lập đăng nhập nếu cấu hình OAuth thiếu.

**Environment variables tối thiểu (tên có thể điều chỉnh theo phiên bản thư viện được chọn):**

```env
DATABASE_URL=postgresql://finance_user:change_me@localhost:5432/personal_finance
BETTER_AUTH_SECRET=replace_with_random_long_secret
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Google Cloud Console:**
- Tạo OAuth client loại **Web application**; cấu hình consent screen, test users và domains khi cần.
- Authorized redirect URI cho development: `http://localhost:3000/api/auth/callback/google`.
- Production: `https://YOUR_DOMAIN/api/auth/callback/google`.
- Bảo đảm `BETTER_AUTH_URL` khớp hostname; không hardcode `localhost` cho production.
- Viết tài liệu từng bước để người triển khai tự bổ sung Client ID/Secret và cấu hình redirect; không đòi agent tự tạo credentials.

## 5. ONBOARDING VÀ CẤU HÌNH CÁ NHÂN

Sau login lần đầu:
1. Chào mừng; thiết lập tên hiển thị, đơn vị tiền tệ cơ sở, múi giờ, ngày bắt đầu kỳ ngân sách (mặc định ngày 1).
2. Tạo ví đầu tiên: Tiền mặt / Ngân hàng / Ví điện tử / Thẻ tín dụng; nhập số dư đầu kỳ và ngày hiệu lực.
3. Chọn/bổ sung danh mục thu chi có sẵn ở Việt Nam.
4. Tùy chọn tạo ngân sách tháng và mục tiêu đầu tiên.
5. Vào dashboard với empty state phù hợp nếu chưa có giao dịch.

Màn hình cài đặt cho phép cập nhật thông tin, tiền tệ hiển thị, chủ đề giao diện, danh mục, thứ tự ví, sao lưu/export, quyền riêng tư.

## 6. QUẢN LÝ VÍ VÀ TÀI KHOẢN

Các loại ví/tài khoản: tiền mặt; tài khoản ngân hàng (ghi thủ công); ví điện tử; tài khoản tiết kiệm; tài khoản thẻ tín dụng (nghĩa vụ nợ); tài khoản theo dõi tài sản khác nếu kích hoạt.

**Chức năng:** Tạo/sửa/lưu trữ (archive) ví; tên, icon, màu, tiền tệ, số dư đầu kỳ, ngày đầu kỳ, ghi chú; số dư hiện tại; lịch sử biến động; chuyển tiền giữa ví; lọc theo ví; đối chiếu số dư; đánh dấu ví không tính trong số dư khả dụng/tổng tài sản theo quy tắc rõ ràng.

**Quy tắc trọng yếu:**
- Chuyển 500.000 ₫ từ Tiền mặt sang Ngân hàng làm ví nguồn -500.000 ₫, ví đích +500.000 ₫; **không** tăng tổng thu, không tăng tổng chi.
- Nếu hai ví khác tiền tệ, lưu số tiền ở cả hai phía, tỷ giá và phí chuyển, dùng tỷ giá thực tế tại thời điểm giao dịch; phí là chi phí riêng nếu có.
- Không cho xóa cứng ví có phát sinh (chỉ archive hoặc chuyển dữ liệu bằng quy trình an toàn).
- Thay đổi số dư đầu kỳ hoặc điều chỉnh số dư cần lưu dấu vết, không được âm thầm tạo thành thu nhập/chi tiêu.

## 7. GIAO DỊCH THU, CHI, CHUYỂN VÍ

### Form nhập nhanh
- Tab **Chi tiền | Thu tiền | Chuyển tiền**; số tiền ưu tiên vị trí; chọn ví, ngày giờ, danh mục, người liên quan (nếu có), ghi chú, nhãn, tệp đính kèm/hóa đơn (tùy chọn).
- Có quick amount, giao dịch gần đây, lưu và nhập tiếp, sao chép giao dịch, sửa/xóa có kiểm soát, hoàn tiền (refund).
- Giao dịch gồm `occurredAt`, `createdAt`, `updatedAt`; cho phép backdate và sắp xếp theo thời điểm phát sinh.
- Nhóm theo ngày/tuần/tháng; search ghi chú, danh mục, số tiền; lọc nhiều điều kiện (date range, ví, danh mục, thu/chi/chuyển tiền, tags, người tạo, trạng thái).
- Hỗ trợ danh mục phân cấp: ăn uống, đi lại, nhà ở, hóa đơn, mua sắm, giải trí, giáo dục, y tế, gia đình, con cái, du lịch, khác; thu nhập: lương, thưởng, kinh doanh, đầu tư, quà tặng, khác. Người dùng thêm/sửa/tắt danh mục riêng.
- Chế độ hàng loạt: gắn danh mục, gắn tags, export; thao tác nhiều bản ghi phải kiểm tra quyền.
- Hỗ trợ nhập CSV/XLSX có preview, ánh xạ cột, phát hiện trùng, validate từng dòng, thông báo số bản ghi nhập thành công/thất bại; triển khai sau lõi CRUD.

### Tính đúng tài chính
- Giao dịch phải atomic trong database transaction: tạo/sửa/xóa không để ví nguồn và ví đích cập nhật lệch nhau.
- Định nghĩa rõ `income`, `expense`, `transfer`, `adjustment`, `refund`, `debt_disbursement`, `debt_principal`, `interest`, `credit_card_payment` hoặc mô hình nghiệp vụ tương đương có phân loại chắc chắn.
- Thu nhập và chi tiêu trong báo cáo **chỉ lấy giao dịch liên quan thực sự tới income/expense**; chuyển tiền nội bộ, số dư đầu kỳ, vay vốn, trả gốc, thanh toán dư nợ thẻ không được tính thành doanh thu/chi phí lần nữa.
- Hoàn tiền phải đảo hoặc giảm khoản chi phù hợp, liên kết giao dịch gốc; xử lý sửa/xóa không làm sai ngân sách.
- Thẻ tín dụng: quẹt thẻ là chi tiêu và tăng dư nợ; trả nợ thẻ bằng tài khoản ngân hàng chỉ giảm tiền ngân hàng và giảm dư nợ, không tạo thêm chi tiêu.
- Vay tiền: nhận vốn vay tăng tiền và tăng nghĩa vụ nợ, không tính vào thu nhập; trả gốc không tính vào chi tiêu, trả lãi tính vào chi tiêu.
- Giao dịch bị vô hiệu hóa/soft delete phải có quy tắc loại khỏi số dư và báo cáo; log người thao tác khi cần.

**Yêu cầu thiết kế sổ cái:** xây dựng một ledger duy nhất làm nguồn sự thật; khuyến nghị cấu trúc `Transaction` + `LedgerEntry` với các bút toán cân đối cho mỗi hoạt động tài chính (hoặc một phương án tương đương có chứng minh bằng test). Không lưu số dư ví như giá trị độc lập dễ lệch; nếu dùng cache số dư thì phải suy ra từ ledger và có quy trình đối soát.

## 8. NGÂN SÁCH & CẢNH BÁO

- Ngân sách theo tháng/tuần/khoảng tùy chọn; ngân sách tổng, ngân sách theo danh mục, hoặc nhóm danh mục; hỗ trợ ngân sách cá nhân và workspace chia sẻ về sau.
- Thiết lập số tiền mục tiêu; số đã chi thực tế; còn lại; % sử dụng; dự báo nếu duy trì tốc độ chi hiện tại; tiến độ theo ngày trong kỳ.
- Cảnh báo ngưỡng 50%, 80%, 100% và trên 100% (có thể chỉnh sửa); cảnh báo trên dashboard và notification center, tránh lặp spam.
- Quy tắc cộng gộp ngân sách: không tự ý cộng ngân sách tổng với ngân sách con gây trùng lặp; mỗi báo cáo phải có quy tắc phạm vi rõ.
- Tùy chọn rollover ngân sách thừa sang tháng tiếp theo ở giai đoạn nâng cao, phải có test.

## 9. MỤC TIÊU TIẾT KIỆM

- Tạo mục tiêu: mua nhà, mua xe, du lịch, quỹ khẩn cấp...; số tiền đích, hạn hoàn thành, số tiền ban đầu, tài khoản/quỹ liên kết.
- Nạp/rút từ mục tiêu, lịch sử đóng góp, % hoàn thành, số còn thiếu, tốc độ cần tiết kiệm mỗi tháng để kịp hạn.
- Nếu nạp mục tiêu bằng chuyển tiền giữa các ví, không tính khoản này thành chi tiêu mới; giữ rõ trạng thái tiền đã được phân bổ và tiền thực sự đang nằm ở ví nào.
- Biểu đồ tiến độ theo thời gian, milestone, cảnh báo chậm mục tiêu.

## 10. VAY NỢ & THẺ TÍN DỤNG

- Phân biệt **tôi đi vay** và **tôi cho vay**; tên đối tác, vốn gốc, lãi suất/kiểu tính lãi, ngày bắt đầu, hạn trả, lịch trả gốc/lãi, ghi chú.
- Theo dõi dư nợ gốc còn lại, lãi dự kiến, lãi đã trả, kỳ sắp đến hạn, quá hạn; chi tiết từng đợt giải ngân/trả nợ.
- Lãi suất đơn/lãi theo dư nợ giảm dần là tùy chọn có phương pháp tính được giải thích và test; không sử dụng công thức thiếu cơ sở.
- Thẻ tín dụng: hạn mức, ngày chốt sao kê, ngày thanh toán, số dư nợ, khả dụng, giao dịch mua hàng, hoàn tiền, thanh toán dư nợ; không đếm trùng dòng tiền trong báo cáo.
- Notification center nhắc đến hạn; chưa tích hợp email/SMS thực nếu chưa cấu hình nhà cung cấp.

## 11. GIAO DỊCH ĐỊNH KỲ VÀ NHẮC VIỆC

- Tạo recurring rule cho lương, tiền thuê nhà, Internet, học phí, tiết kiệm định kỳ... theo ngày/tuần/tháng/năm, có bắt đầu/kết thúc.
- Hai chế độ: tạo giao dịch tự động (nếu thực sự đã phát sinh theo cấu hình), hoặc tạo khoản dự kiến cần xác nhận.
- Worker/job chạy idempotent, có unique key bảo đảm không tạo giao dịch lặp trong cùng kỳ; hỗ trợ sửa rule và ngoại lệ tháng đặc biệt.
- Hiển thị lịch tương lai và nhắc sắp đến hạn; phân biệt forecast với actual. Không cộng giao dịch dự kiến vào báo cáo thực tế.

## 12. DASHBOARD TỔNG QUAN — MỨC ƯU TIÊN HÀNG ĐẦU

Thiết kế như sản phẩm BI mini, cao cấp nhưng không quá tải, thân thiện với người không chuyên tài chính.

### 12.1 Bộ lọc toàn cục
- Khoảng ngày: Hôm nay, 7 ngày, 30 ngày, tháng này, tháng trước, quý này, năm nay, khoảng tùy chọn.
- Bộ lọc ví (một/nhiều), danh mục, tags, thành viên (khi có family workspace), loại giao dịch.
- Lưu filter vào URL query parameters để reload/share deep link không mất ngữ cảnh (không lộ dữ liệu cho người chưa đăng nhập).
- So sánh cùng kỳ trước, cùng kỳ năm trước nếu đủ dữ liệu; không tự đoán % khi kỳ trước bằng 0.

### 12.2 KPI cards — thể hiện rõ công thức
1. **Tổng thu trong kỳ**: tổng thu nhập phát sinh đủ điều kiện.
2. **Tổng chi trong kỳ**: tổng chi phí đủ điều kiện, xử lý hoàn tiền theo chính sách.
3. **Thặng dư/Thâm hụt** = Tổng thu − Tổng chi (khác với biến động số dư tiền nếu có vay, chuyển đổi tài sản...).
4. **Tỷ lệ tiết kiệm** = (Thu − Chi) / Thu × 100%, khi Thu > 0; thu = 0 hiển thị N/A.
5. **Số dư tiền khả dụng hiện tại** = tổng số dư tài sản tiền được chọn, không gồm hạn mức tín dụng hay khoản vay chưa thanh toán.
6. **Giá trị tài sản ròng** = tài sản được theo dõi − nợ phải trả được theo dõi; chú giải phạm vi và giả định định giá.
7. **Ngân sách đã sử dụng** = Chi tiêu thuộc ngân sách / Hạn mức × 100%.
8. **Chi tiêu bình quân/ngày có dữ liệu hoặc ngày đã trôi qua**: mô tả và áp dụng thống nhất cách tính, không đánh tráo mẫu số.

KPI hiển thị tiền VND, chỉ số tăng/giảm so kỳ so sánh, sparkline và tooltip công thức; click để drill-down đúng dữ liệu.

### 12.3 Các biểu đồ bắt buộc

**A. Thu nhập vs Chi tiêu:** biểu đồ cột nhóm theo ngày/tuần/tháng, chuyển đổi granularities; click cột xem giao dịch.

**B. Xu hướng dòng tiền ròng:** area/line chart theo kỳ; có đường tổng lũy kế tùy chọn; phân biệt dòng tiền thuần theo định nghĩa với chuyển tiền nội bộ.

**C. Cơ cấu chi tiêu:** donut chart theo danh mục cha/con, hiển thị %, số tiền; bảng top 10; click drill-down; mục `Khác` gom nhóm khi cần nhưng vẫn mở được.

**D. Heatmap thói quen chi tiêu:** calendar heatmap 12 tháng hoặc kỳ chọn, màu theo cường độ; hover số chi/ngày và số giao dịch; ngày không có giao dịch khác ngày không có dữ liệu.

**E. Phân tích ngân sách:** progress bars/bullet charts từng danh mục, cảnh báo vượt hạn mức, so với tiến độ thời gian.

**F. Cơ cấu số dư ví/tài sản:** horizontal bar/donut, phân tách tài sản và nợ; thẻ tín dụng không được cộng như tiền khả dụng.

**G. Xu hướng 6–12 tháng:** income, expense, net surplus, đường xu hướng và kỳ so sánh.

**H. Top khoản chi lớn nhất:** bảng/visual chart giao dịch lớn nhất, có phân loại và ngày; click đến chi tiết.

**I. Mục tiêu tiết kiệm:** tiến độ từng goal, target vs actual, dự kiến đủ mục tiêu theo tốc độ hiện tại (chú thích giả định).

**J. Tình trạng vay nợ & nhắc việc:** tổng dư nợ, các khoản sắp đến hạn, ngày đến hạn, tiền gốc/lãi; không hiển thị sai là chi tiêu đã phát sinh.

Các biểu đồ nâng cao ở giai đoạn tiếp theo: waterfall giải thích biến động số dư, treemap danh mục chi tiêu, Sankey luồng phân bổ thu nhập, dự báo cashflow dựa trên giao dịch định kỳ. Chỉ triển khai nếu có dữ liệu tính đúng và tương tác thật.

### 12.4 Yêu cầu trải nghiệm tương tác
- Hover tooltip: giá trị đầy đủ, tỷ lệ, kỳ, so sánh trước; legend bật/tắt series; thay granularities; drill-down danh sách giao dịch.
- Khi đổi filter, tất cả KPI/biểu đồ/bảng phải nhất quán với cùng tập điều kiện; cache không được khiến số liệu lệch.
- Biểu đồ có bảng dữ liệu hoặc mô tả text cho người dùng cần accessibility.
- Responsive: desktop bố trí 2–3 cột, mobile 1 cột; không ép biểu đồ quá nhỏ hoặc khó đọc.
- Không dùng các chỉ số được tính từ mock data; dashboard phải phản ánh dữ liệu thật của người dùng.

## 13. TRANG BÁO CÁO CHUYÊN SÂU

Tạo trang `/reports` gồm hệ thống tab, dashboard chuyên đề và bảng chi tiết:

1. **Báo cáo thu chi:** theo kỳ, ví, danh mục, tag; kỳ này vs kỳ trước; xem top nguồn thu/nguồn chi.
2. **Dòng tiền & số dư:** số dư đầu kỳ + dòng tiền vào − dòng tiền ra ± điều chỉnh/chuyển đổi = số dư cuối kỳ (phạm vi ví được chọn); ghi chú rõ chuyển nội bộ giữa ví cùng phạm vi triệt tiêu, chuyển ra ngoài phạm vi vẫn ảnh hưởng biến động số dư tập ví đó.
3. **Ngân sách:** kế hoạch vs thực tế, vượt/thiếu ngân sách, bảng so sánh 3/6/12 tháng.
4. **Chi tiêu theo danh mục:** donut, treemap khi có, bảng chi tiết có drill-down, so sánh tăng giảm.
5. **Phân tích theo thời gian:** ngày trong tuần, tuần trong tháng, tháng trong năm; heatmap.
6. **Tài sản & công nợ:** biến động tổng tài sản theo thời gian, nợ phải trả, tài sản ròng; ghi chú về tài sản do người dùng tự nhập giá trị.
7. **Tiết kiệm & mục tiêu:** khả năng tích lũy, theo dõi tiến độ, chỉ tiêu cần thiết để đạt mục tiêu.
8. **Báo cáo thẻ tín dụng/vay nợ:** gốc, lãi, thanh toán, các kỳ sắp đến hạn.

**Bộ lọc:** custom date range, period compare, ví, category, tags, search; lưu trạng thái; các con số ở overview và report phải thống nhất.

**Export:** CSV UTF-8 BOM phù hợp Excel tiếng Việt, XLSX với các sheet `Tổng quan`, `Thu chi`, `Theo danh mục`, `Giao dịch chi tiết`, `Định nghĩa chỉ số`; PDF có tiêu đề, bộ lọc, kỳ, thời điểm kết xuất, KPI, 1 số biểu đồ và bảng; in A4 đúng dấu tiếng Việt. Export phải lấy cùng dataset/filter và tuân thủ phân quyền.

### 13.1 Quy tắc phân tích tài chính
- Định nghĩa công thức rõ ràng trong code + trong tooltip; kiểm tra các kỳ tháng ngắn, năm nhuận, timezone và ngày giao dịch hồi tố.
- Không gộp tất cả transaction amount để tính thu/chi khi có chuyển ví/trả nợ/thẻ tín dụng.
- So sánh mức thay đổi `Δ = hiện tại − trước`; tỷ lệ `% = Δ / |trước| × 100%` **chỉ khi mẫu số khác 0 và có ý nghĩa**; trường hợp trước = 0 hiển thị `Mới phát sinh` hoặc `N/A`, không Infinity/NaN.
- Tổng danh mục bằng tổng chi của cùng kỳ và phạm vi (sau hoàn tiền, quy đổi tiền tệ, theo chính sách thống nhất).
- Với multi-currency, mỗi giao dịch lưu tiền tệ gốc và snapshot tỷ giá quy đổi tiền tệ báo cáo; không dùng tỷ giá hôm nay để âm thầm sửa báo cáo kỳ quá khứ.
- Nếu thiếu tỷ giá thì đánh dấu giao dịch chưa quy đổi, cảnh báo trong báo cáo và tuyệt đối không cộng lẫn các đồng tiền khác nhau.
- Forecast phải ghi nhãn `Ước tính`, tách khỏi `Thực tế`.

## 14. QUẢN LÝ DỮ LIỆU, BACKUP & RIÊNG TƯ

- Export toàn bộ dữ liệu người dùng theo định dạng máy đọc được (CSV/XLSX và/hoặc JSON backup).
- Import có mapping, dry-run preview, duplicate detection, rollback khi lỗi quan trọng.
- Soft delete và audit trail cho nghiệp vụ nhạy cảm; chính sách giữ/xóa dữ liệu rõ ràng.
- Trang `Quyền riêng tư`, `Xóa tài khoản` có xác nhận và khả năng download trước khi xóa; xóa dữ liệu theo quan hệ hợp lệ.
- File hóa đơn (nếu làm): validate loại/dung lượng, lưu trong private storage, kiểm soát truy cập; không để public static URL không bảo vệ.
- Không tự kết nối ngân hàng hay đọc SMS/Gmail. Nếu thêm sau, chỉ qua API/chương trình được cấp phép và có consent riêng; **Google Login không đồng nghĩa quyền truy cập giao dịch ngân hàng**.
- Không hiển thị dữ liệu tài chính trong logger analytics/console và không đưa nội dung tài chính cá nhân đến AI bên thứ ba mặc định.

## 15. KIẾN TRÚC DỮ LIỆU ĐỀ XUẤT

Thiết kế ERD thực tế; bảng/schema tối thiểu (đặt lại tên khi phù hợp dự án):

- `users`, `accounts`, `sessions`, `verifications`: Better Auth-managed; không tự ghi đè bảng của auth lib.
- `user_preferences`: baseCurrency, timezone, language, budgetStartDay, theme.
- `workspaces`, `workspace_members`: cá nhân; chuẩn bị hỗ trợ gia đình, role owner/editor/viewer.
- `wallets`: id, workspaceId, type, currency, openingBalance, openingBalanceDate, includeInAvailableCash, status, createdAt, updatedAt.
- `categories`: id, workspaceId, parentId, type (income/expense), name, icon, color, isSystem, isArchived.
- `transactions`: id, workspaceId, type, occurredAt, description, categoryId nullable where appropriate, originalAmount/currency, reportCurrencyAmount, exchangeRateSnapshot, transferGroupId/referenceId, status, createdBy, createdAt, updatedAt, deletedAt.
- `ledger_accounts`, `ledger_entries`: journal transactionId, accountId, amount/currency, debitCredit hoặc sign chuẩn hóa; tạo bút toán đối ứng cho income, expense, transfer, card, debt, adjustment.
- `tags`, `transaction_tags`; `attachments` (giai đoạn 2 nếu cần).
- `budgets`, `budget_categories`, `budget_alerts`.
- `goals`, `goal_contributions` (có liên kết ledger/transaction để không đếm tiền hai lần).
- `debts`, `debt_events`, `repayment_schedules`; `credit_card_statements` tùy quy mô.
- `recurring_rules`, `recurring_occurrences`, `notifications`.
- `audit_logs`, `import_jobs` (khi làm chức năng tương ứng).

**Yêu cầu DB:**
- Foreign keys, constraints CHECK và UNIQUE, unique idempotency cho recurring; index bắt đầu bằng `workspaceId` + `occurredAt` và trường filter thông dụng.
- Unique constraints tránh giao dịch import trùng nếu có nguồn dữ liệu/hash ổn định.
- Mọi query phải có authorization và scope workspace ở lớp service/repository; không dựa mỗi vào lọc giao diện.
- Ledger post một cách atomic; tự động kiểm tra tổng bút toán hợp lệ, không âm thầm làm tròn lệch tiền.
- API không được nhận `amount` dưới dạng binary float trong model tính toán nội bộ; serialize decimal về string ở JSON nếu cần.
- Xây migration và seed danh mục mặc định; seed dữ liệu minh họa **chỉ cho demo/development**, không seed vào tài khoản thật mới đăng ký.

Trước khi coding, trình bày ERD và giải thích cách các trường hợp chuyển ví, thẻ tín dụng, vay/trả nợ, refund hoạt động với ledger.

## 16. API & BUSINESS SERVICES

Các route/gói nghiệp vụ REST hoặc server actions tương đương cần có:

- Auth session/Google callback (qua Better Auth).
- Wallet CRUD + transfer + balance + reconciliation.
- Category CRUD + hierarchical tree.
- Transaction CRUD + filtering/search/pagination + refund.
- Budget CRUD + alerts + progress.
- Goal CRUD + contributions.
- Debt CRUD + loan repayments + credit card operations.
- Recurring rule CRUD + occurrence generation.
- Reports: `overview`, `income-expense-series`, `category-breakdown`, `cashflow-series`, `wallet-balances`, `budget-performance`, `expense-heatmap`, `trends`, `net-worth`, `top-transactions`.
- Export/Import endpoints; user profile/settings.

**API response:** typing rõ ràng, Zod validate input, error code thống nhất, HTTP status hợp lý, server-side pagination/filter/sorting; date range rõ inclusive/exclusive, chống N+1; không query quá mức cho mỗi biểu đồ.

## 17. PHI CHỨC NĂNG & BẢO MẬT

- Passwordless Google OAuth là lựa chọn đăng nhập đầu tiên; production HTTPS bắt buộc.
- OWASP: authentication/authorization, CSRF/XSS/SQL injection protections, CSP tương thích, secret management, session rotation/logout, rate limiting, kiểm tra file upload.
- Người dùng A không thể xem, sửa, export, xóa dữ liệu người dùng B kể cả khi sửa ID trong URL/API; test bắt buộc.
- Giao dịch, chuyển tiền, import, jobs có xử lý concurrency/idempotency; không tạo bút toán lặp khi nhấn submit hai lần.
- Các trang dashboard load hợp lý với 10.000 giao dịch/user (đề xuất index, aggregation, pagination, cache đúng phạm vi); đo lường khi có dữ liệu test, không tuyên bố số đo chưa chạy.
- Ứng dụng dùng ổn trên Chrome/Edge/Firefox/Safari phiên bản hiện đại và thiết bị di động; responsive từ 360px.
- Unit test financial core, integration tests cho authorization và API, E2E cho hành trình chính; lint, TypeScript typecheck, build chạy thành công.
- Monitoring lỗi, logging không chứa thông tin tài chính nhạy cảm, backup DB có hướng dẫn restore; tài liệu recovery.

## 18. QUY TRÌNH PHÁT TRIỂN BẮT BUỘC

**Không tạo hết màn hình giả rồi mới nối database.** Làm vertical slices hoàn chỉnh. Với repository có sẵn, đọc cấu trúc và báo cáo thay đổi tác động trước khi chỉnh.

### Phase 0 — Khảo sát & đặc tả
- Kiểm tra repository; chọn/giữ stack phù hợp, mô tả kiến trúc.
- Tạo `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/ERD.md`, `docs/FINANCIAL_RULES.md`, `docs/IMPLEMENTATION_PLAN.md`.
- Liệt kê user stories, tuyến điều hướng, data contract, chart definitions, test cases.

### Phase 1 — Nền tảng + Google Login
- Khởi tạo Next.js, UI system, theme, DB migration, Docker Compose.
- Google OAuth + session + route protection + workspace cá nhân + onboarding.
- Test đăng nhập/đăng xuất/phân quyền/callback error.

### Phase 2 — Lõi tài chính
- Danh mục, ví, giao dịch thu/chi/chuyển ví, ledger, lọc/tìm kiếm.
- Test số dư, thu chi, giao dịch hồi tố, sửa/xóa, giao dịch hai ví, đa tiền tệ nếu kích hoạt.
- Có UI hoàn chỉnh nối với DB, không nút rỗng.

### Phase 3 — Dashboard v1 hoàn chỉnh
- KPI, filter toàn cục, thu vs chi, dòng tiền, donut danh mục, lịch sử giao dịch, drill-down.
- Bảo đảm các biểu đồ tính từ cùng dataset/ledger và kỳ chọn.

### Phase 4 — Ngân sách & báo cáo nâng cao
- Budget + cảnh báo; báo cáo chi tiết theo kỳ/ví/danh mục; heatmap, trends, breakdown; CSV/XLSX/PDF.

### Phase 5 — Mục tiêu, vay nợ, thẻ tín dụng
- Goals, debt, credit card, repayment; bổ sung KPI tài sản ròng; test không đếm trùng gốc/lãi/thanh toán.

### Phase 6 — Định kỳ, nhập/xuất & PWA
- Recurring + scheduler idempotent, import CSV/XLSX preview, notifications, PWA, app install.

### Phase 7 — Hardening & release
- Test bổ sung, performance, accessibility, bảo mật, data isolation, Docker deploy, backup/restore, production docs.
- Nếu thời gian hạn chế, giao MVP **thực sự hoàn chỉnh Phase 1–3** trước khi bắt đầu chức năng không thể hoàn thiện.

Ở cuối mỗi phase, trình bày **đã làm/chưa làm, các file đã thay đổi, test đã chạy, bằng chứng kiểm thử, việc còn lại**. Không ghi hoàn thành nếu chưa chạy/chưa kiểm chứng.

## 19. TEST CASE / ACCEPTANCE CRITERIA BẮT BUỘC

Hãy tự tạo seed demo và automated test bao gồm ít nhất các case:

1. Người dùng mới Google login thành công; chưa có dữ liệu thì dashboard không hiển thị doanh thu/chi tiêu giả.
2. Người dùng A không thể xem/sửa/xóa ví, giao dịch, báo cáo hoặc file export của B.
3. Ví A đầu kỳ 2.000.000 ₫, ví B đầu kỳ 1.000.000 ₫; chuyển 500.000 ₫ từ A sang B -> lần lượt 1.500.000 ₫ và 1.500.000 ₫; tổng thu/chi bằng 0.
4. Thu lương 15.000.000 ₫ vào A, chi ăn uống 500.000 ₫ từ A -> tổng thu 15.000.000 ₫; tổng chi 500.000 ₫; thặng dư 14.500.000 ₫.
5. Sửa khoản chi 500.000 -> 300.000: ví, tổng chi, ngân sách và donut cập nhật về 300.000, không còn bút toán cũ lơ lửng.
6. Hoàn tiền 100.000 ₫ cho khoản chi 300.000 ₫: chi ròng theo chính sách hoàn tiền còn 200.000 ₫; mọi báo cáo có tổng khớp.
7. Ngân sách ăn uống 1.000.000 ₫, chi ròng 800.000 ₫ -> 80%, còn 200.000 ₫; thêm 300.000 ₫ -> 110%, cảnh báo vượt.
8. Thẻ tín dụng chi 1.000.000 ₫ -> tăng chi 1.000.000 ₫, tăng dư nợ 1.000.000 ₫; trả thẻ 600.000 ₫ từ ví ngân hàng -> giảm tiền ngân hàng 600.000 ₫, dư nợ còn 400.000 ₫; tổng chi không thành 1.600.000 ₫.
9. Nhận khoản vay 10.000.000 ₫ -> tăng tiền và tăng nợ nhưng tổng thu không tăng; trả gốc 2.000.000 ₫, lãi 100.000 ₫ -> chỉ 100.000 ₫ tính là chi phí, dư nợ gốc giảm còn 8.000.000 ₫.
10. Khoản định kỳ chạy job hai lần không sinh hai giao dịch cùng kỳ.
11. Thu = 0, tính tiết kiệm/so sánh % không sinh Infinity hoặc NaN; kỳ trước = 0 hiển thị nhãn thích hợp.
12. Bộ lọc chỉ một ví: chuyển tiền từ ví trong phạm vi ra ví ngoài phạm vi làm giảm số dư tập ví, nhưng không trở thành chi tiêu.
13. Kỳ cuối tháng/đầu tháng, năm nhuận, timezone Asia/Ho_Chi_Minh: giao dịch được tổng hợp đúng ngày bản địa.
14. Báo cáo donut/bảng category/tổng KPI khớp nhau sau lọc, refund và chỉnh sửa.
15. Export CSV/XLSX/PDF có dấu tiếng Việt, dữ liệu khớp filter và không có dữ liệu người khác.
16. Hệ thống không tải được client secret, dữ liệu phiên nhạy cảm hoặc toàn bộ dữ liệu từ client bundle.
17. Khi chưa cấu hình Google OAuth, xuất hiện thông báo cấu hình rõ ràng ở môi trường dev, không bỏ qua xác thực.
18. E2E: đăng nhập (mock OAuth ở môi trường test nếu cần, không mock tài chính), tạo ví, thêm khoản chi, xem biểu đồ, chỉnh sửa, lọc và export.

Nếu dùng các con số test mặc định, phải cô lập từng case và reset trạng thái để không làm nhiễu tổng.

## 20. SẢN PHẨM BÀN GIAO

Hoàn thành với các đầu ra có thật trong repository:

```text
/
├── app/ hoặc src/app/            # pages, layout, route handlers
├── components/                   # UI, charts, dialogs, forms
├── lib/                          # auth, db, validation, helpers
├── server/ hoặc services/        # financial business logic, authorization
├── prisma/                       # schema, migrations, seed (nếu dùng Prisma)
├── tests/                        # unit, integration, E2E
├── public/                       # logo riêng, PWA assets
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── ERD.md
│   ├── FINANCIAL_RULES.md
│   ├── REPORT_DEFINITIONS.md
│   ├── IMPLEMENTATION_PLAN.md
│   ├── GOOGLE_OAUTH_SETUP.md
│   ├── DEPLOYMENT.md
│   └── TEST_REPORT.md
├── .env.example
├── Dockerfile
├── compose.yaml
└── README.md
```

README ghi: yêu cầu chạy local, env, Google Cloud setup, migration, seeding demo, lệnh chạy test, build, cách triển khai production. Có test report minh bạch: test nào chạy thành công, lỗi còn tồn tại, không giả lập kết quả.

## 21. TIÊU CHUẨN HOÀN THÀNH (DEFINITION OF DONE)

Chỉ coi một phần tính năng hoàn tất nếu:

- Giao diện hoàn chỉnh responsive, tiếng Việt đúng, các form/action hoạt động.
- API/backend + database thật, có validation và quyền truy cập.
- Có loading/empty/error/success, không crash khi dữ liệu rỗng hoặc nhập sai.
- Kiểm tra cập nhật số dư/báo cáo/ngân sách đúng sau CRUD.
- Unit/integration/E2E cần thiết đã chạy, có kết quả thực tế.
- Không có credentials trong repo hoặc sample `.env` chứa giá trị thật.
- Typecheck/lint/build chạy đạt; production không có demo data giả.

## 22. MỆNH LỆNH HÀNH ĐỘNG NGAY CHO CODING AGENT

**Bắt đầu thực hiện ngay trong repository hiện tại.** Trình tự:

1. Xem cấu trúc repository, phát hiện stack, dependency, conventions.
2. Tạo tài liệu PRD, ERD, luật nghiệp vụ và kế hoạch triển khai ngắn gọn nhưng đủ để coding.
3. Khởi tạo/hoàn thiện hệ thống, đăng nhập Google, DB, dashboard layout.
4. Làm **vertical slice** ví -> thu chi -> ledger -> báo cáo có số liệu thật.
5. Kiểm thử theo dữ liệu mẫu đã định nghĩa; sửa lỗi trước khi mở rộng.
6. Tiếp tục lần lượt theo phase; ưu tiên dashboard và báo cáo trực quan chi tiết.
7. Ở cuối phản hồi, trình bày tiến độ thực tế, file thay đổi, lệnh chạy, test result và các biến môi trường user phải tự cấu hình.

**Không chỉ đưa ra giải pháp lý thuyết. Không tạo nút/biểu đồ giả để báo là xong. Không tuyên bố tích hợp Google thành công nếu chưa có Client ID/Secret thực. Không tự ý truy cập ngân hàng hay email cá nhân.**

---

## Phụ lục — Các tài liệu chính thức nên đối chiếu khi code

- Money Lover: https://moneylover.me/vi/
- Sổ Thu Chi MISA: https://sothuchi.misa.vn/
- Better Auth Google: https://better-auth.com/docs/authentication/google
- Better Auth OAuth: https://better-auth.com/docs/concepts/oauth
- Google Identity Services, verify ID token: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- OWASP Session Management: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

*Ghi chú: Tài liệu này là đặc tả sản phẩm mong muốn; không hàm ý bất kỳ chức năng nào đã được triển khai.*
