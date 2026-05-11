const cartService = require('../services/cart.service');
const emailService = require('../services/email.service');
const { resolveTenantId } = require('../utils/rbac');

const getCart = async (req, res, next) => {
  try {
    const { storeId } = req.query;
    if (!storeId) return res.status(400).json({ error: 'storeId query parameter is required' });
    const tenantId = resolveTenantId(req);
    const cart = await cartService.getCart({ userId: req.user.sub, storeId, tenantId });
    res.json(cart);
  } catch (err) {
    next(err);
  }
};

const addItem = async (req, res, next) => {
  try {
    const { storeId, variantId, quantity } = req.body;
    if (!storeId || !variantId) {
      return res.status(400).json({ error: 'storeId and variantId are required' });
    }
    const tenantId = resolveTenantId(req);
    const item = await cartService.addItem({
      userId: req.user.sub,
      storeId,
      tenantId,
      variantId,
      quantity: Number(quantity) || 1,
    });
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
};

const updateItem = async (req, res, next) => {
  try {
    const { variantId } = req.params;
    const { storeId, quantity } = req.body;
    if (!storeId) return res.status(400).json({ error: 'storeId is required' });
    if (!quantity) return res.status(400).json({ error: 'quantity is required' });
    const tenantId = resolveTenantId(req);
    const item = await cartService.updateItem({
      userId: req.user.sub,
      storeId,
      tenantId,
      variantId,
      quantity: Number(quantity),
    });
    res.json(item);
  } catch (err) {
    next(err);
  }
};

const removeItem = async (req, res, next) => {
  try {
    const { variantId } = req.params;
    const { storeId } = req.query;
    if (!storeId) return res.status(400).json({ error: 'storeId query parameter is required' });
    await cartService.removeItem({ userId: req.user.sub, storeId, variantId });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

const clearCart = async (req, res, next) => {
  try {
    const { storeId } = req.query;
    if (!storeId) return res.status(400).json({ error: 'storeId query parameter is required' });
    await cartService.clearCart({ userId: req.user.sub, storeId });
    res.json({ message: 'Cart cleared' });
  } catch (err) {
    next(err);
  }
};

const checkout = async (req, res, next) => {
  try {
    const { storeId, notes } = req.body;
    if (!storeId) return res.status(400).json({ error: 'storeId is required' });
    const tenantId = resolveTenantId(req);
    const order = await cartService.checkout({ userId: req.user.sub, storeId, tenantId, notes });
    await emailService.sendOrderConfirmationEmail(req.user.email, order);
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
};

module.exports = { getCart, addItem, updateItem, removeItem, clearCart, checkout };
