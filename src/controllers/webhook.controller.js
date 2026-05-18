const webhookService = require('../services/webhook.service');
const { resolveTenantId } = require('../utils/rbac');

const listEndpoints = async (req, res, next) => {
  try {
    res.json(await webhookService.listEndpoints({ tenantId: resolveTenantId(req), ...req.query }));
  } catch (err) {
    next(err);
  }
};

const createEndpoint = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req) || req.body.tenantId;
    const endpoint = await webhookService.createEndpoint({ ...req.body, tenantId });
    res.status(201).json(endpoint);
  } catch (err) {
    next(err);
  }
};

const listDeliveries = async (req, res, next) => {
  try {
    res.json(await webhookService.listDeliveries({ tenantId: resolveTenantId(req), ...req.query }));
  } catch (err) {
    next(err);
  }
};

module.exports = { listEndpoints, createEndpoint, listDeliveries };
