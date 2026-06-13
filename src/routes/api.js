'use strict';

const express      = require('express');
const multer       = require('multer');
const { db }       = require('../db');
const apiAuth      = require('../middleware/apiAuth');
const { processImage } = require('../processor');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

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

    const actions = Array.isArray(options.actions) ? options.actions : ['compress', 'watermark', 'webp'];
    db.prepare(`
      INSERT INTO usage_logs (api_key_id, input_size, output_size, webp_size, has_watermark, processing_ms, action_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.apiKeyId,
      result.inputSize,
      result.output.size,
      result.webp?.size ?? 0,
      (options.watermarkUrl && actions.includes('watermark')) ? 1 : 0,
      Date.now() - startMs,
      actions.length
    );

    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[process error]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
