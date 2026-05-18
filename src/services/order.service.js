const prisma = require('../config/database');
const emailService = require('./email.service');
const inventoryService = require('./inventory.service');
const discountService = require('./discount.service');

const VALID_TRANSITIONS = {
  PENDING:   ['PAID', 'CANCELLED'],
  PAID:      ['PACKED', 'REFUNDED'],
  PACKED:    ['SHIPPED'],
  SHIPPED:   ['DELIVERED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED:  [],
};

const generateOrderNumber = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `ORD-${date}-${rand}`;
};

const createOrder = async ({ storeId, userId, items, tenantId, notes, discountCodes = [] }) => {
  if (!storeId || !userId || !tenantId || !Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error('storeId, userId, tenantId and at least one item are required'), { status: 400 });
  }

  const store = await prisma.store.findFirst({ where: { id: storeId, tenantId } });
  if (!store) throw Object.assign(new Error('Store not found'), { status: 404 });

  const variantIds = items.map((i) => i.variantId);
  const variants = await prisma.variant.findMany({
    where: { id: { in: variantIds }, product: { tenantId } },
    include: { product: true },
  });

  if (variants.length !== variantIds.length) {
    throw Object.assign(new Error('One or more variants not found for this tenant'), { status: 404 });
  }

  const variantMap = Object.fromEntries(variants.map((v) => [v.id, v]));

  for (const item of items) {
    const variant = variantMap[item.variantId];
    const available = variant.stock - variant.reservedStock;
    if (available < item.quantity) {
      throw Object.assign(
        new Error(`Insufficient stock for SKU ${variant.sku}: ${available} available, requested ${item.quantity}`),
        { status: 400 }
      );
    }
  }

  const orderItems = items.map((item) => {
    const variant = variantMap[item.variantId];
    const unitPrice = variant.price ?? variant.product.price ?? 0;
    return { variantId: item.variantId, quantity: item.quantity, unitPrice };
  });

  const subtotal = orderItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const discountResult = await discountService.applyDiscountCodes({ tenantId, storeId, subtotal, codes: discountCodes });
  const routingPlan = await inventoryService.routeInventory({ items, tenantId, storeId });

  const order = await prisma.$transaction(async (tx) => {
    const newOrder = await tx.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        status: 'PENDING',
        totalAmount: discountResult.finalTotal,
        discountCode: discountResult.applied.map((discount) => discount.code).join(',') || null,
        discountAmount: discountResult.totalDiscount,
        notes,
        tenantId,
        storeId,
        userId,
        items: { create: orderItems },
      },
      include: {
        items: { include: { variant: { select: { id: true, sku: true } } } },
        store: { select: { id: true, name: true } },
        user: { select: { id: true, email: true } },
      },
    });

    await Promise.all(
      items.map((item) =>
        tx.variant.update({
          where: { id: item.variantId },
          data: { reservedStock: { increment: item.quantity } },
        })
      )
    );

    if (routingPlan?.length) {
      await inventoryService.reserveWarehousePlan({ tx, orderId: newOrder.id, plan: routingPlan });
    }

    await discountService.incrementRedemptions({
      tx,
      discountIds: discountResult.applied.map((discount) => discount.id),
    });

    return newOrder;
  });

  await emailService.sendOrderConfirmationEmail(order.user.email, order);
  const storeWithMerchant = await prisma.store.findFirst({
    where: { id: storeId, tenantId },
    include: { merchant: { select: { email: true } } },
  });
  if (storeWithMerchant?.merchant?.email) {
    await emailService.sendMerchantOrderNotificationEmail(storeWithMerchant.merchant.email, order);
  }

  return order;
};

const getOrder = async ({ orderId, tenantId, userId, role }) => {
  const where = { id: orderId };
  if (tenantId) where.tenantId = tenantId;
  if (role === 'CUSTOMER') where.userId = userId;

  const order = await prisma.order.findFirst({
    where,
    include: {
      items: { include: { variant: true } },
      store: { select: { id: true, name: true } },
      user: { select: { id: true, email: true } },
    },
  });
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  return order;
};

const listOrders = async ({ tenantId, storeId, status, userId, role, page = 1, limit = 20 }) => {
  const skip = (Number(page) - 1) * Number(limit);
  const where = {};
  if (tenantId) where.tenantId = tenantId;
  if (storeId) where.storeId = storeId;
  if (status) where.status = status;
  if (role === 'CUSTOMER') where.userId = userId;
  else if (userId) where.userId = userId;

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      skip,
      take: Number(limit),
      include: {
        store: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.order.count({ where }),
  ]);

  return { orders, total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) };
};

const updateOrderStatus = async ({ orderId, status, tenantId }) => {
  const where = { id: orderId };
  if (tenantId) where.tenantId = tenantId;

  const order = await prisma.order.findFirst({ where, include: { items: true } });
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });

  const validNext = VALID_TRANSITIONS[order.status] ?? [];
  if (!validNext.includes(status)) {
    throw Object.assign(
      new Error(`Cannot transition ${order.status} → ${status}. Allowed: ${validNext.join(', ') || 'none'}`),
      { status: 400 }
    );
  }

  // On PAID: deduct actual stock (reserved → sold)
  if (status === 'PAID') {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({ where: { id: orderId }, data: { status } });
      if (tx.inventoryReservation) {
        await inventoryService.finalizeWarehouseReservations({ tx, orderId });
      }
      await Promise.all(
        order.items.map((item) =>
          tx.variant.update({
            where: { id: item.variantId },
            data: {
              stock: { decrement: item.quantity },
              reservedStock: { decrement: item.quantity },
            },
          })
        )
      );
      return updated;
    });
  }

  // On CANCELLED: release reserved stock
  if (status === 'CANCELLED') {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({ where: { id: orderId }, data: { status } });
      if (tx.inventoryReservation) {
        await inventoryService.releaseWarehouseReservations({ tx, orderId });
      }
      await Promise.all(
        order.items.map((item) =>
          tx.variant.update({
            where: { id: item.variantId },
            data: { reservedStock: { decrement: item.quantity } },
          })
        )
      );
      return updated;
    });
  }

  return prisma.order.update({ where: { id: orderId }, data: { status } });
};

const cancelOrder = async ({ orderId, tenantId, userId, role }) => {
  const where = { id: orderId };
  if (tenantId) where.tenantId = tenantId;
  if (role === 'CUSTOMER') where.userId = userId;

  const order = await prisma.order.findFirst({ where, include: { items: true } });
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });

  if (!VALID_TRANSITIONS[order.status]?.includes('CANCELLED')) {
    throw Object.assign(new Error(`Cannot cancel an order in status: ${order.status}`), { status: 400 });
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
    if (tx.inventoryReservation) {
      await inventoryService.releaseWarehouseReservations({ tx, orderId });
    }
    await Promise.all(
      order.items.map((item) =>
        tx.variant.update({
          where: { id: item.variantId },
          data: { reservedStock: { decrement: item.quantity } },
        })
      )
    );
    return updated;
  });
};

module.exports = { createOrder, getOrder, listOrders, updateOrderStatus, cancelOrder };
