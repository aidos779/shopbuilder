const discountService = require('../services/discount.service');
const { resolveTenantId } = require('../utils/rbac');

const list = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const { storeId, page, limit } = req.query;
    res.json(await discountService.listDiscounts({ tenantId, storeId, page, limit }));
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req) || req.body.tenantId;
    const discount = await discountService.createDiscount({ ...req.body, tenantId });
    res.status(201).json(discount);
  } catch (err) {
    next(err);
  }
};

const preview = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req) || req.body.tenantId;
    const { storeId, subtotal, codes = [] } = req.body;
    res.json(await discountService.applyDiscountCodes({ tenantId, storeId, subtotal: Number(subtotal), codes }));
  } catch (err) {
    next(err);
  }
};

module.exports = { list, create, preview };
