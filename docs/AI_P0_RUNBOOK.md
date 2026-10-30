# AI P0 — Nhập sao kê, phân tích tài chính, ngân sách

## Phạm vi đã triển khai

- `/imports`: ảnh PNG/JPG/WebP, PDF, Word DOC/DOCX, Excel XLS/XLSX và CSV → AI trích xuất → danh mục gợi ý → kiểm tra/sửa từng dòng → xác nhận nhập hàng loạt qua sổ cái hiện có. Có thể mở lại đợt nhập và tiếp tục sau lỗi mạng.
- Biểu mẫu giao dịch và ghi nhanh: tự tìm danh mục từ 500 giao dịch gần nhất trong workspace; ưu tiên lịch sử người dùng hơn từ khóa. Nút AI gửi tối đa 60 mẫu nội dung đã che email/chuỗi số dài nếu chưa tìm được danh mục.
- `/insights`: thu, chi ròng, chênh lệch, xu hướng bốn tháng, danh mục đóng góp vào tăng/giảm chi; nhận xét và hành động bằng AI khi người dùng yêu cầu.
- `/budgets` và `/insights`: hạn mức đề xuất có thể chỉnh và áp dụng; cảnh báo ngân sách hiện có đã vượt hoặc có nguy cơ vượt.

## Cấu hình và migration

1. Cấu hình `OPENAI_API_KEY` phía máy chủ và `FINOVA_AI_MODEL` (mặc định `gpt-4.1`, cần hỗ trợ vision + Structured Outputs). Không dùng biến `NEXT_PUBLIC_` cho khóa.
2. Áp dụng migration `20261029090000_ai_statement_review` bằng quy trình migration của môi trường đích, trước khi chạy bản ứng dụng mới. Migration thêm bốn cột nullable/default trên `ImportRow`, không thay đổi số dư.
3. Sinh Prisma Client bằng `npm run db:generate`, chạy `npm run build`, khởi động ứng dụng theo quy trình hiện có. Compose đã truyền hai biến AI vào service app.
4. Vào Nhập sao kê, chọn ví và đồng ý gửi dữ liệu, phân tích tệp, đối chiếu tổng/dòng với bản gốc, sửa các dòng cần kiểm tra và xác nhận nhập. Nhập sao kê vẫn theo entitlement `STATEMENT_IMPORT` hiện có.

Không có API key: phần đọc sao kê/nhận xét AI hiển thị chưa cấu hình; nhập CSV/XLSX thủ công, phân loại từ lịch sử, tính toán và dự báo vẫn hoạt động. Không có dữ liệu minh họa giả được trình bày như kết quả AI thật.

## Quy tắc dữ liệu

- Tối đa 5 MB và 200 giao dịch mỗi lần đọc AI. XLSX/CSV có tối đa 250 dòng kể cả tiêu đề; chỉ đọc trang tính hiển thị đầu tiên, từ chối công thức, gửi ô dữ liệu nguyên văn thay vì bản tóm tắt của nhà cung cấp.
- Word chỉ đọc văn bản; ảnh nhúng cần chuyển sang PDF. XLS đời cũ dùng luồng tệp của nhà cung cấp; cần đối chiếu số dòng với bản gốc hoặc chuyển sang XLSX để có kiểm tra giới hạn dòng tại máy chủ.
- Chỉ VND nguyên dương dưới 10¹⁶; số dư đầu/cuối và dòng tổng không phải giao dịch. Ngày tương lai, sai ngày/số tiền, thiếu loại/danh mục, confidence thấp, chuyển nội bộ thiếu ví nhận đều cần sửa trước khi nhập. Tệp không đọc đủ hoặc không xác định VND bị từ chối cả đợt.
- Độ tin cậy do mô hình cung cấp là tín hiệu sàng lọc, không phải bảo đảm chính xác. Luôn có bước xác nhận trước ghi sổ. Thu nhập/chi tiêu không được dùng thay cho chuyển giữa hai ví của chính người dùng.
- Cùng tệp/cùng ví dùng lại đợt nhập dưới khóa database. Mã giao dịch ngân hàng được dùng làm định danh; nếu thiếu mã thì dùng loại/ngày/số tiền/nội dung và thứ tự xuất hiện của giao dịch giống nhau. Sửa danh mục không thay định danh nguồn. Sổ cái dùng idempotency và giao dịch Serializable khi commit.
- Chống trùng này áp dụng cho luồng nhập AI. Khi sao kê có nội dung OCR khác nhau, thiếu mã giao dịch, hoặc giao dịch đã nhập thủ công/CSV/đồng bộ ngân hàng, cần đối chiếu trước xác nhận; không thể khẳng định trùng chỉ vì cùng số tiền và ngày.
- Mọi truy vấn ràng buộc workspace. API có signed session, kiểm tra Origin cho mutation, entitlement nhập sao kê, giới hạn request và giới hạn kích thước trước parse. Kết quả là `private, no-store`.
- Tệp gốc chỉ ở bộ nhớ request, không ghi xuống ổ đĩa. Dữ liệu trích xuất và metadata kiểm tra được lưu trong staging. Sao kê gốc gửi OpenAI có thể chứa dữ liệu định danh; giao diện yêu cầu đồng ý rõ. Không ghi prompt, tệp, body lỗi nhà cung cấp hoặc API key vào log. `store:false` không đồng nghĩa nhà cung cấp không có chính sách lưu dữ liệu riêng.

