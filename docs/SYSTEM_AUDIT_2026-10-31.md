# Rà soát hệ thống Finova — 31/10/2026

## Phạm vi

Rà soát mã nguồn ứng dụng Next.js, 85 tệp API v1 (108 HTTP handlers), các lớp xác thực/phân quyền/Origin, sổ cái, nhập/xuất dữ liệu, thao tác tài chính và giao diện người dùng/quản trị. Kiểm thử thực tế dùng PostgreSQL 17 và tài khoản tổng hợp trong container riêng; không dùng dữ liệu, đăng nhập Google, ngân hàng hoặc nhà cung cấp AI thật. Không push hay deploy.

## Những vấn đề đã sửa

| Vấn đề | Thay đổi | Bằng chứng kiểm chứng |
| --- | --- | --- |
| Mất phản hồi mạng rồi gửi lại tạo khóa mới, có nguy cơ ghi trùng | Giữ khóa theo URL, phương thức và nội dung tới khi nhận phản hồi thành công; gộp hai lần gửi đồng thời. Áp dụng giao dịch nhanh/chi tiết, hoàn tiền, phân bổ mục tiêu, nghiệp vụ thẻ và trả nợ | Unit test mất phản hồi, bấm hai lần, đổi rồi quay lại nội dung; kiểm tra trình duyệt và đếm giao dịch trong PostgreSQL |
| Đóng biểu mẫu nhanh khi đang ghi sổ | Khóa thao tác đóng, Escape, nền ngoài, lựa chọn và trường nhập trong khi lưu | Kiểm thử trình duyệt |
| Hủy/hoàn tiền/xóa ví dùng hộp thoại trình duyệt, thiếu chỗ hiển thị lỗi | Hộp thoại chung có tên giao dịch, số tiền, tác động, focus bàn phím, báo lỗi tại chỗ, khóa khi xử lý | Hoàn tiền quá số tiền được từ chối; hoàn một phần ghi đúng sổ cái |
| Hai yêu cầu tạo ví đầu tiên cùng tạo tài khoản vốn đầu kỳ | Chạy toàn bộ tạo ví và bút toán đầu kỳ trong transaction Serializable có retry khi xung đột | Fixture tạo hai ví đồng thời trên PostgreSQL |
| Thời điểm giao dịch phụ thuộc múi giờ máy | Ô datetime dùng giờ Việt Nam và chuyển ISO với offset +07:00; kiểm tra ngày/giờ hợp lệ | Test qua ranh giới nửa đêm, ngày không tồn tại và giờ ngoài phạm vi |
| CSV/XLSX thiếu phí chuyển ví trong chi phí ròng | Tính phí tại ví nguồn; lọc ví nhận không nhận phần phí | Unit test toàn bộ/ví nguồn/ví nhận; kiểm thử xuất Excel thực tế |
| Nút phụ và các khối trang trí cạnh tranh với dữ liệu | Thanh đầu trang dùng “Ghi nhanh” nhẹ; menu ba chấm/biểu tượng bỏ viền hộp thừa; tiêu đề trang phẳng; thống kê mục tiêu gọn; chỉ mở form phân bổ khi cần; thông báo có trạng thái chưa đọc và thao tác biểu tượng | Ảnh chụp 1440px/390px, kiểm tra tràn ngang và axe |
| Chữ phụ trên nền nhạt thiếu tương phản | Điều chỉnh token chữ phụ và màu tại nhập sao kê, đồng bộ ngân hàng, thông báo | Quét axe WCAG A/AA |
| Lỗi API có thể đưa SQL/thông tin tài chính/token vào log | Chỉ log mã tương quan ngẫu nhiên và loại lỗi; thông báo validation dùng danh sách chính xác | Test không lộ chuỗi giả lập nhạy cảm trong response/log |
| Phản hồi xác thực chưa được bảo đảm no-store tại lớp ứng dụng | Gắn private/no-store cho mọi phản hồi auth; cố định baseURL theo origin cấu hình | HTTP thực tế và giữ nguyên kiểm tra Origin |
| CSP ở chế độ báo cáo chưa áp dụng chặn object/base/frame/form | Luôn enforce nhóm chỉ thị cơ bản; full CSP vẫn giữ cờ rollout hiện có | Build và trình duyệt với full CSP bật |
| Màn hình lỗi chưa có cách khôi phục rõ ràng | Thêm error boundary cho vùng đăng nhập, dùng API retry của Next.js đang cài, không hiển thị chi tiết lỗi | Typecheck/build |

## Phụ thuộc và giới hạn bảo mật

