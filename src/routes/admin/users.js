'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const { db }  = require('../../db');

const router = express.Router();

// 僅限 superadmin
router.use((req, res, next) => {
  if (req.session.adminRole !== 'superadmin') {
    return res.status(403).send('此頁面僅限超級管理員');
  }
  next();
});

router.get('/', (req, res) => {
  const users = db.prepare(
    'SELECT id, username, role, is_active, created_at, last_login_at FROM admin_users ORDER BY id'
  ).all();
  res.render('users', { page: 'users', title: '管理員帳號', users });
});

router.post('/create', (req, res) => {
  const { username, password, role } = req.body;
  try {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, role || 'admin');
  } catch { /* 重複帳號名稱，忽略 */ }
  res.redirect('/admin/users');
});

router.post('/:id/toggle', (req, res) => {
  if (parseInt(req.params.id) === req.session.adminId) return res.redirect('/admin/users');
  db.prepare('UPDATE admin_users SET is_active = NOT is_active WHERE id = ?').run(req.params.id);
  res.redirect('/admin/users');
});

router.post('/:id/reset-password', (req, res) => {
  const hash = bcrypt.hashSync(req.body.password, 10);
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
  res.redirect('/admin/users');
});

module.exports = router;
