const productService = require('../services/product.service');
const storefrontTokenService = require('../services/storefrontToken.service');
const { resolveTenantId } = require('../utils/rbac');

const createToken = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req) || req.body.tenantId;
    const result = await storefrontTokenService.createToken({ ...req.body, tenantId });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

const listTokens = async (req, res, next) => {
  try {
    res.json({ tokens: await storefrontTokenService.listTokens({ tenantId: resolveTenantId(req) }) });
  } catch (err) {
    next(err);
  }
};

const listProducts = async (req, res, next) => {
  try {
    const result = await productService.listProducts({ tenantId: req.storefront.tenantId, ...req.query });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

module.exports = { createToken, listTokens, listProducts };
