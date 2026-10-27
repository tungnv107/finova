# FINOVA — KẾ HOẠCH THIẾT KẾ LẠI HỆ THỐNG ĐIỀU KHIỂN GIAO DIỆN

> **Phiên bản:** Đề xuất V4 — Interaction & Control Hierarchy
> **Ngày:** 27/10/2026
> **Trạng thái:** **Đang triển khai V4**; đã có thay đổi mã nguồn và kiểm thử tự động, **chưa nghiệm thu trình duyệt, responsive và luồng tài chính**.
> **Phạm vi:** Finova người dùng cá nhân và Admin Console; mobile-first, web responsive, PWA, Light/Dark/System.
> **Kế thừa:** `docs/FINOVA_FINTECH_UI_UX_V3/FINOVA_UI_UX_REDESIGN_IMPLEMENTATION_PLAN.md`, `FINOVA_BRAND_GUIDELINE_V2.md` và các ràng buộc tài chính/phân quyền hiện tại.

## 1. Vấn đề và mục tiêu

Các màn hình có nhiều điều khiển trông giống nút CTA dù chúng đảm nhiệm chức năng khác nhau: chuyển nhóm nội dung, chọn kỳ, áp dụng bộ lọc, điều hướng sang trang khác, chỉnh sửa bản ghi và thực hiện nghiệp vụ. Sự đồng dạng này làm yếu thứ bậc thị giác, gây rối ở mobile và buộc người dùng đọc quá nhiều nhãn nút.

Rà soát tĩnh tại `src/components` cho thấy các component có nhiều thẻ `<button>` nhất là `transaction-manager.tsx` (15), `wallet-manager.tsx` (14), `bank-sync-manager.tsx` (13), `finance-dashboard.tsx` (12), `recurring-manager.tsx` (12). **Đây là số lần xuất hiện trong mã nguồn, không phải số nút đồng thời hiển thị trên một màn hình; chưa có đo đạc trực quan của phiên đăng nhập.** Ngoài ra, các nút giả dạng tab xuất hiện trong `report-tabs.tsx`, trong bộ chọn khoảng thời gian của Admin và nhóm chọn 6/12 tháng.

**Mục tiêu trải nghiệm:** Mỗi khu vực có một hành động chính dễ nhận biết; người dùng phân biệt tức thì *đang xem đâu*, *đang chọn gì* và *sắp làm gì*. Giảm số CTA có hình thức giống nhau, giảm thao tác thừa mà không giấu mất các nghiệp vụ quan trọng.

## 2. Quy tắc quyết định loại component

