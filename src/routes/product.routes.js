const router = require('express').Router();
const productController = require('../controllers/product.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Product catalog and SKU/variant management
 */

/**
 * @swagger
 * /products:
 *   get:
 *     tags: [Products]
 *     summary: List products (tenant-scoped)
 *     parameters:
 *       - in: query
 *         name: storeId
 *         schema: { type: string }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated product list
 *       401:
 *         description: Unauthorized
 */
router.get('/', authenticate, productController.list);

/**
 * @swagger
 * /products/{id}:
 *   get:
 *     tags: [Products]
 *     summary: Get product by ID (with variants)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product with variants
 *       404:
 *         description: Product not found
 */
router.get('/:id', authenticate, productController.get);

/**
 * @swagger
 * /products:
 *   post:
 *     tags: [Products]
 *     summary: Create a product (MERCHANT_OWNER, SUPER_ADMIN, PLATFORM_ADMIN)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Premium Cotton T-Shirt"
 *               description:
 *                 type: string
 *                 example: "100% organic cotton, pre-shrunk"
 *               price:
 *                 type: number
 *                 example: 29.99
 *               category:
 *                 type: string
 *                 example: "Apparel"
 *               storeId:
 *                 type: string
 *                 format: uuid
 *               tenantId:
 *                 type: string
 *                 format: uuid
 *                 description: "Required for SUPER_ADMIN/PLATFORM_ADMIN"
 *     responses:
 *       201:
 *         description: Product created
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post(
  '/',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER'),
  productController.create
);

/**
 * @swagger
 * /products/{id}:
 *   patch:
 *     tags: [Products]
 *     summary: Update a product
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
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               category:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated product
 *       404:
 *         description: Product not found
 */
router.patch(
  '/:id',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER'),
  productController.update
);

/**
 * @swagger
 * /products/{id}:
 *   delete:
 *     tags: [Products]
 *     summary: Delete a product
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product deleted
 *       404:
 *         description: Product not found
 */
router.delete(
  '/:id',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER'),
  productController.remove
);

/**
 * @swagger
 * /products/{id}/variants:
 *   get:
 *     tags: [Products]
 *     summary: List all variants for a product
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of variants
 *       404:
 *         description: Product not found
 */
router.get('/:id/variants', authenticate, productController.listVariants);

/**
 * @swagger
 * /products/{id}/variants/{variantId}:
 *   get:
 *     tags: [Products]
 *     summary: Get a single variant
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: variantId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Variant detail
 *       404:
 *         description: Variant not found
 */
router.get('/:id/variants/:variantId', authenticate, productController.getVariant);

/**
 * @swagger
 * /products/generate-variants:
 *   post:
 *     tags: [Products]
 *     summary: Preview SKU matrix (cartesian product, not persisted)
 *     description: |
 *       Generates all attribute combinations. Example: sizes=["S","M"], colors=["Black","White"] → 4 SKUs.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sizes:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["S", "M", "L"]
 *               colors:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["Black", "White", "Navy"]
 *               materials:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["Cotton", "Polyester"]
 *     responses:
 *       200:
 *         description: Generated SKU combinations
 *         content:
 *           application/json:
 *             example:
 *               count: 18
 *               variants:
 *                 - { sku: "S-Black-Cotton", size: "S", color: "Black", material: "Cotton" }
 *       400:
 *         description: No attributes provided
 */
router.post('/generate-variants', authenticate, productController.generateVariants);

/**
 * @swagger
 * /products/save-variants:
 *   post:
 *     tags: [Products]
 *     summary: Generate and persist variant SKU matrix for a product
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
 *                 items: { type: string }
 *                 example: ["S", "M", "L", "XL"]
 *               colors:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["Black", "White"]
 *               materials:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["Cotton"]
 *     responses:
 *       201:
 *         description: Variants saved (idempotent — safe to re-run)
 *       404:
 *         description: Product not found for this tenant
 */
router.post(
  '/save-variants',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER', 'STORE_MANAGER'),
  productController.saveVariants
);

/**
 * @swagger
 * /products/variants/{variantId}/stock:
 *   patch:
 *     tags: [Products]
 *     summary: Adjust stock delta for a variant (legacy endpoint)
 *     description: Pass positive to add, negative to subtract. See /inventory for granular operations.
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
 *                 example: 50
 *     responses:
 *       200:
 *         description: Updated variant
 *       400:
 *         description: Insufficient stock
 *       403:
 *         description: Forbidden
 */
router.patch(
  '/variants/:variantId/stock',
  authenticate,
  authorize('SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER', 'STORE_MANAGER'),
  productController.updateStock
);

module.exports = router;
