const router = require('express').Router();
const webhookController = require('../controllers/webhook.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');

router.get(
  '/',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER'),
  webhookController.listEndpoints
);

router.post(
  '/',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER'),
  webhookController.createEndpoint
);

router.get(
  '/deliveries',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER'),
  webhookController.listDeliveries
);

module.exports = router;
