const prisma = require('../config/database');
const { hashToken } = require('../services/auth.service');

const requireStorefrontScope = (...scopes) => async (req, res, next) => {
  const token = req.headers['x-storefront-token'] || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Storefront token is required' });

  try {
    const record = await prisma.storefrontToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!record || record.revoked || (record.expiresAt && record.expiresAt < new Date())) {
      return res.status(401).json({ error: 'Invalid storefront token' });
    }
    const missing = scopes.filter((scope) => !record.scopes.includes(scope));
    if (missing.length) return res.status(403).json({ error: `Missing storefront scope: ${missing.join(', ')}` });
    req.storefront = { tokenId: record.id, tenantId: record.tenantId, scopes: record.scopes };
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { requireStorefrontScope };