| Nhu cầu | Component đúng | Quy tắc dùng | Tránh |
|---|---|---|---|
| Chuyển giữa các **vùng nội dung cùng trang** | `Tabs` / tab bar | Có trạng thái active, `tablist/tab/tabpanel`, hỗ trợ phím mũi tên; duy trì lựa chọn khi thay bộ lọc | Năm nút `button-primary` / `button-outline` đặt cạnh nhau |
| Chọn **một** trong 2–4 giá trị nhỏ | `SegmentedControl` / radio group | Ví dụ Thu/Chi/Chuyển; 6/12 tháng; 7/30/90 ngày; có nhãn, selected rõ | Nhiều nút CTA rời rạc |
| Chuyển sang **route khác** | `Link`, sidebar nav, sub-navigation | Đánh dấu `aria-current="page"`, URL phản ánh điểm đến; subnav có thể mang hình thức tab | Gắn `role="tab"` vào điều hướng route khi không vận hành theo mô hình tab |
| Bộ lọc dữ liệu | `FilterBar`, filter chip, popover/bottom sheet | Bộ lọc phổ biến hiện gọn; nâng cao mở riêng; hiển thị chip của bộ lọc đang áp dụng và `Xóa lọc` | Một khối form đầy đủ luôn chiếm nửa đầu trang |
| Tác vụ quan trọng duy nhất | `PrimaryButton` có icon phù hợp | Tối đa 1 CTA primary / vùng chức năng; nhãn là động từ cụ thể | Nhiều nút primary cạnh nhau cùng cạnh tranh thị giác |
| Tác vụ nhanh, quen thuộc | `IconButton` + accessible label/tooltip | `Eye`, `Pencil`, `RefreshCw`, `X`; kích thước tương tác >=44 px trên mobile | Icon đơn độc thiếu tên; nút chứa cả icon lẫn chữ trên từng dòng dữ liệu |
| Tác vụ phụ hoặc hiếm | `ActionMenu` (`MoreHorizontal`) | `Sửa`, `Lưu trữ`, `Tạm dừng`, `Khôi phục`, `Hủy` theo ngữ cảnh; nhóm destructive và có xác nhận | Dàn 3–5 nút trên từng card hoặc hàng bảng |
| Xuất dữ liệu nhiều định dạng | `ExportMenu` với `Download` | Một điều khiển `Xuất dữ liệu` → CSV/Excel/PDF, giữ nguyên query đang chọn | Ba nút CSV, Excel, PDF cạnh nhau ở nhiều vị trí |
| Trạng thái thông tin | `Badge`, `StatusPill`, progress, inline text | Trạng thái *không tương tác*; màu đi kèm chữ hoặc icon | Khiến badge giống nút bấm |
| Tác vụ nguy hiểm hoặc đổi tiền | `ConfirmDialog` / bước xác nhận rõ ràng | Hiện đủ số tiền, ví, hệ quả, trạng thái xử lý và phân quyền | Đưa thao tác phá hủy thành icon bấm một lần |

**Lưu ý ngữ nghĩa:** `Tab` vẫn được triển khai bằng thẻ `<button>` theo chuẩn ARIA; yêu cầu thiết kế lại ở đây là **kiểu hiển thị và mô hình tương tác**, không phải thay toàn bộ `<button>` bằng thẻ HTML khác. Form submit vẫn là button; liên kết điều hướng vẫn là link.

## 3. Audit và đề xuất theo màn hình

