# Bóng Đá Quốc Tế - Stremio Addon ⚽

Addon Stremio xem trực tiếp bóng đá: **Premier League**, **La Liga**, **Champions League**, **MLS**.

Nguồn dữ liệu từ [MonPlay](https://sm.manucn.dpdns.org).

## Giải đấu hỗ trợ

| # | Giải đấu | Catalog ID |
|---|----------|-----------|
| 1 | Premier League (Ngoại Hạng Anh) | `epl` |
| 2 | La Liga (Tây Ban Nha) | `laliga` |
| 3 | UEFA Champions League | `ucl` |
| 4 | MLS (Mỹ) | `mls` |

> Khi không có trận đấu từ 4 giải trên, catalog trả về rỗng.

## Cài đặt

### 1. Cài đặt dependencies
```bash
npm install
```

### 2. Chạy server
```bash
# Mặc định port 7000
npm start

# Hoặc tùy chỉnh port
PORT=8080 npm start
```

### 3. Cài addon vào Stremio
Mở Stremio → Addons → Community → nhập URL:
```
http://localhost:7000/manifest.json
```

## API Endpoints

| Endpoint | Mô tả |
|----------|-------|
| `/manifest.json` | Manifest addon |
| `/catalog/thethao/epl.json` | Danh sách trận Premier League |
| `/catalog/thethao/laliga.json` | Danh sách trận La Liga |
| `/catalog/thethao/ucl.json` | Danh sách trận Champions League |
| `/catalog/thethao/mls.json` | Danh sách trận MLS |
| `/meta/thethao/{id}.json` | Chi tiết trận đấu + BLV options |
| `/stream/thethao/{id}.json` | Link stream (khi trận bắt đầu) |

## Cấu hình

| Env Variable | Mặc định | Mô tả |
|-------------|---------|-------|
| `PORT` | `7000` | Port server |

## Triển khai trên MiniPC / Server

```bash
# Clone repo
git clone https://github.com/dinhhieudl/addon-stremio.git
cd addon-stremio

# Install
npm install --production

# Chạy với PM2 (khuyến nghị)
pm2 start index.js --name bongda-intl
pm2 save

# Hoặc chạy với systemd (xem bên dưới)
```

### Systemd service (tùy chọn)
```ini
[Unit]
Description=BongDa Intl Stremio Addon
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/addon-stremio
ExecStart=/usr/bin/node index.js
Restart=always
Environment=PORT=7000

[Install]
WantedBy=multi-user.target
```

## Cách hoạt động

1. **Fetch** danh sách trận từ MonPlay API (`/catalog/thethao/all.json`)
2. **Lọc** theo 4 giải đấu mục tiêu (EPL, La Liga, UCL, MLS) bằng keyword matching
3. **Proxy** meta và stream endpoints từ MonPlay
4. **Serve** qua Stremio Addon SDK protocol
5. **Cache** kết quả 5 phút để giảm tải API

## Dependencies

- `stremio-addon-sdk` — Stremio addon protocol
- `node-fetch` — HTTP client

## License

MIT