- Đã cập nhật nhánh ExcelJS: Archiver 7.0.1, Unzipper 0.12.5, Glob 14.0.3 và Minimatch 11.0.2. Các override chỉ áp dụng vào nhánh đã kiểm tra. ExcelJS chạy ở Node qua serverExternalPackages để không buộc webpack đóng gói adapter S3 tùy chọn.
- Đã kiểm tra hợp đồng glob đồng bộ, đọc thư mục dạng stream, đọc/ghi XLSX và pipeline nhập sao kê. Không chỉ dựa vào số lượng cảnh báo audit.
- `npm audit --omit=dev --omit=peer`: **0 cảnh báo** trong cây phụ thuộc runtime sau bản vá.
- Còn **16 nút phụ thuộc dev mức moderate**, cùng bắt nguồn từ [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) trong bộ ESLint/plugins. Đây không phải 16 lỗ hổng độc lập. Các plugin cũ còn gọi API minimatch dạng hàm; ép override toàn cục sang API mới sẽ phá lint.
- `security:audit` kiểm tra chính xác tập phụ thuộc, chuỗi advisory, mức độ và cờ dev của lockfile. Cảnh báo mới hoặc lọt vào runtime vẫn làm kiểm tra thất bại. Ngoại lệ dev còn tồn tại được in rõ và hết hạn **01/12/2026**. Ngoại lệ braces cũ được thay bằng advisory đang thực sự tồn tại.
- Kiểm tra này không chứng nhận hệ thống không còn mọi lỗ hổng. Chưa thực hiện pentest môi trường production, OAuth Google thật, luồng ngân hàng/AI thật hay Safari/iOS. Full CSP vẫn cho phép inline script; nonce-based CSP cần một đợt kiểm chứng OAuth riêng.
- Khóa chống trùng được giữ trong bộ nhớ biểu mẫu, không qua tải lại toàn bộ trang. Hộp thoại lỗi nhắc kiểm tra lịch sử trước khi nhập lại.

## Kết quả kiểm chứng cuối cùng

| Kiểm tra | Kết quả |
| --- | --- |
| Unit tests | 109 tệp, 701 bài kiểm thử đạt |
| TypeScript và ESLint | Đạt |
| Build production | Đạt; biên dịch, TypeScript, tạo 62 trang tĩnh và build traces hoàn tất |
| Audit route API | 85 tệp v1 / 108 HTTP handlers; kiểm tra guard và Origin đạt |
| Integration PostgreSQL | Luồng P2–P6 đạt, 72 bút toán cân bằng; CSV/XLSX, nhập lại, tác vụ định kỳ và cách ly thông báo đạt |
| Quota đồng thời PostgreSQL | Upload: 12 chấp nhận / 8 từ chối; trước đăng nhập: 30 chấp nhận / 5 từ chối; cách ly người dùng, hết hạn và Retry-After đạt |
| Trình duyệt | 30 trang × 2 viewport: desktop 1440px sáng và mobile 390px tối; 60 trường hợp đạt, không tràn ngang hoặc vi phạm axe mức serious/critical |
| Tương tác và bảo mật HTTP | 9 tình huống đạt: tạo ví đồng thời, mất phản hồi rồi gửi lại, hoàn tiền, phân bổ mục tiêu, đọc thông báo, focus/Escape hộp thoại, khóa khi lưu, no-store/Origin và truy cập ẩn danh |

Log và ảnh chụp cuối cùng nằm ở `artifacts/system-audit/`: `build.log`, `unit-tests.log`, `integration.log`, `security-integration.log`, `browser-results.json`, `browser-recheck.log` và các PNG desktop/mobile. Đã dừng máy chủ QA và xóa container PostgreSQL tạm sau kiểm thử.

## Cách tái kiểm thử

1. Tạo PostgreSQL tạm, chỉ bind loopback, user `finova_qa`, mật khẩu dùng thử `disposable_qa_only`, database `finova_system_audit`; không gắn volume dữ liệu thật.
2. Chạy `prisma migrate deploy` với DATABASE_URL trỏ đúng database tạm; tạo thêm `finova_test` và migrate nếu chạy integration.
3. Đặt `FINOVA_AUDIT_DB_PORT` là cổng container tạm. Runner từ chối thiếu cổng và đặt các cờ/key dùng riêng cho QA, không nạp credentials của ứng dụng.
4. `node scripts/system-audit-runner.mjs server` chạy máy chủ QA ở localhost:31800.
5. `node scripts/system-audit-runner.mjs browser` chạy Chrome/Edge headless trên 30 trang × hai viewport/theme và kiểm thử tương tác.
6. Các chế độ `integration` và `security` chạy bộ kiểm thử tương ứng trên `finova_test` của container đó.
7. Artifacts nằm trong `artifacts/system-audit/` (gitignored). Dừng máy chủ và container QA sau khi hoàn tất.

Các script chỉ chạy ở máy phát triển, không thêm route giả lập hoặc bypass xác thực vào ứng dụng. Session QA được ký bằng secret dùng thử, chỉ có hiệu lực trên máy chủ QA.
