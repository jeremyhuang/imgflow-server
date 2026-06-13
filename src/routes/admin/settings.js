'use strict';

const express = require('express');
const { getSetting, setSetting } = require('../../db');

const router = express.Router();

const KEYS = ['google_client_id', 'google_client_secret'];

const SUFFIX = '/auth/google/callback';

function domainFromCallbackUrl(url) {
  return url.endsWith(SUFFIX) ? url.slice(0, -SUFFIX.length) : url;
}

router.get('/', (req, res) => {
  if (req.session.adminRole !== 'superadmin') return res.redirect('/admin');

  res.render('settings', {
    page:   'settings',
    title:  '系統設定',
    saved:  req.query.saved === '1',
    domain: domainFromCallbackUrl(getSetting('google_callback_url')),
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

  if (req.body.google_domain !== undefined) {
    const domain = req.body.google_domain.trim().replace(/\/$/, '');
    setSetting('google_callback_url', domain ? domain + SUFFIX : '');
  }

  res.redirect('/admin/settings?saved=1');
});

module.exports = router;
