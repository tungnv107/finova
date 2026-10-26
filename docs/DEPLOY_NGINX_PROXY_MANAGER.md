# Triển khai Finova với Docker và Nginx Proxy Manager

Áp dụng cho máy chủ Linux đã có Docker, Docker Compose V2 và Nginx Proxy Manager (NPM). Domain dự kiến: `finova.io.vn`. Tài liệu này hướng dẫn dựng môi trường để kiểm thử qua HTTPS; **chưa phải biên bản nghiệm thu đưa Finova/SePay Live vào production**.

## 1. Kiến trúc và cổng

```text
Internet --HTTPS 443--> NPM container --HTTP finova-app:3002--> Finova app
                                                                  |
                                                       Docker private network
                                                                  |
                                                              PostgreSQL:5432

Host Linux (chỉ loopback): 127.0.0.1:3002 --> Finova:3002
Host Linux (chỉ loopback): 127.0.0.1:55433 --> PostgreSQL:5432
```

Port `3002` đã cấu hình trong `Dockerfile` và `compose.yaml`; đây là **cổng host đề xuất**, phải kiểm tra còn trống trên máy chủ. Nếu host `3002` bận, thay `FINOVA_APP_PORT=3004` (ví dụ) nhưng **giữ nguyên cổng nội bộ và port NPM = 3002**. Cổng database host `55433` cũng cần còn trống hoặc đổi `FINOVA_DB_PORT`.

Ảnh NPM người dùng cung cấp cho thấy các đích `web:3000`, `161.118.222.102:8089` và `sub2api:8080`; đó không phải danh sách đầy đủ các cổng đang nghe của máy chủ.

## 2. Kiểm tra máy chủ và mạng NPM

```bash
docker compose version
docker ps --format 'table {{.Names}}\t{{.Ports}}'
docker network ls
sudo ss -lntp | grep -E ':(3002|55433)\b' || true
```

Xác định đúng tên container NPM từ `docker ps`. Liệt kê các network NPM đang tham gia (thay `<NPM_CONTAINER>` bằng tên thực tế):

```bash
docker inspect <NPM_CONTAINER> --format '{{range $name, $network := .NetworkSettings.Networks}}{{println $name}}{{end}}'
```

Chọn một **user-defined bridge network** hiện có của NPM, ví dụ `npm_default` (đây là ví dụ, cần dùng tên thật). Finova sẽ tham gia network này bằng file `compose.npm.yaml` và có DNS alias `finova-app`. NPM không cần biết IP host; PostgreSQL vẫn chỉ ở mạng Compose mặc định của Finova.

Nếu NPM chỉ ở default `bridge`, có thể tạo `docker network create finova_proxy` và cho NPM tham gia: `docker network connect finova_proxy <NPM_CONTAINER>`. Khi đó đặt `FINOVA_NPM_NETWORK=finova_proxy`. Đồng thời khai báo `finova_proxy` trong **Compose của NPM** để kết nối được giữ lại khi NPM được tạo lại; việc `docker network connect` thủ công không tự áp dụng cho container mới.

## 3. Lấy mã nguồn và tạo `.env`

```bash
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/tungnv107/finova.git
cd finova
cp .env.example .env
chmod 600 .env
openssl rand -hex 24   # ví dụ tạo password PostgreSQL chỉ chứa ký tự URL-safe
openssl rand -hex 32   # ví dụ tạo BETTER_AUTH_SECRET độc lập
nano .env
```

Trong `.env`, đặt ít nhất các khóa bên dưới với giá trị thật, thay cùng một `<DB_PASSWORD>` tại các vị trí. Nên dùng chuỗi hex vừa tạo làm mật khẩu DB để không phải URL-encode dấu đặc biệt:

```dotenv
POSTGRES_PASSWORD=<DB_PASSWORD>
FINOVA_DB_PORT=55433
FINOVA_APP_PORT=3002
FINOVA_NPM_NETWORK=<NPM_NETWORK_NAME>
DATABASE_URL=postgresql://finova:<DB_PASSWORD>@127.0.0.1:55433/finova?schema=public&connection_limit=16
FINOVA_CONTAINER_DATABASE_URL=postgresql://finova:<DB_PASSWORD>@db:5432/finova?schema=public&connection_limit=16
FINOVA_MIGRATION_DATABASE_URL=postgresql://finova:<DB_PASSWORD>@db:5432/finova?schema=public
BETTER_AUTH_SECRET=<RANDOM_SECRET>
BETTER_AUTH_URL=https://finova.io.vn
NEXT_PUBLIC_APP_URL=https://finova.io.vn
GOOGLE_CLIENT_ID=<GOOGLE_OAUTH_CLIENT_ID>
GOOGLE_CLIENT_SECRET=<GOOGLE_OAUTH_CLIENT_SECRET>
FINOVA_CSP_ENFORCE=0
FINOVA_SEPAY_BANKHUB_ENABLED=0
FINOVA_SEPAY_BANKHUB_ENV=sandbox
```

