const prisma = require('../config/database');

const normalizeCode = (code) => code.trim().toUpperCase();

const assertDiscountValid = (discount, subtotal) => {
  const now = new Date();
  if (!discount || !discount.active) {
    throw Object.assign(new Error('Discount code is invalid or inactive'), { status: 400 });
  }
  if (discount.startsAt && discount.startsAt > now) {
    throw Object.assign(new Error('Discount code is not active yet'), { status: 400 });
  }
  if (discount.endsAt && discount.endsAt < now) {
    throw Object.assign(new Error('Discount code has expired'), { status: 400 });
  }
  if (discount.maxRedemptions && discount.redemptions >= discount.maxRedemptions) {
    throw Object.assign(new Error('Discount code redemption limit reached'), { status: 400 });
  }
  if (subtotal <= 0) {
    throw Object.assign(new Error('Discount cannot be applied to an empty subtotal'), { status: 400 });
  }
};

const calculateDiscountAmount = (discount, subtotal) => {
  if (discount.type === 'PERCENTAGE') {
    return Math.min(subtotal, Number(((subtotal * discount.value) / 100).toFixed(2)));
  }
  return Math.min(subtotal, Number(discount.value.toFixed(2)));
};

const createDiscount = async ({ tenantId, storeId, code, type, value, stackable = false, startsAt, endsAt, maxRedemptions }) => {
  if (!tenantId || !code || !type || value === undefined) {
    throw Object.assign(new Error('tenantId, code, type and value are required'), { status: 400 });
  }
  if (!['PERCENTAGE', 'FIXED_AMOUNT'].includes(type)) {
    throw Object.assign(new Error('type must be PERCENTAGE or FIXED_AMOUNT'), { status: 400 });
  }
  if (Number(value) <= 0) {
    throw Object.assign(new Error('value must be greater than zero'), { status: 400 });
  }
  if (storeId) {
    const store = await prisma.store.findFirst({ where: { id: storeId, tenantId } });
    if (!store) throw Object.assign(new Error('Store not found'), { status: 404 });
  }

  return prisma.discount.create({
    data: {
      tenantId,
      storeId: storeId || null,
      code: normalizeCode(code),
      type,
      value: Number(value),
      stackable: Boolean(stackable),
      startsAt: startsAt ? new Date(startsAt) : null,
      endsAt: endsAt ? new Date(endsAt) : null,
      maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
    },
  });
};

const listDiscounts = async ({ tenantId, storeId, page = 1, limit = 20 }) => {
  const skip = (Number(page) - 1) * Number(limit);
  const where = {};
  if (tenantId) where.tenantId = tenantId;
  if (storeId) where.storeId = storeId;

  const [discounts, total] = await prisma.$transaction([
    prisma.discount.findMany({ where, skip, take: Number(limit), orderBy: { createdAt: 'desc' } }),
    prisma.discount.count({ where }),
  ]);

  return { discounts, total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) };
};

const applyDiscountCodes = async ({ tenantId, storeId, subtotal, codes = [] }) => {
  const normalizedCodes = [...new Set(codes.filter(Boolean).map(normalizeCode))];
  if (normalizedCodes.length === 0) return { totalDiscount: 0, applied: [], finalTotal: subtotal };

  const discounts = await prisma.discount.findMany({
    where: {
      tenantId,
      code: { in: normalizedCodes },
      OR: [{ storeId }, { storeId: null }],
    },
    orderBy: [{ stackable: 'asc' }, { value: 'desc' }],
  });

  const applied = [];
  let totalDiscount = 0;
  let exclusiveApplied = false;

  for (const code of normalizedCodes) {
    const discount = discounts.find((row) => row.code === code);
    assertDiscountValid(discount, subtotal);
    if (exclusiveApplied || (!discount.stackable && applied.length > 0)) {
      throw Object.assign(new Error('This discount cannot be stacked with other codes'), { status: 400 });
    }
    const amount = calculateDiscountAmount(discount, subtotal - totalDiscount);
    totalDiscount = Number((totalDiscount + amount).toFixed(2));
    applied.push({ id: discount.id, code: discount.code, type: discount.type, amount, stackable: discount.stackable });
    if (!discount.stackable) exclusiveApplied = true;
  }

  return { totalDiscount, applied, finalTotal: Number(Math.max(0, subtotal - totalDiscount).toFixed(2)) };
};

const incrementRedemptions = async ({ tx, discountIds }) => {
  for (const id of discountIds) {
    await tx.discount.update({ where: { id }, data: { redemptions: { increment: 1 } } });
  }
};

module.exports = { createDiscount, listDiscounts, applyDiscountCodes, incrementRedemptions };
