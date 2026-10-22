# FINOVA — UI/UX REDESIGN SPECIFICATION & IMPLEMENTATION PLAN

> **Phiên bản:** 3.0 — Mobile-first Fintech UI | **Ngày:** 20/10/2026  
> **Phạm vi:** Thiết kế lại giao diện ứng dụng Finova hiện tại, tương thích web responsive và PWA; hỗ trợ Light / Dark / System.  
> **Đối tượng sử dụng:** Product owner, UI/UX designer, frontend engineer và Codex.  
> **Trạng thái (22/10/2026):** Phần lớn UI V3 đã tích hợp vào repository; **kiểm thử public login đã PASS, UI-P5 chưa nghiệm thu hoàn tất**. Xem mục 21 để biết bằng chứng và các hạng mục còn mở.  
> **Căn cứ:** (1) Ảnh 1: Dashboard Finova hiện tại; (2) Ảnh 2–6: ảnh ứng dụng tài chính tham khảo do người dùng cung cấp; (3) `FINOVA_BRAND_GUIDELINE_V2.md`; (4) Implementation Plan và đặc tả Đồng bộ sao kê của Finova.

---

## 0. TÓM TẮT QUYẾT ĐỊNH THIẾT KẾ

**Mục tiêu duy nhất:** Nâng cấp Finova từ một dashboard web với nhiều khối trắng nhỏ sang **ứng dụng fintech chuyên nghiệp, có điểm nhấn, trực quan, dễ chạm và dễ hiểu trên điện thoại**, đồng thời giữ nguyên đúng số liệu, nghiệp vụ kế toán và hành vi dữ liệu hiện có.

### 0.1. Các quyết định đã chốt

| ID | Quyết định | Mức ưu tiên |
|---|---|---|
| UX-01 | **Mobile-first**: màn hình điện thoại là chuẩn thiết kế ưu tiên; desktop được mở rộng chứ không thu nhỏ cơ học | P0 |
| UX-02 | **Thay menu dàn ngang hiện tại bằng fixed bottom navigation 4 mục + nút thêm giao dịch trung tâm (FAB)** | P0 |
| UX-03 | Có **Light / Dark / System**, lưu tùy chọn người dùng và tránh nhấp nháy giao diện khi tải | P0 |
| UX-04 | Dashboard có **hero header xanh navy/royal blue** + card KPI có phân cấp thị giác | P0 |
| UX-05 | Dùng **logo Finova đã chốt trong Brand Guideline V2**; không vẽ lại logo, không sao chép BUFF/ảnh cá nhân từ tham chiếu | P0 |
| UX-06 | Báo cáo tương tác và “Lịch sử giao dịch” dạng timeline mobile; thao tác lọc bằng bottom sheet | P0 |
| UX-07 | **Bảo toàn nghiệp vụ**: không đổi ledger, công thức tổng hợp, tài khoản, ngày, bộ lọc, import/sync hay trạng thái backend | P0 |
| UX-08 | Không hiển thị các mục đầu tư, lãi suất, lợi nhuận, gói tài chính hoặc khuyến nghị không có dữ liệu/chức năng thật | P0 |
| UX-09 | Không dùng biểu đồ giả để tạo cảm giác dashboard có dữ liệu; trạng thái rỗng phải rõ ràng nhưng **không lặp lại** | P0 |
| UX-10 | Mục tiêu WCAG 2.2 AA, thao tác một tay, hỗ trợ bàn phím, screen reader và `prefers-reduced-motion` | P1 |

### 0.2. Tham khảo ảnh người dùng và cách chuyển hóa

| Nguồn ảnh | Điểm học hỏi | Chuyển hóa phù hợp Finova | Không sao chép |
|---|---|---|---|
| **Ảnh 1 (Finova hiện tại)** | Dữ liệu rõ; có thu/chi, tài sản ròng, biểu đồ, ví và lịch sử | Giữ thông tin chính; gộp các bộ lọc, tăng phân cấp thị giác, giảm chiều dài trang, sửa thanh menu di động | Không giữ nguyên menu sáu mục cực nhỏ, không chất quá nhiều card trắng |
| **Ảnh 2 (màn hình tài sản)** | Hero xanh đậm, vòng cơ cấu, summary nổi, card tài sản, bottom navigation | Tái thiết kế “Ví & tài khoản” với tổng số dư, cấu trúc tài sản và card từng ví | Không sao chép tên sản phẩm đầu tư/giá trị từ ảnh |
| **Ảnh 3 (danh mục tài chính)** | Danh mục dạng list/card có badge, nhóm chuyên mục rõ | Áp dụng cho danh mục giao dịch, ví, mục tiêu, ngân sách nếu đã có thật | Không tự tạo sản phẩm tài chính lãi suất định kỳ |
| **Ảnh 4 (cá nhân)** | Profile card, danh mục cài đặt lớn, dễ chạm | Tạo trang Cá nhân: Google profile, giao diện, liên kết ngân hàng, cài đặt, hỗ trợ | Không dùng ảnh đại diện, tên, thông tin định danh trong ảnh tham khảo |
| **Ảnh 5 (trang chủ)** | Gradient hero xanh, số tiền lớn, card trạng thái chồng lớp, nội dung có chiều sâu | Hero Dashboard, card số dư, dòng tiền ngắn, truy cập tác vụ nhanh | Không dựng KPI lợi nhuận không tồn tại |
| **Ảnh 6 (lịch sử)** | Nhóm giao dịch theo ngày, màu/icon rõ, thanh điều hướng thoáng | Timeline giao dịch, lọc, tìm kiếm, trạng thái đồng bộ sao kê | Không dùng nhãn “Thành công” cho dữ liệu không có trạng thái tương ứng |

### 0.3. Không nằm trong phạm vi UI redesign

- Không xây mới tính năng đầu tư hoặc liên kết ngân hàng chưa được nhà cung cấp cấp quyền.
- Không thay đổi các bảng hạch toán, đồng bộ sao kê, cách tính tài sản ròng, chi tiêu hoặc tỷ giá.
- Không lấy hình nền, logo, mascot, người dùng, tên sản phẩm hay số liệu từ ứng dụng tham chiếu để sử dụng thương mại.
- Không thay đổi luồng Google OAuth hay bảo mật chỉ để thuận tiện cho giao diện.

---

# PHẦN I — KIẾN TRÚC THÔNG TIN & RESPONSIVE NAVIGATION

## 1. PHÂN TÍCH VẤN ĐỀ GIAO DIỆN HIỆN TẠI

### 1.1. Vấn đề ưu tiên xử lý

1. **Bố cục thiếu điểm nhấn:** nền xám nhạt kết hợp nhiều card trắng có phong cách gần giống nhau; số dư quan trọng không nổi bật.
2. **Mobile nav quá nhiều điểm đến:** ảnh 1 cho thấy các nhãn “Tổng quan”, “Giao dịch”, “Ví & tài khoản”, “Danh mục”, “Ngân sách”, “Mục tiêu” trải dài ở mép dưới khiến nhãn nhỏ, bị chật/cắt và khó chạm.
3. **Bộ lọc chiếm diện tích đầu màn hình:** bộ lọc ngày, ví, danh mục hiện nằm thành card lớn, đẩy dữ liệu cốt lõi xuống dưới.
4. **Nội dung trống kéo dài:** ba biểu đồ rỗng vẫn tạo các khối cao tương đương nội dung có dữ liệu; giảm giá trị khi người dùng mới bắt đầu.
5. **KPI phân mảnh:** người dùng phải cuộn nhiều lần mới nắm được tổng tài sản, số dư, thu/chi và lịch sử.
6. **Thiếu bố cục native mobile:** khoảng cách, card, tiêu đề và tác vụ của web được xếp dọc nguyên bản, thiếu cấu trúc app-like.
7. **Chưa có dark mode đồng bộ** cho navbar, form, chart, modal, popover, màn hình xác thực và loading.

### 1.2. Thứ tự ưu tiên nội dung trong 1 màn hình đầu mobile

1. Brand / lời chào ngắn / thông báo / avatar.
2. **Số dư khả dụng hoặc tài sản ròng** (theo lựa chọn sản phẩm) với tên chỉ tiêu chính xác.
3. Thu nhập, chi tiêu, thu–chi ròng trong kỳ, không tráo với số dư mọi thời điểm.
4. Tác vụ nhanh: Thêm thu, Thêm chi, Chuyển tiền (chỉ khi được hỗ trợ).
5. Bảng tổng hợp xu hướng hoặc giao dịch gần nhất.
6. Phân tích chi tiết và các module thứ cấp bên dưới.

## 2. NAVIGATION: MOBILE / TABLET / DESKTOP

### 2.1. Mobile (< 768 px): Bottom Navigation

**Chính thức 5 ô chức năng, trong đó ô trung tâm là FAB, chỉ có 4 đích điều hướng:**

| Thứ tự | Nhãn | Icon gợi ý (Lucide) | Điều hướng / hành động |
|---:|---|---|---|
| 1 | **Tổng quan** | `house` | Mở Dashboard |
| 2 | **Giao dịch** | `receipt-text` | Mở lịch sử thu chi |
| 3 | **`+`** | `plus` | Mở **Quick Transaction Sheet** (không điều hướng mất trạng thái) |
| 4 | **Ví** | `wallet-cards` | Mở Ví & tài khoản |
| 5 | **Cá nhân** | `user-round` | Mở Cá nhân & Cài đặt |

**Báo cáo, Ngân sách, Mục tiêu, Danh mục, Đồng bộ sao kê** vẫn phải truy cập được bằng các đường đi rõ ràng: Dashboard → “Xem báo cáo” / “Ngân sách”; Ví → “Đồng bộ ngân hàng”; Cá nhân → “Quản lý danh mục” / “Mục tiêu” / “Cài đặt”; hoặc nút “Tất cả tính năng” xuất hiện trong khu vực tác vụ nhanh. Không “giấu” một phân hệ chỉ vì nó không nằm trong bottom bar.

