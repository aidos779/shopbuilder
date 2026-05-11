const storeService = require('../services/store.service');
const { resolveTenantId } = require('../utils/rbac');

const list = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const { merchantId, page, limit } = req.query;
    const result = await storeService.listStores({ tenantId, merchantId, page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const get = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const store = await storeService.getStore({ storeId: req.params.id, tenantId });
    res.json(store);
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req) || req.body.tenantId;
    const { name, description, merchantId } = req.body;
    const store = await storeService.createStore({ name, description, merchantId, tenantId });
    res.status(201).json(store);
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const store = await storeService.updateStore({ storeId: req.params.id, data: req.body, tenantId });
    res.json(store);
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    await storeService.deleteStore({ storeId: req.params.id, tenantId });
    res.json({ message: 'Store deleted successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, get, create, update, remove };
