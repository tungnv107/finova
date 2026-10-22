# ADR-0005 — Sao kê thẻ và tài sản ròng

**Status:** Accepted for P5, 20/10/2026.

**Bối cảnh:** Mua bằng thẻ phát sinh chi phí cùng nghĩa vụ phải trả. Thanh toán sau đó chỉ giảm nợ; nếu ghi thành chi phí một lần nữa sẽ đếm đôi. Số dư thẻ hiện tại khác dư nợ tại ngày chốt và số còn phải trả của sao kê đã chốt.

**Quyết định:** Mỗi `CreditCard` liên kết ledger account `LIABILITY`. `PURCHASE`: Nợ chi phí/Có phải trả; `PAYMENT`: Nợ phải trả/Có ví; `REFUND`: Nợ phải trả/Có chi phí gốc, có liên kết giao dịch mua để giới hạn hoàn. Hạn mức chỉ dùng để kiểm soát, không tính vào tài sản. Điều chỉnh hạn mức và các nghiệp vụ thẻ có khóa workspace để không vượt giới hạn khi đồng thời.

**Sao kê ước tính:** Tính chu kỳ theo ngày Việt Nam, ngày chốt và hạn thanh toán khai báo (1–28). `lastStatementBalance` lấy dư nợ ledger tại cuối ngày chốt gần nhất; `estimatedStatementRemaining` trừ các khoản thanh toán đã ghi sau ngày chốt và các khoản hoàn tiền sau ngày chốt có giao dịch mua gốc thuộc chu kỳ đã chốt hoặc trước đó. Không dùng hoàn tiền của giao dịch mua kỳ mới để hạ số ước tính phải trả kỳ cũ; kết quả không âm. Chỉ tính giao dịch có `effectiveAt <= now`. Đây là suy luận kế toán trong Finova, không phải bản sao kê, số thanh toán tối thiểu, hạn mức khả dụng hoặc quy tắc phân bổ thanh toán chính thức của ngân hàng. Refund có thể được ngân hàng xử lý khác, cần đối soát bản sao kê thực tế.

**Giá trị ròng:** `Net Worth = Assets + Receivables − Liabilities` tại thời điểm truy vấn theo timezone Việt Nam. Mục tiêu tiết kiệm không thêm tài sản; hạn mức thẻ không thêm tài sản; principal loan không được nhầm thành P&L.

**Giới hạn:** Chưa import sao kê ngân hàng, phí, lãi thẻ, mức thanh toán tối thiểu, bù trừ overpayment/credit balance, quy tắc phân bổ payment chính thức hoặc tự động reconciliation. Ngày giao dịch nhập trong quá khứ có thể cập nhật số của kỳ trước theo sổ cái; kỳ quá khứ chưa có snapshot sao kê bất biến.

**Bằng chứng:** `src/server/credit-cards.ts`, `src/lib/card-statements.ts`, `src/server/net-worth.ts`, unit statement tests và integration P5.