| Mức | Màn hình / nguồn hiện có | Quan sát từ mã nguồn | Phương án V4 |
|---|---|---|---|
| **P0** | `/reports` — `report-tabs.tsx` | 5 tab đã có ARIA chuẩn nhưng đang dùng giao diện `button-primary/outline`; ba link xuất CSV/Excel/PDF ở nhiều khu vực; 6/12 tháng là hai nút | Tab bar gọn có underline/active indicator; trên mobile cuộn tab có kiểm soát hoặc dropdown chọn nhóm; 1 `ExportMenu`; `SegmentedControl` 6/12. Giữ bộ lọc trong URL khi đổi nhóm. |
| **P0** | `/dashboard` — `finance-dashboard.tsx`, `navigation.tsx` | CTA thêm giao dịch ở tiêu đề, topbar, ba hành động thu/chi/chuyển trong hero và FAB mobile; nhóm liên kết nhanh tiếp tục hiển thị dạng nút | Một lối tạo giao dịch nổi bật theo viewport: FAB trên mobile, `Thêm giao dịch` trên desktop; trong sheet chọn Thu/Chi/Chuyển bằng segmented. Liên kết tới chức năng khác dùng text link hoặc action tile. Hero ưu tiên số dư và hai KPI. |
| **P0** | `/transactions` — `transaction-manager.tsx`, `quick-transaction-sheet.tsx` | Trong form có ba nút chọn Thu/Chi/Chuyển; mỗi bản ghi có các nút/icon Sửa, Hoàn tiền, Hủy; filter chứa nhiều trường | Chọn loại bằng segmented thống nhất với quick sheet. Chạm dòng → panel chi tiết; hành động thường dùng có thể hiện trực tiếp trong panel, thao tác hiếm ở `⋯`. Bộ lọc hiện chip loại/kỳ/ví, nâng cao trong sheet; giữ deeplink, phân trang, logic hoàn tiền. |
| **P0** | `/wallets` — `wallet-manager.tsx` | Trên mỗi ví có Sửa, Đối soát, Lưu trữ/Khôi phục; cuối trang lại có biểu mẫu chọn ví xem lịch sử | Card ví là điểm vào chi tiết/lịch sử; header card hiện số dư và trạng thái; tối đa một action theo ngữ cảnh và menu `⋯` cho Sửa/Đối soát/Lưu trữ. Không biến `Đối soát` thành thao tác thiếu xác nhận. |
| **P0** | `/bank-sync` — `bank-sync-manager.tsx` | Hai quy trình tải tệp và liên kết SePay, hàng loạt bước và nút; danh sách kết nối có nhiều nút cho tạm dừng, tiếp tục, kiểm tra, hủy | Phân vùng nội dung bằng tab **Tổng quan / Kết nối ngân hàng / Nhập tệp / Cần đối soát** (chỉ tab nếu dữ liệu cùng trang); trong SePay dùng stepper theo bước; mỗi nguồn là row/card có trạng thái + `⋯` actions. Đối soát cần CTA xác nhận rõ. |
| **P1** | `/recurring` — `recurring-manager.tsx` | Lịch quy tắc và các lần phát sinh cùng trang, nhiều action theo dòng | Tabs `Lịch định kỳ / Chờ xác nhận / Lịch sử`; action quản lý quy tắc vào `⋯`; `Xác nhận ghi sổ` vẫn là CTA rõ ràng ở mục đến hạn. |
| **P1** | `/cards`, `/debts`, `/goals`, `/budgets` | Card chứa nút sửa + ghi nhận nghiệp vụ, form tạo/sửa mở cùng card | Một CTA nghiệp vụ ưu tiên theo trạng thái (`Ghi giao dịch`, `Thanh toán`, `Góp mục tiêu`); `Sửa/Lưu trữ` vào overflow; các form dài mở drawer/sheet hoặc trang chi tiết. |
| **P1** | `/categories` — `category-manager.tsx` | Mỗi hàng có nút `Sửa` và `Lưu trữ` | Chọn `Thu / Chi` bằng segmented hoặc tab theo nội dung; nhấn row hoặc icon edit để sửa; overflow cho lưu trữ/khôi phục; biểu tượng danh mục thành thành phần hiển thị, không phải nút giả. |
| **P1** | `/admin/analytics`, `/admin/billing/analytics` | 7/30/90 ngày thể hiện bằng liên kết có kiểu button; CSV/XLSX bằng các nút | Period switch thống nhất, phản ánh trong URL; một menu export, bộ lọc bổ sung ở popover. |
| **P1** | `/admin/billing/operations`, `/admin/billing/operations/inbox`, `/admin/billing/orders`, `/admin/billing/payments` | Nhiều link hành động sang các route liên quan có hình thức CTA; nút phân trang dạng primary/outline | Sub-navigation `Giám sát / Hộp cảnh báo / Đối soát / Thông báo` bằng route links; breadcrumb/đầu trang và action zone riêng; phân trang gọn với icon, số trang và mô tả. Phân quyền link theo role hiện tại. |
| **P1** | `/admin/billing/prices`, `/admin/subscriptions`, user detail | Lưu nháp, công bố, hủy công bố, phê duyệt/từ chối nằm gần nhau | Trạng thái bản ghi là badge; primary theo bước công việc; menu cho action phụ; các quyết định duyệt/thu hồi giữ modal xác nhận, lý do và audit. Trạng thái chờ phê duyệt phải nhìn thấy ngay. |
| **P2** | `/settings`, navigation người dùng/Admin, các màn phụ | Một số tile/link có kiểu CTA; Admin sidebar đã phân nhóm bằng `<details>` | Chuẩn hóa nav item/setting row, icon dẫn hướng, trạng thái active, mật độ spacing; chỉ mở rộng nhóm có route hiện tại. Tránh thay đổi cấu trúc điều hướng đã hoạt động tốt nếu chưa có bằng chứng UX. |