**Không có horizontal scroll trong Bottom Navigation.** Nếu ngôn ngữ đổi hoặc viewport 320 px, vẫn đủ 5 ô; FAB độc lập, các nhãn nhỏ phải đọc được.

#### Wireframe mobile (min-width 320 px)

```text
┌──────────────────────────────────┐
│ [F] Finova          🔔       ◉   │
│                                      <- status/topbar
│  TỔNG QUAN TÀI CHÍNH             │
│  Số dư khả dụng        👁         │
│  18.250.000 ₫                     │
│  ┌─────────┬────────────┐          │
│  │Tiền vào │ Tiền ra    │          │
│  │ ... ₫   │  ... ₫     │          │
│  └─────────┴────────────┘          │
│  [Thêm thu] [Thêm chi] [...]      │
│                                  │
│  [Kỳ: Tháng này  ▾] [Lọc ▾]     │
│                                  │
│  Dòng tiền      Xem báo cáo →    │
│  ┌─────────────────────────────┐  │
│  │     CHART / EMPTY STATE    │  │
│  └─────────────────────────────┘  │
│                                  │
│  Giao dịch gần đây    Xem tất cả │
│  ...                             │
├──────────────────────────────────┤
│ Tổng quan Giao dịch  (+)  Ví  Cá nhân │
└──────────────────────────────────┘
```

> Đây là wireframe thông tin, không phải bản mô phỏng pixel-perfect. Nội dung sử dụng giá trị placeholder trong tài liệu **chỉ để giải thích bố cục**; không seed vào ứng dụng production.

#### Ràng buộc kỹ thuật Bottom Navigation

- `position: fixed; inset-inline: 0; bottom: 0; z-index` có quản lý; `height` phần nội dung cơ sở **68–72 px**; cộng `env(safe-area-inset-bottom)` (iPhone có home indicator).
- Card, chart và dữ liệu cuối trang phải có `padding-bottom` đủ: **chiều cao nav + safe area + 16 px**; không che nút cuối.
- Mỗi tab chiếm `minmax(0, 1fr)` hoặc flex 1; icon 20–22 px, label 10.5–12 px, `min-width: 0`; tên không wrap 2 dòng.
- FAB hình tròn 52–56 px, nổi khoảng 14–20 px trên mặt thanh nav; nút có accessible name “Thêm giao dịch”, không dùng ký tự `+` làm nhãn truy cập duy nhất.
- Mục đang chọn có icon + label màu brand, indicator nền nhạt; các mục còn lại giữ tương phản; label của FAB hiển thị bằng `aria-label`/tooltip hoặc tên hành động bên sheet.
- Điều hướng menu theo route; trạng thái active được xác định từ pathname, không bằng JS state dễ mất sau reload.
- Khi bàn phím di động mở, bottom bar có thể ẩn tùy màn hình nhập liệu; **form submit CTA luôn ở vị trí có thể tiếp cận**, không bị bàn phím che.
- Bật `viewport-fit=cover` trong PWA nếu dùng CSS safe area; kiểm thử iOS Safari và Android Chrome.
- **Không dùng CSS `width: 100vw` cho khung nội dung cuộn** khi gây tràn ngang bởi scrollbar; thiết kế `width: 100%; min-width: 0`.

### 2.2. Tablet (768–1023 px)

- Dùng navigation rail trái rộng 64–76 px **hoặc** sidebar gập; không dùng bottom navigation màn hình mobile kéo giãn sang tablet.
- Tooltip cho các icon không có nhãn; topbar giữ breadcrumb và ô tìm kiếm compact.
- KPI chia 2–3 cột; biểu đồ 2 cột khi đủ diện tích; danh sách giao dịch giữ độ rộng đọc tốt.

### 2.3. Desktop (>= 1024 px)

- Sidebar cố định 248–272 px, có nhóm chức năng: Tổng quan; Giao dịch; Ví & tài khoản; Báo cáo; Ngân sách; Mục tiêu; Danh mục; Đồng bộ ngân hàng (nếu bật); Cá nhân/Cài đặt.
- Nội dung chính rộng tối đa khoảng 1440 px; không trải KPI quá xa trên màn hình ultra-wide; khoảng đệm 24–32 px.
- Topbar desktop gồm workspace, công cụ lọc/tìm kiếm, thông báo, theme selector, menu profile.
- **Chuyển desktop → mobile không tạo hai nav cùng nhìn thấy**, không để menu ngoài viewport hoặc xuất hiện horizontal scrollbar.

### 2.4. Route mapping / Information Architecture

> Lấy route thực tế từ repository trước khi sửa; các đường dẫn dưới đây là đề xuất, không được đổi URL công khai nếu chưa tạo redirect/route alias.

| Tính năng | Route tham chiếu | Entry mobile | Entry desktop |
|---|---|---|---|
| Dashboard | `/dashboard` | Bottom “Tổng quan” | Sidebar |
| Lịch sử thu chi | `/transactions` | Bottom “Giao dịch” | Sidebar |
| Tạo giao dịch | `/transactions/new` hoặc sheet | FAB | Nút “Thêm giao dịch” |
| Ví & tài khoản | `/wallets` | Bottom “Ví” | Sidebar |
| Báo cáo | `/reports` | CTA Dashboard / Tất cả tính năng | Sidebar |
| Ngân sách | `/budgets` | Card ngân sách / Tất cả tính năng | Sidebar |
| Mục tiêu | `/goals` | Cá nhân / Tất cả tính năng | Sidebar |
| Danh mục | `/categories` | Cá nhân / Tất cả tính năng | Sidebar |
| Đồng bộ sao kê | `/bank-connections` | Ví → Đồng bộ ngân hàng | Sidebar / Ví |
| Cá nhân | `/settings` | Bottom “Cá nhân” | Topbar / Sidebar |

---

# PHẦN II — FINOVA VISUAL DESIGN SYSTEM 3.0

## 3. HƯỚNG MỸ THUẬT

### 3.1. Tuyên ngôn thiết kế

**Modern, confident, readable fintech.** Tạo cảm giác sản phẩm tài chính đáng tin cậy thông qua **hero navy/royal gradient**, số liệu nổi bật, card có chiều sâu, khoảng trắng hợp lý và typography mạnh. Không làm tất cả card sáng trắng phẳng; cũng không tạo giao diện neon/crypto hoặc phô trương hiệu ứng.

### 3.2. Quy tắc sử dụng nhận diện đã chốt

- Logo **đã phê duyệt**: dùng tài nguyên thực từ `FINOVA_BRAND_GUIDELINE_V2/assets/finova-primary-logo-on-white.png`; biểu tượng riêng từ `finova-original-symbol-on-white.png`.
- **Không tạo lại icon F mới**, không trích icon của ứng dụng tham chiếu. Trên hero tối nếu dùng logo ngang navy phải đặt trong nền trắng đủ rộng; nếu không, dùng tên chữ UI “Finova” riêng và app icon chính thức trong tile sáng.
- Primary: `#1E5EFF`; Deep Navy: `#0B1F4A`; Aqua Teal: `#18C5C2`; slogan: “Rõ tiền, vững tương lai”.
- Font: Plus Jakarta Sans; fallback Be Vietnam Pro; luôn xác nhận tiếng Việt không lỗi dấu.
- Brand gradient **dành cho card hero, icon hoạt động, minh họa**; không áp gradient cho toàn bộ card khiến dữ liệu khó đọc.

## 4. DESIGN TOKENS: LIGHT MODE & DARK MODE

### 4.1. Light Mode — không còn “trắng toàn màn hình”

| Token | Giá trị đề xuất | Vai trò |
|---|---|---|
| `--bg-app` | `#F1F5FB` | Nền ứng dụng ánh xanh nhạt |
| `--surface` | `#FFFFFF` | Card và sheet chính |
| `--surface-alt` | `#EAF1FB` | Secondary panel, chip |
| `--surface-raised` | `#FFFFFF` | Modal/popover, shadow rõ hơn |
| `--text-main` | `#101B35` | Chữ/giá trị quan trọng |
| `--text-subtle` | `#52627D` | Mô tả, nhãn phụ |
| `--border-soft` | `#DCE5F2` | Đường biên tinh tế |
| `--brand` | `#1E5EFF` | Điều hướng đang chọn / CTA |
| `--brand-strong` | `#154CD4` | Trạng thái đậm |
| `--brand-navy` | `#0B1F4A` | Hero/navy, wordmark |
| `--teal` | `#18C5C2` | Trang trí biểu tượng/chart, không dùng làm body text trên trắng |
| `--teal-text` | `#087D79` | Text teal có tương phản tốt trên trắng |
| `--income` | `#047857` | Thu nhập / tiền vào |
| `--expense` | `#C2410C` | Chi tiêu / tiền ra |
| `--warning` | `#B54708` | Cảnh báo ngân sách |
| `--danger` | `#B42318` | Lỗi / nguy cơ |
| `--chart-grid` | `#DCE5F2` | Lưới biểu đồ nhẹ |

**Hero gradient Light:** `linear-gradient(125deg, #0B1F4A 0%, #123E91 52%, #1E5EFF 100%)`.

### 4.2. Dark Mode — xanh navy chuyên nghiệp, tránh đen tuyệt đối

