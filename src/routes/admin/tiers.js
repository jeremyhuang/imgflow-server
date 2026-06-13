'use strict';

const express = require('express');
const { db }  = require('../../db');

const router = express.Router();

router.get('/', (req, res) => {
  const tiers = db.prepare(`
    SELECT t.*, COUNT(ca.id) as client_count
    FROM tiers t
    LEFT JOIN client_accounts ca ON ca.tier_id = t.id AND ca.is_active = 1
    GROUP BY t.id
    ORDER BY t.id
  `).all();

  res.render('tiers', { page: 'tiers', title: '方案管理', tiers });
});

router.post('/create', (req, res) => {
  const { name, monthly_image_limit, price } = req.body;
  db.prepare('INSERT INTO tiers (name, monthly_image_limit, price) VALUES (?, ?, ?)')
    .run(name, parseInt(monthly_image_limit) || 0, parseInt(price) || 0);
  res.redirect('/admin/tiers');
});

router.post('/:id/update', (req, res) => {
  const { name, monthly_image_limit, price } = req.body;
  db.prepare('UPDATE tiers SET name = ?, monthly_image_limit = ?, price = ? WHERE id = ?')
    .run(name, parseInt(monthly_image_limit) || 0, parseInt(price) || 0, req.params.id);
  res.redirect('/admin/tiers');
});

router.post('/:id/toggle', (req, res) => {
  db.prepare('UPDATE tiers SET is_active = NOT is_active WHERE id = ?').run(req.params.id);
  res.redirect('/admin/tiers');
});

module.exports = router;
