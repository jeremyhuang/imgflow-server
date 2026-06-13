'use strict';

/**
 * API Key 驗證 middleware
 * Header: X-API-Key: <key>
 */
function authMiddleware(req, res, next) {
  const key = req.headers['x-api-key'];

  if (!key || key !== process.env.API_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  next();
}

module.exports = authMiddleware;
