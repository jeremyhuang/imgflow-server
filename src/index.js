'use strict';

require('dotenv').config();

const express = require('express');
const multer  = require('multer');
const auth    = require('./auth');
const { processImage } = require('./processor');
const { version } = require('../package.json');

const app  = express();
const port = process.env.PORT || 3000;

// multer：圖片存記憶體，限 50 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ─── 健康檢查 ─────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version });
});

// ─── 圖片處理 ─────────────────────────────────────────────────────────────────
app.post('/api/process', auth, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: '缺少 image 欄位' });
  }

  // 解析 options（JSON 字串）
  let options = {};
  if (req.body.options) {
    try {
      options = JSON.parse(req.body.options);
    } catch {
      return res.status(400).json({ success: false, error: 'options 格式錯誤，需為 JSON 字串' });
    }
  }

  try {
    const result = await processImage(req.file.buffer, options);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[process error]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// ─── 啟動 ─────────────────────────────────────────────────────────────────────
app.listen(port, () => {
  console.log(`nas-image-service listening on port ${port}`);
});
