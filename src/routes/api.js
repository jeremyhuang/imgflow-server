'use strict';

const express      = require('express');
const multer       = require('multer');
const { db }       = require('../db');
const apiAuth      = require('../middleware/apiAuth');
const { processImage } = require('../processor');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.get('/verify', apiAuth, (req, res) => {
  res.json({ status: 'ok' });
});

router.post('/user/settings', apiAuth, (req, res) => {
  const row = db.prepare('SELECT client_id FROM api_keys WHERE id = ?').get(req.apiKeyId);
  if (!row) return res.status(404).json({ success: false });

  const json = JSON.stringify(req.body || {});
  db.prepare(`
    INSERT INTO client_settings (client_id, settings_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(client_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at
  `).run(row.client_id, json);

  res.json({ success: true });
});

router.post('/process', apiAuth, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: '缺少 image 欄位' });
  }

  let options = {};
  if (req.body.options) {
    try { options = JSON.parse(req.body.options); }
    catch { return res.status(400).json({ success: false, error: 'options 格式錯誤，需為 JSON 字串' }); }
  }

  const startMs = Date.now();

  try {
    const result = await processImage(req.file.buffer, options);

    const actions    = Array.isArray(options.actions) ? options.actions : ['compress', 'watermark', 'webp'];
    const filename   = req.file.originalname || '';
    const sourceUrl  = typeof options.sourceUrl === 'string' ? options.sourceUrl : '';
    db.prepare(`
      INSERT INTO usage_logs (api_key_id, input_size, output_size, webp_size, has_watermark, processing_ms, action_count, filename, actions_json, source_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.apiKeyId,
      result.inputSize,
      result.output.size,
      result.webp?.size ?? 0,
      (options.watermarkUrl && actions.includes('watermark')) ? 1 : 0,
      Date.now() - startMs,
      actions.length,
      filename,
      JSON.stringify(actions),
      sourceUrl,
    );

    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[process error]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
