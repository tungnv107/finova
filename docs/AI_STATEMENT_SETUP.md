# Model cho ảnh sao kê

Finova gửi ảnh PNG/JPG/WebP qua `input_image` (Responses) hoặc `image_url` (Chat Completions). Model phía sau router phải thực sự nhận được ảnh và hỗ trợ trả JSON. Một alias/combo có thể chuyển yêu cầu sang model hoặc kết nối không nhận ảnh, dù API vẫn trả HTTP 200.

`LLM__VisionModelId` chọn model riêng cho ảnh trên cùng endpoint, dùng cùng khóa API, API mode và response format. Văn bản, CSV/XLSX và các tệp tài liệu khác vẫn dùng `LLM__ChatModelId`. Khi để trống, ảnh dùng model chat như trước. Ứng dụng không tự chuyển sang nhà cung cấp khác.

Ví dụ đã kiểm chứng với ảnh sao kê giả lập trên 9router ngày 30/10/2026:

```dotenv
LLM__Endpoint="https://9router.haui.com.vn/v1"
LLM__ApiKey="<khóa API hiện tại>"
LLM__ChatModelId="tungnv"
LLM__VisionModelId="ag/gemini-3.8-flash"
LLM__ApiMode="chat-completions"
LLM__ResponseFormat="json_object"
```

Chọn model có trong danh sách `/v1/models` và kiểm tra khả năng đọc ảnh trên router của bạn. Trong lần đối chiếu, alias `tungnv` trả rằng không được cung cấp ảnh; model cụ thể ở trên đọc đúng hai giao dịch VND từ cùng một ảnh. Khả năng này phụ thuộc model/kết nối và cấu hình router.

Sau khi cập nhật mã nguồn và `.env`, tạo lại container app theo quy trình triển khai hiện có để nhận `LLM__VisionModelId`; chỉ restart container không cập nhật biến môi trường. `compose.yaml` đã truyền biến này cho app. Cấu hình Nginx Proxy Manager và mạng Docker cần giữ nguyên như lần triển khai hiện tại.

Nếu ảnh vẫn lỗi, đối chiếu `inputType` và `appCode` trong log. `AI_OUTPUT_NOT_JSON` nghĩa là model không trả JSON hợp lệ; `STATEMENT_INCOMPLETE` nghĩa là model báo chưa đọc đủ nội dung. Các trường hợp này không tạo giao dịch. Không bỏ qua kiểm tra dữ liệu hoặc tự tạo giao dịch từ phần trả lời thiếu nội dung.
