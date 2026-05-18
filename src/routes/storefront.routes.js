const router = require('express').Router();
const storefrontController = require('../controllers/storefront.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');
const { requireStorefrontScope } = require('../middleware/storefrontAuth.middleware');

router.get(
  '/tokens',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER'),
  storefrontController.listTokens
);

router.post(
  '/tokens',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER'),
  storefrontController.createToken
);

router.get('/products', requireStorefrontScope('products:read'), storefrontController.listProducts);

module.exports = router;
