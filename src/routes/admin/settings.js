'use strict';

const express = require('express');
const { getSetting, setSetting } = require('../../db');

const router = express.Router();

const KEYS = ['google_client_id', 'google_client_secret', 'google_callback_url'];

router.get('/', (req, res) => {
  if (req.session.adminRole !== 'superadmin') return res.redirect('/admin');

  res.render('settings', {
    page:  'settings',
    title: '系統設定',
    saved: req.query.saved === '1',
    settings: Object.fromEntries(KEYS.map(k => [k, getSetting(k)])),
  });
});

router.post('/', (req, res) => {
  if (req.session.adminRole !== 'superadmin') return res.redirect('/admin');

  for (const key of KEYS) {
    if (req.body[key] !== undefined) {
      setSetting(key, req.body[key].trim());
    }
  }

  res.redirect('/admin/settings?saved=1');
});

module.exports = router;