| Token | Giá trị đề xuất | Vai trò |
|---|---|---|
| `--bg-app` | `#071326` | Nền đêm |
| `--surface` | `#102341` | Card nền tối |
| `--surface-alt` | `#183252` | Chip, panel phụ |
| `--surface-raised` | `#1D3859` | Popover, dialog |
| `--text-main` | `#F8FAFC` | Text chính |
| `--text-subtle` | `#CBD5E1` | Text phụ |
| `--border-soft` | `#345273` | Biên card |
| `--brand` | `#7FA5FF` | Focus/links trên nền tối |
| `--brand-strong` | `#1E5EFF` | Nút chính có chữ trắng |
| `--brand-navy` | `#0B1F4A` | Gradient hero |
| `--teal` | `#2DD4BF` | Accent |
| `--teal-text` | `#5EEAD4` | Text teal |
| `--income` | `#4ADE80` | Dòng thu |
| `--expense` | `#FDBA74` | Dòng chi |
| `--warning` | `#FBBF24` | Chú ý |
| `--danger` | `#FDA4AF` | Lỗi |
| `--chart-grid` | `#294565` | Lưới biểu đồ |

**Hero gradient Dark:** `linear-gradient(135deg, #102B61 0%, #0B1F4A 58%, #1746A2 100%)`.

**Lưu ý tương phản:** Đây là giá trị seed cho UI, cần chạy kiểm thử tương phản thực tế ở từng thành phần. Một màu đủ tương phản trên `--bg-app` chưa chắc đủ trên `--surface-alt`. Không dùng `#18C5C2` làm text nhỏ trên nền trắng.

### 4.3. Semantic state và biểu đồ

- Thu nhập = xanh lá + mũi tên xuống ví / dấu `+` / label “Tiền vào”; Chi tiêu = cam đỏ + mũi tên ra ví / dấu `−` / label “Tiền ra”.
- **Không tô đỏ tất cả khoản tiền ra như lỗi.** Chi tiêu là hoạt động bình thường; đỏ đậm chỉ cho thất bại/sự cố.
- Chuyển tiền = xanh brand + icon 2 mũi tên, **không tính vào tổng thu nhập hoặc chi tiêu**.
- Giao dịch ngân hàng tự đồng bộ = icon ngân hàng + badge “Đã đồng bộ”; giao dịch đang xử lý có badge “Đang đối soát” nếu backend hỗ trợ đúng trạng thái.
- Chart palette phải giữ cùng ngữ nghĩa khi chuyển theme. Cần thêm legend/tooltip và text cho trường hợp không phân biệt được màu.
- Chart không hiển thị dữ liệu mẫu trong trạng thái thật; Chart skeleton chỉ dùng khi đang tải.

### 4.4. Shape, elevation, spacing

| Thành phần | Giá trị |
|---|---|
| Card radius | 18–22 px |
| Hero radius | 24 px (mobile 20–24 px) |
| Input/button radius | 12–14 px |
| Sheet/dialog radius | 22–28 px |
| Floating action button | 56 px hình tròn |
| Page horizontal padding mobile | 16 px (có thể 12 px ở 320 px) |
| Gutter card mobile | 12–16 px |
| Section gap mobile | 20–24 px |
| Desktop gap | 20–24 px |
| 44 px | Mức tối thiểu mục tiêu cho vùng chạm chính |
| Light card shadow | `0 8px 28px rgba(11,31,74,.07)` |
| Hero shadow | `0 18px 35px rgba(12,49,120,.18)` |
| Motion | 150–220 ms, easing mềm |

Shadow Dark Mode: tối giản, ưu tiên border/độ sáng bề mặt. Tránh lạm dụng đổ bóng làm mờ chữ số.

### 4.5. Typography & định dạng số

| Vai trò | Mobile | Desktop | Weight |
|---|---|---|---|
| Số dư hero | 30–36 px | 40–48 px | 700–800 |
| KPI trong card | 18–22 px | 22–28 px | 700 |
| Tiêu đề trang | 22–26 px | 28–34 px | 700 |
| Section title | 16–18 px | 18–22 px | 700 |
| Body | 14–16 px | 14–16 px | 400–500 |
| Caption | 12–13 px | 12–13 px | 400–500 |
| Bottom nav label | 10.5–12 px | N/A | 500–600 |

- Số tiền dùng `Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })` hoặc formatter hiện hành đã được kiểm thử. Dùng `font-variant-numeric: tabular-nums`.
- Không wrap tách số và ký hiệu `₫` thành hai dòng. Nếu thiếu chiều rộng: tối ưu container/size có giới hạn; không cắt số tiền không có cách xem đầy đủ.
- Trên mobile hiển thị số âm/dương kèm dấu và label; không làm tròn tạo sai lệch ở bảng sao kê.
- Số dư thời điểm và thu/chi của **kỳ lọc** là hai ngữ nghĩa khác nhau; nhãn phải thể hiện rõ, không để bộ lọc tháng biến thành số dư “tại hôm nay” một cách gây hiểu lầm.

## 5. LIGHT / DARK / SYSTEM BEHAVIOR

### 5.1. Quy tắc hành vi

1. Ba lựa chọn: **Sáng — Tối — Theo hệ thống**.
2. Mặc định: `system` nếu không có cấu hình người dùng; SSR phải khớp giao diện sau hydration, tránh FOUC.
3. Khi bấm chuyển theme, cập nhật toàn bộ layout: background, sidebar/bottom nav, form, modal, chart, tooltip, toast, calendar và skeleton.
4. Lưu preference trên client (ví dụ `localStorage`) hoặc hồ sơ tài khoản nếu hệ thống có bảng preferences; không cần gửi lên server khi không có yêu cầu.
5. Khi đang ở `system`, lắng nghe sự thay đổi OS và cập nhật ngay.
6. Giữ màu logo gốc; **không áp CSS invert/hue-rotate lên asset logo**; dùng tile trắng cho logo ngang trên dark surfaces.
7. Sử dụng biến CSS từ design tokens, không hard-code `bg-white text-black` rải rác.

### 5.2. Đề xuất công nghệ

- Với Next.js App Router: cân nhắc `next-themes` để điều khiển `class="dark"` và chống flicker; theme picker tích hợp trong Cá nhân và topbar desktop.
- Với Tailwind/shadcn đang có: map semantic CSS variables vào Tailwind tokens; **không chạy song song hai bộ token khác nhau**.
- Nếu dự án không dùng `next-themes`, lập giải pháp tương đương đảm bảo SSR/hydration trước khi rollout.

---

# PHẦN III — THIẾT KẾ CHI TIẾT CÁC MÀN HÌNH

## 6. MÀN HÌNH FIN-UI-01: TỔNG QUAN (DASHBOARD)

### 6.1. Mobile composition — ưu tiên tầm nhìn đầu tiên

**A. Compact App Header** (48–56 px, có thể sticky khi cuộn): symbol/Finova, notification (nếu thật), avatar Google, theme switch qua Profile hoặc dropdown. Không thêm breadcrumb “Không gian làm việc / Cá nhân” dài ở mobile; chỉ giữ trong desktop khi cần.

**B. Hero tài chính** (gradient navy → royal blue, radius 24 px):

- Greeting ngắn “Tổng quan tài chính” hoặc “Chào bạn!” không cần nêu tên đầy đủ trên header nếu không cần.
- Primary: **Số dư khả dụng** hoặc **Tài sản ròng** (chọn một mặc định, cho phép xem chi tiết). Nếu tài sản ròng tính cả nợ/đầu tư, **không được gán là số dư có thể chi tiêu**.
- Eye icon hiện/ẩn số tiền (privacy mode); tính năng chỉ ẩn hiển thị, không thay dữ liệu/DOM accessibility trái ý muốn.
- Sub-row 2 cột: Thu nhập / Chi tiêu theo kỳ; chip dòng tiền thuần (khi muốn) có icon.
- Nếu trạng thái chưa có giao dịch: hiển thị **0 ₫ là số thực**, không vẽ trend tăng/giảm giả.
- Hero không cao quá mức; target hiển thị đoạn mở đầu của section tiếp theo tại viewport phổ biến 390×844.

**C. Action row**: “Thêm thu”, “Thêm chi”, “Chuyển tiền” (hoặc “Tất cả tính năng”). Mobile dùng 3 nút icon có nhãn, riêng FAB toàn cục vẫn là kênh chính; tránh 2 nút `+` lớn cạnh nhau.

**D. Period filter**: một chip “Tháng 10/2026 ▾” + nút `sliders-horizontal` lọc mở **bottom sheet** (thay card 4 input chiếm chiều cao như ảnh 1). Chọn trước các mốc: Tháng này, Tháng trước, 3 tháng, Năm nay, Tùy chỉnh; có lọc ví và danh mục khi áp dụng.

**E. Sơ đồ báo cáo**: card “Dòng tiền thu – chi” với chart 7 ngày/12 tuần/tháng tùy kỳ; ở mobile chỉ hiện một chart chính tại thời điểm; “Xem báo cáo →” dẫn sang report screen; tap vào điểm dữ liệu để mở giao dịch lọc theo ngày.

**F. Quick Insights**: 2–3 mini card như “Ngân sách đang dùng”, “Danh mục chi lớn nhất”, “Mục tiêu gần đạt” **chỉ khi phân hệ và dữ liệu thật tồn tại**.

**G. Ví nổi bật**: 1–3 wallet list rows, tổng số dư và CTA “Xem tất cả”; badge “Đồng bộ ngân hàng” nếu connection đã liên kết thật.

**H. Giao dịch gần đây**: chỉ 3–5 giao dịch; nhóm theo ngày; `Xem tất cả`; phát sinh hôm nay/tại kỳ lọc theo quy tắc rõ ràng.

**I. Báo cáo/chuyên sâu**: chỉ hiển thị thêm nếu người dùng chủ động mở “Xem báo cáo”; không kéo một màn mobile thành nhiều chục card giống hệt nhau.

### 6.2. Empty / first-use mode — sửa lỗi ảnh 1

Trường hợp có một ví với số dư đầu kỳ nhưng **chưa phát sinh giao dịch**:

