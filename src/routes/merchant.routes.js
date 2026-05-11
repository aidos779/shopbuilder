const router = require('express').Router();
const merchantController = require('../controllers/merchant.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');

/**
 * @swagger
 * tags:
 *   name: Merchants
 *   description: Merchant management (platform-level)
 */

/**
 * @swagger
 * /merchants:
 *   get:
 *     tags: [Merchants]
 *     summary: List merchants (SUPER_ADMIN, PLATFORM_ADMIN, MERCHANT_OWNER)
 *     parameters:
 *       - in: query
 *         name: tenantId
 *         schema: { type: string }
 *         description: Filter by tenant (admin only)
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, SUSPENDED, PENDING] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated merchant list
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get(
  '/',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER'),
  merchantController.list
);

/**
 * @swagger
 * /merchants/{id}:
 *   get:
 *     tags: [Merchants]
 *     summary: Get merchant by ID (with stores)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Merchant detail
 *       404:
 *         description: Merchant not found
 */
router.get(
  '/:id',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER'),
  merchantController.get
);

/**
 * @swagger
 * /merchants:
 *   post:
 *     tags: [Merchants]
 *     summary: Create a merchant (SUPER_ADMIN, PLATFORM_ADMIN)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, tenantId]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Acme Retail Ltd"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "contact@acme.com"
 *               phone:
 *                 type: string
 *                 example: "+1-555-0100"
 *               address:
 *                 type: string
 *                 example: "123 Commerce St, NY 10001"
 *               tenantId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Merchant created
 *       409:
 *         description: Email already in use
 */
router.post(
  '/',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN'),
  merchantController.create
);

/**
 * @swagger
 * /merchants/{id}:
 *   patch:
 *     tags: [Merchants]
 *     summary: Update merchant details
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               address: { type: string }
 *     responses:
 *       200:
 *         description: Updated merchant
 *       404:
 *         description: Merchant not found
 */
router.patch(
  '/:id',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER'),
  merchantController.update
);

/**
 * @swagger
 * /merchants/{id}:
 *   delete:
 *     tags: [Merchants]
 *     summary: Delete a merchant (SUPER_ADMIN only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Merchant deleted
 *       404:
 *         description: Merchant not found
 */
router.delete('/:id', authenticate, authorize('SUPER_ADMIN'), merchantController.remove);

/**
 * @swagger
 * /merchants/{id}/suspend:
 *   patch:
 *     tags: [Merchants]
 *     summary: Suspend a merchant account
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Merchant suspended
 */
router.patch(
  '/:id/suspend',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN'),
  merchantController.suspend
);

/**
 * @swagger
 * /merchants/{id}/activate:
 *   patch:
 *     tags: [Merchants]
 *     summary: Reactivate a suspended merchant
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Merchant activated
 */
router.patch(
  '/:id/activate',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN'),
  merchantController.activate
);

module.exports = router;
