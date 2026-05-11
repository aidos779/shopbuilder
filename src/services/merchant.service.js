const prisma = require('../config/database');

const listMerchants = async ({ tenantId, status, page = 1, limit = 20 }) => {
  const skip = (Number(page) - 1) * Number(limit);
  const where = {};
  if (tenantId) where.tenantId = tenantId;
  if (status) where.status = status;

  const [merchants, total] = await prisma.$transaction([
    prisma.merchant.findMany({
      where,
      skip,
      take: Number(limit),
      include: { _count: { select: { stores: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.merchant.count({ where }),
  ]);

  return { merchants, total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) };
};

const getMerchant = async ({ merchantId, tenantId }) => {
  const where = { id: merchantId };
  if (tenantId) where.tenantId = tenantId;

  const merchant = await prisma.merchant.findFirst({
    where,
    include: { stores: { include: { _count: { select: { products: true, orders: true } } } } },
  });
  if (!merchant) throw Object.assign(new Error('Merchant not found'), { status: 404 });
  return merchant;
};

const createMerchant = async ({ name, email, phone, address, tenantId }) => {
  if (!name || !email || !tenantId) {
    throw Object.assign(new Error('name, email and tenantId are required'), { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw Object.assign(new Error('Tenant not found'), { status: 404 });

  const existing = await prisma.merchant.findUnique({ where: { email } });
  if (existing) throw Object.assign(new Error('Merchant with this email already exists'), { status: 409 });

  return prisma.merchant.create({ data: { name, email, phone, address, tenantId } });
};

const updateMerchant = async ({ merchantId, data, tenantId }) => {
  const where = { id: merchantId };
  if (tenantId) where.tenantId = tenantId;

  const merchant = await prisma.merchant.findFirst({ where });
  if (!merchant) throw Object.assign(new Error('Merchant not found'), { status: 404 });

  const { name, email, phone, address } = data;
  return prisma.merchant.update({ where: { id: merchantId }, data: { name, email, phone, address } });
};

const deleteMerchant = async ({ merchantId, tenantId }) => {
  const where = { id: merchantId };
  if (tenantId) where.tenantId = tenantId;

  const merchant = await prisma.merchant.findFirst({ where });
  if (!merchant) throw Object.assign(new Error('Merchant not found'), { status: 404 });

  await prisma.merchant.delete({ where: { id: merchantId } });
};

const updateMerchantStatus = async ({ merchantId, status, tenantId }) => {
  const where = { id: merchantId };
  if (tenantId) where.tenantId = tenantId;

  const merchant = await prisma.merchant.findFirst({ where });
  if (!merchant) throw Object.assign(new Error('Merchant not found'), { status: 404 });

  return prisma.merchant.update({ where: { id: merchantId }, data: { status } });
};

module.exports = {
  listMerchants,
  getMerchant,
  createMerchant,
  updateMerchant,
  deleteMerchant,
  updateMerchantStatus,
};
