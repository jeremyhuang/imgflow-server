'use strict';

const express = require('express');
const crypto  = require('crypto');
const { db }  = require('../../db');

const router = express.Router();

router.get('/', (req, res) => {
  const clients = db.prepare(`
    SELECT ca.*, t.name as tier_name,
      (SELECT COUNT(*) FROM api_keys WHERE client_id = ca.id AND is_active = 1) as key_count,
      (SELECT COUNT(*) FROM usage_logs ul
         JOIN api_keys ak ON ul.api_key_id = ak.id
         WHERE ak.client_id = ca.id
           AND ul.created_at >= datetime('now', 'start of month')) as monthly_usage
    FROM client_accounts ca
    LEFT JOIN tiers t ON ca.tier_id = t.id
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

// 啟用 / 停用
router.post('/:id/toggle', (req, res) => {
  db.prepare('UPDATE client_accounts SET is_active = NOT is_active WHERE id = ?').run(req.params.id);
  res.redirect('/admin/clients');
});

// 新增 API Key
router.post('/:id/key/create', (req, res) => {
  const newKey = crypto.randomBytes(32).toString('hex');
  const label  = req.body.label || '新 Key';
  db.prepare('INSERT INTO api_keys (key, client_id, label) VALUES (?, ?, ?)').run(newKey, req.params.id, label);
  res.redirect('/admin/clients');
});

// 啟用 / 停用 API Key
router.post('/:clientId/key/:keyId/toggle', (req, res) => {
  db.prepare('UPDATE api_keys SET is_active = NOT is_active WHERE id = ? AND client_id = ?')
    .run(req.params.keyId, req.params.clientId);
  res.redirect('/admin/clients');
});

module.exports = router;
