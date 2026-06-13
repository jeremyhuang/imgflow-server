'use strict';

const { db, checkQuota } = require('../db');

module.exports = function apiAuth(req, res, next) {
  const key = req.headers['x-api-key'];

  if (!key) {
    return res.status(401).json({ success: false, error: 'Missing API key' });
  }

  const record = db.prepare(`
    SELECT ak.id as key_id, ak.client_id,
           ca.is_active as client_active,
           t.monthly_image_limit
    FROM api_keys ak
    JOIN client_accounts ca ON ak.client_id = ca.id
    JOIN tiers t ON ca.tier_id = t.id
    WHERE ak.key = ? AND ak.is_active = 1
  `).get(key);

  if (!record) {
    return res.status(401).json({ success: false, error: 'Invalid or inactive API key' });
  }

  if (!record.client_active) {
    return res.status(403).json({ success: false, error: '帳號已停用，請聯繫管理員' });
  }

  const quota = checkQuota(record.client_id, record.monthly_image_limit);
  if (!quota.allowed) {
    return res.status(429).json({
      success: false,
      error: `本月用量已達上限（${quota.used}/${quota.limit} 張）`,
      quota,
    });
  }

  db.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").run(record.key_id);

  req.apiKeyId = record.key_id;
  req.clientId = record.client_id;
  next();
};