## 4. Kiến trúc giao diện đề xuất

### 4.1. Desktop — một vùng tác vụ rõ ràng

```text
[Tên trang]  [Mô tả ngắn]                         [Xuất ▾] [ + Hành động chính ]
────────────────────────────────────────────────────────────────────────────
  Tổng quan  |  Lịch sử  |  Phân tích            ← tab/subnav nếu đúng ngữ nghĩa
  [Kỳ: 30 ngày ▾] [Ví: Tất cả ▾] [Bộ lọc ●2] [Xóa lọc]
────────────────────────────────────────────────────────────────────────────
  Dữ liệu chính / biểu đồ / danh sách
  [icon/trạng thái]  Tên bản ghi      Giá trị       [Chi tiết ›] [⋯]
```

### 4.2. Mobile — tối ưu thao tác một tay

```text
[‹]   Giao dịch                                 [Lọc ☷]
[ Tất cả | Tiền ra | Tiền vào ]         ← segmented/filter, KHÔNG phải 3 CTA
[Tháng này ▾]    [Ví ●1]                ← điều kiện lọc hiện hành
────────────────────────────────────────────
  Hôm nay
  [icon] Nội dung giao dịch           −250.000 ₫
         Ví / thời gian                  [⋯]
  ...
────────────────────────────────────────────
  Tổng quan   Giao dịch     (+)     Ví     Cá nhân
```

Các ví dụ là **wireframe chữ**, không phải thiết kế pixel-perfect hoặc số liệu thật.

### 4.3. Component library V4 tối thiểu

Tạo hệ component dùng chung thay cho mỗi trang tự định nghĩa nút: `PageHeaderActions`, `Tabs`, `SegmentedControl`, `IconButton`, `ActionMenu`, `ExportMenu`, `FilterTrigger/FilterSheet`, `StatusBadge`, `ConfirmDialog`. Tận dụng React, CSS tokens và Lucide hiện có; đánh giá thư viện headless chỉ nếu chứng minh được lợi ích về keyboard/focus và chi phí dependency. Chuẩn hóa size `sm/md`, intent `primary/neutral/danger`, trạng thái disabled/loading và icon.

**Hành vi bắt buộc:** keyboard/focus management và Escape khi mở/đóng menu, click outside, đóng khi điều hướng, screen reader label, focus trở về trigger, popup không bị cắt bởi container cuộn. Với tabs, hỗ trợ Home/End, ArrowLeft/ArrowRight và chỉ active panel hiện ra. Với segmented control, truyền đạt selected bằng radio/pressed state theo cấu trúc hợp lệ.

## 5. Lộ trình triển khai, thứ tự và checklist

Chỉ đánh dấu `[x]` với hạng mục đã tích hợp và qua kiểm thử phù hợp. Các hạng mục đã có mã nhưng chưa đủ tiêu chí nghiệm thu vẫn để `[ ]`; tình trạng được ghi ở bảng tiến độ dưới đây.

### Giai đoạn V4-00 — Baseline & review (P0)

- [ ] Chụp ảnh và ghi số CTA **đồng thời hiển thị** trên 5 màn P0 ở 390/768/1440 px, Light/Dark, dữ liệu rỗng và có dữ liệu; tách cả trạng thái Premium/Lite, role Admin.
- [ ] Định nghĩa inventory từng control: vị trí, hành động, mức dùng, biểu diễn hiện tại, biểu diễn đề xuất; duyệt danh sách thao tác được đưa vào overflow.
- [ ] Chốt luồng `tạo giao dịch`, `đối soát ví`, `duyệt Premium`, `đồng bộ ngân hàng` có điểm xác nhận tiền và trạng thái rõ ràng.

### Giai đoạn V4-01 — Design system interaction (P0)

- [ ] Thiết kế component và token cho TabBar, SegmentedControl, IconButton, ActionMenu, FilterSheet, ExportMenu, StatusBadge.
- [ ] Xây demo hoặc Storybook-equivalent đơn giản cho từng trạng thái, keyboard và responsive; không thêm business logic.
- [ ] Duyệt trạng thái hover/focus/pressed/disabled/loading ở Light và Dark.