## Cơ sở phân tích và dự báo

- Lấy bút toán INCOME/EXPENSE ròng bằng PostgreSQL NUMERIC, gồm hoàn tiền/đảo bút toán; chuyển ví không tính vào thu chi, phí chuyển tính chi. Dùng Decimal cho các phép tính, múi giờ Việt Nam.
- So sánh cùng số ngày đầu tháng với tháng trước, tối đa số ngày của tháng ngắn hơn. Tháng hiện tại tính đến hôm nay, không giả định là tháng đầy đủ.
- Hạn mức: trung bình tối đa ba tháng lịch sử + 5% dự phòng. Nếu danh mục mới, dùng tốc độ chi tháng hiện tại. Khi có thu nhập lịch sử, tổng đề xuất được điều chỉnh tối đa 80% thu nhập bình quân. Đây là mặc định sản phẩm có thể sửa, không phải quy tắc tài chính bắt buộc.
- Dự báo tuyến tính = chi ròng đã có / số ngày đã qua × số ngày trong kỳ. Dưới bảy ngày, đánh dấu chưa đủ dữ liệu trừ khi đã vượt. Kỳ tùy chỉnh bắt đầu trước cửa sổ ba tháng được hiển thị thiếu dữ liệu, không tạo dự báo thiếu phần đầu kỳ.
- Hạn mức tổng và nhóm/danh mục không cộng dồn. Không tự ghi đè ngân sách đã tồn tại. Lịch sử chưa đủ hoặc chưa nhập đầy đủ sẽ làm độ tin cậy thấp.
- AI chỉ diễn giải số liệu tổng hợp, nêu đóng góp của danh mục và gợi ý hành động; không suy đoán nguyên nhân đời sống như sự thật.

## Kiểm thử

Kết quả xác nhận ngày 29/10/2026: production build, TypeScript, ESLint và audit 107 HTTP handlers đều đạt; 102 tệp kiểm thử / 582 tests đạt. Integration PostgreSQL thật và Chrome headless desktop/mobile đạt. Đã trực tiếp xem ảnh chụp, sửa màu chữ/cảnh báo theo token dark mode. Migration chỉ chạy trên DB QA, chưa áp dụng vào DB người dùng hoặc triển khai production.

- Unit/HTTP/provider: `npm test`; kiểm tra xác thực, Origin, consent, workspace, malformed/refused/incomplete output, giới hạn tệp, định dạng, số tiền lớn, kỳ so sánh, hoàn tiền, phân loại lịch sử và ngân sách.
- CSDL riêng đã tạo: `finova_ai_test_p0_20261029_a` trên PostgreSQL local port 55433. Runner từ chối nguồn ngoài local `/finova`, rồi chuyển URL sang DB QA; không thay đổi DB người dùng.
- Migration QA: `node --env-file=.env --import tsx scripts/ai-p0-qa-runner.mjs --migrate`.
- Integration: `node --env-file=.env --import tsx scripts/ai-p0-qa-runner.mjs`. Sử dụng phản hồi OpenAI giả lập, ghi sổ PostgreSQL thật; để lại fixture người dùng riêng cho browser.
- UI server: thêm `--server` vào runner; chỉ bind localhost port 31649. Browser: `node scripts/ai-p0-browser-check.mjs` (Chrome/Edge headless). Ảnh và kết quả nằm trong `artifacts/ai-p0/` đã gitignore. Chạy integration để tạo fixture mới trước mỗi lượt browser.
- Có kiểm thử nhập đồng thời, nhập lặp, sửa dòng, tenant isolation, hoàn tiền, phí chuyển, số dư ví, cảnh báo ngân sách và UI ở 1440px/390px.
- Chưa kiểm thử OCR/nhận xét qua OpenAI thật vì môi trường chưa có API key. Trước phát hành cần chạy bộ sao kê mẫu đã ẩn danh với key/model của môi trường, đối chiếu số dòng/số tiền/ngày/danh mục; đặc biệt PDF nhiều trang, bản scan mờ, DOC và XLS đời cũ.

Tài liệu API đã đối chiếu: [File inputs](https://developers.openai.com/api/docs/guides/file-inputs), [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
