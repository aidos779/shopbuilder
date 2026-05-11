const prisma = require('../config/database');

const findVariant = async (variantId, tenantId) => {
  const variant = await prisma.variant.findFirst({
    where: { id: variantId, ...(tenantId ? { product: { tenantId } } : {}) },
  });
  if (!variant) throw Object.assign(new Error('Variant not found'), { status: 404 });
  return variant;
};

const assertPositiveInt = (quantity) => {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw Object.assign(new Error('quantity must be a positive integer'), { status: 400 });
  }
};

const getInventoryStatus = async ({ variantId, tenantId }) => {
  const variant = await findVariant(variantId, tenantId);
  return {
    variantId: variant.id,
    sku: variant.sku,
    stock: variant.stock,
    reservedStock: variant.reservedStock,
    availableStock: variant.stock - variant.reservedStock,
    updatedAt: variant.updatedAt,
  };
};

const increaseStock = async ({ variantId, quantity, tenantId }) => {
  assertPositiveInt(quantity);
  await findVariant(variantId, tenantId);
  return prisma.variant.update({
    where: { id: variantId },
    data: { stock: { increment: quantity } },
  });
};

const decreaseStock = async ({ variantId, quantity, tenantId }) => {
  assertPositiveInt(quantity);
  const variant = await findVariant(variantId, tenantId);
  if (variant.stock - quantity < 0) {
    throw Object.assign(
      new Error(`Insufficient stock: ${variant.stock} available, requested ${quantity}`),
      { status: 400 }
    );
  }
  return prisma.variant.update({
    where: { id: variantId },
    data: { stock: { decrement: quantity } },
  });
};

const reserveStock = async ({ variantId, quantity, tenantId }) => {
  assertPositiveInt(quantity);
  const variant = await findVariant(variantId, tenantId);
  const available = variant.stock - variant.reservedStock;
  if (available < quantity) {
    throw Object.assign(
      new Error(`Insufficient available stock: ${available} available, requested ${quantity}`),
      { status: 400 }
    );
  }
  return prisma.variant.update({
    where: { id: variantId },
    data: { reservedStock: { increment: quantity } },
  });
};

const releaseStock = async ({ variantId, quantity, tenantId }) => {
  assertPositiveInt(quantity);
  const variant = await findVariant(variantId, tenantId);
  if (variant.reservedStock - quantity < 0) {
    throw Object.assign(
      new Error(`Cannot release more than reserved: ${variant.reservedStock} reserved`),
      { status: 400 }
    );
  }
  return prisma.variant.update({
    where: { id: variantId },
    data: { reservedStock: { decrement: quantity } },
  });
};

const transferInventory = async ({ fromVariantId, toVariantId, quantity, tenantId }) => {
  assertPositiveInt(quantity);
  if (fromVariantId === toVariantId) {
    throw Object.assign(new Error('Source and destination variant must differ'), { status: 400 });
  }

  const [fromVariant] = await Promise.all([
    findVariant(fromVariantId, tenantId),
    findVariant(toVariantId, tenantId),
  ]);

  if (fromVariant.stock < quantity) {
    throw Object.assign(
      new Error(`Insufficient stock in source: ${fromVariant.stock} available`),
      { status: 400 }
    );
  }

  const [from, to] = await prisma.$transaction([
    prisma.variant.update({ where: { id: fromVariantId }, data: { stock: { decrement: quantity } } }),
    prisma.variant.update({ where: { id: toVariantId }, data: { stock: { increment: quantity } } }),
  ]);

  return { from, to, transferred: quantity };
};

module.exports = {
  getInventoryStatus,
  increaseStock,
  decreaseStock,
  reserveStock,
  releaseStock,
  transferInventory,
};
