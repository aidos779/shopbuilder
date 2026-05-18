jest.mock('../src/services/email.service', () => ({
  sendOrderConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  sendMerchantOrderNotificationEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/inventory.service', () => ({
  routeInventory: jest.fn().mockResolvedValue(null),
  reserveWarehousePlan: jest.fn().mockResolvedValue(undefined),
  finalizeWarehouseReservations: jest.fn().mockResolvedValue(undefined),
  releaseWarehouseReservations: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/discount.service', () => ({
  applyDiscountCodes: jest.fn(async ({ subtotal }) => ({ totalDiscount: 0, applied: [], finalTotal: subtotal })),
  incrementRedemptions: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/config/database', () => ({
  store: { findFirst: jest.fn() },
  variant: { findMany: jest.fn(), update: jest.fn() },
  order: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn(),
}));

const orderService = require('../src/services/order.service');
const prisma = require('../src/config/database');

const mockVariant = (id, overrides = {}) => ({
  id,
  sku: `SKU-${id}`,
  stock: 100,
  reservedStock: 5,
  price: 29.99,
  product: { id: 'prod-1', tenantId: 'tenant-1', price: 29.99 },
  ...overrides,
});

const mockOrder = (overrides = {}) => ({
  id: 'order-1',
  orderNumber: 'ORD-20240115-83421',
  status: 'PENDING',
  totalAmount: 59.98,
  tenantId: 'tenant-1',
  storeId: 'store-1',
  userId: 'user-1',
  store: { id: 'store-1', name: 'Test Store' },
  user: { id: 'user-1', email: 'user@test.com' },
  items: [
    { id: 'item-1', variantId: 'variant-1', quantity: 2, unitPrice: 29.99 },
  ],
  ...overrides,
});

afterEach(() => jest.clearAllMocks());

