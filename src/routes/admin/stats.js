'use strict';

const express = require('express');
const { db }  = require('../../db');

const router = express.Router();

router.get('/', (req, res) => {
  const daily = db.prepare(`
    SELECT date(created_at) as day,
           COUNT(*)         as count,
           SUM(input_size)  as total_input,
           SUM(output_size) as total_output
    FROM usage_logs
    WHERE created_at >= datetime('now', '-30 days')
    GROUP BY day
    ORDER BY day
  `).all();

  const monthly = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month,
           COUNT(*)                      as count,
           SUM(input_size)               as total_input,
           SUM(output_size)              as total_output
    FROM usage_logs
    WHERE created_at >= datetime('now', '-6 months')
    GROUP BY month
    ORDER BY month
  `).all();

  const topClients = db.prepare(`
    SELECT ca.name, ca.email, t.name as tier,
           COUNT(ul.id)       as count,
           SUM(ul.input_size)  as total_input,
           SUM(ul.output_size) as total_output
    FROM usage_logs ul
    JOIN api_keys ak        ON ul.api_key_id = ak.id
    JOIN client_accounts ca ON ak.client_id  = ca.id
    JOIN tiers t            ON ca.tier_id    = t.id
    WHERE ul.created_at >= datetime('now', 'start of month')
    GROUP BY ca.id
    ORDER BY count DESC
    LIMIT 10
  `).all();

  res.render('stats', {
    page:       'stats',
    title:      '用量報表',
    daily:      JSON.stringify(daily),
    monthly:    JSON.stringify(monthly),
    topClients,
  });
});

module.exports = router;
