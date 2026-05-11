const router = require('express').Router();
const orderController = require('../controllers/order.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');

/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: Order lifecycle management
 */

/**
 * @swagger
 * /orders:
 *   post:
 *     tags: [Orders]
 *     summary: Create a new order (reserves stock atomically)
 *     description: |
 *       Creates a PENDING order and reserves stock for each line item in a single transaction.
 *       Stock is deducted permanently when the order transitions to PAID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [storeId, items]
 *             properties:
 *               storeId:
 *                 type: string
 *                 format: uuid
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [variantId, quantity]
 *                   properties:
 *                     variantId:
 *                       type: string
 *                       format: uuid
 *                     quantity:
 *                       type: integer
 *                       minimum: 1
 *                       example: 2
 *               notes:
 *                 type: string
 *                 example: "Gift wrapping requested"
 *               tenantId:
 *                 type: string
 *                 description: "Required for SUPER_ADMIN/PLATFORM_ADMIN"
 *     responses:
 *       201:
 *         description: Order created with PENDING status
 *         content:
 *           application/json:
 *             example:
 *               id: "uuid"
 *               orderNumber: "ORD-20240115-83421"
 *               status: "PENDING"
 *               totalAmount: 59.98
 *               items:
 *                 - variantId: "uuid"
 *                   quantity: 2
 *                   unitPrice: 29.99
 *       400:
 *         description: Insufficient stock or missing fields
 *       404:
 *         description: Store or variant not found
 */
router.post('/', authenticate, orderController.create);

/**
 * @swagger
 * /orders:
 *   get:
 *     tags: [Orders]
 *     summary: List orders (role-scoped — customers see only their own)
 *     parameters:
 *       - in: query
 *         name: storeId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, PAID, PACKED, SHIPPED, DELIVERED, CANCELLED, REFUNDED]
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *         description: Admin/staff only — filter by customer
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated order list
 */
router.get('/', authenticate, orderController.list);

/**
 * @swagger
 * /orders/{id}:
 *   get:
 *     tags: [Orders]
 *     summary: Get a single order (customers only see their own)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Order detail with line items
 *       404:
 *         description: Order not found
 */
router.get('/:id', authenticate, orderController.get);

/**
 * @swagger
 * /orders/{id}/status:
 *   patch:
 *     tags: [Orders]
 *     summary: Advance order status (enforces valid state machine transitions)
 *     description: |
 *       Valid transitions:
 *       - PENDING → PAID (deducts stock), CANCELLED (releases reserve)
 *       - PAID → PACKED, REFUNDED
 *       - PACKED → SHIPPED
 *       - SHIPPED → DELIVERED
 *       - DELIVERED → REFUNDED
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PAID, PACKED, SHIPPED, DELIVERED, CANCELLED, REFUNDED]
 *                 example: PAID
 *     responses:
 *       200:
 *         description: Order status updated
 *       400:
 *         description: Invalid status transition
 *       403:
 *         description: Forbidden
 */
router.patch(
  '/:id/status',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER', 'STORE_MANAGER'),
  orderController.updateStatus
);

/**
 * @swagger
 * /orders/{id}/cancel:
 *   post:
 *     tags: [Orders]
 *     summary: Cancel an order (releases reserved stock atomically)
 *     description: Customers can cancel their own PENDING orders. Staff can cancel PENDING or PAID orders.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Order cancelled and stock released
 *       400:
 *         description: Order cannot be cancelled in current status
 */
router.post('/:id/cancel', authenticate, orderController.cancel);

module.exports = router;
