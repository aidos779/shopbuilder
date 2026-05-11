const productService = require('../services/product.service');
const { resolveTenantId } = require('../utils/rbac');

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
    const tenantId = resolveTenantId(req);

    if (!productId) return res.status(400).json({ error: 'productId is required' });
    if (!tenantId) return res.status(400).json({ error: 'tenantId required (assign user to a tenant first)' });

    const variants = await productService.generateAndSaveVariants({ productId, sizes, colors, materials, tenantId });
    res.status(201).json({ count: variants.length, variants });
  } catch (err) {
    next(err);
  }
};

const updateStock = async (req, res, next) => {
  try {
    const { variantId } = req.params;
    const { quantity } = req.body;
    const tenantId = resolveTenantId(req);

    if (typeof quantity !== 'number') {
      return res.status(400).json({ error: 'quantity must be a number' });
    }

    const variant = await productService.updateStock({ variantId, quantity, tenantId });
    res.json(variant);
  } catch (err) {
    next(err);
  }
};

// --- CRUD ---

const list = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const { storeId, category, page, limit } = req.query;
    const result = await productService.listProducts({ tenantId, storeId, category, page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const get = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const product = await productService.getProduct({ productId: req.params.id, tenantId });
    res.json(product);
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req) || req.body.tenantId;
    const { name, description, price, category, storeId } = req.body;
    const product = await productService.createProduct({ name, description, price, category, storeId, tenantId });
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const product = await productService.updateProduct({ productId: req.params.id, data: req.body, tenantId });
    res.json(product);
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    await productService.deleteProduct({ productId: req.params.id, tenantId });
    res.json({ message: 'Product deleted' });
  } catch (err) {
    next(err);
  }
};

const listVariants = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const variants = await productService.listVariants({ productId: req.params.id, tenantId });
    res.json({ count: variants.length, variants });
  } catch (err) {
    next(err);
  }
};

const getVariant = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const variant = await productService.getVariant({ variantId: req.params.variantId, tenantId });
    res.json(variant);
  } catch (err) {
    next(err);
  }
};

module.exports = { generateVariants, saveVariants, updateStock, list, get, create, update, remove, listVariants, getVariant };
