'use strict';

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'imgflow.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ───────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT    UNIQUE NOT NULL,
    password_hash   TEXT    NOT NULL,
    role            TEXT    NOT NULL DEFAULT 'admin',
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    last_login_at   TEXT
  );

  CREATE TABLE IF NOT EXISTS tiers (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT    NOT NULL,
    monthly_image_limit INTEGER NOT NULL DEFAULT 0,
    price               INTEGER NOT NULL DEFAULT 0,
    is_active           INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS client_accounts (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id           TEXT    UNIQUE NOT NULL,
    email               TEXT    UNIQUE NOT NULL,
    name                TEXT    NOT NULL,
    avatar_url          TEXT,
    tier_id             INTEGER NOT NULL DEFAULT 1,
    is_active           INTEGER NOT NULL DEFAULT 1,
    subscription_status TEXT    NOT NULL DEFAULT 'trial',
    current_period_end  TEXT,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    last_login_at       TEXT,
    FOREIGN KEY (tier_id) REFERENCES tiers(id)
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    key          TEXT    UNIQUE NOT NULL,
    client_id    INTEGER NOT NULL,
    label        TEXT    NOT NULL DEFAULT '預設',
    is_active    INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT,
    FOREIGN KEY (client_id) REFERENCES client_accounts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS usage_logs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key_id     INTEGER NOT NULL,
    input_size     INTEGER NOT NULL DEFAULT 0,
    output_size    INTEGER NOT NULL DEFAULT 0,
    webp_size      INTEGER NOT NULL DEFAULT 0,
    has_watermark  INTEGER NOT NULL DEFAULT 0,
    processing_ms  INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
  );

  CREATE TABLE IF NOT EXISTS oauth_states (
    state        TEXT PRIMARY KEY,
    redirect_uri TEXT NOT NULL,
    expires_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auth_tokens (
    token      TEXT    PRIMARY KEY,
    api_key_id INTEGER NOT NULL,
    expires_at TEXT    NOT NULL,
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
  );
`);

// ─── 初始資料 ─────────────────────────────────────────────────────────────────

const tierCount = db.prepare('SELECT COUNT(*) as c FROM tiers').get().c;
if (tierCount === 0) {
  db.prepare(`INSERT INTO tiers (name, monthly_image_limit, price) VALUES ('試用', 0, 0)`).run();
  console.log('[db] 已建立預設試用方案');
}

const adminCount = db.prepare('SELECT COUNT(*) as c FROM admin_users').get().c;
if (adminCount === 0 && process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
  const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
  db.prepare(`INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, 'superadmin')`)
    .run(process.env.ADMIN_USERNAME, hash);
  console.log('[db] 已建立初始超級管理員:', process.env.ADMIN_USERNAME);
}

// ─── 工具函式 ─────────────────────────────────────────────────────────────────

function checkQuota(clientId, monthlyLimit) {
  if (monthlyLimit === 0) return { allowed: true, used: 0, limit: 0 };

  const used = db.prepare(`
    SELECT COUNT(*) as c
    FROM usage_logs ul
    JOIN api_keys ak ON ul.api_key_id = ak.id
    WHERE ak.client_id = ?
      AND ul.created_at >= datetime('now', 'start of month')
  `).get(clientId).c;

  return { allowed: used < monthlyLimit, used, limit: monthlyLimit };
}

module.exports = { db, checkQuota };
