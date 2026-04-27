const productService = require('../services/product.service');

const generateVariants = async (req, res, next) => {
  try {
    const { sizes = [], colors = [], materials = [] } = req.body;
    const variants = productService.generateSKUCombinations({ sizes, colors, materials });
    res.json({ count: variants.length, variants });
  } catch (err) {
    next(err);
  }
};

const saveVariants = async (req, res, next) => {
  try {
    const { productId, sizes = [], colors = [], materials = [] } = req.body;
    const { tenantId } = req.user;

    if (!productId) return res.status(400).json({ error: 'productId is required' });
    if (!tenantId) return res.status(400).json({ error: 'User has no associated tenant' });

    const variants = await productService.generateAndSaveVariants({
      productId, sizes, colors, materials, tenantId,
    });
    res.status(201).json({ count: variants.length, variants });
  } catch (err) {
    next(err);
  }
};

const updateStock = async (req, res, next) => {
  try {
    const { variantId } = req.params;
    const { quantity } = req.body;
    const { tenantId } = req.user;

    if (typeof quantity !== 'number') {
      return res.status(400).json({ error: 'quantity must be a number' });
    }

    const variant = await productService.updateStock({ variantId, quantity, tenantId });
    res.json(variant);
  } catch (err) {
    next(err);
  }
};

module.exports = { generateVariants, saveVariants, updateStock };
