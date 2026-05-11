const inventoryService = require('../services/inventory.service');
const { resolveTenantId } = require('../utils/rbac');

const getStatus = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const status = await inventoryService.getInventoryStatus({ variantId: req.params.variantId, tenantId });
    res.json(status);
  } catch (err) {
    next(err);
  }
};

const increase = async (req, res, next) => {
  try {
    const { quantity } = req.body;
    const tenantId = resolveTenantId(req);
    const variant = await inventoryService.increaseStock({ variantId: req.params.variantId, quantity, tenantId });
    res.json({ message: `Stock increased by ${quantity}`, variant });
  } catch (err) {
    next(err);
  }
};

const decrease = async (req, res, next) => {
  try {
    const { quantity } = req.body;
    const tenantId = resolveTenantId(req);
    const variant = await inventoryService.decreaseStock({ variantId: req.params.variantId, quantity, tenantId });
    res.json({ message: `Stock decreased by ${quantity}`, variant });
  } catch (err) {
    next(err);
  }
};

const reserve = async (req, res, next) => {
  try {
    const { quantity } = req.body;
    const tenantId = resolveTenantId(req);
    const variant = await inventoryService.reserveStock({ variantId: req.params.variantId, quantity, tenantId });
    res.json({ message: `${quantity} units reserved`, variant });
  } catch (err) {
    next(err);
  }
};

const release = async (req, res, next) => {
  try {
    const { quantity } = req.body;
    const tenantId = resolveTenantId(req);
    const variant = await inventoryService.releaseStock({ variantId: req.params.variantId, quantity, tenantId });
    res.json({ message: `${quantity} reserved units released`, variant });
  } catch (err) {
    next(err);
  }
};

const transfer = async (req, res, next) => {
  try {
    const { fromVariantId, toVariantId, quantity } = req.body;
    const tenantId = resolveTenantId(req);

    if (!fromVariantId || !toVariantId) {
      return res.status(400).json({ error: 'fromVariantId and toVariantId are required' });
    }

    const result = await inventoryService.transferInventory({ fromVariantId, toVariantId, quantity, tenantId });
    res.json({ message: `${quantity} units transferred`, ...result });
  } catch (err) {
    next(err);
  }
};

module.exports = { getStatus, increase, decrease, reserve, release, transfer };
