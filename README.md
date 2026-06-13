# ImgFlow Server

自架圖片處理服務，以 Node.js + Docker 執行於 NAS（或任意 Linux 主機）。提供：

- 圖片壓縮（JPEG / PNG → JPEG / WebP），使用 [sharp](https://sharp.pixelplumbing.com/)
- 浮水印疊加（位置、縮放、透明度、邊距可設定）
- 多租戶 API Key 管理
- Google OAuth 2.0 用戶自助連結
- 方案（Tier）系統：每月圖片張數配額，超限回 429
- 後台管理介面（客戶管理、方案管理、用量報表、管理員帳號）

## 快速開始

### 1. 設定環境變數

```bash
cp .env.example .env
# 編輯 .env 填入必要值
```

### 2. Docker Compose 啟動

```bash
docker compose up -d
```

服務預設監聽 `3000` port。

### 3. 登入後台

瀏覽器開啟 `http://your-nas-ip:3000/admin`，使用 `.env` 中設定的帳密登入。

---

## Synology NAS GUI 部署（Container Manager）

適合不習慣 CLI 的用戶，全程在 DSM 圖形介面操作。

### 前置需求

- DSM 7.2+，已安裝 **Container Manager**（套件中心搜尋安裝）
- NAS 已連上網路，並設定好對外域名（Google OAuth 需要 HTTPS callback URL）

---

### Step 1：把程式碼放到 NAS

**方法 A — File Station（拖曳上傳，適合首次）**

1. 開啟 **File Station**，在 `docker/` 資料夾下建立新資料夾，命名為 `imgflow-server`
2. 把整個專案資料夾的內容（除 `node_modules/`）拖曳上傳進去

**方法 B — SSH git clone（適合日後更新）**

1. DSM → 控制台 → 終端機與 SNMP → 啟用 SSH 服務
2. 用終端機連入 NAS：
   ```bash
   ssh 你的NAS帳號@NAS的IP
   ```
3. 切換到 docker 資料夾並 clone：
   ```bash
   cd /volume1/docker
   git clone git@github.com:jeremyhuang035/imgflow-server.git
   ```

---

### Step 2：建立 `.env` 設定檔

1. **File Station** 中進入 `docker/imgflow-server/`
2. 找到 `.env.example`，右鍵 → **複製** → 重新命名為 `.env`
3. 右鍵 `.env` → **以文字編輯器開啟**，填入以下值：

```
PORT=3000
NODE_ENV=production
SESSION_SECRET=（換成一段長隨機字串，至少 32 字元）
ADMIN_USERNAME=admin
ADMIN_PASSWORD=（設定你要的後台密碼）
GOOGLE_CLIENT_ID=（Google Cloud Console 申請的 Client ID）
GOOGLE_CLIENT_SECRET=（對應的 Client Secret）
GOOGLE_CALLBACK_URL=https://你的網域/auth/google/callback
```

> **如何取得 Google Client ID/Secret？**
> 1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
> 2. 建立或選擇一個專案
> 3. API 和服務 → 憑證 → 建立憑證 → OAuth 用戶端 ID
> 4. 應用程式類型選「網頁應用程式」
> 5. 已授權的重新導向 URI 填入：`https://你的網域/auth/google/callback`
> 6. 建立後複製 Client ID 和 Client Secret

---

### Step 3：Container Manager 建立專案

1. 開啟 **Container Manager** → 左側選單點 **專案（Project）**
2. 點右上角 **新增**
3. 填寫：
   - **專案名稱**：`imgflow-server`（自訂）
   - **路徑**：選擇 `docker/imgflow-server`（即上傳程式碼的資料夾）
   - **來源**：選「使用現有的 docker-compose.yml」
4. 下一步會自動偵測到 `docker-compose.yml`，確認內容無誤
5. 下一步設定 Port：確認 `3000:3000` 對應正確
6. 點 **完成** → Container Manager 會自動 **Build image 並啟動容器**

> Build 過程需要幾分鐘（需下載 node:20-alpine 並編譯 sharp），可在「建置記錄」頁面查看進度。

---

### Step 4：確認服務正常

1. 在 Container Manager → 專案 → `imgflow-server`，確認狀態為 **執行中（Running）**
2. 瀏覽器開啟 `http://NAS的IP:3000/health`，應看到：
   ```json
   { "status": "ok", "version": "0.1.0" }
   ```
3. 開啟 `http://NAS的IP:3000/admin`，以 `.env` 設定的帳密登入

---

### Step 5：設定外部存取（Reverse Proxy）

Google OAuth 需要 HTTPS 的 callback URL，建議透過 DSM 的反向代理設定對外域名。

1. DSM → 控制台 → 登入入口 → **進階** → **反向代理規則**
2. 點 **新增**，填入：
   - **描述**：ImgFlow Server
   - **通訊協定（來源）**：HTTPS
   - **主機名稱（來源）**：`imgflow.你的網域.com`（需先在 DNS 設定 A record 指向 NAS 外部 IP）
   - **連接埠（來源）**：443
   - **通訊協定（目的地）**：HTTP
   - **主機名稱（目的地）**：`localhost`
   - **連接埠（目的地）**：3000
3. 儲存後，外部即可透過 `https://imgflow.你的網域.com` 訪問服務
4. 回頭把 `.env` 中的 `GOOGLE_CALLBACK_URL` 改為 `https://imgflow.你的網域.com/auth/google/callback`，並在 Container Manager 重新啟動容器（Stop → Start）

---

### 日後更新版本

**方法 A — File Station 覆蓋上傳**

1. 上傳新版程式碼到 `docker/imgflow-server/`（`.env` 與 `data/` 不要刪）
2. Container Manager → 專案 → `imgflow-server` → **停止** → **建置**（重新 build）→ **啟動**

**方法 B — SSH git pull**

```bash
ssh 你的NAS帳號@NAS的IP
cd /volume1/docker/imgflow-server
git pull origin develop     # 或 main（正式版）
```

然後在 Container Manager 重新 build 並啟動。

---

### 注意事項

- `data/` 資料夾（SQLite DB）已透過 `docker-compose.yml` 的 `volumes` 掛載到主機，**重建容器後資料不會遺失**
- `.env` 不在版本控制中，更新程式碼不會覆蓋 `.env`
- 如果更新後後台無法登入，確認 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 與資料庫中已存的帳號一致（seed 只在 DB 為空時執行）

---

## 需求

- Docker + Docker Compose（建議 Docker Desktop 或 Synology Container Manager）
- 對外可訪問的公開 URL（Google OAuth callback 需要）

---

## 目錄結構

```
nas-image-service/
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── package.json
└── src/
    ├── index.js
    ├── db.js
    ├── processor.js
    ├── middleware/
    │   ├── apiAuth.js
    │   └── adminAuth.js
    ├── routes/
    │   ├── auth.js
    │   ├── api.js
    │   └── admin/
    │       ├── index.js
    │       ├── clients.js
    │       ├── tiers.js
    │       ├── users.js
    │       └── stats.js
    ├── views/
    │   ├── login.ejs
    │   ├── dashboard.ejs
    │   ├── clients.ejs
    │   ├── tiers.ejs
    │   ├── users.ejs
    │   ├── stats.ejs
    │   └── partials/
    │       ├── header.ejs
    │       └── footer.ejs
    └── public/
        └── admin.css
```

---

## 各檔案說明

### `.env.example`

環境變數範本，複製為 `.env` 後填入實際值。

| 變數 | 說明 |
|------|------|
| `PORT` | 服務監聽 port（預設 3000） |
| `SESSION_SECRET` | Express session 加密金鑰，請設定長隨機字串 |
| `ADMIN_USERNAME` | 初始 superadmin 帳號（資料庫不存在時自動 seed） |
| `ADMIN_PASSWORD` | 初始 superadmin 密碼（bcrypt hash 後儲存） |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret |
| `GOOGLE_CALLBACK_URL` | OAuth 回調 URL，格式：`https://your-domain/auth/google/callback` |

---

### `.gitignore`

排除：`node_modules/`、`data/`（SQLite 資料庫目錄）、`.env`。

---

### `Dockerfile`

基於 `node:20-alpine`。步驟：

1. 設工作目錄 `/app`
2. 複製 `package*.json` 並執行 `npm ci --production`
3. 複製其餘原始碼
4. 建立 `data/` 目錄（SQLite 存放位置）
5. EXPOSE 3000，CMD `node src/index.js`

`sharp` 在 Alpine 上使用預建 binary（`npm install --ignore-scripts` + 手動下載），不需要本機 native compilation。

---

### `docker-compose.yml`

定義單一服務 `imgflow-server`。要點：

- 從 `Dockerfile` build
- Port mapping：`3000:3000`（可改）
- Volume：`./data:/app/data`（持久化 SQLite DB）
- `env_file: .env`
- `restart: unless-stopped`

---

### `package.json`

版本：`0.1.0`，主入口：`src/index.js`。

**相依套件：**

| 套件 | 用途 |
|------|------|
| `express` | HTTP 框架 |
| `sharp` | 圖片壓縮 / WebP 轉換 / 浮水印合成 |
| `multer` | multipart/form-data 解析（接收圖片） |
| `better-sqlite3` | SQLite 同步存取（比 `sqlite3` 更簡潔） |
| `bcryptjs` | 密碼 hash（純 JS，無需 native addon） |
| `ejs` | 後台模板引擎 |
| `express-session` | Admin 登入 session 管理 |
| `node-fetch` | 從 Google OAuth token endpoint 取 token |

---

### `src/index.js`

Express app 入口。負責：

- EJS 設定（view engine、views 路徑、partials 支援）
- 靜態檔案：`/public` → `src/public/`
- Body parsing（JSON + urlencoded）
- express-session（in-memory store，重啟後 session 清除；production 可改 Redis）
- 掛載路由：
  - `authRouter` at `/`（處理 `/auth/*` 與 `/admin/login`、`/admin/logout`）
  - `apiRouter` at `/`（處理 `/api/*`）
  - `adminRouter` at `/admin`
- `GET /health` — 健康檢查，回傳 `{ status: 'ok', version }` （version 從 package.json 讀取）

---

### `src/db.js`

SQLite 資料庫初始化與 schema 管理。

**資料庫位置：** `data/imgflow.db`（目錄不存在時自動建立）

**WAL 模式 + Foreign Keys**：啟動時執行 `PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;`

**資料表：**

| 表名 | 說明 |
|------|------|
| `admin_users` | 後台管理員（id, username, password_hash, role: superadmin/admin, is_active） |
| `tiers` | 方案定義（id, name, monthly_limit, is_active） |
| `client_accounts` | 客戶帳號（id, google_sub, email, name, tier_id, is_active） |
| `api_keys` | API Key 清單（id, client_id, key_hash, prefix, is_active, last_used_at） |
| `usage_logs` | 每次 API 呼叫記錄（id, api_key_id, client_id, file_count, original_bytes, compressed_bytes, webp_bytes, processed_at） |
| `oauth_states` | OAuth flow 暫存 state（id, state, wp_url, expires_at） |
| `auth_tokens` | OAuth 完成後的一次性 token（id, client_id, api_key, email, name, token, expires_at） |

**Seed 邏輯（首次啟動自動執行）：**

- 若 `tiers` 表為空 → 建立「試用」方案（monthly_limit = 0 = 無限制）
- 若 `admin_users` 表為空 → 以 `.env` 中的 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 建立初始 superadmin

**匯出：**

- `db` — better-sqlite3 實例（同步 API）
- `checkQuota(clientId)` — 檢查本月用量是否超過方案上限，超過回傳 `{ exceeded: true, limit, used }`

---

### `src/processor.js`

圖片處理核心（包裝 sharp）。

**`processImage(imageBuffer, options)`** — 接收 Buffer 與設定物件，回傳：

```js
{
  inputSize: number,      // 原始檔案 bytes
  output: {
    data: string,         // base64 JPEG
    size: number,
  },
  webp?: {
    data: string,         // base64 WebP（options.outputWebp = true 時才有）
    size: number,
  }
}
```

**options 物件：**

| 欄位 | 型別 | 說明 |
|------|------|------|
| `quality` | int | JPEG 壓縮品質（50–100） |
| `webpQuality` | int | WebP 品質 |
| `outputWebp` | bool | 是否產生 WebP |
| `watermarkUrl` | string | 浮水印圖片 URL |
| `watermarkPos` | string | 位置代碼（tl/tc/tr/ml/mc/mr/bl/bc/br） |
| `watermarkScale` | float | 比例（0–1，相對圖片寬度） |
| `watermarkOpacity` | float | 透明度（0–1） |
| `watermarkMarginX` | float | 水平邊距（% 圖寬） |
| `watermarkMarginY` | float | 垂直邊距（% 圖高） |
| `minWidthForWm` | int | 小於此寬度不加浮水印 |

浮水印處理流程：下載 watermarkUrl 圖片 → 縮放至目標尺寸（sharp resize）→ 以 `composite()` 疊加於主圖指定位置。

---

### `src/middleware/apiAuth.js`

API 請求驗證 middleware。

1. 從 `X-API-Key` header 取得金鑰
2. 在 `api_keys` 表中比對（儲存的是 SHA-256 hash，不儲存明文）
3. 查詢對應 `client_accounts`，確認 `is_active = true`
4. 呼叫 `db.checkQuota(clientId)`，超限回傳 `429 { error: '...' }`
5. 更新 `api_keys.last_used_at`
6. 掛載 `req.apiKeyId` 與 `req.clientId`，呼叫 `next()`

---

### `src/middleware/adminAuth.js`

後台 Session 驗證 middleware。

檢查 `req.session.adminId` 是否存在，不存在則 redirect 到 `/admin/login`。通過後從資料庫取得管理員資料並掛載至 `req.admin`。

---

### `src/routes/auth.js`

掛載路徑：`/`

| 路由 | 說明 |
|------|------|
| `GET /auth/google` | 產生 state、存入 `oauth_states` 表（含 wp_url），redirect 到 Google OAuth 授權頁 |
| `GET /auth/google/callback` | 接收 code + state，驗證 state，向 Google 換取 id_token，解析 email/sub，找或建 client_accounts，建 api_keys，建 auth_token，redirect 回 WordPress（帶 `?wio_token=xxx`） |
| `GET /auth/exchange` | WordPress plugin 呼叫此端點，用一次性 token 換取 api_key + email + name，token 使用後刪除 |
| `GET /admin/login` | 顯示登入頁（EJS） |
| `POST /admin/login` | 驗證帳密（bcrypt compare），寫入 session，redirect 到 `/admin` |
| `POST /admin/logout` | 清除 session，redirect 到 `/admin/login` |

---

### `src/routes/api.js`

掛載路徑：`/`，對外提供 `POST /api/process`。

流程：

1. `apiAuth` middleware 驗證 API Key 與配額
2. `multer` 接收 `multipart/form-data` 中的 `image` 欄位（memory storage）
3. 解析 `options` 欄位（JSON string）
4. 呼叫 `processImage(req.file.buffer, options)`
5. 在 `usage_logs` 插入一筆記錄（file_count=1，記錄 bytes）
6. 回傳 `{ inputSize, output, webp? }`

---

### `src/routes/admin/index.js`

掛載路徑：`/admin`，套用 `adminAuth` middleware 保護所有子路由。

- `GET /` — 儀表板：查詢活躍客戶數、API Key 數、本月處理張數、今日處理張數，渲染 `dashboard.ejs`
- 掛載子路由：`/clients`、`/tiers`、`/users`、`/stats`

---

### `src/routes/admin/clients.js`

掛載路徑：`/admin/clients`，管理客戶帳號。

| 路由 | 說明 |
|------|------|
| `GET /` | 列出所有客戶，含本月用量（JOIN usage_logs）；渲染 `clients.ejs` |
| `POST /:id/tier` | 變更客戶方案（tier_id） |
| `POST /:id/toggle` | 切換客戶 is_active 狀態 |
| `POST /:id/key/create` | 產生新 API Key（32 bytes random hex），以 SHA-256 hash 存入 DB |
| `POST /:clientId/key/:keyId/toggle` | 啟用 / 停用特定 API Key |

---

### `src/routes/admin/tiers.js`

掛載路徑：`/admin/tiers`，管理方案定義。

| 路由 | 說明 |
|------|------|
| `GET /` | 列出所有方案；渲染 `tiers.ejs` |
| `POST /create` | 建立新方案（name, monthly_limit） |
| `POST /:id/update` | 更新方案名稱與用量上限 |
| `POST /:id/toggle` | 啟用 / 停用方案 |

---

### `src/routes/admin/users.js`

掛載路徑：`/admin/users`，管理後台管理員帳號。

**此路由僅 superadmin 可訪問**（middleware 內部檢查 `req.admin.role`）。

| 路由 | 說明 |
|------|------|
| `GET /` | 列出所有管理員；渲染 `users.ejs`，自己的列顯示「(目前帳號)」 |
| `POST /create` | 建立新管理員（username, password, role），密碼以 bcrypt hash 後儲存 |
| `POST /:id/toggle` | 切換 is_active（不能停用自己） |
| `POST /:id/reset-password` | 重設密碼 |

---

### `src/routes/admin/stats.js`

掛載路徑：`/admin/stats`，用量報表。

`GET /` — 從 `usage_logs` 聚合三份資料後渲染 `stats.ejs`：

1. **近 30 天每日處理張數**（GROUP BY DATE(processed_at)）
2. **近 6 個月每月處理張數**（GROUP BY strftime('%Y-%m', processed_at)）
3. **本月前 10 大用量客戶**（JOIN client_accounts，GROUP BY client_id 排序）

---

### `src/views/login.ejs`

後台登入頁（獨立版面，不含 sidebar）。

顯示 ImgFlow 標誌、帳號 / 密碼輸入、登入按鈕。POST 失敗時顯示錯誤訊息（透過 query string `?error=1` 觸發）。

---

### `src/views/dashboard.ejs`

後台首頁儀表板。

4 張統計卡片：**活躍客戶數**、**API Key 數**、**本月處理張數**、**今日處理張數**。

---

### `src/views/clients.ejs`

客戶管理列表頁。

表格欄位：客戶 Email、連結名稱、方案（下拉選單，選擇即 POST submit）、本月用量、帳號狀態、操作（啟用/停用、新增 API Key）。

---

### `src/views/tiers.ejs`

方案管理頁。

左側：方案列表（名稱、每月上限、狀態、操作）。右側：新增方案表單。編輯方案透過 `openEdit(id, name, limit)` 開啟 modal 覆蓋層。

---

### `src/views/users.ejs`

管理員帳號管理頁（superadmin only）。

左側：管理員列表（帳號、角色、狀態、操作）。右側：新增帳號表單（帳號、密碼、角色）。

---

### `src/views/stats.ejs`

用量報表頁。

- 近 30 天每日處理張數長條圖（Chart.js）
- 近 6 個月每月處理張數長條圖（Chart.js）
- 本月前 10 大用量客戶表格（含處理張數與節省空間）

`fmtBytes()` 以 EJS function 定義在模板內，供 server-side 渲染表格中的 bytes 格式化。

---

### `src/views/partials/header.ejs`

所有後台頁面共用的 HTML 開頭與側邊欄。

Sidebar 連結：儀表板、客戶管理、方案管理、用量報表、管理員帳號（superadmin 限定）。目前頁面連結加 `.active` class。右上角顯示登入帳號名稱與登出按鈕（POST `/admin/logout`）。

---

### `src/views/partials/footer.ejs`

關閉 main content 區塊與 `</body></html>` 的 HTML 結尾 partial。

---

### `src/public/admin.css`

後台全站樣式表（無框架，純手工 CSS）。主要區塊：

| 選擇器 | 說明 |
|--------|------|
| `.layout` / `.sidebar` / `.main` | 兩欄式版面（sidebar 固定寬 220px） |
| `.sidebar` | 深藍背景（`#1a2236`），白色字體，active 連結高亮 |
| `.stat-card` / `.card-grid` | 儀表板統計卡片格線 |
| `.badge.active` / `.badge.inactive` / `.badge.trial` | 狀態徽章（綠/紅/橘） |
| `.btn` / `.btn-primary` / `.btn-secondary` / `.btn-danger` / `.btn-sm` | 按鈕變體 |
| `.table-wrap table` | 資料表格樣式（hover 高亮） |
| `.alert` / `.alert-success` / `.alert-danger` | 通知訊息 |
| `.login-page` / `.login-box` | 登入頁置中版面 |
| `.modal-overlay` / `.modal` | 編輯方案用 Modal 覆蓋層 |

---

## API 規格

### `POST /api/process`

壓縮並可選加浮水印單張圖片。

**Headers：**
```
X-API-Key: <your-api-key>
Content-Type: multipart/form-data
```

**Form Fields：**

| 欄位 | 說明 |
|------|------|
| `image` | 圖片二進位資料（JPEG / PNG） |
| `options` | JSON 字串（見下） |

**options JSON：**

```json
{
  "quality": 82,
  "webpQuality": 80,
  "outputWebp": true,
  "watermarkUrl": "https://...",
  "watermarkPos": "br",
  "watermarkScale": 0.2,
  "watermarkOpacity": 0.7,
  "watermarkMarginX": 3,
  "watermarkMarginY": 3,
  "minWidthForWm": 400
}
```

**成功回應 200：**

```json
{
  "inputSize": 204800,
  "output": {
    "data": "<base64 JPEG>",
    "size": 98304
  },
  "webp": {
    "data": "<base64 WebP>",
    "size": 76800
  }
}
```

**失敗回應：**

- `400` — 缺少圖片欄位
- `401` — API Key 無效或停用
- `429` — 本月配額超限（`{ "error": "本月用量已達 500 張上限" }`）
- `500` — 伺服器內部錯誤

### `GET /health`

```json
{ "status": "ok", "version": "0.1.0" }
```

---

## Google OAuth 連結流程

```
WordPress 後台（帳號連結 Tab）
    │  點擊「使用 Google 帳號連結」
    ▼
GET /auth/google?wp_url=<callback-url>
    │  產生 state，存入 oauth_states 表
    ▼
Google OAuth 授權頁
    │  使用者同意
    ▼
GET /auth/google/callback?code=xxx&state=yyy
    │  驗證 state → 換 id_token → 建/找 client_accounts
    │  建 api_keys → 建 auth_token（一次性，5分鐘有效）
    ▼
redirect → WordPress admin.php?page=wio&wio_token=zzz
    │
    ▼  （WordPress plugin admin_init hook 偵測 wio_token）
GET /auth/exchange?token=zzz
    │  回傳 { api_key, email, name }，刪除 auth_token
    ▼
WIO_Settings::save_oauth() 儲存 api_key + email + name
    ▼
redirect 回設定頁，顯示「已成功連結」
```

---

## 版號

| 分支 | 版號 |
|------|------|
| main | `0.0.1` |
| develop | `0.1.0` |

正式上線版本從 `1.0.0` 開始。
