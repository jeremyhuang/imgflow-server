'use strict';

const express = require('express');
const session = require('express-session');
const path    = require('path');

const { getSetting } = require('./db'); // 初始化資料庫（含 session secret 自動產生）

const { version } = require('../package.json');
const authRouter   = require('./routes/auth');
const apiRouter    = require('./routes/api');
const adminRouter  = require('./routes/admin/index');

const app  = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1); // Synology Reverse Proxy 後面必須加，否則 secure cookie 失效

// ─── View engine ──────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── Static files ─────────────────────────────────────────────────────────────
app.use('/admin', express.static(path.join(__dirname, 'public')));

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Session ──────────────────────────────────────────────────────────────────
app.use(session({
  secret:            getSetting('session_secret'),
  resave:            false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure:   false, // HTTPS 由 Synology Reverse Proxy 處理，容器內部走 HTTP
    maxAge:   24 * 60 * 60 * 1000, // 1 天
  },
}));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', version }));

app.use('/',      authRouter);
app.use('/api',   apiRouter);
app.use('/admin', adminRouter);

// ─── 404 / Error ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

app.use((err, req, res, _next) => {
  console.error('[error]', err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`imgflow-server v${version} listening on port ${port}`);
});