- Hiển thị số dư thực ở hero và card Ví.
- Không tạo ba biểu đồ đều “Chưa có số liệu” chiếm chiều cao lớn.
- Thay khối biểu đồ chính bằng **1 onboarding action card**: “Chưa có giao dịch trong kỳ” + “Thêm giao dịch đầu tiên” + “Nhập sao kê” nếu có chức năng.
- Những khối khác có thể ẩn hoặc compact dưới “Khám phá báo cáo”; để tổng quan vẫn có khoảng thở và không trông như trang lỗi.
- Nếu có giao dịch nhưng không thuộc bộ lọc, hiển thị “Không có giao dịch trong khoảng thời gian đã chọn”, gợi ý **Đổi khoảng thời gian**; không nói “Bạn chưa có giao dịch”.
- Không có dữ liệu thật ≠ đang tải ≠ backend lỗi: sử dụng 3 giao diện trạng thái tách biệt.

### 6.3. Desktop Dashboard

- Sidebar cố định; hàng trên: hero chiếm 8/12 grid, insight panel 4/12; dưới đó hai card chart + phân loại, sau đó lịch sử + số dư ví.
- Bộ lọc desktop compact nằm ngang/toolbar, có sticky option khi scroll sâu.
- Grid không được tự động ép chart xuống quá hẹp; chart cần tối thiểu 300 px vùng vẽ nếu dạng phức tạp.

### 6.4. Acceptance criteria Dashboard

- [x] **UI-303 — triển khai mã nguồn:** bộ lọc mobile mở thành bottom sheet có backdrop, nút đóng, Escape, focus trap/restore, scroll lock; chọn nhanh Tháng này/Tháng trước/3 tháng/Năm nay theo lịch Việt Nam và giới hạn kỳ backend. Desktop giữ form ngang. Unit test 2 trường hợp PASS; mã E2E read-only đã bổ sung.
- [ ] **UI-303 — nghiệm thu trình duyệt sau đăng nhập:** xác nhận bottom sheet tại 320/390/430 px, Light/Dark, bàn phím và dữ liệu kỳ thật; chưa có phiên Google QA hợp lệ.
- [ ] Người dùng thấy chỉ tiêu tiền quan trọng, thu và chi mà không phải cuộn quá nhiều trên thiết bị 390×844.
- [x] Trường hợp chưa có thu chi trong kỳ chỉ có một empty state kèm hành động đổi kỳ/thêm giao dịch/nhập sao kê, không có ba biểu đồ rỗng; đã xác nhận bằng 4 SSR regression cases (UI-305). Visual QA sau đăng nhập vẫn mở riêng.
- [ ] Bộ lọc mobile chỉ dùng 1–2 chip; mở bottom sheet khi cần.
- [ ] Nhãn “Số dư khả dụng”/“Tài sản ròng” phản ánh đúng công thức backend, không lẫn nhau.
- [ ] Thay kỳ lọc **không làm mất ví dụ số dư thực tế** hoặc tính sai tổng thu–chi.

## 7. FIN-UI-02: LỊCH SỬ GIAO DỊCH (MOBILE FIRST)

### 7.1. Bố cục

- App header: **Lịch sử giao dịch** + search icon + filter icon.
- Segmented control: “Tất cả” | “Tiền vào” | “Tiền ra” | “Chuyển tiền” (có thể dùng horizontal scroll **bên trong segmented control** nếu không đủ, nhưng **không áp dụng cho bottom nav**; ưu tiên 2 hàng/chip nếu accessibility cần).
- Toolbar chip thời gian “Tháng này” và “Ví: Tất cả”; bottom sheet chọn bộ lọc nâng cao.
- Group rows theo ngày; sticky group headers tùy nền tảng, tổng tiền vào/ra theo ngày khi có cơ sở dữ liệu.
- Mỗi transaction: category icon, tên danh mục hoặc người nhận, mô tả/sao kê ngắn, thời gian, amount phải, trạng thái nhập tay/đồng bộ nếu quan trọng.
- Row có pressed/hover/focus state, click mở **transaction details sheet** hoặc route; không dùng modal nhỏ khó thao tác.
- Date picker hỗ trợ custom range, lịch Việt Nam, timezone backend như hiện có.

### 7.2. Cách thể hiện tiền

| Loại | Màu ngữ nghĩa | Cách hiển thị |
|---|---|---|
| Tiền vào | Income green | `+1.200.000 ₫` |
| Tiền ra | Expense orange | `−250.000 ₫` |
| Chuyển giữa ví | Brand blue | `500.000 ₫ · Chuyển ví` (hoặc cặp debit/credit theo model đang có) |
| Giao dịch chờ đối soát | Neutral + badge | Badge “Cần xác nhận”, không tự cộng nhiều lần |
| Hoàn tiền | Theo nghiệp vụ đã phân loại | “Hoàn tiền” + liên kết đến giao dịch gốc nếu có |

Đối với sao kê tự động, hiển thị trạng thái “Đã đồng bộ” khi dữ liệu có source verified; không mặc định mọi record là “Thành công”.

### 7.3. Tương tác

- Long press (nếu có) không được là cách duy nhất để thao tác; vẫn có menu ba chấm.
- Swipe action tùy chọn, không bắt buộc; không cho xóa tức thì không xác nhận.
- Tìm kiếm debounce hợp lý; tìm tên/danh mục/số tiền nhưng **không đưa dữ liệu nhạy cảm ra URL công khai**.
- Pagination/infinite scroll được xử lý có thể truy cập; giữ vị trí scroll khi quay lại detail.
- Khi đổi theme, chart/badge và sheet giữ semantic màu ổn định.

## 8. FIN-UI-03: VÍ & TÀI KHOẢN / TÀI SẢN

### 8.1. Bố cục tham khảo ảnh 2

- Header gradient navy: “Ví & tài khoản”, **Tổng số dư ví** và icon eye-hide.
- Donut nhỏ thể hiện phân bổ theo ví chỉ khi **tối thiểu hai ví với số dư dương hợp lệ**; nếu chỉ một ví, dùng thanh chiếm tỷ trọng/summary compact, không ép donut trắng vô nghĩa.
- Card danh sách ví: tên ví, loại (tiền mặt/ngân hàng/điện tử...), masked account nếu có, số dư, tình trạng đồng bộ + thời gian cập nhật (nếu backend cung cấp).
- “Thêm ví”, “Chuyển tiền”, “Kết nối ngân hàng” là action nổi bật nhưng không chen chúc; action nào chưa triển khai phải ẩn/ghi trạng thái tính năng sắp có, không dẫn đến trang lỗi.
- Tài sản ròng và các khoản nợ phải trả ở summary **tách biệt số dư ví**; chú thích cách tính.
- Chi tiết ví: chart biến động số dư (nếu có snapshots), giao dịch theo ví, đối soát.

### 8.2. Đồng bộ sao kê ngân hàng — giao diện tích hợp

- CTA **Đồng bộ sao kê** ở trang Ví; menu phụ trong “Cá nhân / Kết nối ngân hàng”.
- Trạng thái: `Chưa kết nối`, `Đang đồng bộ`, `Đã cập nhật lúc ...`, `Cần kết nối lại`, `Đối soát cần xử lý`.
- Screen “Quản lý ngân hàng”: danh sách tài khoản đã kết nối, loại cơ chế kết nối/nguồn dữ liệu, lần đồng bộ cuối, CTA dừng kết nối.
- Import CSV/Excel phải phân biệt rõ với realtime webhook/API; **không nói “đồng bộ thời gian thực”** nếu chỉ nhập file hoặc polling chậm.
- Layout phải khớp đặc tả `FINOVA_DONG_BO_SAO_KE_NGAN_HANG_DESIGN.md`, không thay logic dedup/ledger/consent.

## 9. FIN-UI-04: BÁO CÁO VÀ BIỂU ĐỒ TÀI CHÍNH

### 9.1. Mobile Reports landing

- Header “Báo cáo tài chính”, chip kỳ và lọc theo ví; không dùng card lọc 4 input thường trực.
- Khu tóm tắt: thu nhập, chi tiêu, thu–chi ròng, biến động kỳ trước (chỉ khi có đủ dữ liệu và backend có công thức xác định).
- Biểu đồ chính: **Thu – chi theo thời gian** (bar/area với legend); cho phép chuyển tuần/tháng/năm tùy kỳ.
- Biểu đồ thứ cấp: **Cơ cấu chi tiêu** bằng donut + **bảng danh mục sắp theo giá trị**, có thể chạm từng danh mục để drill-down.
- Xu hướng “Thu – chi ròng theo ngày” dạng đường/bar nhỏ, chỉ hiển thị khi có dữ liệu.
- “Xuất báo cáo” qua action sheet khi API export đã có, có feedback tải file.

### 9.2. Chart standards

- Tooltip hỗ trợ tap, keyboard focus và screen reader summary; nhãn đơn vị `₫` hoặc `triệu ₫` ghi rõ.
- Responsive chart container: không cần cuộn ngang cả trang, có thể cuộn biểu đồ riêng nếu số nhãn quá nhiều; dùng `ResponsiveContainer` hoặc tương đương và chống `width: 0` trên tab ẩn.
- Donut không dựa vào màu duy nhất; đi kèm legend và bảng chi tiết có icon/giá trị/tỷ lệ.
- Dữ liệu âm/zero cho tỷ lệ cần quy tắc rõ; không chia cho 0 hoặc tạo % vô nghĩa.
- Không đánh đồng tài sản ròng với dòng tiền ròng, hay đầu tư với ví ngân hàng.
- Empty state chỉ 1 block/section, không hiển thị chart skeleton như đã có dữ liệu.

## 10. FIN-UI-05: CÁ NHÂN & CÀI ĐẶT

### 10.1. Profile card

- Ảnh đại diện từ Google nếu user đã cho phép và có URL hợp lệ; fallback avatar chữ cái. Không lấy ảnh cá nhân từ screenshot tham khảo.
- Tên và email được xử lý riêng; che email nếu đang ở chế độ riêng tư trên màn hình chung.
- Trạng thái tài khoản Google “Đã đăng nhập” chỉ là auth status; **không đồng nghĩa với xác minh ngân hàng/KYC**.

