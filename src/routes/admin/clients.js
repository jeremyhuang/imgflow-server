'use strict';

const express = require('express');
const crypto  = require('crypto');
const { db }  = require('../../db');

const router = express.Router();

router.get('/', (req, res) => {
  const clients = db.prepare(`
    SELECT ca.*, t.name as tier_name,
      (SELECT key  FROM api_keys WHERE client_id = ca.id AND is_active = 1 ORDER BY id DESC LIMIT 1) as api_key,
      (SELECT COALESCE(SUM(ul.action_count), 0) FROM usage_logs ul
         JOIN api_keys ak ON ul.api_key_id = ak.id
         WHERE ak.client_id = ca.id
           AND ul.created_at >= datetime('now', 'start of month')) as monthly_usage,
      cs.settings_json,
      cs.updated_at as settings_updated_at
    FROM client_accounts ca
    LEFT JOIN tiers t ON ca.tier_id = t.id
    LEFT JOIN client_settings cs ON cs.client_id = ca.id
    ORDER BY ca.created_at DESC
  `).all();

  const tiers = db.prepare('SELECT * FROM tiers WHERE is_active = 1 ORDER BY id').all();

  res.render('clients', { page: 'clients', title: '客戶管理', clients, tiers });
});

// 變更方案
router.post('/:id/tier', (req, res) => {
  db.prepare('UPDATE client_accounts SET tier_id = ? WHERE id = ?').run(req.body.tier_id, req.params.id);
  res.redirect('/admin/clients');
});

// 啟用 / 停用帳號
router.post('/:id/toggle', (req, res) => {
  db.prepare('UPDATE client_accounts SET is_active = NOT is_active WHERE id = ?').run(req.params.id);
  res.redirect('/admin/clients');
});

// 重置 API Key（停用舊 key，產生新 key）
router.post('/:id/key/reset', (req, res) => {
  const newKey = crypto.randomBytes(32).toString('hex');
  db.prepare('UPDATE api_keys SET is_active = 0 WHERE client_id = ?').run(req.params.id);
  db.prepare("INSERT INTO api_keys (key, client_id, label) VALUES (?, ?, 'key')").run(newKey, req.params.id);
  res.redirect('/admin/clients');
});

module.exports = router;
