# AI P0 — Nhập sao kê, phân tích tài chính, ngân sách

## Phạm vi đã triển khai

- `/imports`: ảnh PNG/JPG/WebP, PDF, Word DOC/DOCX, Excel XLS/XLSX và CSV → AI trích xuất → danh mục gợi ý → kiểm tra/sửa từng dòng → xác nhận nhập hàng loạt qua sổ cái hiện có. Có thể mở lại đợt nhập và tiếp tục sau lỗi mạng.
- Biểu mẫu giao dịch và ghi nhanh: tự tìm danh mục từ 500 giao dịch gần nhất trong workspace; ưu tiên lịch sử người dùng hơn từ khóa. Nút AI gửi tối đa 60 mẫu nội dung đã che email/chuỗi số dài nếu chưa tìm được danh mục.
- `/insights`: thu, chi ròng, chênh lệch, xu hướng bốn tháng, danh mục đóng góp vào tăng/giảm chi; nhận xét và hành động bằng AI khi người dùng yêu cầu.
- `/budgets` và `/insights`: hạn mức đề xuất có thể chỉnh và áp dụng; cảnh báo ngân sách hiện có đã vượt hoặc có nguy cơ vượt.

## Cấu hình và migration

1. Cấu hình `OPENAI_API_KEY` phía máy chủ và `FINOVA_AI_MODEL` (mặc định `gpt-4.1`, cần hỗ trợ vision + Structured Outputs), hoặc cấu hình provider tùy chỉnh bên dưới. Không dùng biến `NEXT_PUBLIC_` cho khóa.
2. Áp dụng migration `20261029090000_ai_statement_review` bằng quy trình migration của môi trường đích, trước khi chạy bản ứng dụng mới. Migration thêm bốn cột nullable/default trên `ImportRow`, không thay đổi số dư.
3. Sinh Prisma Client bằng `npm run db:generate`, chạy `npm run build`, khởi động ứng dụng theo quy trình hiện có. Compose đã truyền các biến AI vào service app.
4. Vào Nhập sao kê, chọn ví và đồng ý gửi dữ liệu, phân tích tệp, đối chiếu tổng/dòng với bản gốc, sửa các dòng cần kiểm tra và xác nhận nhập. Nhập sao kê vẫn theo entitlement `STATEMENT_IMPORT` hiện có.

Không có API key: phần đọc sao kê/nhận xét AI hiển thị chưa cấu hình; nhập CSV/XLSX thủ công, phân loại từ lịch sử, tính toán và dự báo vẫn hoạt động. Không có dữ liệu minh họa giả được trình bày như kết quả AI thật.

## Provider tùy chỉnh (OpenAI-compatible)

Thêm vào `.env` trên máy chủ Docker; dùng đúng chữ hoa/thường và dấu `__`. Các thẻ XML `environmentVariable` không được Docker Compose đọc. Không đưa khóa vào Git, build args hoặc trình duyệt.

```dotenv
LLM__Endpoint="https://9router.haui.com.vn/v1"
LLM__ApiKey="THAY_BANG_KHOA_MOI_TREN_MAY_CHU"
LLM__ChatModelId="tungnv"
```

Ba biến này chọn provider tùy chỉnh cho **nhập sao kê, phân loại giao dịch và nhận xét tài chính/ngân sách**. `OPENAI_API_KEY` và `FINOVA_AI_MODEL` không được dùng khi có cấu hình custom. Nếu chỉ điền một phần, ứng dụng báo `AI_CONFIG_INVALID`; không tự chuyển dữ liệu sang OpenAI khi cấu hình sai hoặc provider lỗi. Xóa/để trống toàn bộ `LLM__...` để quay lại OpenAI.

- Mặc định gọi `POST {LLM__Endpoint}/chat/completions`, model giữ nguyên `tungnv`, JSON mode (`json_object`); prompt chứa schema và máy chủ vẫn kiểm tra Zod trước khi tạo đợt nhập. Từ chối kết quả thiếu, sai cấu trúc, refusal/tool call và `finish_reason` khác `stop`.
- `LLM__ApiMode="responses"` để gọi `/responses` nếu gateway/model hỗ trợ. `LLM__ResponseFormat="json_schema"` để yêu cầu Structured Outputs nghiêm ngặt; nếu để trống, provider custom dùng `json_object`. Không tự đổi giao thức hoặc tự gửi lại yêu cầu sang provider khác.
- Chat Completions: gửi văn bản, ảnh và PDF theo chuẩn API; XLSX/CSV vẫn được đọc thành ô dữ liệu tại Finova. **Word DOC/DOCX và XLS cần chuyển thành PDF hoặc XLSX/CSV**, hoặc dùng chế độ Responses với provider hỗ trợ các loại tệp đó. Không giả định gateway/model `tungnv` hỗ trợ vision, PDF hoặc Word chỉ vì URL trả lời HTTP.
- Endpoint là URL gốc API, thường có `/v1`, không kèm `/chat/completions`, `/responses`, user/password, query hoặc fragment. Chỉ HTTPS, ngoại trừ HTTP loopback để kiểm thử local. Không đi theo redirect để tránh gửi dữ liệu/khóa sang nơi khác.
- Khóa chỉ ở môi trường phía máy chủ. Thông báo quota/auth/model phản ánh provider đã chọn; không in khóa, prompt hay body lỗi upstream. `store:false` không thay thế chính sách lưu dữ liệu của gateway/provider phía sau.