### 10.2. Menu nhóm chức năng

| Nhóm | Menu |
|---|---|
| Tài chính | Quản lý ví; Đồng bộ ngân hàng; Danh mục; Ngân sách; Mục tiêu |
| Giao diện | **Chế độ hiển thị: Sáng / Tối / Theo hệ thống**; ngôn ngữ và tiền tệ khi hỗ trợ |
| Bảo mật | Quyền riêng tư / Ẩn số dư; phiên đăng nhập; quản lý dữ liệu |
| Hỗ trợ | Hướng dẫn; Phản hồi; Chính sách bảo mật; Phiên bản |
| Tài khoản | Đăng xuất, xác nhận nếu có tác vụ chưa lưu |

- List rows height tối thiểu khoảng 52–56 px, icon trên nền soft color, chevron bên phải, divider vừa phải.
- Không thêm chương trình giới thiệu nhận thưởng nếu sản phẩm chưa có chương trình thật.
- “Đồng bộ ngân hàng” cần thể hiện rõ liên kết tài khoản và quyền truy cập dữ liệu, tránh gây hiểu lầm Google Sign-in tự kết nối ngân hàng.

## 11. FIN-UI-06: FORM GIAO DỊCH & QUICK ACTION SHEET

### 11.1. FAB hành vi

Nhấn FAB trung tâm mở **bottom sheet** (mobile) gồm:

1. **Ghi thu nhập** — màu xanh thu, icon `arrow-down-left`.
2. **Ghi chi tiêu** — màu cam chi, icon `arrow-up-right`.
3. **Chuyển tiền giữa ví** — màu xanh blue, icon `arrow-left-right`.
4. Nếu backend có hỗ trợ: “Nhập sao kê” / “Đồng bộ ngân hàng” trong menu phụ, **không đặt ngang hàng thao tác thường xuyên khi làm sheet quá dài**.

Desktop: dropdown / modal / route phù hợp. Sheet phải có nút đóng, ESC, focus trap, swipe-down nếu an toàn, giữ dữ liệu form nếu đóng nhầm (confirm khi có thay đổi).

### 11.2. Form mobile

- Step đơn giản: loại giao dịch → số tiền (numeric keypad) → ví → danh mục → ngày → ghi chú.
- Có nút Lưu sticky trên/giữa vùng dễ nhìn và tránh bị keyboard che; `safe-area`.
- Số tiền font lớn, format rõ; thực hiện validation theo rule backend, không dùng float để tính tiền.
- Phát sinh từ sao kê: nếu sửa danh mục/ghi chú thì không sửa chứng từ ngân hàng gốc.
- Các trường tùy chọn nằm trong “Thêm chi tiết” để giảm tải trên mobile.

---

# PHẦN IV — COMPONENT SPECIFICATION

## 12. COMPONENT LIBRARY ĐỀ XUẤT

| Component | Mục đích | Biến thể / trạng thái |
|---|---|---|
| `AppShell` | Điều phối responsive desktop/tablet/mobile | desktop sidebar / tablet rail / mobile bottom |
| `MobileBottomNav` | Nav cố định 4 destinations + FAB | default/active/focus/keyboard-open |
| `DesktopSidebar` | Menu dài cho web | expanded/collapsed, active/hover |
| `MobileTopbar` | Header brand/notifications/avatar | normal/sticky |
| `FinovaHeroCard` | Tóm tắt tài chính trong gradient | visible/hidden-amount/loading/error |
| `KPIStat` | KPI thu, chi, số dư, ngân sách | income/expense/neutral/warning |
| `QuickActionSheet` | Tạo nhanh thu, chi, chuyển ví | open/close/confirm-discard |
| `FilterBottomSheet` | Thời gian/ví/danh mục | apply/reset/empty |
| `FinanceChartCard` | Chart + header + drill-down | loading/empty/ready/error |
| `TransactionTimeline` | Lịch sử nhóm theo ngày | all/in/out/transfer/pending |
| `TransactionRow` | 1 khoản thu chi | manual/bank-sync/review |
| `WalletBalanceCard` | Ví, trạng thái sync, số dư | connected/disconnected/stale |
| `CategoryBreakdown` | Donut + legend + total | ready/empty |
| `ThemeSelector` | Light/Dark/System | menu/radio segmented |
| `PrivacyAmount` | Hiện/ẩn tiền | visible/masked |
| `FinanceEmptyState` | Empty state cụ thể theo ngữ cảnh | first-use/no-results/filtered |
| `FinanceErrorState` | Lỗi API và thử lại | retry/contact support |
| `LoadingSkeleton` | Loading thật, không giả dữ liệu | hero/chart/list |

### 12.1. Component props hợp đồng tham chiếu

```ts
export type ThemeChoice = 'light' | 'dark' | 'system';
export type TransactionKind = 'income' | 'expense' | 'transfer';
export type DataState = 'loading' | 'ready' | 'empty' | 'error';

export interface HeroStat {
  label: string;            // "Số dư khả dụng" hoặc "Tài sản ròng"
  minorUnitValue: bigint;   // Ví dụ: lưu integer VND; tích hợp theo money model hiện có
  currency: 'VND' | string;
  asOf?: string;            // Thời điểm số dư nếu backend có dữ liệu
  isMasked: boolean;
}

export interface NavigationItem {
  id: string;
  label: string;
  href: string;
  icon: string;             // map sang bộ Lucide đang dùng
  isEnabled: boolean;
}
```

> Hợp đồng trên chỉ là đặc tả **UI layer**, không phải yêu cầu đổi money type trong database. Nếu dự án đang dùng decimal/string thì giữ nguyên và adapter định dạng tại UI cho an toàn.

## 13. BIẾN CSS & COMPONENT STYLING

- Sử dụng các token semantic duy nhất, không để component tự định nghĩa brand màu.
- Định nghĩa `data-theme` hoặc `.dark` nhất quán tùy kiến trúc hiện có; khi dùng thư viện theme thì tránh hai cơ chế cùng điều khiển.
- Bottom nav, header, card, chart, modal và tooltip phải đọc token chung.
- Chart colors cần được cấu hình theo theme thay vì chỉ CSS, ví dụ Recharts nhận màu từ `useTheme` + resolve CSS vars sau mount (có fallback SSR an toàn).
- Phải có `:focus-visible` rõ ràng, label cho icon-only buttons, tap targets đúng chuẩn.
- Tài nguyên CSS starter được cung cấp tại `finova-fintech-theme.css` trong bộ bàn giao, là **bản tham khảo**, không phải thay thế tự động style của repository.

---

# PHẦN V — RESPONSIVE & ACCESSIBILITY ACCEPTANCE

## 14. BREAKPOINTS, GRID VÀ CHỈ TIÊU THIẾT KẾ

| Chiều rộng | Chiến lược | KPI grid | Navigation |
|---|---|---:|---|
| 320–359 px | Mobile nhỏ, nội dung ưu tiên; hero số không bị đứt | 2 cột khi đủ, có thể 1 cột | Bottom 4 tab + FAB |
| 360–430 px | Phone phổ biến | 2 cột | Bottom 4 tab + FAB |
| 431–767 px | Phone lớn | 2 cột, chart đơn | Bottom 4 tab + FAB |
| 768–1023 px | Tablet | 2–3 cột | Collapsed rail |
| 1024–1439 px | Laptop | 4 KPI + chart 2 cột | Sidebar |
| >= 1440 px | Desktop lớn | Grid 12 cột, content max 1440 | Sidebar |

### 14.1. Chống tràn ngang

```css
html, body { max-width: 100%; }
/* Chỉ dùng overflow-x: clip ở app shell khi cần; trước tiên sửa phần tử gây tràn. */
.app-shell, .page-content, .card-grid > * { min-width: 0; }
.finance-amount { font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
/* Tránh body có horizontal scroll chỉ vì date picker/chart/nav. */
```

- Không áp `overflow-x: hidden` bừa bãi để che lỗi; tìm nguyên nhân từ `min-width`, `100vw`, padding, long amount, chart SVG, date picker và fixed FAB.
- Safari iOS: kiểm tra vùng an toàn và bàn phím khi mở forms.
- `zoom: 200%` không được che menu/khóa thao tác và tránh nội dung buộc cuộn ngang không cần thiết.

### 14.2. Mobile tap & scroll

- Touch targets ưu tiên >= 44×44 CSS px cho hành động chính.
- Bottom nav luôn dùng được khi cuộn; thanh không đè lên last transaction.
- Chỉ dùng `overscroll-behavior` khi có lý do; đừng chặn cuộn tự nhiên của trình duyệt.
- Sheet kéo từ dưới lên phải có giới hạn độ cao và phần nội dung có thể cuộn độc lập.
- Navigation state giữ sau refresh, back/forward, direct link; đóng sheet không tự gửi request.

### 14.3. Accessibility

- Mục tiêu **WCAG 2.2 AA**: contrast text thông thường >= 4.5:1; text lớn >= 3:1; UI icon/border nhận biết >= 3:1 nơi áp dụng.
- Focus indicator rõ; tất cả chức năng có thể sử dụng bằng bàn phím trên web.
- SVG chart có tiêu đề/mô tả; bảng số liệu song hành cho những thông tin quan trọng.
- Không dùng hover làm cách duy nhất mở chi tiết; tooltip chart mobile mở bằng tap.
- Hỗ trợ `prefers-reduced-motion: reduce`: bỏ animation không thiết yếu.
- Thử dynamic type và long Vietnamese strings; hệ thống có skeleton/error/empty đúng ngữ cảnh.

---

# PHẦN VI — IMPLEMENTATION PLAN CHO CODEX

## 15. QUY TẮC TÍCH HỢP VÀO CODE HIỆN TẠI

