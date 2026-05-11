const router = require('express').Router();
const cartController = require('../controllers/cart.controller');
const { authenticate } = require('../middleware/auth.middleware');

/**
 * @swagger
 * tags:
 *   name: Cart
 *   description: Shopping cart and checkout
 */

/**
 * @swagger
 * /cart:
 *   get:
 *     tags: [Cart]
 *     summary: Get the current user's cart for a store
 *     parameters:
 *       - in: query
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Cart with items and subtotal
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Cart'
 *       400:
 *         description: storeId is required
 *       401:
 *         description: Unauthorized
 */
router.get('/', authenticate, cartController.getCart);

/**
 * @swagger
 * /cart/items:
 *   post:
 *     tags: [Cart]
 *     summary: Add an item to the cart
 *     description: Creates the cart if it doesn't exist. Adds to existing quantity if the variant is already in the cart.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [storeId, variantId]
 *             properties:
 *               storeId:
 *                 type: string
 *                 format: uuid
 *               variantId:
 *                 type: string
 *                 format: uuid
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 default: 1
 *     responses:
 *       201:
 *         description: Item added or quantity updated
 *       400:
 *         description: Insufficient stock or missing fields
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Store or variant not found
 */
router.post('/items', authenticate, cartController.addItem);

/**
 * @swagger
 * /cart/items/{variantId}:
 *   patch:
 *     tags: [Cart]
 *     summary: Update item quantity in cart
 *     parameters:
 *       - in: path
 *         name: variantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [storeId, quantity]
 *             properties:
 *               storeId:
 *                 type: string
 *                 format: uuid
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *     responses:
 *       200:
 *         description: Item quantity updated
 *       400:
 *         description: Insufficient stock or invalid quantity
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Cart or item not found
 *   delete:
 *     tags: [Cart]
 *     summary: Remove an item from the cart
 *     parameters:
 *       - in: path
 *         name: variantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Item removed
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Item not found
 */
router.patch('/items/:variantId', authenticate, cartController.updateItem);
router.delete('/items/:variantId', authenticate, cartController.removeItem);

/**
 * @swagger
 * /cart:
 *   delete:
 *     tags: [Cart]
 *     summary: Clear all items from the cart
 *     parameters:
 *       - in: query
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Cart cleared
 *       401:
 *         description: Unauthorized
 */
router.delete('/', authenticate, cartController.clearCart);

/**
 * @swagger
 * /cart/checkout:
 *   post:
 *     tags: [Cart]
 *     summary: Convert cart to order (checkout)
 *     description: |
 *       Creates an order from the current cart, reserves stock, clears the cart,
 *       and sends an order confirmation email. The order starts in PENDING status.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [storeId]
 *             properties:
 *               storeId:
 *                 type: string
 *                 format: uuid
 *               notes:
 *                 type: string
 *                 example: "Please leave at the door"
 *     responses:
 *       201:
 *         description: Order created — confirmation email queued
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       400:
 *         description: Empty cart or insufficient stock
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Store not found
 */
router.post('/checkout', authenticate, cartController.checkout);

module.exports = router;