Sau khi có bản ứng dụng mới, cập nhật `.env` và **tạo lại container app bằng đúng image và các compose file của lần triển khai hiện tại**. Chỉ `docker compose restart app` không nạp biến mới; không dùng image mặc định cũ khi server đang chạy image release riêng. Không cần đổi biến AI trong build args.

Kiểm tra biến đã vào container mà không in khóa:

```sh
docker compose exec -T app node -e 'console.log(JSON.stringify({endpointConfigured:Boolean(process.env.LLM__Endpoint?.trim()),keyConfigured:Boolean(process.env.LLM__ApiKey?.trim()),model:process.env.LLM__ChatModelId?.trim(),apiMode:process.env.LLM__ApiMode?.trim()||"chat-completions",responseFormat:process.env.LLM__ResponseFormat?.trim()||"json_object"}))'
```

Đã kiểm tra HTTPS tới gateway ngày 30/10/2026: các đường dẫn `/v1/models`, `/v1/chat/completions`, `/v1/responses` đều trả `401` khi không gửi khóa. Điều này chỉ xác nhận kết nối/tầng xác thực, chưa xác nhận quyền model hay khả năng đọc tệp. Không dùng khóa đã dán trong chat để kiểm thử. Cần thay khóa trước khi bật trên máy chủ.

