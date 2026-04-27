const router = require('express').Router();
const productController = require('../controllers/product.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: SKU generation and inventory management
 */

/**
 * @swagger
 * /products/generate-variants:
 *   post:
 *     tags: [Products]
 *     summary: Generate all SKU combinations (cartesian product)
 *     description: |
 *       Returns every combination of the provided attribute lists.
 *       **Example**: sizes=["S","M"], colors=["Black","White"], materials=["Cotton"]
 *       produces: S-Black-Cotton, S-White-Cotton, M-Black-Cotton, M-White-Cotton
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sizes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["S", "M"]
 *               colors:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Black", "White"]
 *               materials:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Cotton"]
 *     responses:
 *       200:
 *         description: Generated variant SKUs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                   example: 4
 *                 variants:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       sku:
 *                         type: string
 *                         example: S-Black-Cotton
 *                       size:
 *                         type: string
 *                       color:
 *                         type: string
 *                       material:
 *                         type: string
 *       400:
 *         description: No attributes provided
 *       401:
 *         description: Unauthorized
 */
router.post('/generate-variants', authenticate, productController.generateVariants);

/**
 * @swagger
 * /products/save-variants:
 *   post:
 *     tags: [Products]
 *     summary: Generate and persist variants for a product (tenant-scoped)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId]
 *             properties:
 *               productId:
 *                 type: string
 *                 format: uuid
 *               sizes:
 *                 type: array
 *                 items:
 *                   type: string
 *               colors:
 *                 type: array
 *                 items:
 *                   type: string
 *               materials:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Variants saved
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Product not found for this tenant
 */
router.post('/save-variants', authenticate, productController.saveVariants);

/**
 * @swagger
 * /products/variants/{variantId}/stock:
 *   patch:
 *     tags: [Products]
 *     summary: Adjust stock for a variant (ADMIN only)
 *     description: Pass a positive quantity to add stock, negative to subtract. Negative stock is rejected.
 *     parameters:
 *       - in: path
 *         name: variantId
 *         required: true
 *         schema:
 *           type: string
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
 *                 example: 10
 *     responses:
 *       200:
 *         description: Updated variant with new stock level
 *       400:
 *         description: Insufficient stock or invalid quantity
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — ADMIN role required
 *       404:
 *         description: Variant not found
 */
router.patch('/variants/:variantId/stock', authenticate, authorize('ADMIN'), productController.updateStock);

module.exports = router;