### Giai đoạn V4-02 — Chuyển đổi luồng người dùng chính (P0)

- [x] `/reports`: tab bar rõ nghĩa, bộ chọn 6/12 tháng, export dropdown và giữ URL/bộ lọc (đã tích hợp, typecheck/unit regression đạt; còn QA trực quan toàn hệ thống).
- [x] `/dashboard`: loại CTA thêm giao dịch trùng lặp theo breakpoint; thống nhất quick sheet (đã tích hợp, qua typecheck và unit regression; còn QA trực quan).
- [ ] `/transactions`: segmented chọn nghiệp vụ, hành động trên danh sách và filter sheet.
- [ ] `/wallets`: card/detail/overflow và luồng xem lịch sử, đối soát.
- [ ] `/bank-sync`: nội dung theo tab/stepper và menu tác vụ mỗi kết nối.

### Giai đoạn V4-03 — Màn hỗ trợ & Admin (P1)

- [ ] Chuẩn hóa recurring, cards, debts, goals, budgets, categories theo inventory.
- [ ] Admin period switch, export menu, sub-navigation, action menus phù hợp RBAC.
- [ ] Với duyệt/thu hồi Premium và đơn thu phí: kiểm tra nguyên vẹn dual approval, reasons, CSRF/authorization, audit và status.

### Giai đoạn V4-04 — QA & bàn giao (P0 trước nghiệm thu)

- [ ] Unit/component tests cho tab, segmented, menu, focus, disabled; regression các deeplink và query filters.
- [ ] Browser walkthrough có đăng nhập ở 320/360/390/430/768/1024/1440 px, bàn phím và màn hình cảm ứng; kiểm thử Dark/Light, Chrome/Safari mobile nếu có thiết bị.
- [ ] Kiểm thử a11y tự động + thủ công (tab order, focus trap, screen reader, nhãn icon-only, tương phản); không đạt thì để task mở.
- [ ] Kiểm thử lại nghiệp vụ và API liên quan: thu/chi/chuyển, hoàn tiền, hủy, đối soát, kết nối SePay, phê duyệt Premium; không cập nhật tiền hoặc quyền chỉ từ state UI.
- [ ] Visual diff trước/sau, ghi nhận các nhượng bộ, cập nhật tài liệu V3/implementation tracker khi nghiệm thu thực tế.

## 6. Tiêu chí nghiệm thu

### Tiến độ triển khai và bằng chứng (27/10/2026)