1. **Audit repository trước:** xác định router, thư viện UI, auth, SSR, chart, theme, nav components và điểm gọi API hiện tại.
2. Chụp baseline screenshot desktop/mobile trước khi sửa; ghi lại lỗi trong ảnh 1.
3. Ưu tiên **refactor trình bày**, giữ service API/query hooks/ledger và route compatibility; thay design system theo từng bước.
4. Không tự đổi `schema.prisma`, migrations, nghiệp vụ nhập sao kê, quyền tài khoản; nếu bắt buộc phải đổi thì tách PR/ADR riêng.
5. Giữ Google Login, workspace và lựa chọn kỳ; không mất navigation hoặc dữ liệu sau refresh.
6. Duy trì hỗ trợ theme cho các component của thư viện ngoài (date picker/Popover/Dialog/Recharts/toast).
7. Không trộn demo fixtures vào production; unit test/screenshot mock phải được gắn rõ.
8. Không phát sinh yêu cầu “tài sản đầu tư” chỉ vì ảnh tham khảo có tính năng đầu tư.

## 16. WORK BREAKDOWN STRUCTURE — 6 GIAI ĐOẠN

### UI-P0 — Kiểm kê và chuẩn hóa thiết kế (ưu tiên bắt buộc)

| ID | Task | Deliverable |
|---|---|---|
| UI-001 | Xem cấu trúc project, route và state | Inventory/impact map |
| UI-002 | Chụp screenshot baseline ở 320, 375, 390, 430, 768, 1024, 1440 | Before screenshots |
| UI-003 | Kiểm tra số liệu/logic KPI hiện có | Invariant checklist |
| UI-004 | Mapping tài nguyên logo chính thức | Asset register |
| UI-005 | Thiết lập tokens semantic và font | CSS + theme integration |
| UI-006 | Viết visual acceptance checklist | Checklist phiên bản |

**Gate P0:** Biết chính xác component nào thay đổi, không có thay đổi ledger và route không chủ đích.

### UI-P1 — Responsive App Shell + Bottom Navigation (sửa lỗi ảnh 1)

| ID | Task | Deliverable |
|---|---|---|
| UI-101 | Xây `AppShell` responsive | Mobile/Tablet/Desktop shell |
| UI-102 | Bottom bar 4 tab + FAB trung tâm | `MobileBottomNav` |
| UI-103 | Nhúng `safe-area-inset-bottom`, padding nội dung cuối | No occlusion |
| UI-104 | Sidebar/rail theo breakpoints | Desktop/Tablet nav |
| UI-105 | Mapping “Tất cả tính năng” để không mất entry | Feature access menu |
| UI-106 | Keyboard & screen-reader interactions | Accessibility tests |
| UI-107 | Test no horizontal scroll và active state | Screenshot + E2E |

**Gate P1:** Không còn tình trạng menu dàn ngang cắt chữ trên 320–430 px; FAB mở được thao tác; toàn bộ chức năng cũ có đường vào.

### UI-P2 — Light/Dark/System + Branding

| ID | Task | Deliverable |
|---|---|---|
| UI-201 | Đưa design tokens vào base styles | Semantic theme vars |
| UI-202 | Bổ sung Light/Dark/System selector | Theme control |
| UI-203 | Đồng bộ form/menu/calendar/chart/tooltip | No unthemed surface |
| UI-204 | Chống FOUC/SSR hydration mismatch | Theme smoke tests |
| UI-205 | Kiểm thử logo trên nền sáng/tối theo Guideline V2 | Consistent brand |
| UI-206 | Focus/contrast/reduced motion | A11y report |

**Gate P2:** Reload trang ở dark không nháy light; logo không bị invert; không có card trắng sáng gây chói trên dark.

### UI-P3 — Dashboard 3.0 và Data States

| ID | Task | Deliverable |
|---|---|---|
| UI-301 | Redesign hero financial summary | Hero card |
| UI-302 | KPI compact, nhãn chính xác | KPI stats |
| UI-303 | Chuyển lọc ngày/ví/danh mục vào sheet | Filters |
| UI-304 | Redesign chart cards và legend | Responsive reports |
| UI-305 | Compact empty states, first-use flows | Empty state library |
| UI-306 | Ví nổi bật và lịch sử gần đây | Summary sections |
| UI-307 | Privacy eye-hide | Privacy UI state |
| UI-308 | Không thay đổi API/financial invariants | Unit/E2E reports |

**Gate P3:** Mobile dashboard có điểm nhấn mạnh, không còn ba biểu đồ trống liên tiếp, KPI đúng với dữ liệu trước refactor.

### UI-P4 — Transaction / Wallet / Reports / Profile

| ID | Task | Deliverable |
|---|---|---|
| UI-401 | Timeline giao dịch grouped by date | Transaction timeline |
| UI-402 | Transaction detail + filter sheet | Transaction UX |
| UI-403 | Wallet overview + bank sync status | Wallet UX |
| UI-404 | Reports drill-down + export affordance | Reports UX |
| UI-405 | Profile, theme setting, account management | Profile screen |
| UI-406 | FAB quick actions + mobile form | Fast entry |
| UI-407 | Kiểm thử data state mọi screen | State matrix |

**Gate P4:** Toàn bộ 5 khu vực chính nhất quán màu, nav, card và tương tác; không lộ chi tiết sản phẩm bên thứ ba.

### UI-P5 — QA, performance, release

| ID | Task | Deliverable |
|---|---|---|
| UI-501 | Visual snapshots 320→1440, Light/Dark | Screenshot matrix |
| UI-502 | Playwright navigation, create/edit/filter | E2E suite |
| UI-503 | axe/WCAG + manual screen reader review | A11y findings |
| UI-504 | Lighthouse & Core Web Vitals audit | Performance report |
| UI-505 | Device test iOS Safari & Android Chrome | Device report |
| UI-506 | Regression auth/financial data/sync UX | Regression report |
| UI-507 | So sánh before/after, sửa lỗi UX | Change log |

**Gate P5:** Chỉ coi hoàn tất khi có bằng chứng test, không chỉ báo cáo “đã đẹp”.

## 17. TEST MATRIX / VISUAL QA

| Test ID | Kịch bản | Kết quả mong đợi |
|---|---|---|
| VT-01 | Mobile 320×568, light | Không cuộn ngang, đủ 4 tab + FAB, số tiền xem được |
| VT-02 | Mobile 375×667, light | Bottom nav không cắt nhãn; section có khoảng đệm dưới |
| VT-03 | Mobile 390×844, dark | Hero rõ; card/chart/text tương phản, không nháy trắng |
| VT-04 | Mobile 430×932, light | KPI 2 cột cân đối, sheet mở/đóng tốt |
| VT-05 | Tablet 768×1024 | Sidebar rail đúng, không hiển thị trùng bottom nav |
| VT-06 | Desktop 1440×900 | Sidebar rõ, dashboard grid chuyên nghiệp |
| VT-07 | Dark system mode, đổi OS theme | UI đổi theo hệ thống khi mode `system` |
| VT-08 | Refresh while dark selected | Theme giữ nguyên, không hydration error |
| VT-09 | Login Google rồi trở lại app | Không mất route, logo và theme đúng |
| VT-10 | Ví có 1.000.000 ₫ và không có giao dịch | Hero số dư đúng; 1 empty action; không 3 chart rỗng |
| VT-11 | Bộ lọc không chứa giao dịch | Hiện no-results có CTA đổi kỳ, không nói chưa có dữ liệu tổng thể |
| VT-12 | Thu 2 khoản, chi 3 khoản trong kỳ | KPI và chart/list khớp kết quả backend |
| VT-13 | Chuyển tiền 2 ví | Không đội tổng thu nhập/chi phí hoặc tổng tài sản |
| VT-14 | Đồng bộ sao kê mới vào | Giao dịch xuất hiện đúng loại; badge nguồn phù hợp |
| VT-15 | Trùng giao dịch nhập tay + bank sync | Không xuất hiện thu/chi trùng |
| VT-16 | Lỗi API/loading/empty | Ba trạng thái phân biệt; có retry khi lỗi |
| VT-17 | Mở form và bàn phím mobile | Nút Lưu không bị bottom nav/keyboard che |
| VT-18 | VoiceOver/TalkBack/bàn phím | FAB, icons, charts có nhãn/truy cập được |
| VT-19 | Theme trên Popover/Calendar/Modal | Không có nền trắng tối ngoài ý muốn |
| VT-20 | Zoom 200% / tăng font | Nav hoạt động; card không mất nội dung quan trọng |
| VT-21 | iPhone safe area / Android gesture nav | Bottom nav không đè home indicator |
| VT-22 | Dữ liệu số lớn (> 1 tỷ) | Không tách/bị cắt số tiền; xem số đầy đủ |
| VT-23 | Offline/PWA nếu có | Không crash; báo trạng thái kết nối rõ ràng |
| VT-24 | Quay lại từ transaction details | Giữ vị trí list và bộ lọc |
| VT-25 | User bật ẩn số dư | Số tiền nhạy cảm được mask thống nhất trên hero, ví, preview |

## 18. MỤC TIÊU PHI CHỨC NĂNG (TARGETS)

| Mục tiêu | Giá trị đích | Đo bằng |
|---|---|---|
| Layout shift | CLS < 0.1 | Lighthouse/Web Vitals |
| Tốc độ hiển thị chính | LCP <= 2.5 s trên điều kiện đo xác định | Lighthouse / RUM |
| Phản hồi tương tác | INP <= 200 ms khi có dữ liệu đo thực | Web Vitals |
| Contrast / a11y | Hướng đến WCAG 2.2 AA | axe + manual |
| Không cuộn ngang trang | 0 lỗi trên viewport test | Playwright kiểm tra scrollWidth |
| Color theme consistency | Tất cả route chính | Screenshot comparisons |
| Finance regression | 0 thay đổi sai về phép tính / dòng tiền | Unit/integration tests |

