jest.mock('../src/config/database', () => ({
  store: { findFirst: jest.fn() },
  variant: { findFirst: jest.fn(), update: jest.fn() },
  cart: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
  cartItem: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  order: { create: jest.fn() },
  $transaction: jest.fn(),
}));

jest.mock('../src/services/email.service', () => ({
  sendOrderConfirmationEmail: jest.fn().mockResolvedValue(undefined),
}));

const cartService = require('../src/services/cart.service');
const prisma = require('../src/config/database');

const mockStore = { id: 'store-1', name: 'Test Store', tenantId: 'tenant-1' };
const mockVariant = (overrides = {}) => ({
  id: 'variant-1',
  sku: 'SKU-1',
  price: 29.99,
  stock: 50,
  reservedStock: 5,
  product: { id: 'prod-1', name: 'T-Shirt', price: 25.00, tenantId: 'tenant-1' },
  ...overrides,
});
const mockCart = (overrides = {}) => ({
  id: 'cart-1',
  userId: 'user-1',
  storeId: 'store-1',
  tenantId: 'tenant-1',
  items: [],
  store: { id: 'store-1', name: 'Test Store' },
  ...overrides,
});

afterEach(() => jest.clearAllMocks());

describe('Cart — getCart', () => {
  it('throws 400 when storeId is missing', async () => {
    await expect(cartService.getCart({ userId: 'u1', storeId: null, tenantId: 't1' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('throws 404 when store not found', async () => {
    prisma.store.findFirst.mockResolvedValue(null);
    await expect(cartService.getCart({ userId: 'u1', storeId: 'bad', tenantId: 't1' }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('returns empty cart with subtotal 0 when cart does not exist', async () => {
    prisma.store.findFirst.mockResolvedValue(mockStore);
    prisma.cart.findUnique.mockResolvedValue(null);

    const result = await cartService.getCart({ userId: 'u1', storeId: 'store-1', tenantId: 'tenant-1' });

    expect(result.items).toEqual([]);
    expect(result.subtotal).toBe(0);
  });

  it('returns cart with computed subtotal', async () => {
    const variant = mockVariant();
    prisma.store.findFirst.mockResolvedValue(mockStore);
    prisma.cart.findUnique.mockResolvedValue(
      mockCart({
        items: [{ id: 'ci-1', cartId: 'cart-1', variantId: 'variant-1', quantity: 2, variant }],
      })
    );

    const result = await cartService.getCart({ userId: 'u1', storeId: 'store-1', tenantId: 'tenant-1' });
    expect(result.subtotal).toBeCloseTo(59.98);
  });
});

describe('Cart — addItem', () => {
  it('throws 400 when storeId or variantId is missing', async () => {
    await expect(cartService.addItem({ userId: 'u1', storeId: null, variantId: 'v1', tenantId: 't1' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 for non-integer quantity', async () => {
    await expect(cartService.addItem({ userId: 'u1', storeId: 's1', variantId: 'v1', tenantId: 't1', quantity: 1.5 }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('throws 404 when store not found', async () => {
    prisma.store.findFirst.mockResolvedValue(null);
    await expect(cartService.addItem({ userId: 'u1', storeId: 'bad', variantId: 'v1', tenantId: 't1', quantity: 1 }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('throws 404 when variant not found', async () => {
    prisma.store.findFirst.mockResolvedValue(mockStore);
    prisma.variant.findFirst.mockResolvedValue(null);
    await expect(cartService.addItem({ userId: 'u1', storeId: 'store-1', variantId: 'bad', tenantId: 't1', quantity: 1 }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('throws 400 when available stock is insufficient', async () => {
    prisma.store.findFirst.mockResolvedValue(mockStore);
    prisma.variant.findFirst.mockResolvedValue(mockVariant({ stock: 5, reservedStock: 4 })); // 1 available
    await expect(cartService.addItem({ userId: 'u1', storeId: 'store-1', variantId: 'v1', tenantId: 't1', quantity: 3 }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('creates cart and item when cart does not exist', async () => {
    prisma.store.findFirst.mockResolvedValue(mockStore);
    prisma.variant.findFirst.mockResolvedValue(mockVariant());
    prisma.cart.upsert.mockResolvedValue(mockCart());
    prisma.cartItem.findUnique.mockResolvedValue(null);
    prisma.cartItem.create.mockResolvedValue({ id: 'ci-1', cartId: 'cart-1', variantId: 'variant-1', quantity: 2 });

    const result = await cartService.addItem({ userId: 'u1', storeId: 'store-1', variantId: 'variant-1', tenantId: 'tenant-1', quantity: 2 });
    expect(prisma.cartItem.create).toHaveBeenCalledWith(expect.objectContaining({ data: { cartId: 'cart-1', variantId: 'variant-1', quantity: 2 } }));
    expect(result.quantity).toBe(2);
  });

  it('increments quantity when item already in cart', async () => {
    const existingItem = { id: 'ci-1', cartId: 'cart-1', variantId: 'variant-1', quantity: 3 };
    prisma.store.findFirst.mockResolvedValue(mockStore);
    prisma.variant.findFirst.mockResolvedValue(mockVariant());
    prisma.cart.upsert.mockResolvedValue(mockCart());
    prisma.cartItem.findUnique.mockResolvedValue(existingItem);
    prisma.cartItem.update.mockResolvedValue({ ...existingItem, quantity: 5 });

    const result = await cartService.addItem({ userId: 'u1', storeId: 'store-1', variantId: 'variant-1', tenantId: 'tenant-1', quantity: 2 });
    expect(prisma.cartItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: { quantity: 5 } }));
    expect(result.quantity).toBe(5);
  });
});

describe('Cart — removeItem', () => {
  it('throws 404 when cart not found', async () => {
    prisma.cart.findUnique.mockResolvedValue(null);
    await expect(cartService.removeItem({ userId: 'u1', storeId: 's1', variantId: 'v1' }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('throws 404 when item not in cart', async () => {
    prisma.cart.findUnique.mockResolvedValue(mockCart());
    prisma.cartItem.findUnique.mockResolvedValue(null);
    await expect(cartService.removeItem({ userId: 'u1', storeId: 'store-1', variantId: 'v1' }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('deletes item successfully', async () => {
    prisma.cart.findUnique.mockResolvedValue(mockCart());
    prisma.cartItem.findUnique.mockResolvedValue({ id: 'ci-1' });
    prisma.cartItem.delete.mockResolvedValue({});

    await cartService.removeItem({ userId: 'u1', storeId: 'store-1', variantId: 'variant-1' });
    expect(prisma.cartItem.delete).toHaveBeenCalledWith({ where: { id: 'ci-1' } });
  });
});

describe('Cart — checkout', () => {
  it('throws 400 when storeId is missing', async () => {
    await expect(cartService.checkout({ userId: 'u1', storeId: null, tenantId: 't1' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when cart is empty', async () => {
    prisma.cart.findUnique.mockResolvedValue(mockCart({ items: [] }));
    await expect(cartService.checkout({ userId: 'u1', storeId: 'store-1', tenantId: 'tenant-1' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when stock is insufficient at checkout', async () => {
    prisma.cart.findUnique.mockResolvedValue(
      mockCart({
        items: [{
          id: 'ci-1',
          variantId: 'variant-1',
          quantity: 10,
          variant: mockVariant({ stock: 5, reservedStock: 4 }), // 1 available
        }],
      })
    );
    await expect(cartService.checkout({ userId: 'u1', storeId: 'store-1', tenantId: 'tenant-1' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('creates order, reserves stock, and clears cart atomically', async () => {
    const cartWithItems = mockCart({
      items: [{
        id: 'ci-1',
        variantId: 'variant-1',
        quantity: 2,
        variant: mockVariant(),
      }],
    });
    const createdOrder = {
      id: 'order-1',
      orderNumber: 'ORD-20240101-12345',
      status: 'PENDING',
      totalAmount: 59.98,
      store: { id: 'store-1', name: 'Test Store' },
      user: { id: 'user-1', email: 'user@test.com' },
      items: [],
    };

    prisma.cart.findUnique.mockResolvedValue(cartWithItems);
    prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
    prisma.order.create.mockResolvedValue(createdOrder);
    prisma.variant.update.mockResolvedValue({});
    prisma.cartItem.deleteMany.mockResolvedValue({});

    const result = await cartService.checkout({ userId: 'user-1', storeId: 'store-1', tenantId: 'tenant-1' });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.order.create).toHaveBeenCalled();
    expect(prisma.variant.update).toHaveBeenCalledWith({
      where: { id: 'variant-1' },
      data: { reservedStock: { increment: 2 } },
    });
    expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: 'cart-1' } });
    expect(result.status).toBe('PENDING');
  });
});