| Hạng mục | Đã tích hợp vào mã | Còn phải xác nhận |
|---|---|---|
| Shared V4 | `src/components/ui/interaction-controls.tsx`: `ContentTabs`, `SegmentedControl`, `IconButton`, `StatusBadge`, `ActionMenu`, `ExportMenu`, `useMobileFilterSheet`; CSS V4 Light/Dark theo semantic tokens. Menu portal đã xử lý Tab/Shift+Tab theo thứ tự focus tại trigger; menu toàn thao tác disabled khóa trigger. Chuẩn hóa tối thiểu 44 px cho segmented, mục menu và liên kết chọn kỳ. | `ConfirmDialog` thống nhất, demo tương tác, focus thực trên browser, contrast và chế độ touch. Hook filter mobile mới kiểm chứng tĩnh và typecheck. |
| Báo cáo + dashboard | Tab underline, lựa chọn kỳ dạng segmented, export menu; giảm CTA lặp, icon ẩn/hiện số dư có nhãn. Empty state giữ một CTA đổi kỳ chính; tạo giao dịch và nhập sao kê đổi thành thao tác/liên kết nhẹ có icon. | Screenshot so sánh từng breakpoint; UX thực tế có đăng nhập. |
| Giao dịch + quick sheet | Segmented Thu/Chi/Chuyển, menu tác vụ theo hàng, chip lọc hiện hành. Form lọc hiển thị như bottom sheet trên mobile, có backdrop, khóa scroll, Escape, focus trap và focus restore; desktop vẫn thu gọn tại chỗ. CTA trùng trong header được hạ thành hành động nhẹ để ưu tiên nút tạo giao dịch chung. Đã xử lý lỗi lint callback đóng sheet. | Kiểm chứng touch/keyboard thật trên browser, hoàn tiền/hủy và deeplink; chưa nghiệm thu mobile. |
| Ví + đồng bộ ngân hàng | Overflow per-card/per-connection, shortcut lịch sử ví; tab phân vùng kết nối, nhập tệp, đối soát, lịch sử | Quy trình SePay và stepper, thao tác thật, xác nhận đối soát, visual QA. |
| Recurring/categories/cards/debts/goals/budgets | Tabs theo nội dung khi cần, giữ CTA nghiệp vụ, đưa sửa/lưu trữ/tạm dừng vào `⋯` nếu có nhiều hành động. Riêng thẻ tín dụng và khoản vay chỉ có thao tác sửa: đổi menu một mục thành `IconButton` 44 px có nhãn. | Form dài dạng drawer, thử tương tác đầy đủ và mobile. |
| Admin và trang Cá nhân | Period switch + export menu ở analytics; sub-navigation route links, phân trang gọn, badge tĩnh. Bảng giá có menu cho chỉnh/xóa/ngừng công bố, form chỉnh nháp chỉ mở khi cần. Yêu cầu Premium có subnav trạng thái, biểu mẫu xét duyệt thu gọn và bước xác nhận quyết định; trang user có nhãn trạng thái và link điều hướng nhẹ. Bộ lọc nhật ký Admin là sub-navigation có trạng thái hiện tại; trang Cá nhân dùng liên kết quản lý gói thay CTA nổi. | Kiểm chứng trình duyệt từng role, API/catalog và dual approval end-to-end, lý do/audit, disabled/busy, mobile layout. Server-side RBAC hiện có được giữ nguyên. |
| Kiểm thử | Toàn bộ **97 file / 525 test đạt** ở lượt full suite sau cải tiến menu/phím Tab và icon sửa; `npm run typecheck`, `node --check scripts/protected-ui-audit.mjs` (lượt trước), `git diff --check` và ESLint riêng bốn tệp sửa lượt này đều đạt. | ESLint toàn repo chưa xác nhận; keyboard/touch bằng browser, a11y thủ công và API integration cần làm trước nghiệm thu. Kiểm thử một menu toàn thao tác disabled mới kiểm chứng bằng SSR markup. |
| Build | `npm run typecheck`, ESLint đích và `git diff --check` đạt | `next build --webpack` gặp Windows `EPERM` khi tạo thư mục `.next/server/app/api/internal`; build riêng `.next-v4-check` gặp `EPERM` tại nhánh `server/app/api/v1/admin/users/export`. Turbopack ở `.next-v4-turbo` bị chặn tạo junction (`Access is denied`, mã 5). Có thể tạo thư mục thường thủ công; chưa xác định nguyên nhân `EPERM` của webpack và chưa xác nhận production build. |

**Nguyên tắc QA:** Không xem `renderToStaticMarkup` là bằng chứng người dùng đã mở được overflow, sử dụng keyboard/focus và touch. Bộ test cũ đã được điều chỉnh để kiểm tra tác vụ được truyền vào menu ẩn và từng panel định kỳ; cần nghiệm thu tương tác bằng browser trước khi đóng V4-04.

