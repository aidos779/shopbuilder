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
  const warehouses = prisma.warehouseInventory
    ? await prisma.warehouseInventory.findMany({
        where: { variantId, warehouse: { ...(tenantId ? { tenantId } : {}) } },
        include: { warehouse: { select: { id: true, name: true, priority: true, region: true, storeId: true } } },
        orderBy: [{ warehouse: { priority: 'asc' } }, { updatedAt: 'desc' }],
      })
    : [];

  return {
    variantId: variant.id,
    sku: variant.sku,
    stock: variant.stock,
    reservedStock: variant.reservedStock,
    availableStock: variant.stock - variant.reservedStock,
    warehouses: warehouses.map((row) => ({
      warehouseId: row.warehouseId,
      warehouse: row.warehouse,
      stock: row.stock,
      reservedStock: row.reservedStock,
      availableStock: row.stock - row.reservedStock,
    })),
    updatedAt: variant.updatedAt,
  };
};

const listWarehouses = async ({ tenantId, storeId, page = 1, limit = 20 }) => {
  const skip = (Number(page) - 1) * Number(limit);
  const where = {};
  if (tenantId) where.tenantId = tenantId;
  if (storeId) where.storeId = storeId;

  const [warehouses, total] = await prisma.$transaction([
    prisma.warehouse.findMany({
      where,
      skip,
      take: Number(limit),
      include: { _count: { select: { inventory: true } } },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.warehouse.count({ where }),
  ]);

  return { warehouses, total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) };
};

const createWarehouse = async ({ name, priority = 100, address, region, storeId, tenantId }) => {
  if (!name || !tenantId) throw Object.assign(new Error('name and tenantId are required'), { status: 400 });
  if (storeId) {
    const store = await prisma.store.findFirst({ where: { id: storeId, tenantId } });
    if (!store) throw Object.assign(new Error('Store not found'), { status: 404 });
  }

  return prisma.warehouse.create({ data: { name, priority: Number(priority), address, region, storeId: storeId || null, tenantId } });
};

const setWarehouseStock = async ({ warehouseId, variantId, quantity, tenantId }) => {
  assertPositiveInt(quantity);
  const warehouse = await prisma.warehouse.findFirst({ where: { id: warehouseId, ...(tenantId ? { tenantId } : {}) } });
  if (!warehouse) throw Object.assign(new Error('Warehouse not found'), { status: 404 });
  await findVariant(variantId, tenantId);

  const inventory = await prisma.warehouseInventory.upsert({
    where: { warehouseId_variantId: { warehouseId, variantId } },
    create: { warehouseId, variantId, stock: quantity, reservedStock: 0 },
    update: { stock: quantity },
  });

  await syncVariantStockFromWarehouses({ variantId });
  return inventory;
};

const routeInventory = async ({ items, tenantId, storeId }) => {
  if (!prisma.warehouseInventory) return null;
  const plans = [];

  for (const item of items) {
    assertPositiveInt(item.quantity);
    const rows = await prisma.warehouseInventory.findMany({
      where: {
        variantId: item.variantId,
        warehouse: {
          ...(tenantId ? { tenantId } : {}),
          OR: [{ storeId }, { storeId: null }],
        },
      },
      include: { warehouse: true },
      orderBy: [{ warehouse: { priority: 'asc' } }, { updatedAt: 'desc' }],
    });

    let remaining = item.quantity;
    for (const row of rows) {
      const available = row.stock - row.reservedStock;
      if (available <= 0) continue;
      const quantity = Math.min(available, remaining);
      plans.push({ variantId: item.variantId, warehouseId: row.warehouseId, quantity });
      remaining -= quantity;
      if (remaining === 0) break;
    }

    if (remaining > 0) {
      return null;
    }
  }

  return plans;
};

const reserveWarehousePlan = async ({ tx, orderId, plan }) => {
  for (const line of plan) {
    await tx.warehouseInventory.update({
      where: { warehouseId_variantId: { warehouseId: line.warehouseId, variantId: line.variantId } },
      data: { reservedStock: { increment: line.quantity } },
    });
    await tx.inventoryReservation.create({
      data: { orderId, warehouseId: line.warehouseId, variantId: line.variantId, quantity: line.quantity },
    });
  }
};

const finalizeWarehouseReservations = async ({ tx, orderId }) => {
  const reservations = await tx.inventoryReservation.findMany({ where: { orderId } });
  for (const reservation of reservations) {
    await tx.warehouseInventory.update({
      where: {
        warehouseId_variantId: {
          warehouseId: reservation.warehouseId,
          variantId: reservation.variantId,
        },
      },
      data: {
        stock: { decrement: reservation.quantity },
        reservedStock: { decrement: reservation.quantity },
      },
    });
  }
};

const releaseWarehouseReservations = async ({ tx, orderId }) => {
  const reservations = await tx.inventoryReservation.findMany({ where: { orderId } });
  for (const reservation of reservations) {
    await tx.warehouseInventory.update({
      where: {
        warehouseId_variantId: {
          warehouseId: reservation.warehouseId,
          variantId: reservation.variantId,
        },
      },
      data: { reservedStock: { decrement: reservation.quantity } },
    });
  }
  await tx.inventoryReservation.deleteMany({ where: { orderId } });
};

const syncVariantStockFromWarehouses = async ({ variantId }) => {
  const rows = await prisma.warehouseInventory.findMany({ where: { variantId } });
  if (rows.length === 0) return;
  const stock = rows.reduce((sum, row) => sum + row.stock, 0);
  const reservedStock = rows.reduce((sum, row) => sum + row.reservedStock, 0);
  await prisma.variant.update({ where: { id: variantId }, data: { stock, reservedStock } });
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
  listWarehouses,
  createWarehouse,
  setWarehouseStock,
  routeInventory,
  reserveWarehousePlan,
  finalizeWarehouseReservations,
  releaseWarehouseReservations,
  increaseStock,
  decreaseStock,
  reserveStock,
  releaseStock,
  transferInventory,
};
