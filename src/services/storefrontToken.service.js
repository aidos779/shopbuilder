const { randomBytes } = require('crypto');
const prisma = require('../config/database');
const { hashToken } = require('./auth.service');

const VALID_SCOPES = ['products:read', 'cart:write', 'orders:write'];

const createToken = async ({ name, scopes, tenantId, expiresAt }) => {
  if (!name || !tenantId || !Array.isArray(scopes) || scopes.length === 0) {
    throw Object.assign(new Error('name, tenantId and scopes are required'), { status: 400 });
  }
  const invalid = scopes.filter((scope) => !VALID_SCOPES.includes(scope));
  if (invalid.length) throw Object.assign(new Error(`Invalid scopes: ${invalid.join(', ')}`), { status: 400 });
  const token = `sb_pk_${randomBytes(32).toString('hex')}`;
  const record = await prisma.storefrontToken.create({
    data: { name, scopes, tenantId, tokenHash: hashToken(token), expiresAt: expiresAt ? new Date(expiresAt) : null },
  });
  return { token, record };
};

const listTokens = async ({ tenantId }) => {
  return prisma.storefrontToken.findMany({
    where: tenantId ? { tenantId } : {},
    select: { id: true, name: true, scopes: true, tenantId: true, expiresAt: true, revoked: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
};

module.exports = { createToken, listTokens, VALID_SCOPES };