describe('Order — createOrder', () => {
  it('throws 400 when items is empty', async () => {
    await expect(orderService.createOrder({ storeId: 's1', userId: 'u1', items: [], tenantId: 't1' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when storeId is missing', async () => {
    await expect(orderService.createOrder({ userId: 'u1', items: [{ variantId: 'v1', quantity: 1 }], tenantId: 't1' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('throws 404 when store not found', async () => {
    prisma.store.findFirst.mockResolvedValue(null);
    await expect(
      orderService.createOrder({ storeId: 'bad-store', userId: 'u1', items: [{ variantId: 'v1', quantity: 1 }], tenantId: 't1' })
    ).rejects.toMatchObject({ status: 404, message: 'Store not found' });
  });

  it('throws 404 when variant not found for tenant', async () => {
    prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
    prisma.variant.findMany.mockResolvedValue([]); // not found

    await expect(
      orderService.createOrder({
        storeId: 'store-1',
        userId: 'u1',
        items: [{ variantId: 'bad-variant', quantity: 1 }],
        tenantId: 't1',
      })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('throws 400 when available stock is insufficient', async () => {
    prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
    // stock: 5, reservedStock: 3 → available: 2, requesting 5
    prisma.variant.findMany.mockResolvedValue([mockVariant('v1', { stock: 5, reservedStock: 3 })]);

    await expect(
      orderService.createOrder({
        storeId: 'store-1',
        userId: 'u1',
        items: [{ variantId: 'v1', quantity: 5 }],
        tenantId: 't1',
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('creates order and reserves stock in a transaction', async () => {
    const order = mockOrder();
    prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
    prisma.variant.findMany.mockResolvedValue([mockVariant('variant-1')]);
    prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
    prisma.order.create.mockResolvedValue(order);
    prisma.variant.update.mockResolvedValue({});

    const result = await orderService.createOrder({
      storeId: 'store-1',
      userId: 'user-1',
      items: [{ variantId: 'variant-1', quantity: 2 }],
      tenantId: 'tenant-1',
    });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.order.create).toHaveBeenCalled();
    expect(prisma.variant.update).toHaveBeenCalledWith({
      where: { id: 'variant-1' },
      data: { reservedStock: { increment: 2 } },
    });
    expect(result.status).toBe('PENDING');
  });
});

describe('Order — updateOrderStatus', () => {
  it('throws 400 for invalid status transition (PENDING → SHIPPED)', async () => {
    prisma.order.findFirst.mockResolvedValue(mockOrder({ status: 'PENDING' }));
    await expect(orderService.updateOrderStatus({ orderId: 'order-1', status: 'SHIPPED', tenantId: 't1' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 for transition from terminal state (CANCELLED → PAID)', async () => {
    prisma.order.findFirst.mockResolvedValue(mockOrder({ status: 'CANCELLED' }));
    await expect(orderService.updateOrderStatus({ orderId: 'order-1', status: 'PAID', tenantId: 't1' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('allows PENDING → PAID and deducts stock', async () => {
    prisma.order.findFirst.mockResolvedValue(mockOrder({ status: 'PENDING' }));
    prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
    prisma.order.update.mockResolvedValue(mockOrder({ status: 'PAID' }));
    prisma.variant.update.mockResolvedValue({});

    await orderService.updateOrderStatus({ orderId: 'order-1', status: 'PAID', tenantId: 'tenant-1' });

    expect(prisma.variant.update).toHaveBeenCalledWith({
      where: { id: 'variant-1' },
      data: { stock: { decrement: 2 }, reservedStock: { decrement: 2 } },
    });
  });

  it('allows PENDING → CANCELLED and releases reserved stock', async () => {
    prisma.order.findFirst.mockResolvedValue(mockOrder({ status: 'PENDING' }));
    prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
    prisma.order.update.mockResolvedValue(mockOrder({ status: 'CANCELLED' }));
    prisma.variant.update.mockResolvedValue({});

    await orderService.updateOrderStatus({ orderId: 'order-1', status: 'CANCELLED', tenantId: 'tenant-1' });

    expect(prisma.variant.update).toHaveBeenCalledWith({
      where: { id: 'variant-1' },
      data: { reservedStock: { decrement: 2 } },
    });
  });

  it('allows PAID → PACKED without touching stock', async () => {
    prisma.order.findFirst.mockResolvedValue(mockOrder({ status: 'PAID' }));
    prisma.order.update.mockResolvedValue(mockOrder({ status: 'PACKED' }));

    const result = await orderService.updateOrderStatus({ orderId: 'order-1', status: 'PACKED', tenantId: 'tenant-1' });
    expect(prisma.variant.update).not.toHaveBeenCalled();
    expect(result.status).toBe('PACKED');
  });
});

describe('Order — cancelOrder', () => {
  it('throws 400 when order is already DELIVERED', async () => {
    prisma.order.findFirst.mockResolvedValue(mockOrder({ status: 'DELIVERED' }));
    await expect(orderService.cancelOrder({ orderId: 'o1', tenantId: 't1', userId: 'u1', role: 'CUSTOMER' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('cancels a PENDING order and releases stock', async () => {
    prisma.order.findFirst.mockResolvedValue(mockOrder({ status: 'PENDING' }));
    prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
    prisma.order.update.mockResolvedValue(mockOrder({ status: 'CANCELLED' }));
    prisma.variant.update.mockResolvedValue({});

    await orderService.cancelOrder({ orderId: 'order-1', tenantId: 'tenant-1', userId: 'user-1', role: 'CUSTOMER' });

    expect(prisma.variant.update).toHaveBeenCalledWith({
      where: { id: 'variant-1' },
      data: { reservedStock: { decrement: 2 } },
    });
  });
});

describe('Order — status machine', () => {
  const transitions = [
    { from: 'PENDING', to: 'PAID', valid: true },
    { from: 'PENDING', to: 'CANCELLED', valid: true },
    { from: 'PENDING', to: 'SHIPPED', valid: false },
    { from: 'PENDING', to: 'DELIVERED', valid: false },
    { from: 'PAID', to: 'PACKED', valid: true },
    { from: 'PAID', to: 'SHIPPED', valid: false },
    { from: 'PACKED', to: 'SHIPPED', valid: true },
    { from: 'PACKED', to: 'DELIVERED', valid: false },
    { from: 'SHIPPED', to: 'DELIVERED', valid: true },
    { from: 'SHIPPED', to: 'CANCELLED', valid: false },
    { from: 'CANCELLED', to: 'PAID', valid: false },
    { from: 'REFUNDED', to: 'DELIVERED', valid: false },
  ];

  transitions.forEach(({ from, to, valid }) => {
    it(`${from} → ${to} should ${valid ? 'succeed' : 'throw 400'}`, async () => {
      prisma.order.findFirst.mockResolvedValue(mockOrder({ status: from }));
      if (valid) {
        prisma.$transaction.mockImplementation(async (fn) =>
          typeof fn === 'function' ? fn(prisma) : Promise.all(fn)
        );
        prisma.order.update.mockResolvedValue(mockOrder({ status: to }));
        prisma.variant.update.mockResolvedValue({});
        await expect(orderService.updateOrderStatus({ orderId: 'o1', status: to, tenantId: 't1' }))
          .resolves.toBeDefined();
      } else {
        await expect(orderService.updateOrderStatus({ orderId: 'o1', status: to, tenantId: 't1' }))
          .rejects.toMatchObject({ status: 400 });
      }
    });
  });
});
