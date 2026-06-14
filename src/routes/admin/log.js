'use strict';

const express = require('express');
const { db }  = require('../../db');

const router = express.Router();

router.get('/', (req, res) => {
  const page      = Math.max(1, parseInt(req.query.page) || 1);
  const per_page  = 30;
  const offset    = (page - 1) * per_page;
  const clientId  = parseInt(req.query.client_id) || 0;
  const action    = ['compress', 'watermark', 'webp'].includes(req.query.action) ? req.query.action : '';

  const conditions = [];
  const args       = [];

  if (clientId) {
    conditions.push('ca.id = ?');
    args.push(clientId);
  }
  if (action) {
    conditions.push('ul.actions_json LIKE ?');
    args.push(`%"${action}"%`);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const base = `
    FROM usage_logs ul
    JOIN api_keys ak ON ul.api_key_id = ak.id
    JOIN client_accounts ca ON ak.client_id = ca.id
    ${where}
  `;

  const total = db.prepare(`SELECT COUNT(*) as c ${base}`).get(...args).c;

  const logs = db.prepare(`
    SELECT ul.*, ca.name as client_name, ca.email as client_email
    ${base}
    ORDER BY ul.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...args, per_page, offset);

  const clients = db.prepare('SELECT id, name FROM client_accounts ORDER BY name').all();

  res.render('log', {
    page:          'log',
    title:         '處理記錄',
    logs,
    total,
    per_page,
    current_page:  page,
    total_pages:   Math.ceil(total / per_page),
    clients,
    filter_client: clientId,
    filter_action: action,
  });
});

module.exports = router;
