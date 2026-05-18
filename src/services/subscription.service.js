const prisma = require('../config/database');

const createSubscription = async ({ userId, tenantId, storeId, planName, amount, currency = 'USD', nextBillingAt }) => {
  if (!userId || !tenantId || !planName || amount === undefined || !nextBillingAt) {
    throw Object.assign(new Error('userId, tenantId, planName, amount and nextBillingAt are required'), { status: 400 });
  }
  return prisma.subscription.create({
    data: { userId, tenantId, storeId: storeId || null, planName, amount: Number(amount), currency, nextBillingAt: new Date(nextBillingAt) },
  });
};

const listSubscriptions = async ({ tenantId, status, page = 1, limit = 20 }) => {
  const skip = (Number(page) - 1) * Number(limit);
  const where = {};
  if (tenantId) where.tenantId = tenantId;
  if (status) where.status = status;
  const [subscriptions, total] = await prisma.$transaction([
    prisma.subscription.findMany({ where, skip, take: Number(limit), include: { user: { select: { email: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.subscription.count({ where }),
  ]);
  return { subscriptions, total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) };
};

module.exports = { createSubscription, listSubscriptions };
