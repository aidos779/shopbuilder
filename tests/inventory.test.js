jest.mock('../src/config/database', () => ({
  variant: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
}));

const inventoryService = require('../src/services/inventory.service');
const prisma = require('../src/config/database');

const mockVariant = (overrides = {}) => ({
  id: 'variant-1',
  sku: 'PROD-S-Black-Cotton',
  stock: 100,
  reservedStock: 10,
  updatedAt: new Date(),
  ...overrides,
});

afterEach(() => jest.clearAllMocks());

describe('Inventory — increaseStock', () => {
  it('throws 400 for zero quantity', async () => {
    await expect(inventoryService.increaseStock({ variantId: 'v1', quantity: 0, tenantId: 't1' }))
      .rejects.toMatchObject({ status: 400, message: 'quantity must be a positive integer' });
  });

  it('throws 400 for negative quantity', async () => {
    await expect(inventoryService.increaseStock({ variantId: 'v1', quantity: -5, tenantId: 't1' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 for non-integer quantity', async () => {
    await expect(inventoryService.increaseStock({ variantId: 'v1', quantity: 1.5, tenantId: 't1' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('throws 404 when variant not found', async () => {
    prisma.variant.findFirst.mockResolvedValue(null);
    await expect(inventoryService.increaseStock({ variantId: 'v1', quantity: 5, tenantId: 't1' }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('calls prisma.variant.update with increment', async () => {
    const variant = mockVariant();
    const updated = mockVariant({ stock: 150 });
    prisma.variant.findFirst.mockResolvedValue(variant);
    prisma.variant.update.mockResolvedValue(updated);

    const result = await inventoryService.increaseStock({ variantId: 'variant-1', quantity: 50, tenantId: 't1' });

    expect(prisma.variant.update).toHaveBeenCalledWith({
      where: { id: 'variant-1' },
      data: { stock: { increment: 50 } },
    });
    expect(result.stock).toBe(150);
  });
});

describe('Inventory — decreaseStock', () => {
  it('throws 400 when stock would go negative', async () => {
    prisma.variant.findFirst.mockResolvedValue(mockVariant({ stock: 5 }));
    await expect(inventoryService.decreaseStock({ variantId: 'v1', quantity: 10, tenantId: 't1' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('decreases stock when sufficient', async () => {
    const variant = mockVariant({ stock: 50 });
    const updated = mockVariant({ stock: 40 });
    prisma.variant.findFirst.mockResolvedValue(variant);
    prisma.variant.update.mockResolvedValue(updated);

    const result = await inventoryService.decreaseStock({ variantId: 'variant-1', quantity: 10, tenantId: 't1' });

    expect(prisma.variant.update).toHaveBeenCalledWith({
      where: { id: 'variant-1' },
      data: { stock: { decrement: 10 } },
    });
    expect(result.stock).toBe(40);
  });
});

describe('Inventory — reserveStock', () => {
  it('throws 400 when available stock is insufficient', async () => {
    // stock: 20, reservedStock: 15 → available: 5, requesting 10
    prisma.variant.findFirst.mockResolvedValue(mockVariant({ stock: 20, reservedStock: 15 }));
    await expect(inventoryService.reserveStock({ variantId: 'v1', quantity: 10, tenantId: 't1' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('reserves when available stock is sufficient', async () => {
    const variant = mockVariant({ stock: 100, reservedStock: 10 }); // 90 available
    const updated = mockVariant({ stock: 100, reservedStock: 20 });
    prisma.variant.findFirst.mockResolvedValue(variant);
    prisma.variant.update.mockResolvedValue(updated);

    const result = await inventoryService.reserveStock({ variantId: 'variant-1', quantity: 10, tenantId: 't1' });

    expect(prisma.variant.update).toHaveBeenCalledWith({
      where: { id: 'variant-1' },
      data: { reservedStock: { increment: 10 } },
    });
    expect(result.reservedStock).toBe(20);
  });
});

describe('Inventory — releaseStock', () => {
  it('throws 400 when releasing more than reserved', async () => {
    prisma.variant.findFirst.mockResolvedValue(mockVariant({ reservedStock: 3 }));
    await expect(inventoryService.releaseStock({ variantId: 'v1', quantity: 10, tenantId: 't1' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('releases reserved stock', async () => {
    const variant = mockVariant({ reservedStock: 15 });
    const updated = mockVariant({ reservedStock: 10 });
    prisma.variant.findFirst.mockResolvedValue(variant);
    prisma.variant.update.mockResolvedValue(updated);

    const result = await inventoryService.releaseStock({ variantId: 'variant-1', quantity: 5, tenantId: 't1' });

    expect(prisma.variant.update).toHaveBeenCalledWith({
      where: { id: 'variant-1' },
      data: { reservedStock: { decrement: 5 } },
    });
    expect(result.reservedStock).toBe(10);
  });
});

describe('Inventory — transferInventory', () => {
  it('throws 400 when transferring to the same variant', async () => {
    await expect(inventoryService.transferInventory({ fromVariantId: 'v1', toVariantId: 'v1', quantity: 10, tenantId: 't1' }))
      .rejects.toMatchObject({ status: 400, message: 'Source and destination variant must differ' });
  });

  it('throws 400 when source has insufficient stock', async () => {
    prisma.variant.findFirst
      .mockResolvedValueOnce(mockVariant({ id: 'v1', stock: 5 }))
      .mockResolvedValueOnce(mockVariant({ id: 'v2', stock: 20 }));

    await expect(inventoryService.transferInventory({ fromVariantId: 'v1', toVariantId: 'v2', quantity: 10, tenantId: 't1' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('performs atomic transfer via $transaction', async () => {
    const from = mockVariant({ id: 'v1', stock: 50 });
    const to = mockVariant({ id: 'v2', stock: 30 });
    const fromUpdated = { ...from, stock: 40 };
    const toUpdated = { ...to, stock: 40 };

    prisma.variant.findFirst
      .mockResolvedValueOnce(from)
      .mockResolvedValueOnce(to);

    prisma.$transaction.mockResolvedValue([fromUpdated, toUpdated]);

    const result = await inventoryService.transferInventory({ fromVariantId: 'v1', toVariantId: 'v2', quantity: 10, tenantId: 't1' });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(result.transferred).toBe(10);
    expect(result.from.stock).toBe(40);
    expect(result.to.stock).toBe(40);
  });
});

describe('Inventory — getInventoryStatus', () => {
  it('returns computed availableStock', async () => {
    prisma.variant.findFirst.mockResolvedValue(mockVariant({ stock: 100, reservedStock: 25 }));
    const status = await inventoryService.getInventoryStatus({ variantId: 'variant-1', tenantId: 't1' });

    expect(status.stock).toBe(100);
    expect(status.reservedStock).toBe(25);
    expect(status.availableStock).toBe(75);
  });
});
