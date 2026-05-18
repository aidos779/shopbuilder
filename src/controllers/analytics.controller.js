const analyticsService = require('../services/analytics.service');
const { resolveTenantId } = require('../utils/rbac');

const aggregate = async (req, res, next) => {
  try {
    res.json(await analyticsService.aggregate({ tenantId: resolveTenantId(req), storeId: req.query.storeId }));
  } catch (err) {
    next(err);
  }
};

module.exports = { aggregate };
