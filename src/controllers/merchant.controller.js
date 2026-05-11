const merchantService = require('../services/merchant.service');
const { resolveTenantId } = require('../utils/rbac');

const list = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const { status, page, limit } = req.query;
    const result = await merchantService.listMerchants({ tenantId, status, page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const get = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const merchant = await merchantService.getMerchant({ merchantId: req.params.id, tenantId });
    res.json(merchant);
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req) || req.body.tenantId;
    const { name, email, phone, address } = req.body;
    const merchant = await merchantService.createMerchant({ name, email, phone, address, tenantId });
    res.status(201).json(merchant);
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const merchant = await merchantService.updateMerchant({ merchantId: req.params.id, data: req.body, tenantId });
    res.json(merchant);
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    await merchantService.deleteMerchant({ merchantId: req.params.id, tenantId });
    res.json({ message: 'Merchant deleted successfully' });
  } catch (err) {
    next(err);
  }
};

const suspend = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const merchant = await merchantService.updateMerchantStatus({ merchantId: req.params.id, status: 'SUSPENDED', tenantId });
    res.json(merchant);
  } catch (err) {
    next(err);
  }
};

const activate = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const merchant = await merchantService.updateMerchantStatus({ merchantId: req.params.id, status: 'ACTIVE', tenantId });
    res.json(merchant);
  } catch (err) {
    next(err);
  }
};

module.exports = { list, get, create, update, remove, suspend, activate };
