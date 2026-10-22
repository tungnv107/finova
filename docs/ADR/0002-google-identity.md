# ADR-0002 — Google OIDC và workspace cá nhân

**Status:** Accepted, OAuth chưa verified end-to-end.

Better Auth + Prisma adapter lưu user/session/account; `Account(providerId,accountId)` unique theo Google identifier thay vì xác định dựa trên email. Google provider scope `openid email profile`, password login disabled. Tất cả API truy xuất context từ session server, bind personal workspace `personal-${user.id}`; `Origin` được kiểm tra cho mutation. Secrets chỉ ở server `.env`; không dùng localStorage cho tài chính/token.

Thiết kế sẵn Membership để mở rộng family nhưng P1 chỉ hoạt động trong personal workspace. Thiếu Google credentials -> từ chối login rõ ràng, không tạo tài khoản giả. Bắt buộc browser E2E và kiểm tra production HTTPS trước nghiệm thu.
