'use strict';

const express   = require('express');
const adminAuth = require('../../middleware/adminAuth');
const { db }    = require('../../db');
const { version } = require('../../../package.json');

const router = express.Router();

// 所有 admin 路由都需要登入，並掛載 res.locals.admin / version
router.use((req, res, next) => {
  adminAuth(req, res, () => {
    res.locals.admin = {
      id:       req.session.adminId,
      username: req.session.adminUsername,
      role:     req.session.adminRole,
    };
    res.locals.version = version;
    next();
  });
});

// 總覽
router.get('/', (req, res) => {
  const totalClients  = db.prepare("SELECT COUNT(*) as c FROM client_accounts WHERE is_active = 1").get().c;
  const totalKeys     = db.prepare("SELECT COUNT(*) as c FROM api_keys WHERE is_active = 1").get().c;
  const monthlyImages = db.prepare("SELECT COUNT(*) as c FROM usage_logs WHERE created_at >= datetime('now', 'start of month')").get().c;
  const todayImages   = db.prepare("SELECT COUNT(*) as c FROM usage_logs WHERE created_at >= datetime('now', 'start of day')").get().c;

  res.render('dashboard', {
    page: 'dashboard',
    title: '總覽',
    stats: { totalClients, totalKeys, monthlyImages, todayImages },
  });
});

router.use('/clients',  require('./clients'));
router.use('/tiers',    require('./tiers'));
router.use('/users',    require('./users'));
router.use('/stats',    require('./stats'));
router.use('/log',      require('./log'));
router.use('/settings', require('./settings'));

module.exports = router;