| Chỉ tiêu | Mục tiêu kiểm được |
|---|---|
| CTA density | **Tối đa 1 primary CTA** trong mỗi page header/panel chính; các action lặp trên row **tối đa 1–2 hiện trực tiếp**, phần còn lại ở menu chi tiết. Ngoại lệ có lý do nghiệp vụ. |
| Component semantics | 100% nhóm chuyển nội dung dùng tabs; lựa chọn 2–4 giá trị dùng segmented/radio; route navigation dùng link; submit dùng button. |
| Discoverability | Không mất đường đến chức năng hoặc làm tăng đáng kể số bước với nghiệp vụ phổ biến; test tối thiểu với tạo giao dịch, xem ví, lọc, xuất báo cáo và xử lý đối soát. |
| Mobile ergonomics | Không tràn ngang từ 320 px; mục chạm >=44×44 CSS px; menu và sheet không bị bottom nav/keyboard che; có safe area. |
| Accessibility | WCAG 2.2 AA ở thành phần sửa; không icon-only vô danh; trạng thái active, focus, lỗi và destructive confirmation được đọc rõ. |
| Functional safety | Query/deeplink giữ đúng; không đổi API, số liệu ledger, giá Premium, quyền Admin hoặc hành vi scheduler do thay đổi UI. |
| Visual consistency | Light/Dark/System, Be Vietnam Pro/fallback theo theme hiện hữu, Lucide icon đồng nhất, trạng thái static rõ với hành động bấm. |

## 7. Thứ tự đề nghị và những gì cần tránh

**Làm trước:** Báo cáo → Giao dịch/Quick Sheet → Dashboard → Ví → Đồng bộ sao kê. Đây là các điểm có nhiều lựa chọn hiển thị và ảnh hưởng trải nghiệm hằng ngày. **Làm sau:** Màn quản lý khác và Admin. Không nên thay mọi nút bằng `⋯`: các nút tạo, lưu, xác nhận ghi sổ, phê duyệt và các hành động cần hiểu hậu quả vẫn phải nổi bật đúng lúc.

Không xem V4 là cơ hội viết lại tài chính hoặc kết nối ngân hàng. Trước mỗi thay đổi, kiểm tra đoạn UI có sử dụng quyền truy cập, URL parameters, tình trạng chờ đồng bộ hay lý do audit hay không. Đối với Admin, **chỉ làm việc với các hành động user có quyền**; menu ẩn không thay thế kiểm tra quyền server.

## 8. Điểm cần kiểm chứng khi triển khai

- Phần audit và theo dõi tiến độ hiện dựa trên **đọc mã nguồn và kiểm thử tự động**, chưa có phiên đăng nhập thực tế, visual baseline hay thử nghiệm người dùng; thứ tự ưu tiên có thể điều chỉnh sau V4-00.
- Hiện `report-tabs.tsx` **đã có** `role=tablist/tab/tabpanel`, điều hướng bàn phím. Trọng tâm ở đây là **thiết kế thị giác, nhất quán và trạng thái URL**, không xem nó là lỗi ARIA chưa khắc phục.
- Bộ lọc giao dịch trên mobile hiện là dialog nội trang; chế độ desktop giữ form thu gọn. Cần kiểm chứng thật tại 320–430 px và khi bàn phím ảo mở trước khi đánh dấu hoàn tất V4-02.
- Đã thử `npm run test:browser` với dev server `localhost:3002` ngày 27/10: lần thông thường bị `EACCES` khi kết nối loopback; thử qua chế độ quyền nâng cao gặp `ETIMEDOUT`. Dev server từng báo `Ready` nhưng tiến trình QA chưa kết nối được, vì vậy chưa coi đây là kiểm thử giao diện. Các file cấu hình `next-env.d.ts`/`tsconfig.json` bị Next dev tự thay đổi đã được đưa về nội dung trước lượt thử.
- `AdminSubscriptionDecision` đưa lựa chọn phê duyệt/từ chối qua bước xem lại và yêu cầu lý do. Chỉ thay đổi giao diện; chưa có bằng chứng kết thúc luồng dual approval hay kiểm tra nghiệp vụ trên database trong lượt này.
- Không coi số `<button>` trong source là lỗi tự thân: nhiều nút thuộc biểu mẫu/nhánh điều kiện không cùng xuất hiện. Dùng tiêu chí mật độ hiển thị và số bước hoàn thành tác vụ để đánh giá hiệu quả redesign.
