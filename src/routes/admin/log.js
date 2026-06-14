'use strict';

const express = require('express');
const { db }  = require('../../db');

const router = express.Router();

router.get('/', (req, res) => {
  const page     = Math.max(1, parseInt(req.query.page) || 1);
  const per_page = 30;
  const offset   = (page - 1) * per_page;

  const total = db.prepare('SELECT COUNT(*) as c FROM usage_logs').get().c;

  const logs = db.prepare(`
    SELECT ul.*, ca.name as client_name, ca.email as client_email
    FROM usage_logs ul
    JOIN api_keys ak ON ul.api_key_id = ak.id
    JOIN client_accounts ca ON ak.client_id = ca.id
    ORDER BY ul.created_at DESC
    LIMIT ? OFFSET ?
  `).all(per_page, offset);

  res.render('log', {
    page:         'log',
    title:        '處理記錄',
    logs,
    total,
    per_page,
    current_page: page,
    total_pages:  Math.ceil(total / per_page),
  });
});

module.exports = router;
