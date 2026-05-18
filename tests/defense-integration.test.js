process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_for_defense_integration_tests';

jest.mock('../src/config/database', () => ({
  warehouse: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  },
  warehouseInventory: {
    findMany: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
  inventoryReservation: {
    create: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  variant: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  store: {
    findFirst: jest.fn(),
  },
  discount: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  webhookEndpoint: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  webhookDelivery: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  payment: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  order: {
    findFirst: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  },
  product: { count: jest.fn(), findMany: jest.fn() },
  cart: { count: jest.fn() },
  storefrontToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  subscription: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn().mockImplementation(async (arg) =>
    typeof arg === 'function'
      ? arg(require('../src/config/database'))
      : Promise.all(arg)
  ),
}));

jest.mock('../src/queues/webhook.queue', () => ({
  add: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/order.service', () => ({
  updateOrderStatus: jest.fn().mockResolvedValue({ id: 'order-1', status: 'PAID' }),
}));

const prisma = require('../src/config/database');
const inventoryService = require('../src/services/inventory.service');
const discountService = require('../src/services/discount.service');
const webhookService = require('../src/services/webhook.service');
const paymentService = require('../src/services/payment.service');
const storefrontTokenService = require('../src/services/storefrontToken.service');
const analyticsService = require('../src/services/analytics.service');

afterEach(() => jest.clearAllMocks());

describe('Defense integration - warehouse inventory routing', () => {
  it('splits a reservation across prioritized warehouses', async () => {
    prisma.warehouseInventory.findMany.mockResolvedValue([
      { warehouseId: 'w1', variantId: 'v1', stock: 3, reservedStock: 0, warehouse: { priority: 1 } },
      { warehouseId: 'w2', variantId: 'v1', stock: 10, reservedStock: 2, warehouse: { priority: 2 } },
    ]);

    const plan = await inventoryService.routeInventory({
      tenantId: 'tenant-1',
      storeId: 'store-1',
      items: [{ variantId: 'v1', quantity: 6 }],
    });

    expect(plan).toEqual([
      { variantId: 'v1', warehouseId: 'w1', quantity: 3 },
      { variantId: 'v1', warehouseId: 'w2', quantity: 3 },
    ]);
  });
});

describe('Defense integration - discounts', () => {
  it('applies stackable percentage and fixed discounts', async () => {
    prisma.discount.findMany.mockResolvedValue([
      { id: 'd1', code: 'SAVE10', type: 'PERCENTAGE', value: 10, stackable: true, active: true, redemptions: 0 },
      { id: 'd2', code: 'TAKE5', type: 'FIXED_AMOUNT', value: 5, stackable: true, active: true, redemptions: 0 },
    ]);

    const result = await discountService.applyDiscountCodes({
      tenantId: 'tenant-1',
      storeId: 'store-1',
      subtotal: 100,
      codes: ['SAVE10', 'TAKE5'],
    });

    expect(result.totalDiscount).toBe(15);
    expect(result.finalTotal).toBe(85);
  });

  it('rejects exclusive discounts stacked with other codes', async () => {
    prisma.discount.findMany.mockResolvedValue([
      { id: 'd1', code: 'VIP', type: 'PERCENTAGE', value: 20, stackable: false, active: true, redemptions: 0 },
      { id: 'd2', code: 'TAKE5', type: 'FIXED_AMOUNT', value: 5, stackable: true, active: true, redemptions: 0 },
    ]);

    await expect(discountService.applyDiscountCodes({
      tenantId: 'tenant-1',
      storeId: 'store-1',
      subtotal: 100,
      codes: ['VIP', 'TAKE5'],
    })).rejects.toMatchObject({ status: 400 });
  });
});

describe('Defense integration - webhooks', () => {
  it('creates signed webhook deliveries and enqueues retryable jobs', async () => {
    prisma.webhookEndpoint.findMany.mockResolvedValue([
      { id: 'endpoint-1', tenantId: 'tenant-1', url: 'https://example.com/webhook', secret: 'secret', events: ['payment.captured'] },
    ]);
    prisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });

    const deliveries = await webhookService.emitEvent({
      tenantId: 'tenant-1',
      event: 'payment.captured',
      payload: { id: 'payment-1' },
    });

    expect(deliveries).toHaveLength(1);
    expect(prisma.webhookDelivery.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ event: 'payment.captured', status: 'PENDING' }),
    }));
  });
});

describe('Defense integration - payments and 3DS', () => {
  it('creates a payment requiring 3DS for high-risk cards', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'order-1', tenantId: 'tenant-1', status: 'PENDING', totalAmount: 120 });
    prisma.payment.create.mockResolvedValue({ id: 'pay-1', status: 'REQUIRES_ACTION', requires3ds: true });
    prisma.webhookEndpoint.findMany.mockResolvedValue([]);

    const payment = await paymentService.createPaymentIntent({
      orderId: 'order-1',
      tenantId: 'tenant-1',
      cardNumber: '4000000000003184',
    });

    expect(payment.requires3ds).toBe(true);
  });
});

describe('Defense integration - storefront token scopes and analytics', () => {
  it('creates hashed storefront tokens without returning the hash as the public token', async () => {
    prisma.storefrontToken.create.mockResolvedValue({ id: 'tok-1', tokenHash: 'stored-hash', scopes: ['products:read'] });

    const result = await storefrontTokenService.createToken({
      name: 'Public storefront',
      tenantId: 'tenant-1',
      scopes: ['products:read'],
    });

    expect(result.token).toMatch(/^sb_pk_/);
    expect(result.token).not.toBe(result.record.tokenHash);
  });

  it('aggregates analytics from tenant-scoped records', async () => {
    prisma.order.count.mockResolvedValueOnce(10).mockResolvedValueOnce(6);
    prisma.product.count.mockResolvedValue(4);
    prisma.cart.count.mockResolvedValue(2);
    prisma.order.aggregate.mockResolvedValue({ _sum: { totalAmount: 500 } });
    prisma.order.groupBy.mockResolvedValue([{ status: 'PAID', _count: { status: 6 } }]);

    const result = await analyticsService.aggregate({ tenantId: 'tenant-1' });

    expect(result.revenue).toBe(500);
    expect(result.conversionProxy).toBe(0.8333);
  });
});
