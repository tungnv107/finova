# Finova UI-P5 — Hướng dẫn nghiệm thu và bằng chứng

Tài liệu này phân biệt rõ **bài kiểm thử đã chạy** với **bài kiểm thử đã được viết nhưng chưa chạy trong phiên đăng nhập**. Không sử dụng giao dịch hoặc số dư giả để vượt qua bước nghiệm thu.

## 1. Kiểm thử tự động, an toàn với dữ liệu thật

Trong thư mục dự án:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:browser:local
```

`test:browser:local` khởi động production server và Chrome headless trong cùng phiên lệnh. Bài test công khai kiểm tra 13 viewport (bao gồm 320×568), logo, không tràn ngang, PWA, theme Light/Dark/System, keyboard focus, target tối thiểu 44px, WCAG axe và chuyển đến Google OAuth. Báo cáo ở `artifacts/qa/browser-smoke.json`; ảnh ở cùng thư mục. Chỉ dùng `npm run test:browser` nếu server production đang chạy trên `http://localhost:3002` trong cùng vùng mạng. Trong sandbox mặc định ngày 22/10/2026, kết nối loopback bị từ chối (`EACCES`); bài test PASS khi Codex được cấp quyền kết nối mạng cục bộ.

**Kiểm chứng lại 22/10/2026:** wrapper `test:browser:local` **PASS khi môi trường cho phép kết nối localhost**: tự khởi động Next.js production, thực hiện 13 viewport và các kiểm tra a11y/PWA/OAuth initiation, rồi kết thúc thành công. Ở sandbox hạn chế loopback, probe trả `EACCES` trên cả `::1` và `127.0.0.1`, dù chưa có bằng chứng server lỗi. Wrapper đã được sửa để báo ngay `Local loopback connection ... denied (EACCES/EPERM)` thay vì chờ hết số lần thử hoặc quy lỗi cho server. Chạy QA/CI trong môi trường có quyền kết nối localhost; nếu cần có thể chạy `npm run start -- -p 3002` và `npm run test:browser` riêng để chẩn đoán.

## 2. Kiểm thử các màn sau đăng nhập (không ghi dữ liệu)

Chạy server `npm run start -- -p 3002`. Trên Windows, mở **Chrome profile QA riêng**, bật local debugging:

```powershell
& 'C:\Program Files\Google\Chrome\Application\chrome.exe' --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 --user-data-dir="$env:TEMP\finova-ui-qa-browser" http://localhost:3002/login
```

Đăng nhập qua Google trong trình duyệt này bằng tài khoản được phép. Sau đó, trong terminal cùng môi trường mạng:

```powershell
npm run test:ui:auth
```

`test:ui:auth` mở và đóng **một tab mới** trong cùng profile. Script dùng phiên đăng nhập hợp lệ, chỉ đọc `/dashboard`, `/transactions`, `/wallets`, `/reports`, `/budgets`, `/goals`, `/settings` ở 320–1440px, Light/Dark; kiểm tra overflow, navigation, FAB, focus trap `Tab`/`Shift+Tab`, keyboard tab reports, đóng form bằng Escape, focus restoration, axe WCAG và thời gian hiển thị trình duyệt. Không gửi thao tác tạo/sửa/xóa tài chính. Báo cáo ở `artifacts/qa/protected-ui-audit.json`, chỉ gồm thông tin UI/selector và số đo, không lưu số dư hoặc tên giao dịch.

Từ checkpoint UI-303, script còn kiểm tra bộ lọc Dashboard dạng bottom sheet trên mobile: nút chọn Tháng trước, tính chất modal, scroll lock, vòng focus hai chiều, Escape và trả focus về chip. Các kiểm tra này **đã được viết nhưng chưa chạy với Google session hợp lệ**.

**Mặc định không lưu ảnh dữ liệu nhạy cảm.** Nếu chủ sở hữu dữ liệu chủ động muốn lưu snapshot nội bộ, chạy `$env:FINOVA_QA_CAPTURE='1'; npm run test:ui:auth`, cất ảnh đúng quy trình bảo mật và xóa biến môi trường sau khi chạy. Không đăng ảnh có thông tin tài chính vào issue công khai.

Lỗi `BLOCKED_AUTH` có nghĩa là profile QA chưa đăng nhập; không tắt auth để vượt bài kiểm thử. `EACCES`/`ETIMEDOUT` khi kết nối localhost có thể đến từ sandbox của terminal; chạy server và trình duyệt trong môi trường có quyền kết nối loopback.

## 3. Nghiệm thu thủ công bắt buộc trước phát hành

