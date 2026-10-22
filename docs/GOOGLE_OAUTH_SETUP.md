# Google OAuth — cấu hình và nghiệm thu Finova

Finova dùng Better Auth với Google OIDC và chỉ yêu cầu `openid`, `email`, `profile`. Ứng dụng không cần quyền Gmail, Drive hay truy cập ngân hàng. Chỉ đăng nhập bằng Google thật sau khi đã cấu hình OAuth Web Client; không tạo session giả trong môi trường vận hành.

## Cấu hình local

1. Tạo OAuth consent screen, đặt ứng dụng ở trạng thái thử nghiệm và khai báo các Google test user được phép đăng nhập.
2. Trong Google Cloud Console, tạo OAuth Client ID loại **Web application**. Authorized JavaScript origin: `http://localhost:3002`; Authorized redirect URI: `http://localhost:3002/api/auth/callback/google`.
3. Đặt `BETTER_AUTH_URL=http://localhost:3002`, `NEXT_PUBLIC_APP_URL=http://localhost:3002` và cấu hình `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET` trong `.env` riêng tư. Không commit `.env`, không đưa secrets vào artifact/log; trên Windows hãy dùng đúng `localhost` cho smoke trình duyệt vì Origin cần khớp chính xác.
4. Chạy PostgreSQL/migration, khởi động `npm run dev -- -p 3002`, sau đó chạy `npm run test:oauth` và `npm run test:browser`.

`test:oauth` chỉ xác minh initiation, callback URL, state cookie, scopes và auth guards; `test:browser` chỉ xác minh nút đăng nhập chuyển tới Google OAuth. Hai lệnh **không chứng nhận callback/session bằng người dùng thật**.

## Nghiệm thu staging (chưa thực hiện)

- Cấp OAuth Client và secrets **riêng cho staging**, domain HTTPS hợp lệ; cấu hình origin/redirect URI `https://<staging-domain>/api/auth/callback/google` đúng tuyệt đối. Không dùng callback local cho domain staging.
- Đăng nhập hoàn chỉnh bằng **hai tài khoản Google thử nghiệm độc lập**, xác nhận callback, cookie `HttpOnly`/`Secure`/`SameSite`, session refresh, logout, hết hạn/thu hồi session và từ chối request khi chưa có session.
- Với hai workspace, kiểm chứng CRUD tài chính và thử ID ví/danh mục/giao dịch/report/export của tài khoản B từ A (và ngược lại), cùng các tình huống 401/403/404; không sử dụng dữ liệu tài chính thật để thử.
- Chạy mobile/desktop, keyboard/screen reader/PWA trên domain HTTPS với cả hai trạng thái light/dark nếu đã hỗ trợ; kiểm tra CSP violations trước khi chuyển `FINOVA_CSP_ENFORCE=1`.
- **Thay Google Client Secret đã từng được chia sẻ trước khi staging/production**; xác nhận secret mới trong secret store và thu hồi secret cũ. Không ghi secret vào báo cáo nghiệm thu.

Chỉ đánh dấu T07.03 và G7 hoàn thành sau khi có biên bản kết quả thực từ môi trường đích. Xem [runbook](OPERATIONS_RUNBOOK.md) và [báo cáo](TEST_REPORT.md).