*Đây là mục tiêu nghiệm thu thiết kế, không phải kết quả đã đo. Hãy ghi rõ môi trường, mạng và dữ liệu khi thực hiện performance test.*

---

# PHẦN VII — PROMPT TÍCH HỢP VÀO CODEX

## 19. MASTER PROMPT CHO CODEX — SỬ DỤNG NGUYÊN VĂN

```text
Bạn là Senior Product Designer + Senior Frontend Engineer chuyên xây dựng Financial SaaS, Mobile-first PWA và UI Design System.

Nhiệm vụ: THIẾT KẾ LẠI giao diện repository Finova đang tồn tại theo tài liệu FINOVA_UI_UX_REDESIGN_IMPLEMENTATION_PLAN.md (UI/UX v3), bảo toàn toàn bộ logic nghiệp vụ hiện hành.

Hãy đọc lần lượt:
1) FINOVA_UI_UX_REDESIGN_IMPLEMENTATION_PLAN.md (tài liệu hiện tại);
2) FINOVA_BRAND_GUIDELINE_V2.md và các tài nguyên logo V2;
3) IMPLEMENTATION_PLAN_QUAN_LY_TAI_CHINH_CA_NHAN.md;
4) FINOVA_DONG_BO_SAO_KE_NGAN_HANG_DESIGN.md nếu phân hệ bank sync đã có;
5) repository và cấu trúc route, component, database hiện tại.

YÊU CẦU BẮT BUỘC:
- Không tạo dự án mới nếu repository đã có.
- Không tự sửa business logic, Prisma schema, ledger, công thức KPI, API, OAuth, đồng bộ sao kê hoặc route hiện có chỉ để đổi UI.
- Giữ nguyên logo Finova đã được duyệt; không vẽ lại hình chữ F hay lấy biểu tượng/logo từ app tham khảo.
- Mobile-first; fix bottom nav chật: 4 destinations + center FAB trên mobile; desktop sidebar, tablet rail.
- Cung cấp Light / Dark / System mode thống nhất đến popover, calendar, chart, form và modal; không nhấp nháy khi load.
- Hero fintech gradient, KPI rõ, chart hiện đại, lịch sử timeline, ví, báo cáo và cá nhân đồng bộ.
- Không giả dữ liệu tài chính/đầu tư/sao kê; không dựng các số lãi suất, sản phẩm đầu tư hoặc tên người dùng từ ảnh mẫu.
- Khi không có giao dịch, không hiển thị nhiều chart rỗng lặp lại. Empty/loading/error phân biệt rõ.
- Bảo đảm WCAG 2.2 AA mục tiêu, safe area mobile, keyboard handling, no horizontal scroll, aria labels, responsive cho 320 đến >=1440 px.

QUY TRÌNH THỰC HIỆN:
A. Kiểm kê code hiện tại và báo cáo chính xác các route/components chịu tác động.
B. Lập plan thực thi với các phase UI-P0 -> UI-P5 và Acceptance Criteria.
C. Thực hiện từng phase, giữ app chạy được sau mỗi phase.
D. Viết hoặc cập nhật test: component, E2E Playwright, visual snapshots và regression tài chính.
E. Chạy lint/typecheck/build/test, sửa lỗi phát sinh; không tuyên bố đạt khi chưa chạy.
F. Báo cáo theo mỗi phase: các file thay đổi, ảnh before/after, các test đã chạy, lỗi còn lại, và cách kiểm tra thủ công.

Hãy bắt đầu bằng UI-P0 và UI-P1, ưu tiên sửa triệt để Bottom Navigation trên mobile trước. Sau khi hai giai đoạn qua gate, tiếp tục UI-P2 -> UI-P5. Nếu không truy cập được logo/tài nguyên hay môi trường chạy, hỏi đúng phần thiếu, tuyệt đối không thay bằng logo tự sinh.
```

## 20. CHECKLIST BÀN GIAO CHO PRODUCT OWNER

- [x] Có file Markdown đặc tả làm nguồn yêu cầu duy nhất cho phiên bản giao diện v3.
- [x] Có sơ đồ menu mobile, tablet, desktop và mapping route.
- [x] Có CSS semantic tokens light/dark và brand logo gốc.
- [ ] Có ảnh trước/sau mobile ít nhất 320, 390, 430 px; desktop 1440 px; cả Light & Dark.
- [ ] Không còn menu dàn ngang/cắt nhãn như ảnh 1.
- [ ] Có màn Dashboard với hero fintech + filter sheet + empty state hợp lý.
- [x] Có mã nguồn cho lịch sử timeline, Ví & tài khoản, Báo cáo, Cá nhân và FAB giao dịch (chờ kiểm thử thực tế sau đăng nhập).
- [ ] Dark mode hoạt động trên tất cả component, cả calendar/tooltip/chart.
- [ ] Thu chi, tài sản ròng, số dư, chuyển ví và sao kê đồng nhất với backend.
- [ ] Số liệu trong sản phẩm đều có nguồn thật; không sao chép tên/ảnh/tỷ suất từ screenshot tham khảo.
- [ ] Test responsive, a11y, visual regression, Google Login và các luồng core đã chạy.
- [ ] Không thay đổi quyền truy cập hoặc dữ liệu tài chính ngoài yêu cầu UI.

---

## 21. NHẬT KÝ TRIỂN KHAI & NGHIỆM THU (22/10/2026)

Các trạng thái dưới đây chỉ ghi nhận phạm vi đã có bằng chứng. **Có mã giao diện** không đồng nghĩa đã qua visual QA hoặc đã được phê duyệt phát hành.

| Giai đoạn | Tình trạng | Bằng chứng / công việc còn lại |
|---|---|---|
| UI-P0 | Đã có đặc tả và tokens | Tài liệu V3, Brand Guideline V2, `src/styles/finova-design-tokens.css`, logo gốc; chưa đủ bộ ảnh *before/after* cho mọi màn hình. |
| UI-P1 | Đã triển khai trong mã, chờ nghiệm thu sau đăng nhập | `src/components/navigation.tsx`, `src/components/quick-transaction-sheet.tsx`, `src/app/(protected)/layout.tsx`: mobile 4 tab + FAB, tablet rail 76px, desktop sidebar 264px, safe area. Chưa đo trực tiếp protected navigation ở 320–1440px. |
| UI-P2 | Đã triển khai, kiểm chứng public theme | Light/Dark/System trên login PASS; System theo thay đổi OS PASS; logo gốc trên nền trắng PASS ở các viewport login. Theme của tooltip/calendar/chart sau đăng nhập vẫn chưa được kiểm chứng. |
| UI-P3 | Đã triển khai, đạt regression thành phần; chưa nghiệm thu thật | Financial hero dùng `report.kpis.available`; số tài sản ròng lấy từ `worth.current.netWorth`; privacy mode che KPI, chart, ví và giao dịch. UI-305 ẩn chart/khung trống khi không có thu chi; vẫn giữ giao dịch chuyển ví và phân biệt các bút toán triệt tiêu về 0. Bốn SSR tests PASS; chưa đối chiếu trực quan với tài khoản thật. |
| UI-P4 | Đã triển khai trong mã, chưa đủ E2E | Timeline giao dịch, mobile cards, báo cáo, wallet, hồ sơ, import, Quick Transaction Sheet; Reports tabs có điều hướng Arrow/Home/End, ARIA và cảnh báo dữ liệu CSV/Excel/PDF không bị che bởi privacy mode. |
| UI-P5 | **PARTIAL PASS — chưa hoàn thành** | Production build, lint, typecheck, 273 unit tests (41 files), security route audit, 13 viewport login, axe WCAG bốn tổ hợp và OAuth initiation PASS. Cần authenticated browser QA, screen reader, visual regression màn protected, Lighthouse, iOS/Android và regression luồng tài chính thực tế. |

### Checkpoint UI-303 — 22/10/2026 (tiếp tục sau 10:16 giờ Việt Nam)

- [x] **UI-303 implementation:** chuyển Dashboard/Reports mobile filter từ card inline thành bottom sheet; thêm chọn nhanh bốn kỳ Việt Nam với `endExclusive`, đóng bằng backdrop/Escape, focus trap hai chiều, khôi phục focus và body scroll; giữ đường lọc ví/danh mục và submit cũ.
- [x] **UI-303 date unit regression:** `tests/unit/report-period-presets.test.ts` kiểm tra ranh giới năm theo múi giờ Việt Nam, tháng nhuận và `parseRange` backend; **269/269 tests (40 files) PASS**.
- [x] **Static/build/public browser regression:** `typecheck`, `lint`, Next.js production build 27 static pages và `test:browser:local` 13 viewport login, Light/Dark/System, axe, PWA, OAuth initiation **PASS**. Build đầu tiên gặp `EPERM mkdir .next/server/app/api/v1` trong môi trường Windows; build tiếp theo với quyền phù hợp đã PASS, không thay cấu hình.
- [x] **Prepared authenticated QA:** `scripts/protected-ui-audit.mjs` kiểm tra filter sheet, shortcut, focus trap/Escape/restore, không ghi dữ liệu; script parse `node --check` PASS.
- [ ] **UI-303 browser acceptance và toàn UI-P5:** chưa chạy script protected vì Chrome CDP profile 9222 chưa khởi động/đăng nhập (kết nối `ECONNREFUSED` khi kiểm tra với quyền loopback). Các gate Lighthouse, thiết bị thật, hai tài khoản Google, staging/G7 vẫn OPEN; không xác nhận production ready.

### Checkpoint UI-305 — 22/10/2026 (11:00–11:10 giờ Việt Nam)

