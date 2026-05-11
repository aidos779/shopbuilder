const router = require('express').Router();
const storeController = require('../controllers/store.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');

/**
 * @swagger
 * tags:
 *   name: Stores
 *   description: Store management within a merchant
 */

/**
 * @swagger
 * /stores:
 *   get:
 *     tags: [Stores]
 *     summary: List stores (tenant-scoped)
 *     parameters:
 *       - in: query
 *         name: merchantId
 *         schema: { type: string }
 *       - in: query
 *         name: tenantId
 *         schema: { type: string }
 *         description: Admin override
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated store list
 */
router.get(
  '/',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER', 'STORE_MANAGER'),
  storeController.list
);

/**
 * @swagger
 * /stores/{id}:
 *   get:
 *     tags: [Stores]
 *     summary: Get store by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Store detail with product and order counts
 *       404:
 *         description: Store not found
 */
router.get(
  '/:id',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER', 'STORE_MANAGER'),
  storeController.get
);

/**
 * @swagger
 * /stores:
 *   post:
 *     tags: [Stores]
 *     summary: Create a store under a merchant
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, merchantId]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Downtown Flagship"
 *               description:
 *                 type: string
 *                 example: "Main retail location"
 *               merchantId:
 *                 type: string
 *                 format: uuid
 *               tenantId:
 *                 type: string
 *                 format: uuid
 *                 description: "For SUPER_ADMIN/PLATFORM_ADMIN only"
 *     responses:
 *       201:
 *         description: Store created
 *       404:
 *         description: Merchant not found
 */
router.post(
  '/',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER'),
  storeController.create
);

/**
 * @swagger
 * /stores/{id}:
 *   patch:
 *     tags: [Stores]
 *     summary: Update store name or description
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
 *               description: { type: string }
 *     responses:
 *       200:
 *         description: Updated store
 */
router.patch(
  '/:id',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER', 'STORE_MANAGER'),
  storeController.update
);

/**
 * @swagger
 * /stores/{id}:
 *   delete:
 *     tags: [Stores]
 *     summary: Delete a store (SUPER_ADMIN, PLATFORM_ADMIN, MERCHANT_OWNER)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Store deleted
 */
router.delete(
  '/:id',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER'),
  storeController.remove
);

module.exports = router;