Chuẩn đối chiếu: [Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [giới hạn file theo API](https://developers.openai.com/api/docs/guides/file-inputs). Đây là chuẩn tương thích; khả năng thực tế phụ thuộc gateway/model.

## Chẩn đoán AI trong Docker

Phần này dành cho cấu hình OpenAI mặc định (toàn bộ `LLM__...` để trống). `gpt-5.6-sol` hỗ trợ Responses API, ảnh và Structured Outputs. Giữ nguyên model được cấu hình; tên model hợp lệ chưa chứng minh project có đủ quyền hoặc tín dụng.

Sau khi thay `.env`, tạo lại container `app` bằng cùng Compose files, image và mạng đang dùng khi triển khai. Không chỉ restart container cũ. Nếu hệ thống dùng `release-server.sh`, giữ đúng image release hiện tại khi cập nhật biến môi trường.

Kiểm tra biến thực sự có trong container, không in khóa:

```sh
docker compose exec -T app node -e 'console.log(JSON.stringify({keyConfigured:Boolean(process.env.OPENAI_API_KEY?.trim()),model:process.env.FINOVA_AI_MODEL?.trim()||"gpt-4.1"}))'
```

Sau khi thay khóa bị lộ, có thể gửi một yêu cầu thử ngắn không chứa sao kê. Lệnh dưới gọi API và có thể tiêu thụ một lượng token nhỏ; chỉ in HTTP, machine code, trạng thái và request ID:

```sh
docker compose exec -T app node -e 'fetch("https://api.openai.com/v1/responses",{method:"POST",signal:AbortSignal.timeout(30000),headers:{Authorization:"Bearer "+process.env.OPENAI_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.FINOVA_AI_MODEL||"gpt-4.1",input:"Reply OK",max_output_tokens:1024,store:false})}).then(async r=>{const j=await r.json();console.log(JSON.stringify({http:r.status,code:j.error?.code,type:j.error?.type,status:j.status,requestId:r.headers.get("x-request-id")}))}).catch(()=>console.log("NETWORK_ERROR"))'
```

| OpenAI trả về | Ứng dụng báo | Cách xử lý |
| --- | --- | --- |
| `credit_balance_exhausted` | `AI_CREDITS_EXHAUSTED` | Bổ sung credit trong Billing của tổ chức OpenAI đang dùng. |
| `insufficient_quota`, giới hạn chi tiêu/usage | `AI_QUOTA_EXCEEDED` | Kiểm tra Billing và Limits; thử lại liên tục không sửa được giới hạn. |
| `401` / `invalid_api_key` | `AI_AUTH_FAILED` | Kiểm tra/đổi khóa trong môi trường máy chủ rồi tạo lại container. |
| `model_not_found` | `AI_MODEL_UNAVAILABLE` | Kiểm tra ID model và quyền của project. |
| `403` | `AI_ACCESS_DENIED` | Kiểm tra quyền của khóa/project/tổ chức. |
| `invalid_json_schema` / `text.format` | `AI_SCHEMA_INVALID` | Kiểm tra schema Structured Outputs của ứng dụng. |
| `429` do tốc độ | `AI_RATE_LIMITED` | Chờ theo Retry-After và giảm tốc độ yêu cầu. |

Ứng dụng chỉ log HTTP status, machine code/type trong danh sách cho phép, mã lỗi nội bộ và request ID hợp lệ. Không log lỗi nguyên văn từ nhà cung cấp vì lỗi có thể chứa khóa hoặc dữ liệu đầu vào. Lỗi credit/quota không trả Retry-After như lỗi tốc độ.

Ngày 30/10/2026, kiểm tra từ máy chủ xác nhận `429 / credit_balance_exhausted / insufficient_quota`; nguyên nhân là hết prepaid credits, cần xử lý tại tài khoản OpenAI. Khóa từng dán vào chat phải được thu hồi và thay mới; không lưu khóa trong tài liệu này.

Tham chiếu: [mã lỗi OpenAI](https://developers.openai.com/api/docs/guides/error-codes), [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol).

## Quy tắc dữ liệu

- Tối đa 5 MB và 200 giao dịch mỗi lần đọc AI. XLSX/CSV có tối đa 250 dòng kể cả tiêu đề; chỉ đọc trang tính hiển thị đầu tiên, từ chối công thức, gửi ô dữ liệu nguyên văn thay vì bản tóm tắt của nhà cung cấp.
- Word chỉ đọc văn bản; ảnh nhúng cần chuyển sang PDF. XLS đời cũ dùng luồng tệp của nhà cung cấp; cần đối chiếu số dòng với bản gốc hoặc chuyển sang XLSX để có kiểm tra giới hạn dòng tại máy chủ.
- Chỉ VND nguyên dương dưới 10¹⁶; số dư đầu/cuối và dòng tổng không phải giao dịch. Ngày tương lai, sai ngày/số tiền, thiếu loại/danh mục, confidence thấp, chuyển nội bộ thiếu ví nhận đều cần sửa trước khi nhập. Tệp không đọc đủ hoặc không xác định VND bị từ chối cả đợt.
- Độ tin cậy do mô hình cung cấp là tín hiệu sàng lọc, không phải bảo đảm chính xác. Luôn có bước xác nhận trước ghi sổ. Thu nhập/chi tiêu không được dùng thay cho chuyển giữa hai ví của chính người dùng.
- Cùng tệp/cùng ví dùng lại đợt nhập dưới khóa database. Mã giao dịch ngân hàng được dùng làm định danh; nếu thiếu mã thì dùng loại/ngày/số tiền/nội dung và thứ tự xuất hiện của giao dịch giống nhau. Sửa danh mục không thay định danh nguồn. Sổ cái dùng idempotency và giao dịch Serializable khi commit.
- Chống trùng này áp dụng cho luồng nhập AI. Khi sao kê có nội dung OCR khác nhau, thiếu mã giao dịch, hoặc giao dịch đã nhập thủ công/CSV/đồng bộ ngân hàng, cần đối chiếu trước xác nhận; không thể khẳng định trùng chỉ vì cùng số tiền và ngày.
- Mọi truy vấn ràng buộc workspace. API có signed session, kiểm tra Origin cho mutation, entitlement nhập sao kê, giới hạn request và giới hạn kích thước trước parse. Kết quả là `private, no-store`.
- Tệp gốc chỉ ở bộ nhớ request, không ghi xuống ổ đĩa. Dữ liệu trích xuất và metadata kiểm tra được lưu trong staging. Sao kê gốc gửi nhà cung cấp AI được cấu hình có thể chứa dữ liệu định danh; giao diện yêu cầu đồng ý rõ. Không ghi prompt, tệp, body lỗi nhà cung cấp hoặc API key vào log. `store:false` không đồng nghĩa nhà cung cấp không có chính sách lưu dữ liệu riêng.

## Cơ sở phân tích và dự báo

- Lấy bút toán INCOME/EXPENSE ròng bằng PostgreSQL NUMERIC, gồm hoàn tiền/đảo bút toán; chuyển ví không tính vào thu chi, phí chuyển tính chi. Dùng Decimal cho các phép tính, múi giờ Việt Nam.
- So sánh cùng số ngày đầu tháng với tháng trước, tối đa số ngày của tháng ngắn hơn. Tháng hiện tại tính đến hôm nay, không giả định là tháng đầy đủ.
- Hạn mức: trung bình tối đa ba tháng lịch sử + 5% dự phòng. Nếu danh mục mới, dùng tốc độ chi tháng hiện tại. Khi có thu nhập lịch sử, tổng đề xuất được điều chỉnh tối đa 80% thu nhập bình quân. Đây là mặc định sản phẩm có thể sửa, không phải quy tắc tài chính bắt buộc.
- Dự báo tuyến tính = chi ròng đã có / số ngày đã qua × số ngày trong kỳ. Dưới bảy ngày, đánh dấu chưa đủ dữ liệu trừ khi đã vượt. Kỳ tùy chỉnh bắt đầu trước cửa sổ ba tháng được hiển thị thiếu dữ liệu, không tạo dự báo thiếu phần đầu kỳ.
- Hạn mức tổng và nhóm/danh mục không cộng dồn. Không tự ghi đè ngân sách đã tồn tại. Lịch sử chưa đủ hoặc chưa nhập đầy đủ sẽ làm độ tin cậy thấp.
- AI chỉ diễn giải số liệu tổng hợp, nêu đóng góp của danh mục và gợi ý hành động; không suy đoán nguyên nhân đời sống như sự thật.

## Kiểm thử

Provider tùy chỉnh, xác nhận ngày 30/10/2026: 103 tệp / 640 tests đạt; TypeScript, ESLint và production build `.next-ai-provider-build` đạt. Docker Compose profile `app` hợp lệ và truyền đủ năm biến `LLM__...`. Integration `--custom-provider` đạt với HTTP loopback thật, phản hồi AI giả lập và PostgreSQL QA thật. Chưa xác thực yêu cầu có khóa/model trên gateway thật hoặc chất lượng OCR của model `tungnv`.

Kết quả xác nhận ngày 29/10/2026: production build, TypeScript, ESLint và audit 107 HTTP handlers đều đạt; 102 tệp kiểm thử / 582 tests đạt. Integration PostgreSQL thật và Chrome headless desktop/mobile đạt. Đã trực tiếp xem ảnh chụp, sửa màu chữ/cảnh báo theo token dark mode. Migration chỉ chạy trên DB QA, chưa áp dụng vào DB người dùng hoặc triển khai production.

- Unit/HTTP/provider: `npm test`; kiểm tra xác thực, Origin, consent, workspace, malformed/refused/incomplete output, giới hạn tệp, định dạng, số tiền lớn, kỳ so sánh, hoàn tiền, phân loại lịch sử và ngân sách.
- CSDL riêng đã tạo: `finova_ai_test_p0_20261029_a` trên PostgreSQL local port 55433. Runner từ chối nguồn ngoài local `/finova`, rồi chuyển URL sang DB QA; không thay đổi DB người dùng.
- Migration QA: `node --env-file=.env --import tsx scripts/ai-p0-qa-runner.mjs --migrate`.
- Integration: `node --env-file=.env --import tsx scripts/ai-p0-qa-runner.mjs`. Sử dụng phản hồi OpenAI giả lập, ghi sổ PostgreSQL thật; để lại fixture người dùng riêng cho browser.
- Integration custom: thêm `--custom-provider` vào lệnh trên. Chạy HTTP server loopback thật trả fixture tổng hợp; kiểm tra Chat Completions, model, header xác thực, staging/ghi sổ PostgreSQL và AI phân loại/nhận xét. Không gọi gateway bên ngoài và không dùng khóa thật.
- UI server: thêm `--server` vào runner; chỉ bind localhost port 31649. Browser: `node scripts/ai-p0-browser-check.mjs` (Chrome/Edge headless). Ảnh và kết quả nằm trong `artifacts/ai-p0/` đã gitignore. Chạy integration để tạo fixture mới trước mỗi lượt browser.
- Có kiểm thử nhập đồng thời, nhập lặp, sửa dòng, tenant isolation, hoàn tiền, phí chuyển, số dư ví, cảnh báo ngân sách và UI ở 1440px/390px.
- Chưa kiểm thử OCR/nhận xét qua OpenAI thật vì môi trường chưa có API key. Trước phát hành cần chạy bộ sao kê mẫu đã ẩn danh với key/model của môi trường, đối chiếu số dòng/số tiền/ngày/danh mục; đặc biệt PDF nhiều trang, bản scan mờ, DOC và XLS đời cũ.

Tài liệu API đã đối chiếu: [File inputs](https://developers.openai.com/api/docs/guides/file-inputs), [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
