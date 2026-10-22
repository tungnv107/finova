# Finova — hướng dẫn bảo mật và kiểm soát phát hành

Các tài liệu kiểm soát chính: [Threat model](SECURITY_THREAT_MODEL.md), [authorization audit](AUTHORIZATION_AUDIT.md), [runbook](OPERATIONS_RUNBOOK.md) và [phase report](PHASE_REPORT.md). Mọi yêu cầu `/api/v1` dựa trên session/workspace server-side; các mutation kiểm tra Origin, input có validation, response tài chính dùng `no-store`. Journal/Posting thuộc sổ cái kép với ràng buộc dữ liệu và lệnh đối soát chỉ đọc `npm run db:reconcile`.

Để rà soát thay đổi mã nguồn, chạy `npm run security:routes`, `npm run security:audit`, `npm run test`, PostgreSQL integration trong database thử nghiệm, rồi kiểm tra HTTP negative cases. API guard audit là kiểm tra cấu trúc 51 handler, **không thay thế** IDOR/session E2E hai người dùng. `FINOVA_CSP_ENFORCE=0` là Report-Only trong lúc nghiệm thu; chỉ bật enforcement sau khi đã xử lý CSP violations trong trình duyệt staging.

Quota OAuth/report/mutation dùng PostgreSQL; chỉ bật header IP đáng tin cậy nếu ingress ghi đè header client và chặn truy cập app trực tiếp. Cần WAF/edge rate limiting, TLS/HSTS, log redaction, giám sát quota/401/403/429/5xx, bảo vệ PostgreSQL khỏi Internet công khai và kiểm tra không cache dữ liệu tài chính tại CDN/service worker. Dữ liệu sao lưu phải mã hóa, có phân quyền và retention/offsite được phê duyệt.

Các việc **chưa nghiệm thu**: Google callback/session/logout thực tế, rà soát service IDOR đầy đủ, HTTPS/CSP enforcement/WAF, secret rotation, restore offsite, CI remote và tải multi-replica. Full-tree npm audit còn ngoại lệ 5 High *dev-only* theo chính sách hiện hành đến 01/12/2026; trạng thái production audit xem kết quả chạy mới nhất. Không công bố ứng dụng là production-ready trước khi các gate này đạt.
