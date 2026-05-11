const router = require('express').Router();
const adminController = require('../controllers/admin.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Platform administration (SUPER_ADMIN and PLATFORM_ADMIN only)
 */

const adminOnly = [authenticate, authorize('SUPER_ADMIN', 'PLATFORM_ADMIN')];
const superOnly = [authenticate, authorize('SUPER_ADMIN')];

/**
 * @swagger
 * /admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Platform-wide statistics
 *     description: Returns total counts for users, tenants, merchants, stores, products, and orders — grouped by status/role.
 *     responses:
 *       200:
 *         description: Platform stats
 *         content:
 *           application/json:
 *             example:
 *               totals:
 *                 users: 42
 *                 tenants: 3
 *                 merchants: 8
 *                 stores: 12
 *                 products: 156
 *                 orders: 319
 *               ordersByStatus:
 *                 PENDING: 24
 *                 PAID: 101
 *                 DELIVERED: 187
 *               usersByRole:
 *                 CUSTOMER: 35
 *                 MERCHANT_OWNER: 5
 *       403:
 *         description: Forbidden
 */
router.get('/stats', ...adminOnly, adminController.getPlatformStats);

/**
 * @swagger
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List all platform users
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [SUPER_ADMIN, PLATFORM_ADMIN, MERCHANT_OWNER, STORE_MANAGER, CUSTOMER]
 *       - in: query
 *         name: tenantId
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated user list
 */
router.get('/users', ...adminOnly, adminController.listUsers);

/**
 * @swagger
 * /admin/users/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Get a user by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User profile
 *       404:
 *         description: User not found
 */
router.get('/users/:id', ...adminOnly, adminController.getUser);

/**
 * @swagger
 * /admin/users/{id}/role:
 *   patch:
 *     tags: [Admin]
 *     summary: Update a user's role and/or tenant assignment (SUPER_ADMIN only)
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
 *             required: [role]
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [SUPER_ADMIN, PLATFORM_ADMIN, MERCHANT_OWNER, STORE_MANAGER, CUSTOMER]
 *                 example: MERCHANT_OWNER
 *               tenantId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: Assign or remove tenant association
 *     responses:
 *       200:
 *         description: User role updated
 *       400:
 *         description: Invalid role
 *       404:
 *         description: User not found
 */
router.patch('/users/:id/role', ...superOnly, adminController.updateUserRole);

/**
 * @swagger
 * /admin/users/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete a user (SUPER_ADMIN only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User deleted
 *       404:
 *         description: User not found
 */
router.delete('/users/:id', ...superOnly, adminController.deleteUser);

/**
 * @swagger
 * /admin/tenants:
 *   get:
 *     tags: [Admin]
 *     summary: List all tenants with aggregate counts
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated tenant list
 */
router.get('/tenants', ...adminOnly, adminController.listTenants);

/**
 * @swagger
 * /admin/tenants/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Get a tenant by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Tenant detail
 *       404:
 *         description: Tenant not found
 */
router.get('/tenants/:id', ...adminOnly, adminController.getTenant);

/**
 * @swagger
 * /admin/tenants:
 *   post:
 *     tags: [Admin]
 *     summary: Create a new tenant (isolates a merchant ecosystem)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, slug]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Acme Commerce"
 *               slug:
 *                 type: string
 *                 example: "acme-commerce"
 *                 description: URL-safe unique identifier
 *     responses:
 *       201:
 *         description: Tenant created
 *       409:
 *         description: Slug already taken
 */
router.post('/tenants', ...adminOnly, adminController.createTenant);

module.exports = router;
