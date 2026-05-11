const prisma = require('../config/database');

const listStores = async ({ tenantId, merchantId, page = 1, limit = 20 }) => {
  const skip = (Number(page) - 1) * Number(limit);
  const where = {};
  if (tenantId) where.tenantId = tenantId;
  if (merchantId) where.merchantId = merchantId;

  const [stores, total] = await prisma.$transaction([
    prisma.store.findMany({
      where,
      skip,
      take: Number(limit),
      include: {
        merchant: { select: { id: true, name: true, status: true } },
        _count: { select: { products: true, orders: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.store.count({ where }),
  ]);

  return { stores, total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) };
};

const getStore = async ({ storeId, tenantId }) => {
  const where = { id: storeId };
  if (tenantId) where.tenantId = tenantId;

  const store = await prisma.store.findFirst({
    where,
    include: {
      merchant: true,
      _count: { select: { products: true, orders: true } },
    },
  });
  if (!store) throw Object.assign(new Error('Store not found'), { status: 404 });
  return store;
};

const createStore = async ({ name, description, merchantId, tenantId }) => {
  if (!name || !merchantId || !tenantId) {
    throw Object.assign(new Error('name, merchantId and tenantId are required'), { status: 400 });
  }

  const merchant = await prisma.merchant.findFirst({ where: { id: merchantId, tenantId } });
  if (!merchant) throw Object.assign(new Error('Merchant not found'), { status: 404 });

  return prisma.store.create({ data: { name, description, merchantId, tenantId } });
};

const updateStore = async ({ storeId, data, tenantId }) => {
  const where = { id: storeId };
  if (tenantId) where.tenantId = tenantId;

  const store = await prisma.store.findFirst({ where });
  if (!store) throw Object.assign(new Error('Store not found'), { status: 404 });

  const { name, description } = data;
  return prisma.store.update({ where: { id: storeId }, data: { name, description } });
};

const deleteStore = async ({ storeId, tenantId }) => {
  const where = { id: storeId };
  if (tenantId) where.tenantId = tenantId;

  const store = await prisma.store.findFirst({ where });
  if (!store) throw Object.assign(new Error('Store not found'), { status: 404 });

  await prisma.store.delete({ where: { id: storeId } });
};

module.exports = { listStores, getStore, createStore, updateStore, deleteStore };
