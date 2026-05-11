const prisma = require('../config/database');

const getCart = async ({ userId, storeId, tenantId }) => {
  if (!storeId) throw Object.assign(new Error('storeId is required'), { status: 400 });

  const store = await prisma.store.findFirst({ where: { id: storeId, tenantId } });
  if (!store) throw Object.assign(new Error('Store not found'), { status: 404 });

  const cart = await prisma.cart.findUnique({
    where: { userId_storeId: { userId, storeId } },
    include: {
      items: {
        include: {
          variant: {
            include: { product: { select: { id: true, name: true, price: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      store: { select: { id: true, name: true } },
    },
  });

  if (!cart) {
    return { items: [], store: { id: store.id, name: store.name }, subtotal: 0 };
  }

  const subtotal = cart.items.reduce((sum, item) => {
    const price = item.variant.price ?? item.variant.product.price ?? 0;
    return sum + price * item.quantity;
  }, 0);

  return { ...cart, subtotal };
};

const addItem = async ({ userId, storeId, tenantId, variantId, quantity = 1 }) => {
  if (!storeId || !variantId) {
    throw Object.assign(new Error('storeId and variantId are required'), { status: 400 });
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw Object.assign(new Error('quantity must be a positive integer'), { status: 400 });
  }

  const store = await prisma.store.findFirst({ where: { id: storeId, tenantId } });
  if (!store) throw Object.assign(new Error('Store not found'), { status: 404 });

  const variant = await prisma.variant.findFirst({
    where: { id: variantId, product: { tenantId } },
  });
  if (!variant) throw Object.assign(new Error('Variant not found'), { status: 404 });

  const available = variant.stock - variant.reservedStock;
  if (available < quantity) {
    throw Object.assign(
      new Error(`Insufficient stock: ${available} available, requested ${quantity}`),
      { status: 400 }
    );
  }

  const cart = await prisma.cart.upsert({
    where: { userId_storeId: { userId, storeId } },
    create: { userId, storeId, tenantId },
    update: {},
  });

  const existingItem = await prisma.cartItem.findUnique({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
  });

  if (existingItem) {
    const newQty = existingItem.quantity + quantity;
    if (newQty > available) {
      throw Object.assign(
        new Error(`Cannot add ${quantity} more: only ${available - existingItem.quantity} additional units available`),
        { status: 400 }
      );
    }
    return prisma.cartItem.update({
      where: { id: existingItem.id },
      data: { quantity: newQty },
      include: { variant: { include: { product: { select: { name: true, price: true } } } } },
    });
  }

  return prisma.cartItem.create({
    data: { cartId: cart.id, variantId, quantity },
    include: { variant: { include: { product: { select: { name: true, price: true } } } } },
  });
};

const updateItem = async ({ userId, storeId, tenantId, variantId, quantity }) => {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw Object.assign(new Error('quantity must be a positive integer'), { status: 400 });
  }

  const cart = await prisma.cart.findUnique({
    where: { userId_storeId: { userId, storeId } },
  });
  if (!cart) throw Object.assign(new Error('Cart not found'), { status: 404 });

  const item = await prisma.cartItem.findUnique({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
    include: { variant: true },
  });
  if (!item) throw Object.assign(new Error('Item not in cart'), { status: 404 });

  const available = item.variant.stock - item.variant.reservedStock;
  if (quantity > available) {
    throw Object.assign(
      new Error(`Insufficient stock: ${available} available`),
      { status: 400 }
    );
  }

  return prisma.cartItem.update({
    where: { id: item.id },
    data: { quantity },
    include: { variant: { include: { product: { select: { name: true, price: true } } } } },
  });
};

const removeItem = async ({ userId, storeId, variantId }) => {
  const cart = await prisma.cart.findUnique({
    where: { userId_storeId: { userId, storeId } },
  });
  if (!cart) throw Object.assign(new Error('Cart not found'), { status: 404 });

  const item = await prisma.cartItem.findUnique({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
  });
  if (!item) throw Object.assign(new Error('Item not in cart'), { status: 404 });

  await prisma.cartItem.delete({ where: { id: item.id } });
};

const clearCart = async ({ userId, storeId }) => {
  const cart = await prisma.cart.findUnique({
    where: { userId_storeId: { userId, storeId } },
  });
  if (!cart) return;
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
};

const checkout = async ({ userId, storeId, tenantId, notes }) => {
  if (!storeId) throw Object.assign(new Error('storeId is required'), { status: 400 });

  const cart = await prisma.cart.findUnique({
    where: { userId_storeId: { userId, storeId } },
    include: {
      items: { include: { variant: { include: { product: true } } } },
    },
  });

  if (!cart || cart.items.length === 0) {
    throw Object.assign(new Error('Cart is empty'), { status: 400 });
  }

  for (const item of cart.items) {
    const available = item.variant.stock - item.variant.reservedStock;
    if (available < item.quantity) {
      throw Object.assign(
        new Error(`Insufficient stock for SKU ${item.variant.sku}: ${available} available, requested ${item.quantity}`),
        { status: 400 }
      );
    }
  }

  const orderItems = cart.items.map((item) => ({
    variantId: item.variantId,
    quantity: item.quantity,
    unitPrice: item.variant.price ?? item.variant.product.price ?? 0,
  }));

  const totalAmount = orderItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const orderNumber = generateOrderNumber();

  const order = await prisma.$transaction(async (tx) => {
    const newOrder = await tx.order.create({
      data: {
        orderNumber,
        status: 'PENDING',
        totalAmount,
        notes: notes || null,
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
      cart.items.map((item) =>
        tx.variant.update({
          where: { id: item.variantId },
          data: { reservedStock: { increment: item.quantity } },
        })
      )
    );

    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

    return newOrder;
  });

  return order;
};

const generateOrderNumber = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `ORD-${date}-${rand}`;
};

module.exports = { getCart, addItem, updateItem, removeItem, clearCart, checkout };
