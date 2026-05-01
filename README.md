# XoilacZ Bóng Đá - Stremio Addon ⚽

Addon Stremio xem trực tiếp bóng đá từ XoilacZ.

## Giải đấu hỗ trợ

| # | Giải đấu | Trạng thái |
|---|----------|-----------|
| 1 | Premier League (Ngoại Hạng Anh) | ✅ |
| 2 | La Liga (Tây Ban Nha) | ✅ |
| 3 | UEFA Champions League | ✅ |
| 4 | Ligue 1 (Pháp) | ✅ |
| 5 | Serie A (Ý) | ✅ |
| 6 | MLS (Mỹ) | ✅ |

> Khi không có trận đấu từ 6 giải trên, addon tự động hiển thị tất cả trận bóng đá đang/sắp diễn ra.

## Cài đặt

### 1. Cài đặt dependencies
```bash
npm install
```

### 2. Chạy server
```bash
# Mặc định port 7000
npm start

# Hoặc tùy chỉnh
PORT=8080 npm start

# Chỉ định domain XoilacZ (nếu domain thay đổi)
XOILACZ_BASE_URL=https://newdomain.net npm start
```

### 3. Cài addon vào Stremio
Mở Stremio → Addons → Community → nhập URL:
```
http://localhost:7000/manifest.json
```

## Cấu hình

| Env Variable | Mặc định | Mô tả |
|-------------|---------|-------|
| `PORT` | `7000` | Port server |
| `XOILACZ_BASE_URL` | `https://egyptwatch.net` | Domain XoilacZ |

## Triển khai trên MiniPC / Server

```bash
# Clone repo
git clone <repo-url>
cd xoilacz-bongda

# Install
npm install --production

# Chạy với PM2 (khuyến nghị)
pm2 start index.js --name xoilacz-bongda
pm2 save

# Hoặc chạy với systemd
# Tạo file /etc/systemd/system/xoilacz-bongda.service
```

### Systemd service (tùy chọn)
```ini
[Unit]
Description=XoilacZ BongDa Stremio Addon
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/xoilacz-bongda
ExecStart=/usr/bin/node index.js
Restart=always
Environment=PORT=7000

[Install]
WantedBy=multi-user.target
```

## Cách hoạt động

1. **Scrape** trang chủ XoilacZ để lấy danh sách trận đấu
2. **Lọc** theo 6 giải đấu mục tiêu (hoặc fallback tất cả bóng đá)
3. **Extract** stream URLs từ JavaScript variable `list_stream` trên trang `/link/N`
4. **Serve** qua Stremio Addon SDK protocol

## Lưu ý

- Domain XoilacZ thay đổi thường xuyên → dùng env `XOILACZ_BASE_URL` hoặc cập nhật trong code
- Stream URLs có thể thay đổi → addon tự động scrape mỗi 5 phút
- Nên chạy trên MiniPC/Server local để truy cập từ mọi nơi

## License

MIT