| Mục | Thao tác | Bằng chứng cần lưu |
|---|---|---|
| UI-501 | Snapshot màn protected ở 320/390/430/1440, Light/Dark; đối chiếu baseline trước V3 | Ảnh được chủ sở hữu phê duyệt, chú thích khác biệt |
| UI-502 | Google login thật; điều hướng; lọc giao dịch; mở form tạo/sửa; ghi thử **chỉ trong workspace test được cho phép** | Checklist thao tác và kết quả backend |
| UI-503 | VoiceOver trên iOS, TalkBack trên Android; keyboard-only, zoom 200%, contrast và reduced motion | Phiên bản OS/browser, lỗi và cách tái hiện |
| UI-504 | Lighthouse mobile/desktop trong Chrome DevTools; đo LCP, CLS, INP trên môi trường/mạng được mô tả | HTML/JSON Lighthouse, điều kiện throttling |
| UI-505 | iOS Safari và Android Chrome thiết bị thật; bàn phím ảo, safe area, 320px, sheet, gesture navigation | Mẫu máy/OS, ảnh lỗi đã che dữ liệu |
| UI-506 | Đối chiếu số dư, thu chi, chuyển ví, hoàn tiền, nhập sao kê, xuất báo cáo với backend thật | Bảng đối soát, không chỉnh ledger production |
| UI-507 | So sánh trước/sau, duyệt visual diffs và sửa lỗi phát hiện | Log lỗi, ảnh đối chiếu, quyết định release |

`test:ui:auth` cung cấp bằng chứng bổ sung, nhưng **không thay thế** Lighthouse, phép thử thiết bị vật lý, screen reader, so sánh baseline hoặc nghiệm thu ghi dữ liệu trong workspace test. Chỉ đánh dấu toàn bộ UI-P5 hoàn tất khi những bằng chứng này có thật.

## 4. Kết quả kiểm chứng 22/10/2026

| Hạng mục | Trạng thái | Bằng chứng / hạn chế |
|---|---|---|
| TypeScript, lint, production build | **PASS** | Đã chạy lại sau sửa UI-305; build tạo 27 static pages, Windows cần quyền ghi `.next` phù hợp. |
| Unit tests | **PASS** | 273/273 tests, 41/41 files; thêm 4 case empty/transfer-only/zero-net/onboarding cho Dashboard. |
| Browser smoke login | **PASS** | 13/13 viewport 320–1440px; Light/Dark/System; PWA; Google OAuth initiation; `artifacts/qa/browser-smoke.json` cập nhật sau khi chạy trực tiếp production server. |
| WCAG axe login | **PASS (phạm vi login)** | 390px/1440px × Light/Dark: 0 violations với các nhóm WCAG được script cấu hình. Không đại diện cho toàn bộ ứng dụng. |
| Dependencies & QA scripts | **PASS** | `npm ls --depth=0`; axe 4.14.0 khớp package và lock; `node --check` ba script. Chưa xác minh `npm ci` sạch. |
| Wrapper public browser QA | **PASS với localhost được cấp quyền** | `npm run test:browser:local`: 13 viewport, 4 axe checks, theme System, public PWA và Google OAuth initiation PASS. Trong sandbox mặc định: dừng sớm với thông báo `EACCES` chính xác; đây là hạn chế quyền mạng của terminal. |
| UI-501: snapshots | **PARTIAL** | Có ảnh login sau chỉnh sửa; thiếu baseline trước V3 và ảnh màn protected với sự đồng ý của chủ sở hữu. |
| UI-502: authenticated E2E | **BLOCKED_AUTH** | Chưa có Chrome QA đã đăng nhập qua Google; không chạy thay bằng phiên giả. |
| UI-503: accessibility toàn ứng dụng | **PARTIAL** | Axe login PASS; chưa có VoiceOver/TalkBack, bàn phím và phóng to trên protected. |
| UI-504: Lighthouse/Core Web Vitals | **NOT RUN** | Có FCP Performance API của login (44–156ms, không throttling), chưa có Lighthouse/LCP/CLS/INP hợp lệ. |
| UI-505: thiết bị thật | **NOT RUN** | Chưa có iOS Safari/Android Chrome với kết quả kiểm chứng trực tiếp. |
| UI-506: regression nghiệp vụ | **PARTIAL** | 273 unit tests PASS và OAuth initiation PASS; cần đối soát với dữ liệu tài chính thật trên workspace thử nghiệm. |
| UI-507: so sánh visual/release | **NOT RUN** | Chưa có baseline protected và phê duyệt phát hành. |
| UI-305: empty states | **PASS mã nguồn + SSR regression; visual pending** | Một empty state khi không có thu chi, giữ số dư có thật, chuyển ví vẫn có lịch sử, không nhận sai zero-net ledger thành “chưa có thu chi”; 4/4 SSR case PASS. |
| Audit API route | **PASS tĩnh** | 41 route v1, 54 handler có context guard/Origin mutation; chưa thay thế kiểm thử IDOR hai tài khoản. |

**Release gate UI-P5: CHƯA ĐẠT.** Cần phiên Google QA hợp lệ, phép đo Lighthouse, thiết bị thật và đối soát nghiệp vụ trước khi duyệt các ô nghiệm thu còn mở ở implementation plan. Không lưu ảnh màn protected theo mặc định.
