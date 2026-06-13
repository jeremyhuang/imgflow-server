'use strict';

const express = require('express');
const crypto  = require('crypto');
const fetch   = require('node-fetch');
const bcrypt  = require('bcryptjs');
const { db, getSetting } = require('../db');

const router = express.Router();

// ─── Google OAuth ─────────────────────────────────────────────────────────────

router.get('/auth/google', (req, res) => {
  const { redirect_uri } = req.query;
  if (!redirect_uri) return res.status(400).send('Missing redirect_uri');

  const clientId   = getSetting('google_client_id');
  const callbackUrl = getSetting('google_callback_url');
  if (!clientId || !callbackUrl) return res.status(503).send('Google OAuth 尚未設定，請聯繫管理員');

  const state      = crypto.randomBytes(16).toString('hex');
  const expiresAt  = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  db.prepare('INSERT INTO oauth_states (state, redirect_uri, expires_at) VALUES (?, ?, ?)').run(state, redirect_uri, expiresAt);
  db.prepare("DELETE FROM oauth_states WHERE expires_at < datetime('now')").run();

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  callbackUrl,
    response_type: 'code',
    scope:         'openid email profile',
    state,
    access_type:   'online',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/auth/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.status(400).send('Google OAuth 錯誤：' + error);

  const stateRow = db.prepare(
    "SELECT * FROM oauth_states WHERE state = ? AND expires_at > datetime('now')"
  ).get(state);

  if (!stateRow) return res.status(400).send('OAuth state 無效或已過期，請重新嘗試');
  db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);

  try {
    // 取得 access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        code,
        client_id:     getSetting('google_client_id'),
        client_secret: getSetting('google_client_secret'),
        redirect_uri:  getSetting('google_callback_url'),
        grant_type:    'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('無法取得 access token');

    // 取得 Google 使用者資料
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();

    // 找或建立客戶帳號
    let client = db.prepare('SELECT * FROM client_accounts WHERE google_id = ?').get(profile.sub);

    if (!client) {
      const result = db.prepare(`
        INSERT INTO client_accounts (google_id, email, name, avatar_url, tier_id)
        VALUES (?, ?, ?, ?, 1)
      `).run(profile.sub, profile.email, profile.name, profile.picture || null);
      client = db.prepare('SELECT * FROM client_accounts WHERE id = ?').get(result.lastInsertRowid);
    } else {
      db.prepare("UPDATE client_accounts SET last_login_at = datetime('now'), name = ?, avatar_url = ? WHERE id = ?")
        .run(profile.name, profile.picture || null, client.id);
    }

    if (!client.is_active) return res.status(403).send('此帳號已被停用，請聯繫管理員');

    // 找或建立 API Key
    let apiKey = db.prepare('SELECT * FROM api_keys WHERE client_id = ? AND is_active = 1 LIMIT 1').get(client.id);
    if (!apiKey) {
      const newKey = crypto.randomBytes(32).toString('hex');
      const result = db.prepare(`INSERT INTO api_keys (key, client_id, label) VALUES (?, ?, '預設')`).run(newKey, client.id);
      apiKey = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(result.lastInsertRowid);
    }

    // 建立短效 auth token（5 分鐘）
    const token     = crypto.randomBytes(16).toString('hex');
    const tokenExp  = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO auth_tokens (token, api_key_id, expires_at) VALUES (?, ?, ?)').run(token, apiKey.id, tokenExp);

    // 跳回 WordPress
    const redirectUrl = new URL(stateRow.redirect_uri);
    redirectUrl.searchParams.set('wio_token', token);
    res.redirect(redirectUrl.toString());

  } catch (err) {
    console.error('[oauth error]', err.message);
    res.status(500).send('OAuth 處理發生錯誤，請稍後再試');
  }
});

// ─── Token 交換（WordPress plugin 呼叫）────────────────────────────────────────

router.get('/auth/exchange', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ success: false, error: 'Missing token' });

  const record = db.prepare(`
    SELECT at.token, ak.key as api_key, ca.email, ca.name
    FROM auth_tokens at
    JOIN api_keys ak ON at.api_key_id = ak.id
    JOIN client_accounts ca ON ak.client_id = ca.id
    WHERE at.token = ? AND at.expires_at > datetime('now')
  `).get(token);

  if (!record) return res.status(401).json({ success: false, error: 'Token 無效或已過期' });

  db.prepare('DELETE FROM auth_tokens WHERE token = ?').run(token);

  res.json({ success: true, api_key: record.api_key, email: record.email, name: record.name });
});

// ─── 首次設定（無任何管理員時才開放）────────────────────────────────────────

router.get('/admin/setup', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as c FROM admin_users').get().c;
  if (count > 0) return res.redirect('/admin/login');
  res.render('setup', { error: null });
});

router.post('/admin/setup', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as c FROM admin_users').get().c;
  if (count > 0) return res.redirect('/admin/login');

  const { username, password, confirm } = req.body;
  if (!username || !password) return res.render('setup', { error: '請填寫帳號與密碼' });
  if (password !== confirm)   return res.render('setup', { error: '兩次密碼不一致' });
  if (password.length < 8)   return res.render('setup', { error: '密碼至少 8 個字元' });

  const hash = bcrypt.hashSync(password, 10);
  db.prepare("INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, 'superadmin')").run(username, hash);
  console.log('[setup] 已建立初始超級管理員:', username);

  res.redirect('/admin/login');
});

// ─── 管理員登入 ───────────────────────────────────────────────────────────────

router.get('/admin/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  const count = db.prepare('SELECT COUNT(*) as c FROM admin_users').get().c;
  if (count === 0) return res.redirect('/admin/setup');
  res.render('login', { error: null });
});

router.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ? AND is_active = 1').get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.render('login', { error: '帳號或密碼錯誤' });
  }

  db.prepare("UPDATE admin_users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  req.session.adminId       = user.id;
  req.session.adminUsername = user.username;
  req.session.adminRole     = user.role;

  const returnTo = req.session.returnTo || '/admin';
  delete req.session.returnTo;
  res.redirect(returnTo);
});

router.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

module.exports = router;
