# imgflow-server — NAS Image Processing Service

## 專案簡介

imgflow-server 是一個以 Node.js + Express 撰寫的圖片處理微服務，設計為部署在自架 NAS 的 Docker 容器中。

主要功能：

1. **圖片壓縮**：JPEG（mozjpeg）、PNG（compressionLevel 9）
2. **WebP 輸出**：從壓縮後的圖片轉換，同時保留浮水印
3. **浮水印合成**：支援自訂位置（9 宮格）、縮放比例、透明度、邊距
4. **API Key 驗證**：`X-API-Key` header 驗證

提供 HTTP API：

- `GET  /health` — 健康檢查
- `POST /api/process` — 圖片處理（multipart/form-data）

回傳格式：`{ inputSize, output: { data, size, mime }, webp: { data, size } | null }`  
圖片資料以 **base64** 編碼回傳。

## 目錄結構

```
nas-image-service/
├── src/
│   ├── index.js      # Express server 入口，路由定義
│   ├── processor.js  # 圖片處理核心（sharp）、浮水印邏輯、WebP 輸出
│   └── auth.js       # API Key 驗證 middleware
├── Dockerfile
├── docker-compose.yml
├── package.json
└── .env.example      # 環境變數範本（.env 不進 git）
```

## 技術棧

- **Runtime**：Node.js 20 (Alpine)
- **圖片處理**：[sharp](https://sharp.pixelplumbing.com/) — 底層使用 libvips
- **HTTP**：Express 4
- **檔案上傳**：multer（記憶體儲存，上限 50 MB）
- **浮水印快取**：in-memory Map，TTL 24 小時

## 關鍵設計

- **浮水印透明度**：透過 sharp `linear` + `dest-in` 調整 alpha channel，有 fallback 路徑。
- **位置計算**：`calcPosition()` 支援 9 宮格（tl/tc/tr/ml/mc/mr/bl/bc/br），邊距以圖片寬/高的百分比計算。
- **Docker 資源限制**：`cpus: "2"`, `memory: 1G`，避免壓圖時佔用 NAS 全部資源。
- **環境變數**：`API_KEY`、`PORT`，透過 `.env` 注入（不進版本控制）。

## 配套服務

本服務由 **ImgFlow WP** WordPress 外掛呼叫。  
參見：https://github.com/jeremyhuang035/imgflow-wp

---

## Commit 規範

遵循 Angular Commit Message Convention（參考：https://www.ruanyifeng.com/blog/2016/01/commit_message_change_log.html）。

### 格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type 種類

| type       | 用途                         |
|------------|------------------------------|
| `feat`     | 新功能                        |
| `fix`      | 修復 bug                     |
| `docs`     | 文件變更                      |
| `style`    | 格式調整（不影響程式邏輯）     |
| `refactor` | 重構（非新功能、非修 bug）     |
| `test`     | 測試相關                      |
| `chore`    | 建置流程或工具調整            |

### 規則

- **語言**：subject、body、footer 一律以**中文**撰寫
- **Header** 不超過 72 字元
- **Subject**：動詞開頭（加入、修正、更新、移除），不加句號，50 字以內
- **Body**：說明「為何」做這個變更，而非「做了什麼」；與 header 空一行
- **Footer**：記錄 `BREAKING CHANGE:` 或 `Closes #<issue>`

### 範例

```
feat(processor): 加入浮水印透明度 alpha channel 調整

用 sharp linear + dest-in 精確縮放 alpha channel，
取代原本只能靠 modulate 的近似做法。
```

```
fix(auth): 修正 API Key 比對時未處理空值導致崩潰的問題
```

```
chore: 初始化專案並建立 CLAUDE.md
```
