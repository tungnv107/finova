# Finova Fintech UI/UX V3 — Gói bàn giao

## Tài liệu

- **`FINOVA_UI_UX_REDESIGN_IMPLEMENTATION_PLAN.md`** — đặc tả giao diện & implementation plan chính: UI, mobile bottom navigation, Light/Dark/System mode, Dashboard, giao dịch, Ví, báo cáo, Cá nhân, component contracts, tasks và test cases.
- **`finova-fintech-theme.css`** — CSS starter minh họa semantic design tokens, hero fintech, card, bottom navigation, breakpoints, safe area và reduced motion. Cần kiểm tra cấu trúc framework trước khi tích hợp; **không copy đè toàn bộ CSS hiện hữu**.
- **`README.md`** — hướng dẫn dùng bộ bàn giao.

## Cách đưa vào repository

1. Chép Markdown vào `docs/design/` hoặc đường dẫn tài liệu tương ứng.
2. Đưa CSS vào `docs/design/reference/` trước; Codex sẽ quyết định cách tích hợp semantic tokens vào Tailwind/shadcn đang có.
3. Giữ nguyên bộ logo Finova Brand Guideline V2 đã duyệt; không trộn asset logo từ bộ concept cũ.
4. Giao Codex đọc mục **19. MASTER PROMPT** trong tài liệu và triển khai từng giai đoạn từ UI-P0 đến UI-P5.
5. Nghiệm thu với thiết bị mobile (320/375/390/430), tablet 768 và desktop >=1024; Light/Dark + trạng thái có dữ liệu/không dữ liệu.

## Ràng buộc quan trọng

- Đây là **đặc tả UI và CSS minh họa**, chưa thực hiện thay đổi code trong repo Finova.
- Không được tự tạo dữ liệu tài chính, sản phẩm đầu tư hoặc chỉnh ledger, đồng bộ sao kê, Google OAuth chỉ để có ảnh giao diện đẹp.
- Chế độ theme chỉ điều khiển presentation, không được làm mất trạng thái giao dịch/bộ lọc.
