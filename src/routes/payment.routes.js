const router = require('express').Router();
const paymentController = require('../controllers/payment.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.get('/', authenticate, paymentController.list);
router.post('/intents', authenticate, paymentController.createIntent);
router.post('/:id/3ds', authenticate, paymentController.complete3ds);
router.post('/:id/capture', authenticate, paymentController.capture);

module.exports = router;
