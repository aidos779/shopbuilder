const router = require('express').Router();
const inventoryController = require('../controllers/inventory.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');

/**
 * @swagger
 * tags:
 *   name: Inventory
 *   description: Transaction-safe stock management per variant
 */

/**
 * @swagger
 * /inventory/{variantId}/status:
 *   get:
 *     tags: [Inventory]
 *     summary: Get inventory status for a variant
 *     description: Returns total stock, reserved stock, and computed available stock.
 *     parameters:
 *       - in: path
 *         name: variantId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Inventory status
 *         content:
 *           application/json:
 *             example:
 *               variantId: "uuid"
 *               sku: "PROD-S-Black-Cotton"
 *               stock: 100
 *               reservedStock: 15
 *               availableStock: 85
 *       404:
 *         description: Variant not found
 */
router.get(
  '/:variantId/status',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER', 'STORE_MANAGER'),
  inventoryController.getStatus
);

/**
 * @swagger
 * /inventory/{variantId}/increase:
 *   post:
 *     tags: [Inventory]
 *     summary: Increase stock (goods received)
 *     parameters:
 *       - in: path
 *         name: variantId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [quantity]
 *             properties:
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 example: 50
 *     responses:
 *       200:
 *         description: Stock increased
 *       400:
 *         description: Invalid quantity
 *       404:
 *         description: Variant not found
 */
router.post(
  '/:variantId/increase',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER', 'STORE_MANAGER'),
  inventoryController.increase
);

/**
 * @swagger
 * /inventory/{variantId}/decrease:
 *   post:
 *     tags: [Inventory]
 *     summary: Decrease stock (shrinkage, damage, write-off)
 *     parameters:
 *       - in: path
 *         name: variantId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [quantity]
 *             properties:
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 example: 3
 *     responses:
 *       200:
 *         description: Stock decreased
 *       400:
 *         description: Insufficient stock
 */
router.post(
  '/:variantId/decrease',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER', 'STORE_MANAGER'),
  inventoryController.decrease
);

/**
 * @swagger
 * /inventory/{variantId}/reserve:
 *   post:
 *     tags: [Inventory]
 *     summary: Reserve stock (hold for pending order)
 *     parameters:
 *       - in: path
 *         name: variantId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [quantity]
 *             properties:
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 example: 5
 *     responses:
 *       200:
 *         description: Stock reserved
 *       400:
 *         description: Insufficient available stock
 */
router.post(
  '/:variantId/reserve',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER', 'STORE_MANAGER'),
  inventoryController.reserve
);

/**
 * @swagger
 * /inventory/{variantId}/release:
 *   post:
 *     tags: [Inventory]
 *     summary: Release reserved stock (order cancelled or expired)
 *     parameters:
 *       - in: path
 *         name: variantId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [quantity]
 *             properties:
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 example: 5
 *     responses:
 *       200:
 *         description: Reserved stock released
 *       400:
 *         description: Cannot release more than reserved
 */
router.post(
  '/:variantId/release',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER', 'STORE_MANAGER'),
  inventoryController.release
);

/**
 * @swagger
 * /inventory/transfer:
 *   post:
 *     tags: [Inventory]
 *     summary: Transfer stock between two variants (warehouse transfer)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fromVariantId, toVariantId, quantity]
 *             properties:
 *               fromVariantId:
 *                 type: string
 *                 format: uuid
 *               toVariantId:
 *                 type: string
 *                 format: uuid
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 example: 10
 *     responses:
 *       200:
 *         description: Transfer completed (atomic transaction)
 *         content:
 *           application/json:
 *             example:
 *               message: "10 units transferred"
 *               transferred: 10
 *               from: { id: "uuid", sku: "A", stock: 40 }
 *               to: { id: "uuid", sku: "B", stock: 60 }
 *       400:
 *         description: Insufficient source stock or same variant
 */
router.post(
  '/transfer',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER', 'STORE_MANAGER'),
  inventoryController.transfer
);

module.exports = router;