Thay các giá trị đặt trong dấu `<...>`; không giữ nguyên placeholder. Google OAuth cần thông tin ứng dụng Google Cloud thật nếu muốn sử dụng đăng nhập. Nếu chưa có, để hai biến Google rỗng và chỉ kiểm tra hạ tầng HTTP/HTTPS, **không coi như đã kiểm thử đăng nhập**. Các biến khác trong `.env.example` có thể giữ mặc định an toàn. Tạo riêng secret đủ mạnh cho cron, webhook, replay và khóa mã hóa AES nếu kích hoạt các luồng tương ứng; không bật SePay Live ở giai đoạn này. Không đưa `.env`, mật khẩu hay token lên Git.

> `NEXT_PUBLIC_APP_URL` được Next.js đưa vào JavaScript khi **build**, nên sau khi đổi domain phải build lại image. `compose.yaml` đã truyền giá trị này qua Docker build argument; không truyền bí mật qua build arguments.

## 4. Khởi động database, migration, ứng dụng

Thực hiện trong thư mục `~/apps/finova`:

```bash
docker compose -f compose.yaml -f compose.npm.yaml --profile app config --quiet
docker compose -f compose.yaml -f compose.npm.yaml up -d db
docker compose -f compose.yaml -f compose.npm.yaml --profile release build migrate
docker compose -f compose.yaml -f compose.npm.yaml --profile release run --rm migrate
docker compose -f compose.yaml -f compose.npm.yaml --profile app up -d --build app
docker compose -f compose.yaml -f compose.npm.yaml --profile app ps
docker compose -f compose.yaml -f compose.npm.yaml --profile app logs --tail=100 app
curl -I http://127.0.0.1:3002/login
```

Nếu đổi `FINOVA_APP_PORT=3004`, dòng cuối sẽ truy cập `127.0.0.1:3004/login`. Không dùng `prisma migrate reset`, `docker compose down -v`, hoặc xóa volume `finova_pg` vì sẽ mất dữ liệu.

## 5. Cấu hình DNS và Nginx Proxy Manager

