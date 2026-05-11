const prisma = require('../config/database');

const generateSKUCombinations = ({ sizes = [], colors = [], materials = [] }) => {
  const dims = [
    { type: 'size', values: sizes },
    { type: 'color', values: colors },
    { type: 'material', values: materials },
  ].filter((d) => d.values.length > 0);

  if (dims.length === 0) {
    throw Object.assign(new Error('At least one attribute (sizes, colors, materials) is required'), {
      status: 400,
    });
  }

  const product = dims.reduce((acc, dim) => {
    if (acc.length === 0) return dim.values.map((v) => [{ type: dim.type, value: v }]);
    return acc.flatMap((combo) => dim.values.map((v) => [...combo, { type: dim.type, value: v }]));
  }, []);

  return product.map((parts) => ({
    sku: parts.map((p) => p.value).join('-'),
    size: parts.find((p) => p.type === 'size')?.value ?? null,
    color: parts.find((p) => p.type === 'color')?.value ?? null,
    material: parts.find((p) => p.type === 'material')?.value ?? null,
  }));
};

const generateAndSaveVariants = async ({ productId, sizes, colors, materials, tenantId }) => {
  const product = await prisma.product.findFirst({ where: { id: productId, tenantId } });
  if (!product) {
    throw Object.assign(new Error('Product not found'), { status: 404 });
  }

  const combinations = generateSKUCombinations({ sizes, colors, materials });

  const variants = await prisma.$transaction(
    combinations.map((combo) =>
      prisma.variant.upsert({
        where: { sku: `${productId}-${combo.sku}` },
        create: {
          sku: `${productId}-${combo.sku}`,
          size: combo.size,
          color: combo.color,
          material: combo.material,
          stock: 0,
          reservedStock: 0,
          productId,
        },
        update: {},
      })
    )
  );

  return variants;
};

const updateStock = async ({ variantId, quantity, tenantId }) => {
  const variant = await prisma.variant.findFirst({
    where: { id: variantId, product: { tenantId } },
  });
  if (!variant) {
    throw Object.assign(new Error('Variant not found'), { status: 404 });
  }

  const newStock = variant.stock + quantity;
  if (newStock < 0) {
    throw Object.assign(new Error(`Insufficient stock: current stock is ${variant.stock}`), {
      status: 400,
    });
  }

  return prisma.variant.update({ where: { id: variantId }, data: { stock: newStock } });
};

// --- Product CRUD ---

const listProducts = async ({ tenantId, storeId, category, page = 1, limit = 20 }) => {
  const skip = (Number(page) - 1) * Number(limit);
  const where = {};
  if (tenantId) where.tenantId = tenantId;
  if (storeId) where.storeId = storeId;
  if (category) where.category = { contains: category, mode: 'insensitive' };

  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      skip,
      take: Number(limit),
      include: { _count: { select: { variants: true } }, store: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.product.count({ where }),
  ]);

  return { products, total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) };
};

const getProduct = async ({ productId, tenantId }) => {
  const where = { id: productId };
  if (tenantId) where.tenantId = tenantId;

  const product = await prisma.product.findFirst({
    where,
    include: { variants: { orderBy: { sku: 'asc' } }, store: true },
  });
  if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });
  return product;
};

const createProduct = async ({ name, description, price, category, storeId, tenantId }) => {
  if (!name) throw Object.assign(new Error('name is required'), { status: 400 });
  if (!tenantId) throw Object.assign(new Error('tenantId is required'), { status: 400 });

  if (storeId) {
    const store = await prisma.store.findFirst({ where: { id: storeId, tenantId } });
    if (!store) throw Object.assign(new Error('Store not found'), { status: 404 });
  }

  return prisma.product.create({
    data: { name, description, price: price ?? 0, category, storeId: storeId || null, tenantId },
  });
};

const updateProduct = async ({ productId, data, tenantId }) => {
  const where = { id: productId };
  if (tenantId) where.tenantId = tenantId;

  const product = await prisma.product.findFirst({ where });
  if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });

  const { name, description, price, category } = data;
  return prisma.product.update({
    where: { id: productId },
    data: { name, description, price, category },
  });
};

const deleteProduct = async ({ productId, tenantId }) => {
  const where = { id: productId };
  if (tenantId) where.tenantId = tenantId;

  const product = await prisma.product.findFirst({ where });
  if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });

  await prisma.product.delete({ where: { id: productId } });
};

// --- Variant reads ---

const listVariants = async ({ productId, tenantId }) => {
  const where = { id: productId };
  if (tenantId) where.tenantId = tenantId;

  const product = await prisma.product.findFirst({ where });
  if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });

  return prisma.variant.findMany({ where: { productId }, orderBy: { sku: 'asc' } });
};

const getVariant = async ({ variantId, tenantId }) => {
  const variant = await prisma.variant.findFirst({
    where: { id: variantId, ...(tenantId ? { product: { tenantId } } : {}) },
    include: { product: { select: { id: true, name: true, tenantId: true } } },
  });
  if (!variant) throw Object.assign(new Error('Variant not found'), { status: 404 });
  return variant;
};

module.exports = {
  generateSKUCombinations,
  generateAndSaveVariants,
  updateStock,
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  listVariants,
  getVariant,
};
