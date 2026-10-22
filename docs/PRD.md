# Finova — Product Requirements (triển khai MVP)

Nguồn: `PROMPT_XAY_DUNG_UNG_DUNG_QUAN_LY_TAI_CHINH_CA_NHAN.md`, `IMPLEMENTATION_PLAN_QUAN_LY_TAI_CHINH_CA_NHAN.md`, và `FINOVA_BRAND_GUIDELINE_V2.md` (19/10/2026).

## Người dùng và giá trị

Người dùng cá nhân tại Việt Nam đăng nhập Google, quản lý nhiều ví VND, ghi thu chi/chuyển tiền/hoàn tiền và xem tình hình tài chính theo ngày/danh mục/ví mà không phải tự đối chiếu số dư. Thương hiệu riêng: **Finova — Rõ tiền, vững tương lai**, #1E5EFF / #18C5C2 / #0B1F4A, light-first, logo PNG được duyệt. Không sử dụng tài sản thương hiệu của Money Lover hoặc MISA.

## Persona, hành trình và user stories

**Persona chính:** cá nhân Việt Nam muốn theo dõi tiền VND bằng một tài khoản Google, có nhiều ví và cần kiểm chứng tính đúng đắn của từng giao dịch. V1 chưa hỗ trợ workspace gia đình, đồng bộ tự động từ ngân hàng hay đa tiền tệ.

Ba hành trình chính:

1. **Ngày đầu sử dụng:** Google login → tạo workspace/danh mục idempotent → chọn VND/múi giờ Việt Nam → tạo ví với số dư mở đầu → dashboard không có dữ liệu giả.
2. **Ghi nhận và chỉnh sửa:** chọn ví/danh mục, ghi khoản chi → quan sát số dư và báo cáo → sửa bằng reversal/repost hoặc hoàn một phần → đối soát sổ cái và ngân sách.
3. **Đánh giá tài chính:** chọn kỳ/ví/danh mục → xem KPI/biểu đồ → mở danh sách giao dịch tương ứng → export CSV/XLSX/PDF với cùng filter.

| ID | User story | Acceptance / ranh giới |
| --- | --- | --- |
| US-AUTH-01 | Là người dùng mới, tôi đăng nhập Google để bắt đầu theo dõi tiền. | Một workspace duy nhất; không mock session/giao dịch; AT-01/17; callback thật chưa nghiệm thu. |
| US-SEC-01 | Là chủ tài khoản, tôi chỉ xem/sửa dữ liệu thuộc workspace mình. | 401/403/404 và zero disclosure, bao gồm export; AT-02; hai-user E2E còn mở. |
| US-WALLET-01 | Tôi tạo ví tiền mặt/ngân hàng có số dư mở đầu và chuyển giữa các ví. | Opening vào equity; transfer không tạo thu/chi; AT-03. |
| US-TX-01 | Tôi ghi thu/chi, sửa và hoàn tiền mà vẫn đối soát được. | VND integer, reversal/refund/idempotency, AT-04/05/06. |
| US-DASH-01 | Tôi nhìn thấy số dư, thu chi và lọc đúng theo ví/kỳ. | Không NaN, ngày VN, KPI/chart match, AT-11/12/13/14. |
| US-BUDGET-01 | Tôi đặt hạn mức và được cảnh báo khi vượt ngưỡng. | 50/80/100/>100%, dedup, AT-07. |
| US-DEBT-01 | Tôi quản lý nợ vay và thẻ mà không nhầm gốc với thu/chi. | AT-08/09; lịch/sao kê là dự phóng. |
| US-RECUR-01 | Tôi chạy giao dịch định kỳ và nhập sao kê mà không nhân đôi bút toán. | Idempotent retry, AT-10; multi-replica vẫn mở. |
| US-EXPORT-01 | Tôi xuất báo cáo chính xác và riêng tư. | CSV/XLSX/PDF theo filter/tenant, AT-15; PDF visual QA còn mở. |
| US-E2E-01 | Tôi đi hết luồng từ ví tới biểu đồ, sửa và xuất. | AT-18 với Google session thật + mobile; chưa nghiệm thu. |

**Không bao gồm:** truy cập ngân hàng trực tiếp/Open Banking, thanh toán hộ, đa tiền tệ, chia sẻ gia đình, đồng bộ hai chiều offline, nhập giao dịch mẫu cho tài khoản thật. P4–P6 đã có nhiều phần trong mã nguồn nhưng vẫn cần gate UX/E2E; phát hành production phải đạt G7.

## In-scope MVP (P0–P3)

1. Google OAuth qua Better Auth; xác thực server-side; một workspace cá nhân/user và danh mục mặc định, không giao dịch giả.
2. Tạo ví tiền mặt/ngân hàng/ví điện tử/tiết kiệm, số dư mở đầu, lưu trữ/khôi phục; số dư suy ra từ sổ cái.
3. Thu nhập, chi phí, chuyển giữa hai ví, hoàn tiền, sửa/hủy bằng reversal và audit log. Validation server-side, giới hạn workspace, idempotency key.
4. Dashboard & reports lấy số liệu từ PostgreSQL với KPI, biểu đồ thu chi, surplus, category, wallet balance, recent/top expense, lọc kỳ/ví/danh mục và dẫn đến giao dịch.
5. Unit/integration tests, migrations, Docker Compose database và tài liệu thiết lập.

## Ngoài MVP

P4: ngân sách, nâng cao báo cáo, xuất CSV/XLSX/PDF. P5: mục tiêu tiết kiệm, vay nợ, thẻ tín dụng. P6: recurring, import, PWA offline. P7: hardening, bảo mật, hiệu năng, deploy. P8: gia đình, ngân hàng/Open Banking chỉ khi pháp lý và kỹ thuật cho phép.

## Tiêu chí nghiệm thu trọng yếu

- AT-01: login Google thật, session cookie và workspace riêng.
- AT-02: user A không thấy/sửa dữ liệu B.
- AT-03: chuyển 500 nghìn từ ví 2 triệu sang ví 1 triệu => cả hai 1,5 triệu, thu/chi vẫn bằng 0.
- AT-04..06: thu 15 triệu/chi 500 nghìn, sửa chi còn 300 nghìn, hoàn 100 nghìn => chi ròng 200 nghìn.
- AT-11..14: thu bằng 0 không NaN, filter ví, Asia/Ho_Chi_Minh, đối soát category/KPI.
- AT-17: không cấu hình Google => không đăng nhập giả.

**Gate:** chỉ tuyên bố P1–P3 hoàn tất sau khi migration và integration chạy trên PostgreSQL thật, build/lint/typecheck đạt và OAuth E2E với credentials thật. Mã nguồn được tạo chưa đồng nghĩa đạt gate.
