const prisma = require('../config/database');

/**
 * Generates all cartesian-product combinations of the given variant attributes.
 * Each attribute dimension (size, color, material) that is non-empty contributes
 * one segment to the resulting SKU string.
 *
 * @param {{ sizes: string[], colors: string[], materials: string[] }} attrs
 * @returns {{ sku: string, size: string|null, color: string|null, material: string|null }[]}
 */
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

  // Build cartesian product as arrays of { type, value } tuples
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

  // Upsert so re-running with same attributes is idempotent
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

module.exports = { generateSKUCombinations, generateAndSaveVariants, updateStock };