- [x] **UI-305 implementation:** Dashboard giữ số dư khả dụng của ví kể cả khi kỳ không có thu chi, hiện một empty state có ba hành động đổi kỳ/thêm giao dịch/nhập sao kê; ẩn các chart không có dữ liệu. Mobile bố trí CTA toàn chiều rộng; desktop tự trải nhóm hành động. Các thẻ danh sách chỉ xuất hiện khi thực sự có dữ liệu tương ứng, kể cả trường hợp kỳ chỉ có chuyển ví.
- [x] **UI-305 data-state regression:** dùng sự hiện diện của dòng ledger aggregate trong `report.series` để xác định hoạt động thu chi, tránh phân loại sai khi bút toán triệt tiêu về 0. `tests/unit/dashboard-empty-state.test.tsx` **4/4 PASS**: có ví + số dư không giao dịch, transfer-only, zero-net income/expense, chưa tạo ví; không seed giao dịch vào DB.
- [x] **UI-305 code/build regression:** `typecheck`, `lint`, `npm test` **273/273 (41 files)**, `npm run build` (27 static pages), `security:routes` (41 route files, 54 handlers) PASS. Browser public login 13 viewport, Light/Dark/System, PWA, OAuth initiation và axe 4 tổ hợp PASS khi chạy `npm run start -- -p 3002` rồi `npm run test:browser`.
- [ ] **UI-305 authenticated visual acceptance:** chưa quan sát dữ liệu thật trên `/dashboard` và `/reports` sau Google login. Chrome QA CDP 9222 trả `ECONNREFUSED` với quyền loopback. Không chụp/seed dữ liệu tài chính giả hoặc tự đánh dấu UI-P5 đạt.

**Chẩn đoán môi trường QA:** wrapper từng không kết nối localhost trong sandbox hạn chế. Ngày 22/10, chạy lại `npm run test:browser:local` với quyền kết nối loopback đã **PASS** đủ 13 viewport, theme, axe, PWA và OAuth initiation; không tái hiện lỗi server con. Khi chạy trong sandbox hạn chế, probe thực tế trả `EACCES` cho cả IPv4/IPv6. Wrapper hiện dừng sớm với chẩn đoán quyền mạng chính xác. Build lần đầu ở sandbox thông thường gặp `EPERM` tại `.next/static/chunks/...`, build chạy với quyền ghi workspace phù hợp đã PASS. `scripts/protected-ui-audit.mjs` hiện thông báo rõ endpoint CDP không truy cập được, đã qua `node --check`.

### Checkpoint browser QA wrapper — 22/10/2026

- [x] **Public browser runner validation:** tái hiện `EACCES` trong sandbox giới hạn, kiểm chứng cùng wrapper khi cho phép localhost **PASS 13/13 viewport**, theme Light/Dark/System, axe login bốn tổ hợp, PWA và Google OAuth initiation. `scripts/run-browser-smoke-local.mjs` nay phân biệt lỗi quyền kết nối loopback và dừng sớm; `node --check` PASS. Không có cơ sở kết luận server Next.js bị lỗi khởi động.
- [ ] **Authenticated UI-P5 acceptance:** `npm run test:ui:auth` với quyền loopback vẫn `BLOCKED_AUTH`: Chrome QA debugging endpoint `127.0.0.1:9222` `ECONNREFUSED`; cần Google QA profile thật, thiết bị vật lý, Lighthouse và đối soát theo runbook trước khi đóng gate.

### Kiểm thử đã thực thi

- `npm run typecheck`: **PASS** (22/10/2026, sau các thay đổi UI V3).
- `npm run lint`: **PASS** (22/10/2026; đã bỏ qua thư mục output backup `.next-pre-*` trong ESLint).
- `npm test`: **41 files, 273 tests PASS** (22/10/2026, sau UI-305); không thay đổi logic ghi ledger trong đợt hoàn thiện UI này.
- `npm run build`: **PASS** (22/10/2026, Next.js 16.4.2, Webpack, Windows, chạy trực tiếp không nạp script chẩn đoán; 27 trang static được tạo). Cấu hình build Windows dùng 1 worker và `staticGenerationMaxConcurrency: 1`, cùng workaround `traceIgnores` cho cây `Users` ngoài repository để tránh socket Docker trong AppData. Workaround dựa trên API nội bộ Next.js, cần đánh giá lại khi nâng cấp Next.js.
- `npm run test:oauth`: **PASS** với production server địa phương `localhost:3002`: OAuth initiation, callback URI, cookie state, scopes và bảo vệ các route chưa đăng nhập. Không thực hiện callback bằng tài khoản Google.
- `npm run test:browser:local`: **PASS** ngày 22/10/2026 (báo cáo cập nhật lúc 10:03 giờ Việt Nam), **13 viewport** từ 320×568 đến 1440×900 cho màn **login công khai**; tất cả không tràn ngang, logo và nút Google hiển thị đúng. Chrome kiểm tra PWA manifest/icons/cache, Light/Dark ở 320/390/430/1440, keyboard focus, touch target 52px, System theme theo đổi OS và chuyển hướng tới Google OAuth đều PASS. **axe-core 4.14.0: 0 vi phạm được phát hiện** cho 390px/1440px × Light/Dark với các tag WCAG 2.0/2.1 A/AA và WCAG 2.2 AA. Lỗi tương phản `.login-footnote` trước đó đã hết trong phạm vi kiểm thử này. Bằng chứng: `artifacts/qa/browser-smoke.json` và ảnh `artifacts/qa/login-*-verified.png`.
- Chạy smoke đã phải dùng sandbox escalation do kết nối loopback `::1:3002` và `127.0.0.1:3002` trả về `EACCES` khi chạy mặc định. `scripts/run-browser-smoke-local.mjs` hiện ghi lại HTTP status / mã lỗi kết nối để phân biệt sự cố môi trường với lỗi ứng dụng.
- Chỉ số Performance API của **login không throttling** trong kết quả smoke: FCP 44–156ms trên bốn tổ hợp được đo; đây không phải Lighthouse hoặc Core Web Vitals ngoài thực tế, không đủ để kết luận đạt LCP/CLS/INP.
- `npm ls --depth=0`: **PASS**. `axe-core@4.14.0` khớp `package.json`, `package-lock.json` và `node_modules`; **chưa chạy `npm ci` sạch** vì yêu cầu tải lại dependency.
- `node --check` ba script QA (`browser-smoke`, `run-browser-smoke-local`, `protected-ui-audit`): **PASS**. Bộ protected audit đã bổ sung kiểm tra vòng lặp focus hai chiều trong Quick Transaction Sheet nhưng **chưa chạy với phiên đăng nhập**.
- Ảnh Light/Dark login: `artifacts/qa/login-small-mobile-light-verified.png`, `login-mobile-dark-verified.png`, `login-large-mobile-dark-verified.png`, `login-desktop-light-verified.png` và các ảnh viewport khác. Đây là ảnh **màn login**, chưa phải các màn protected.

### Vấn đề còn mở

1. Production build đã PASS trên môi trường Windows hiện tại, nhưng workaround file tracing dùng `TraceEntryPointsPlugin.traceIgnores` (API nội bộ của Next.js) và loại trừ `**/Users/**` khi build server. Cần kiểm tra dependency tracing trên môi trường triển khai và đánh giá lại sau khi nâng cấp Next.js. Đã bỏ các script chẩn đoán tạm; không đụng đến Docker sockets hay dữ liệu bên ngoài repository.
2. **BLOCKED_AUTH:** chưa có Chrome QA profile đăng nhập Google tại cổng CDP 9222 trong phiên này. `npm run test:ui:auth` vì vậy chưa được chạy và chưa có bằng chứng cho các route protected. Cần chạy với tài khoản được phép, dùng dữ liệu hiện có, không seed tài chính giả; kiểm tra navigation, FAB, lọc, privacy, tabs, long amount, empty/error/loading, import trên các viewport trong script, Light/Dark. Không bỏ qua OAuth.
3. **NOT RUN:** Lighthouse chính thức, baseline before/after protected, kiểm thử trực tiếp trên iOS Safari/Android Chrome, VoiceOver/TalkBack, phóng to 200%, bàn phím ảo/safe area và regression nghiệp vụ có ghi dữ liệu trong workspace test. Các mục này vẫn mở; số đo FCP của login không được thay thế Lighthouse.
4. Chỉ đánh dấu các ô nghiệm thu còn lại ở mục 20 khi có kết quả quan sát thực tế và regression nghiệp vụ tương ứng. Chưa đủ bằng chứng để phát hành UI-P5.

---

## PHỤ LỤC A — GỢI Ý ĐẶT TÊN TASK / COMMIT

| Task | Commit mẫu |
|---|---|
| Theme foundations | `feat(ui): add semantic fintech light/dark tokens` |
| Responsive navigation | `feat(nav): replace overflowing mobile menu with bottom tabs and fab` |
| Dashboard redesign | `feat(dashboard): add financial hero and compact empty states` |
| Transactions | `feat(transactions): mobile grouped transaction timeline` |
| Wallets | `feat(wallets): fintech wallet overview with bank-sync status` |
| QA | `test(ui): add mobile and theme visual regression coverage` |

## PHỤ LỤC B — LƯU Ý TRÁNH LỆCH PHẠM VI

- Tham khảo ảnh 2–6 **ở ngôn ngữ thiết kế**, không sao chép tính năng/sản phẩm BUFF.
- Không đổi tên app Finova hoặc slogan đã duyệt.
- Không chỉ thay màu các nút rồi coi là thiết kế lại: phải chỉnh **thứ bậc thông tin, mật độ, navigation, thao tác và states**.
- Không thay toàn bộ frontend một lúc; giữ code review nhỏ theo phase để regression dễ kiểm soát.
- Tại các chỗ UI gọi “Dữ liệu riêng tư · VND” nếu giữ, cần giải thích rõ nguồn và phạm vi dữ liệu; không đặt badge “an toàn tuyệt đối”.

**Kết thúc tài liệu.**
