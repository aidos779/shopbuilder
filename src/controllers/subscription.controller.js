const subscriptionService = require('../services/subscription.service');
const { resolveTenantId } = require('../utils/rbac');

const list = async (req, res, next) => {
  try {
    res.json(await subscriptionService.listSubscriptions({ tenantId: resolveTenantId(req), ...req.query }));
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req) || req.body.tenantId;
    const userId = req.body.userId || req.user.sub;
    const subscription = await subscriptionService.createSubscription({ ...req.body, tenantId, userId });
    res.status(201).json(subscription);
  } catch (err) {
    next(err);
  }
};

module.exports = { list, create };