1. Tạo DNS bản ghi `A`: `finova.io.vn` → **IP public đúng của máy chủ**. Kiểm tra `dig +short finova.io.vn`; nếu dùng CDN proxy, cần kiểm tra thêm trạng thái DNS và SSL của CDN.
2. Đảm bảo 80/443 từ Internet đến NPM; chứng chỉ Let's Encrypt HTTP challenge cần cổng 80 truy cập được.
3. NPM → **Proxy Hosts** → **Add Proxy Host** → Domain Names: `finova.io.vn`; Scheme: `http`; Forward Hostname/IP: `finova-app`; Forward Port: `3002`.
4. Chọn **Block Common Exploits**, bật Websockets Support nếu cần; tránh bật Cache Assets cho ứng dụng tài chính có phiên đăng nhập.
5. Tab **SSL** → Request a new SSL Certificate (Let's Encrypt) → bật Force SSL sau khi chứng chỉ thành công, chấp nhận điều khoản và lưu. Chỉ bật HSTS sau khi HTTPS và Google OAuth đã được xác minh hoạt động.

NPM phải ở cùng network được chỉ định bởi `FINOVA_NPM_NETWORK`; proxy đến `127.0.0.1` **bên trong NPM container** sẽ trỏ lại chính NPM, không phải loopback của host. Nếu NPM được cài **trực tiếp trên host** thay vì container, không dùng `compose.npm.yaml`, và NPM forward tới `127.0.0.1:3002`.

## 6. Google OAuth và kiểm tra

Trong Google Cloud Console, cấu hình OAuth Client loại Web:

```text
Authorized JavaScript origins: https://finova.io.vn
Authorized redirect URIs:    https://finova.io.vn/api/auth/callback/google
```

Đây là đường dẫn callback mặc định của Better Auth cho provider Google trong dự án; cần xác minh trong bài kiểm thử đăng nhập thật trên môi trường được triển khai. Giữ đúng `BETTER_AUTH_URL=https://finova.io.vn`, `NEXT_PUBLIC_APP_URL=https://finova.io.vn` và rebuild sau khi thay đổi các giá trị lúc build.

```bash
curl -I https://finova.io.vn/login
docker compose -f compose.yaml -f compose.npm.yaml --profile app ps
docker compose -f compose.yaml -f compose.npm.yaml --profile app logs --tail=100 app
```

Nghiệm thu tối thiểu: trang login trả thành công qua HTTPS, container healthy, Google đăng nhập/callback tạo session thật, giao diện tải được và API yêu cầu đăng nhập từ chối truy cập chưa xác thực. Nên kiểm tra thêm bản ghi/tác vụ DB với tài khoản thử nghiệm, CSP Report-Only trên trình duyệt, sao lưu/khôi phục thử, HTTPS/WAF/giám sát, và SePay Sandbox trước khi cân nhắc production. Không bật `FINOVA_TRUSTED_CLIENT_IP_HEADER` nếu NPM chưa ghi đè header tin cậy và chưa chặn đường vào ứng dụng.

## 7. Sao lưu và cập nhật

**Cập nhật 26/10/2026 — nâng cấp một lượt (khuyến nghị).** Script `scripts/release-server.sh` dành cho **Linux + Docker Compose + PostgreSQL do Compose quản lý**, giữ nguyên dữ liệu và các Docker volumes. Cần có `git`, `python3`, `curl`, `flock`, `sha256sum`, Docker và Docker Compose V2. Trước lần chạy đầu, đảm bảo NPM đang cùng network `FINOVA_NPM_NETWORK`, cấu hình `.env` của **máy chủ** có giá trị thật, và ít nhất:

```dotenv
POSTGRES_PASSWORD=<server-db-password>
FINOVA_CONTAINER_DATABASE_URL=postgresql://finova:<url-encoded-password>@db:5432/finova?schema=public&connection_limit=16
FINOVA_MIGRATION_DATABASE_URL=postgresql://finova:<url-encoded-password>@db:5432/finova?schema=public
BETTER_AUTH_SECRET=<secret-at-least-32-characters>
BETTER_AUTH_URL=https://finova.io.vn
NEXT_PUBLIC_APP_URL=https://finova.io.vn
FINOVA_NPM_NETWORK=<existing-npm-docker-network>
FINOVA_APP_PORT=3002
```

`<...>` chỉ là chỗ điền giá trị, không đưa vào `.env` nguyên văn. `FINOVA_MIGRATION_DATABASE_URL` phải dùng **chính DB `finova` của dịch vụ Compose**, không được trỏ tới DB thử nghiệm hay hệ thống khác. Script kiểm tra hostname/port/user/database/password giữa app, migration và Postgres, đồng thời từ chối mật khẩu DB mẫu và origin không phải HTTPS. Với NPM chạy trực tiếp trên Linux host (không phải container), dùng `--no-npm` ở mọi lần chạy và trỏ proxy tới `127.0.0.1:3002`.

Trên máy chủ, từ checkout Git **sạch** của `main` (nếu chưa clone, làm theo mục 3):

```bash
cd ~/apps/finova
git status --short
git pull --ff-only origin main
bash scripts/release-server.sh --dry-run
bash scripts/release-server.sh
```

Không cần gọi `prisma migrate deploy` thủ công khi đã chạy script: quá trình nâng cấp đã bao gồm việc đó. Script tự động: khóa để chặn phát hành song song; cập nhật nhánh `main` bằng fast-forward; xác thực cấu hình; build image app và image migration; khởi động DB; xác minh DB `finova/finova`; xuất `pg_dump -Fc` và xác nhận archive qua `pg_restore --list`; ghi checksum SHA-256; gắn tag rollback cho image app cũ (nếu có); chạy **`prisma migrate deploy`**; khởi động image mới; đợi container healthy và thử `/login` + `/manifest.webmanifest` qua cổng loopback. Nếu lỗi ở bất kỳ bước nào, script dừng với mã lỗi. Script **không** xóa volume, reset schema, tự restore DB hoặc tự kích hoạt thanh toán live.

Bản sao lưu đặt mặc định ở `~/apps/finova-backups/` (thư mục ngang hàng với repo, không commit) cùng file `.sha256`; đổi bằng biến `FINOVA_RELEASE_BACKUP_DIR=/đường/dẫn/riêng` nếu cần. **Bản dump chưa được mã hóa tự động:** mã hóa, chuyển offsite, quản lý quyền và retention theo quy định. Trước khi phát hành production thật, khôi phục thử trên DB **cách ly** và đối soát dữ liệu. Nếu DB không nằm trong Compose `db`, script này chưa phù hợp: phải điều chỉnh backup, kiểm tra DSN và migration cho kiến trúc tương ứng trước khi dùng.

Kiểm tra sau phát hành:

```bash
docker compose -f compose.yaml -f compose.npm.yaml --profile app ps
docker compose -f compose.yaml -f compose.npm.yaml --profile app logs --tail=100 app
curl -fI https://finova.io.vn/login
curl -fI https://finova.io.vn/manifest.webmanifest
docker compose -f compose.yaml -f compose.npm.yaml --profile release run --rm migrate npx prisma migrate status
```

Lưu ý: lệnh cuối sử dụng môi trường migration và chỉ truy vấn trạng thái schema. Kiểm thử **đăng nhập Google thật**, phiên người dùng, truy cập và giao dịch đã xác thực, reverse proxy, chính sách bảo mật và giám sát riêng trước khi chuyển lưu lượng production. Các tính năng Admin/Premium/Billing tiếp tục mặc định tắt trong `.env`; Docker Compose nay truyền đầy đủ các flag cấu hình. Chỉ bật khi đã hoàn thành điều kiện UAT/phân quyền/nhà cung cấp trong [payment runbook](FINOVA_ADMIN_PREMIUM_PAYMENT_RUNBOOK.md).

### Cấp quyền Super Admin đầu tiên theo email đã xác minh

Đăng nhập Google vào Finova **trước** bằng đúng email cần cấp quyền, bảo đảm người dùng đã tồn tại trong database đích và `emailVerified=true`. Trên máy chủ, sử dụng image `migrate` được build từ commit mới nhất và chỉ chạy với `FINOVA_MIGRATION_DATABASE_URL` đã được xác thực:

```bash
docker compose -f compose.yaml -f compose.npm.yaml --profile release run --rm migrate \
  npm run admin:bootstrap -- --email 'your-verified-google-email@example.com'
```

Tùy chọn `--email` tra cứu chính xác cột `User.email` (duy nhất), chỉ cấp khi đã xác minh, ghi audit trong transaction và từ chối khi đã có Super Admin hoạt động. Có thể thay `--email <...>` bằng User ID trong lệnh cũ. Không tự tạo sẵn một email/quyền mặc định trong seed hoặc repo. Đặt `FINOVA_ADMIN_ENABLED=1` trong `.env` và tái tạo app container (`--profile app up -d --no-build app`); các cờ thanh toán tiếp tục tắt. Quyền được cấp trực tiếp trong PostgreSQL của môi trường đã chọn và không tự lan sang môi trường khác.

Nếu phát hành lỗi sau migration, trước tiên kiểm tra trạng thái container, logs, `prisma migrate status` và backup/checksum. Script lưu image cũ với tag `finova:rollback-<UTC timestamp>`. **Chỉ** quay lại image đó sau khi đã xác nhận schema mới tương thích image cũ; migration của Prisma mặc định không có thao tác rollback. Tránh `docker compose down -v`, `prisma migrate reset` hoặc khôi phục dữ liệu đè production: có thể mất giao dịch mới.

### Thao tác thủ công (khi cần tách từng bước)

Nếu operator muốn giám sát từng bước sau khi tự backup và đối soát DB:

```bash
docker compose -f compose.yaml -f compose.npm.yaml --profile release build migrate
docker compose -f compose.yaml -f compose.npm.yaml --profile release run --rm migrate
docker compose -f compose.yaml -f compose.npm.yaml --profile app up -d --build app
docker compose -f compose.yaml -f compose.npm.yaml --profile app ps
```

**Trạng thái hiện tại:** Chưa chạy script trên máy chủ thật hoặc nghiệm thu OAuth E2E, HTTPS staging, SePay Sandbox UAT, database outage/recovery và offsite restore. Script tự động hóa phát hành, không thay thế các bước nghiệm thu production này.
