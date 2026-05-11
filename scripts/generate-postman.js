/**
 * Generates ShopBuilder.postman_collection.json and ShopBuilder.postman_environment.json
 * from the actual implemented routes. Run with: node scripts/generate-postman.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ─── helpers ──────────────────────────────────────────────────────────────────

let seq = 1;
const uid = () => `sb-${String(seq++).padStart(4, '0')}`;

const jsonBody = (obj) => ({
  mode: 'raw',
  raw: JSON.stringify(obj, null, 2),
  options: { raw: { language: 'json' } },
});

const noBody = () => ({ mode: 'raw', raw: '' });

const url = (raw, pathSegments = [], query = []) => {
  const obj = {
    raw: `{{baseUrl}}/${pathSegments.join('/')}`,
    host: ['{{baseUrl}}'],
    path: pathSegments,
  };
  if (query.length) obj.query = query;
  // raw override
  obj.raw = raw;
  return obj;
};

const bearerAuth = { type: 'bearer', bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }] };
const noAuth = { type: 'noauth' };

const test = (...lines) => ({
  listen: 'test',
  script: { type: 'text/javascript', exec: lines },
});

const preReq = (...lines) => ({
  listen: 'prerequest',
  script: { type: 'text/javascript', exec: lines },
});

const saveEnvTest = (mapping) => {
  const lines = [
    'const res = pm.response.json();',
    ...Object.entries(mapping).map(
      ([env, path]) => {
        const expr = path.split('.').reduce((acc, k) => `${acc}?.${k}`, 'res').replace(/^\?\./, '');
        return `if (${expr}) pm.environment.set('${env}', ${expr});`;
      }
    ),
  ];
  return test(...lines);
};

const statusTest = (code) =>
  test(`pm.test('Status ${code}', () => pm.response.to.have.status(${code}));`);

const req = ({ name, method, rawUrl, body, auth, events = [], description }) => ({
  name,
  ...(description ? { description } : {}),
  request: {
    method,
    header: [],
    ...(body !== undefined ? { body } : {}),
    url: rawUrl,
    ...(auth ? { auth } : {}),
  },
  response: [],
  event: events,
});

const folder = (name, description, items) => ({
  name,
  description,
  item: items,
});

// ─── environment ──────────────────────────────────────────────────────────────

const environment = {
  id: 'shopbuilder-local-env',
  name: 'ShopBuilder — Local',
  values: [
    { key: 'baseUrl',                 value: 'http://localhost:3000', type: 'default',  enabled: true },
    { key: 'accessToken',             value: '',                      type: 'secret',   enabled: true },
    { key: 'refreshToken',            value: '',                      type: 'secret',   enabled: true },
    { key: 'tenantId',                value: '',                      type: 'default',  enabled: true },
    { key: 'merchantId',              value: '',                      type: 'default',  enabled: true },
    { key: 'storeId',                 value: '',                      type: 'default',  enabled: true },
    { key: 'productId',               value: '',                      type: 'default',  enabled: true },
    { key: 'variantId',               value: '',                      type: 'default',  enabled: true },
    { key: 'variantId2',              value: '',                      type: 'default',  enabled: true },
    { key: 'orderId',                 value: '',                      type: 'default',  enabled: true },
    { key: 'userId',                  value: '',                      type: 'default',  enabled: true },
    { key: 'targetUserId',            value: '',                      type: 'default',  enabled: true },
    { key: 'emailVerificationToken',  value: '',                      type: 'default',  enabled: true },
    { key: 'passwordResetToken',      value: '',                      type: 'default',  enabled: true },
    { key: 'adminEmail',              value: 'admin@shopbuilder.io',  type: 'default',  enabled: true },
    { key: 'adminPassword',           value: 'AdminPass123!',         type: 'default',  enabled: true },
    { key: 'merchantEmail',           value: 'merchant@acme.com',     type: 'default',  enabled: true },
    { key: 'merchantPassword',        value: 'MerchantPass123!',      type: 'default',  enabled: true },
    { key: 'customerEmail',           value: 'customer@example.com',  type: 'default',  enabled: true },
    { key: 'customerPassword',        value: 'CustomerPass123!',      type: 'default',  enabled: true },
  ],
  _postman_variable_scope: 'environment',
};

// ─── collection items ─────────────────────────────────────────────────────────

const healthFolder = folder('🏥 Health', 'Public health check endpoint — no auth required.', [
  req({
    name: 'Health Check',
    method: 'GET',
    rawUrl: { raw: '{{baseUrl}}/health', host: ['{{baseUrl}}'], path: ['health'] },
    auth: noAuth,
    events: [
      test(
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Status is ok', () => pm.expect(pm.response.json().status).to.eql('ok'));"
      ),
    ],
  }),
]);

// ─── Auth ─────────────────────────────────────────────────────────────────────

const authFolder = folder('🔐 Auth', `JWT authentication — access token (15 min) + revocable refresh token (7 days).

• Register → sends verification email
• Login → run this to auto-populate accessToken and refreshToken in the environment
• Tokens are automatically saved after Login and Refresh`, [

  req({
    name: 'Register',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/auth/register', host: ['{{baseUrl}}'], path: ['auth', 'register'] },
    body: jsonBody({ email: '{{customerEmail}}', password: '{{customerPassword}}', role: 'CUSTOMER' }),
    auth: noAuth,
    description: 'Creates a new CUSTOMER account. A verification email is queued. Rate limited: 10 req/min.',
    events: [
      test(
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        'const res = pm.response.json();',
        "if (res.user?.id) pm.environment.set('userId', res.user.id);"
      ),
    ],
  }),

  req({
    name: 'Register — as MERCHANT_OWNER',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/auth/register', host: ['{{baseUrl}}'], path: ['auth', 'register'] },
    body: jsonBody({ email: '{{merchantEmail}}', password: '{{merchantPassword}}', role: 'MERCHANT_OWNER' }),
    auth: noAuth,
    description: 'Creates a MERCHANT_OWNER account.',
    events: [statusTest(201)],
  }),

  req({
    name: 'Register — as SUPER_ADMIN',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/auth/register', host: ['{{baseUrl}}'], path: ['auth', 'register'] },
    body: jsonBody({ email: '{{adminEmail}}', password: '{{adminPassword}}', role: 'SUPER_ADMIN' }),
    auth: noAuth,
    description: 'Creates a SUPER_ADMIN account (only safe in dev environments).',
    events: [statusTest(201)],
  }),

  req({
    name: 'Verify Email',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/auth/verify-email', host: ['{{baseUrl}}'], path: ['auth', 'verify-email'] },
    body: jsonBody({ token: '{{emailVerificationToken}}' }),
    auth: noAuth,
    description: 'Validates the token from the verification email. Paste the token from the email into the emailVerificationToken env var.',
    events: [statusTest(200)],
  }),

  req({
    name: 'Login',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/auth/login', host: ['{{baseUrl}}'], path: ['auth', 'login'] },
    body: jsonBody({ email: '{{customerEmail}}', password: '{{customerPassword}}' }),
    auth: noAuth,
    description: 'Authenticates and returns accessToken + refreshToken. Both are auto-saved to the environment.',
    events: [
      test(
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Has accessToken', () => pm.expect(pm.response.json()).to.have.property('accessToken'));",
        'const res = pm.response.json();',
        "if (res.accessToken)  pm.environment.set('accessToken',  res.accessToken);",
        "if (res.refreshToken) pm.environment.set('refreshToken', res.refreshToken);",
        "if (res.user?.id)     pm.environment.set('userId',       res.user.id);"
      ),
    ],
  }),

  req({
    name: 'Login — as SUPER_ADMIN',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/auth/login', host: ['{{baseUrl}}'], path: ['auth', 'login'] },
    body: jsonBody({ email: '{{adminEmail}}', password: '{{adminPassword}}' }),
    auth: noAuth,
    description: 'Login as SUPER_ADMIN. Tokens auto-saved. Use this before admin operations.',
    events: [
      test(
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        'const res = pm.response.json();',
        "if (res.accessToken)  pm.environment.set('accessToken',  res.accessToken);",
        "if (res.refreshToken) pm.environment.set('refreshToken', res.refreshToken);",
        "if (res.user?.id)     pm.environment.set('userId',       res.user.id);"
      ),
    ],
  }),

  req({
    name: 'Login — as MERCHANT_OWNER',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/auth/login', host: ['{{baseUrl}}'], path: ['auth', 'login'] },
    body: jsonBody({ email: '{{merchantEmail}}', password: '{{merchantPassword}}' }),
    auth: noAuth,
    description: 'Login as MERCHANT_OWNER. Tokens auto-saved.',
    events: [
      test(
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        'const res = pm.response.json();',
        "if (res.accessToken)  pm.environment.set('accessToken',  res.accessToken);",
        "if (res.refreshToken) pm.environment.set('refreshToken', res.refreshToken);",
        "if (res.user?.id)     pm.environment.set('userId',       res.user.id);"
      ),
    ],
  }),

  req({
    name: 'Refresh Access Token',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/auth/refresh', host: ['{{baseUrl}}'], path: ['auth', 'refresh'] },
    body: jsonBody({ refreshToken: '{{refreshToken}}' }),
    auth: noAuth,
    description: 'Exchange refresh token for a new access token. New accessToken is auto-saved.',
    events: [
      test(
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        'const res = pm.response.json();',
        "if (res.accessToken) pm.environment.set('accessToken', res.accessToken);"
      ),
    ],
  }),

  req({
    name: 'Logout',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/auth/logout', host: ['{{baseUrl}}'], path: ['auth', 'logout'] },
    body: jsonBody({ refreshToken: '{{refreshToken}}' }),
    description: 'Revokes the refresh token. The access token remains valid until its 15-min expiry.',
    events: [statusTest(200)],
  }),

  req({
    name: 'Get Current User',
    method: 'GET',
    rawUrl: { raw: '{{baseUrl}}/auth/me', host: ['{{baseUrl}}'], path: ['auth', 'me'] },
    description: 'Returns the JWT payload of the authenticated user.',
    events: [
      test(
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Has role', () => pm.expect(pm.response.json().user).to.have.property('role'));"
      ),
    ],
  }),

  req({
    name: 'Forgot Password',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/auth/forgot-password', host: ['{{baseUrl}}'], path: ['auth', 'forgot-password'] },
    body: jsonBody({ email: '{{customerEmail}}' }),
    auth: noAuth,
    description: 'Queues a password reset email. Always returns 200 to prevent email enumeration. Rate limited: 5 req/15 min.',
    events: [statusTest(200)],
  }),

  req({
    name: 'Reset Password',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/auth/reset-password', host: ['{{baseUrl}}'], path: ['auth', 'reset-password'] },
    body: jsonBody({ token: '{{passwordResetToken}}', newPassword: 'NewSecurePass456!' }),
    auth: noAuth,
    description: 'Sets a new password using the token from the reset email. All sessions are revoked.',
    events: [statusTest(200)],
  }),

  req({
    name: 'Change Password',
    method: 'PATCH',
    rawUrl: { raw: '{{baseUrl}}/auth/password', host: ['{{baseUrl}}'], path: ['auth', 'password'] },
    body: jsonBody({ currentPassword: '{{customerPassword}}', newPassword: 'NewSecurePass456!' }),
    description: 'Changes password and revokes all active sessions. Requires current password.',
    events: [statusTest(200)],
  }),
]);

// ─── Cart ─────────────────────────────────────────────────────────────────────

const cartFolder = folder('🛒 Cart', `Shopping cart and checkout flow.

Cart is per-user per-store. A cart is automatically created on first addItem.
POST /cart/checkout converts the cart into a PENDING order atomically.`, [

  req({
    name: 'Get Cart',
    method: 'GET',
    rawUrl: {
      raw: '{{baseUrl}}/cart?storeId={{storeId}}',
      host: ['{{baseUrl}}'],
      path: ['cart'],
      query: [{ key: 'storeId', value: '{{storeId}}' }],
    },
    description: 'Returns the current cart for the authenticated user for a given store.',
    events: [statusTest(200)],
  }),

  req({
    name: 'Add Item to Cart',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/cart/items', host: ['{{baseUrl}}'], path: ['cart', 'items'] },
    body: jsonBody({ storeId: '{{storeId}}', variantId: '{{variantId}}', quantity: 2 }),
    description: 'Adds an item to the cart. If the variant is already in the cart, quantity is incremented. Validates available stock.',
    events: [
      test(
        "pm.test('Status 201', () => pm.response.to.have.status(201));"
      ),
    ],
  }),

  req({
    name: 'Update Item Quantity',
    method: 'PATCH',
    rawUrl: {
      raw: '{{baseUrl}}/cart/items/{{variantId}}',
      host: ['{{baseUrl}}'],
      path: ['cart', 'items', '{{variantId}}'],
    },
    body: jsonBody({ storeId: '{{storeId}}', quantity: 3 }),
    description: 'Sets the quantity for a specific variant in the cart.',
    events: [statusTest(200)],
  }),

  req({
    name: 'Remove Item from Cart',
    method: 'DELETE',
    rawUrl: {
      raw: '{{baseUrl}}/cart/items/{{variantId}}?storeId={{storeId}}',
      host: ['{{baseUrl}}'],
      path: ['cart', 'items', '{{variantId}}'],
      query: [{ key: 'storeId', value: '{{storeId}}' }],
    },
    description: 'Removes a single item from the cart.',
    events: [statusTest(204)],
  }),

  req({
    name: 'Clear Cart',
    method: 'DELETE',
    rawUrl: {
      raw: '{{baseUrl}}/cart?storeId={{storeId}}',
      host: ['{{baseUrl}}'],
      path: ['cart'],
      query: [{ key: 'storeId', value: '{{storeId}}' }],
    },
    description: 'Removes all items from the cart.',
    events: [statusTest(200)],
  }),

  req({
    name: 'Checkout (Cart → Order)',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/cart/checkout', host: ['{{baseUrl}}'], path: ['cart', 'checkout'] },
    body: jsonBody({ storeId: '{{storeId}}', notes: 'Please gift wrap' }),
    description: `Atomically:
1. Validates stock for all items
2. Creates a PENDING order
3. Reserves stock for each item
4. Clears the cart
5. Queues an order confirmation email`,
    events: [
      test(
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        'const res = pm.response.json();',
        "if (res.id) pm.environment.set('orderId', res.id);",
        "pm.test('Order is PENDING', () => pm.expect(res.status).to.eql('PENDING'));"
      ),
    ],
  }),
]);

// ─── Products ─────────────────────────────────────────────────────────────────

const productsFolder = folder('📦 Products', `Product catalog and SKU/variant management.

The variant system uses a Cartesian product engine:
  sizes × colors × materials → all SKU combinations

Use /products/generate-variants to preview, then /products/save-variants to persist.`, [

  req({
    name: 'List Products',
    method: 'GET',
    rawUrl: {
      raw: '{{baseUrl}}/products?page=1&limit=20',
      host: ['{{baseUrl}}'],
      path: ['products'],
      query: [
        { key: 'page',     value: '1' },
        { key: 'limit',    value: '20' },
        { key: 'storeId',  value: '{{storeId}}', disabled: true },
        { key: 'category', value: 'Apparel',     disabled: true },
      ],
    },
    description: 'Paginated list scoped to tenantId from JWT. Admins can filter across tenants.',
    events: [statusTest(200)],
  }),

  req({
    name: 'Get Product (with Variants)',
    method: 'GET',
    rawUrl: {
      raw: '{{baseUrl}}/products/{{productId}}',
      host: ['{{baseUrl}}'],
      path: ['products', '{{productId}}'],
    },
    events: [
      test(
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Has variants', () => pm.expect(pm.response.json()).to.have.property('variants'));"
      ),
    ],
  }),

  req({
    name: 'Create Product',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/products', host: ['{{baseUrl}}'], path: ['products'] },
    body: jsonBody({
      name: 'Premium Cotton T-Shirt',
      description: '100% organic cotton, pre-shrunk',
      price: 29.99,
      category: 'Apparel',
      storeId: '{{storeId}}',
    }),
    description: 'Requires MERCHANT_OWNER, PLATFORM_ADMIN, or SUPER_ADMIN.',
    events: [
      test(
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        'const res = pm.response.json();',
        "if (res.id) pm.environment.set('productId', res.id);"
      ),
    ],
  }),

  req({
    name: 'Update Product',
    method: 'PATCH',
    rawUrl: {
      raw: '{{baseUrl}}/products/{{productId}}',
      host: ['{{baseUrl}}'],
      path: ['products', '{{productId}}'],
    },
    body: jsonBody({ price: 34.99, description: 'Updated: 100% organic cotton' }),
    events: [statusTest(200)],
  }),

  req({
    name: 'Delete Product',
    method: 'DELETE',
    rawUrl: {
      raw: '{{baseUrl}}/products/{{productId}}',
      host: ['{{baseUrl}}'],
      path: ['products', '{{productId}}'],
    },
    description: 'Hard delete. Variants are cascade-deleted.',
    events: [statusTest(200)],
  }),

  req({
    name: 'List Variants',
    method: 'GET',
    rawUrl: {
      raw: '{{baseUrl}}/products/{{productId}}/variants',
      host: ['{{baseUrl}}'],
      path: ['products', '{{productId}}', 'variants'],
    },
    events: [statusTest(200)],
  }),

  req({
    name: 'Get Single Variant',
    method: 'GET',
    rawUrl: {
      raw: '{{baseUrl}}/products/{{productId}}/variants/{{variantId}}',
      host: ['{{baseUrl}}'],
      path: ['products', '{{productId}}', 'variants', '{{variantId}}'],
    },
    events: [statusTest(200)],
  }),

  req({
    name: 'Preview SKU Matrix (not saved)',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/products/generate-variants', host: ['{{baseUrl}}'], path: ['products', 'generate-variants'] },
    body: jsonBody({ sizes: ['S', 'M', 'L', 'XL'], colors: ['Black', 'White', 'Navy'], materials: ['Cotton'] }),
    description: 'Generates the Cartesian product of all attributes. 4 sizes × 3 colors × 1 material = 12 SKUs. Nothing is saved to the database.',
    events: [
      test(
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Count correct', () => pm.expect(pm.response.json().count).to.eql(12));"
      ),
    ],
  }),

  req({
    name: 'Save Variants (persist SKU matrix)',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/products/save-variants', host: ['{{baseUrl}}'], path: ['products', 'save-variants'] },
    body: jsonBody({
      productId: '{{productId}}',
      sizes: ['S', 'M', 'L'],
      colors: ['Black', 'White'],
      materials: ['Cotton'],
    }),
    description: 'Generates and persists all SKU combinations for a product. Idempotent — safe to re-run.',
    events: [
      test(
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        'const res = pm.response.json();',
        "const variants = res.variants || [];",
        "if (variants[0]?.id) pm.environment.set('variantId',  variants[0].id);",
        "if (variants[1]?.id) pm.environment.set('variantId2', variants[1].id);"
      ),
    ],
  }),

  req({
    name: 'Update Stock Delta (legacy)',
    method: 'PATCH',
    rawUrl: {
      raw: '{{baseUrl}}/products/variants/{{variantId}}/stock',
      host: ['{{baseUrl}}'],
      path: ['products', 'variants', '{{variantId}}', 'stock'],
    },
    body: jsonBody({ quantity: 100 }),
    description: 'Adjusts stock by a delta (positive = add, negative = subtract). Prefer /inventory endpoints for granular control.',
    events: [statusTest(200)],
  }),
]);

// ─── Inventory ────────────────────────────────────────────────────────────────

const inventoryFolder = folder('📊 Inventory', `Transaction-safe stock management.

Stock model:
  stock          = physical units on hand
  reservedStock  = held for PENDING orders
  availableStock = stock − reservedStock  (computed)

Flow:
  CREATE ORDER  → reserveStock
  ORDER PAID    → stock−=qty, reserved−=qty  (automatic)
  ORDER CANCEL  → releaseStock               (automatic)`, [

  req({
    name: 'Get Inventory Status',
    method: 'GET',
    rawUrl: {
      raw: '{{baseUrl}}/inventory/{{variantId}}/status',
      host: ['{{baseUrl}}'],
      path: ['inventory', '{{variantId}}', 'status'],
    },
    description: 'Returns stock, reservedStock, and computed availableStock.',
    events: [
      test(
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Has availableStock', () => pm.expect(pm.response.json()).to.have.property('availableStock'));"
      ),
    ],
  }),

  req({
    name: 'Increase Stock (goods received)',
    method: 'POST',
    rawUrl: {
      raw: '{{baseUrl}}/inventory/{{variantId}}/increase',
      host: ['{{baseUrl}}'],
      path: ['inventory', '{{variantId}}', 'increase'],
    },
    body: jsonBody({ quantity: 100 }),
    description: 'Increments physical stock. Use when receiving new stock.',
    events: [statusTest(200)],
  }),

  req({
    name: 'Decrease Stock (write-off)',
    method: 'POST',
    rawUrl: {
      raw: '{{baseUrl}}/inventory/{{variantId}}/decrease',
      host: ['{{baseUrl}}'],
      path: ['inventory', '{{variantId}}', 'decrease'],
    },
    body: jsonBody({ quantity: 3 }),
    description: 'Decrements physical stock. Use for shrinkage or damaged goods.',
    events: [statusTest(200)],
  }),

  req({
    name: 'Reserve Stock (for order)',
    method: 'POST',
    rawUrl: {
      raw: '{{baseUrl}}/inventory/{{variantId}}/reserve',
      host: ['{{baseUrl}}'],
      path: ['inventory', '{{variantId}}', 'reserve'],
    },
    body: jsonBody({ quantity: 5 }),
    description: 'Increments reservedStock. Only succeeds if availableStock >= quantity.',
    events: [statusTest(200)],
  }),

  req({
    name: 'Release Stock (order cancelled)',
    method: 'POST',
    rawUrl: {
      raw: '{{baseUrl}}/inventory/{{variantId}}/release',
      host: ['{{baseUrl}}'],
      path: ['inventory', '{{variantId}}', 'release'],
    },
    body: jsonBody({ quantity: 5 }),
    description: 'Decrements reservedStock. Only succeeds if reserved >= quantity.',
    events: [statusTest(200)],
  }),

  req({
    name: 'Transfer Stock Between Variants',
    method: 'POST',
    rawUrl: {
      raw: '{{baseUrl}}/inventory/transfer',
      host: ['{{baseUrl}}'],
      path: ['inventory', 'transfer'],
    },
    body: jsonBody({ fromVariantId: '{{variantId}}', toVariantId: '{{variantId2}}', quantity: 10 }),
    description: 'Atomically moves stock from one variant to another. Source and destination must differ.',
    events: [
      test(
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Transfer recorded', () => pm.expect(pm.response.json()).to.have.property('transferred'));"
      ),
    ],
  }),
]);

// ─── Orders ───────────────────────────────────────────────────────────────────

const ordersFolder = folder('📋 Orders', `Order lifecycle management.

State machine:
  PENDING → PAID (deducts stock), CANCELLED (releases reserve)
  PAID    → PACKED, REFUNDED
  PACKED  → SHIPPED
  SHIPPED → DELIVERED
  DELIVERED → REFUNDED
  CANCELLED, REFUNDED → terminal

Customers see only their own orders.
MERCHANT_OWNER / STORE_MANAGER can advance status.`, [

  req({
    name: 'Create Order (direct)',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/orders', host: ['{{baseUrl}}'], path: ['orders'] },
    body: jsonBody({
      storeId: '{{storeId}}',
      items: [{ variantId: '{{variantId}}', quantity: 2 }],
      notes: 'Gift wrapping requested',
    }),
    description: 'Creates a PENDING order and reserves stock atomically. Prefer POST /cart/checkout for the full cart flow.',
    events: [
      test(
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        'const res = pm.response.json();',
        "if (res.id) pm.environment.set('orderId', res.id);",
        "pm.test('Order is PENDING', () => pm.expect(res.status).to.eql('PENDING'));"
      ),
    ],
  }),

  req({
    name: 'List Orders',
    method: 'GET',
    rawUrl: {
      raw: '{{baseUrl}}/orders?page=1&limit=20',
      host: ['{{baseUrl}}'],
      path: ['orders'],
      query: [
        { key: 'page',    value: '1' },
        { key: 'limit',   value: '20' },
        { key: 'status',  value: 'PENDING', disabled: true },
        { key: 'storeId', value: '{{storeId}}', disabled: true },
        { key: 'userId',  value: '{{userId}}',  disabled: true },
      ],
    },
    description: 'CUSTOMER role automatically scoped to their own orders.',
    events: [statusTest(200)],
  }),

  req({
    name: 'Get Order',
    method: 'GET',
    rawUrl: {
      raw: '{{baseUrl}}/orders/{{orderId}}',
      host: ['{{baseUrl}}'],
      path: ['orders', '{{orderId}}'],
    },
    events: [statusTest(200)],
  }),

  req({
    name: 'Update Order Status → PAID',
    method: 'PATCH',
    rawUrl: {
      raw: '{{baseUrl}}/orders/{{orderId}}/status',
      host: ['{{baseUrl}}'],
      path: ['orders', '{{orderId}}', 'status'],
    },
    body: jsonBody({ status: 'PAID' }),
    description: 'PENDING → PAID: deducts stock permanently (stock−=qty, reserved−=qty).',
    events: [
      test(
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Status is PAID', () => pm.expect(pm.response.json().status).to.eql('PAID'));"
      ),
    ],
  }),

  req({
    name: 'Update Order Status → PACKED',
    method: 'PATCH',
    rawUrl: {
      raw: '{{baseUrl}}/orders/{{orderId}}/status',
      host: ['{{baseUrl}}'],
      path: ['orders', '{{orderId}}', 'status'],
    },
    body: jsonBody({ status: 'PACKED' }),
    events: [statusTest(200)],
  }),

  req({
    name: 'Update Order Status → SHIPPED',
    method: 'PATCH',
    rawUrl: {
      raw: '{{baseUrl}}/orders/{{orderId}}/status',
      host: ['{{baseUrl}}'],
      path: ['orders', '{{orderId}}', 'status'],
    },
    body: jsonBody({ status: 'SHIPPED' }),
    events: [statusTest(200)],
  }),

  req({
    name: 'Update Order Status → DELIVERED',
    method: 'PATCH',
    rawUrl: {
      raw: '{{baseUrl}}/orders/{{orderId}}/status',
      host: ['{{baseUrl}}'],
      path: ['orders', '{{orderId}}', 'status'],
    },
    body: jsonBody({ status: 'DELIVERED' }),
    events: [statusTest(200)],
  }),

  req({
    name: 'Update Order Status → REFUNDED',
    method: 'PATCH',
    rawUrl: {
      raw: '{{baseUrl}}/orders/{{orderId}}/status',
      host: ['{{baseUrl}}'],
      path: ['orders', '{{orderId}}', 'status'],
    },
    body: jsonBody({ status: 'REFUNDED' }),
    events: [statusTest(200)],
  }),

  req({
    name: 'Cancel Order',
    method: 'POST',
    rawUrl: {
      raw: '{{baseUrl}}/orders/{{orderId}}/cancel',
      host: ['{{baseUrl}}'],
      path: ['orders', '{{orderId}}', 'cancel'],
    },
    description: 'Cancels a PENDING order and atomically releases reserved stock. Customers can cancel their own orders.',
    events: [
      test(
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Status CANCELLED', () => pm.expect(pm.response.json().status).to.eql('CANCELLED'));"
      ),
    ],
  }),
]);

// ─── Merchants ────────────────────────────────────────────────────────────────

const merchantsFolder = folder('🏢 Merchants', `Merchant entity management. Merchants belong to a Tenant and own Stores.

RBAC:
  Create/Delete: SUPER_ADMIN, PLATFORM_ADMIN
  Read/Update:   MERCHANT_OWNER+
  Suspend/Activate: SUPER_ADMIN, PLATFORM_ADMIN`, [

  req({
    name: 'List Merchants',
    method: 'GET',
    rawUrl: {
      raw: '{{baseUrl}}/merchants?page=1&limit=20',
      host: ['{{baseUrl}}'],
      path: ['merchants'],
      query: [
        { key: 'page',     value: '1' },
        { key: 'limit',    value: '20' },
        { key: 'tenantId', value: '{{tenantId}}', disabled: true },
        { key: 'status',   value: 'ACTIVE',        disabled: true },
      ],
    },
    events: [statusTest(200)],
  }),

  req({
    name: 'Get Merchant',
    method: 'GET',
    rawUrl: {
      raw: '{{baseUrl}}/merchants/{{merchantId}}',
      host: ['{{baseUrl}}'],
      path: ['merchants', '{{merchantId}}'],
    },
    events: [statusTest(200)],
  }),

  req({
    name: 'Create Merchant',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/merchants', host: ['{{baseUrl}}'], path: ['merchants'] },
    body: jsonBody({
      name: 'Acme Retail Ltd',
      email: 'contact@acme-retail.com',
      phone: '+1-555-0100',
      address: '123 Commerce St, New York, NY 10001',
      tenantId: '{{tenantId}}',
    }),
    description: 'SUPER_ADMIN and PLATFORM_ADMIN only.',
    events: [
      test(
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        'const res = pm.response.json();',
        "if (res.id) pm.environment.set('merchantId', res.id);"
      ),
    ],
  }),

  req({
    name: 'Update Merchant',
    method: 'PATCH',
    rawUrl: {
      raw: '{{baseUrl}}/merchants/{{merchantId}}',
      host: ['{{baseUrl}}'],
      path: ['merchants', '{{merchantId}}'],
    },
    body: jsonBody({ phone: '+1-555-0199', address: '456 Market Ave, New York, NY 10002' }),
    events: [statusTest(200)],
  }),

  req({
    name: 'Suspend Merchant',
    method: 'PATCH',
    rawUrl: {
      raw: '{{baseUrl}}/merchants/{{merchantId}}/suspend',
      host: ['{{baseUrl}}'],
      path: ['merchants', '{{merchantId}}', 'suspend'],
    },
    description: 'Sets merchant status to SUSPENDED.',
    events: [statusTest(200)],
  }),

  req({
    name: 'Activate Merchant',
    method: 'PATCH',
    rawUrl: {
      raw: '{{baseUrl}}/merchants/{{merchantId}}/activate',
      host: ['{{baseUrl}}'],
      path: ['merchants', '{{merchantId}}', 'activate'],
    },
    description: 'Re-activates a SUSPENDED merchant.',
    events: [statusTest(200)],
  }),

  req({
    name: 'Delete Merchant',
    method: 'DELETE',
    rawUrl: {
      raw: '{{baseUrl}}/merchants/{{merchantId}}',
      host: ['{{baseUrl}}'],
      path: ['merchants', '{{merchantId}}'],
    },
    description: 'SUPER_ADMIN only. Hard delete.',
    events: [statusTest(200)],
  }),
]);

// ─── Stores ───────────────────────────────────────────────────────────────────

const storesFolder = folder('🏪 Stores', `Store management within a merchant.

Stores belong to a Merchant and scoped to a Tenant.
Products and Orders are associated with a Store.`, [

  req({
    name: 'List Stores',
    method: 'GET',
    rawUrl: {
      raw: '{{baseUrl}}/stores?page=1&limit=20',
      host: ['{{baseUrl}}'],
      path: ['stores'],
      query: [
        { key: 'page',       value: '1' },
        { key: 'limit',      value: '20' },
        { key: 'merchantId', value: '{{merchantId}}', disabled: true },
        { key: 'tenantId',   value: '{{tenantId}}',   disabled: true },
      ],
    },
    events: [statusTest(200)],
  }),

  req({
    name: 'Get Store',
    method: 'GET',
    rawUrl: {
      raw: '{{baseUrl}}/stores/{{storeId}}',
      host: ['{{baseUrl}}'],
      path: ['stores', '{{storeId}}'],
    },
    events: [statusTest(200)],
  }),

  req({
    name: 'Create Store',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/stores', host: ['{{baseUrl}}'], path: ['stores'] },
    body: jsonBody({
      name: 'Downtown Flagship',
      description: 'Main retail location on 5th Avenue',
      merchantId: '{{merchantId}}',
    }),
    events: [
      test(
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        'const res = pm.response.json();',
        "if (res.id) pm.environment.set('storeId', res.id);"
      ),
    ],
  }),

  req({
    name: 'Update Store',
    method: 'PATCH',
    rawUrl: {
      raw: '{{baseUrl}}/stores/{{storeId}}',
      host: ['{{baseUrl}}'],
      path: ['stores', '{{storeId}}'],
    },
    body: jsonBody({ description: 'Flagship store — open Mon-Sat 9am-8pm' }),
    events: [statusTest(200)],
  }),

  req({
    name: 'Delete Store',
    method: 'DELETE',
    rawUrl: {
      raw: '{{baseUrl}}/stores/{{storeId}}',
      host: ['{{baseUrl}}'],
      path: ['stores', '{{storeId}}'],
    },
    description: 'Hard delete. SUPER_ADMIN, PLATFORM_ADMIN, MERCHANT_OWNER.',
    events: [statusTest(200)],
  }),
]);

// ─── Admin ────────────────────────────────────────────────────────────────────

const adminFolder = folder('👑 Admin', `Platform administration — SUPER_ADMIN and PLATFORM_ADMIN only.

Tenant → Merchant → Store hierarchy.
User role management and platform-wide statistics.`, [

  req({
    name: 'Platform Stats',
    method: 'GET',
    rawUrl: { raw: '{{baseUrl}}/admin/stats', host: ['{{baseUrl}}'], path: ['admin', 'stats'] },
    description: 'Returns total counts for users, tenants, merchants, stores, products, orders — grouped by status/role.',
    events: [statusTest(200)],
  }),

  req({
    name: 'List Users',
    method: 'GET',
    rawUrl: {
      raw: '{{baseUrl}}/admin/users?page=1&limit=20',
      host: ['{{baseUrl}}'],
      path: ['admin', 'users'],
      query: [
        { key: 'page',     value: '1' },
        { key: 'limit',    value: '20' },
        { key: 'role',     value: 'CUSTOMER',     disabled: true },
        { key: 'tenantId', value: '{{tenantId}}', disabled: true },
      ],
    },
    events: [statusTest(200)],
  }),

  req({
    name: 'Get User',
    method: 'GET',
    rawUrl: {
      raw: '{{baseUrl}}/admin/users/{{targetUserId}}',
      host: ['{{baseUrl}}'],
      path: ['admin', 'users', '{{targetUserId}}'],
    },
    events: [statusTest(200)],
  }),

  req({
    name: 'Update User Role',
    method: 'PATCH',
    rawUrl: {
      raw: '{{baseUrl}}/admin/users/{{targetUserId}}/role',
      host: ['{{baseUrl}}'],
      path: ['admin', 'users', '{{targetUserId}}', 'role'],
    },
    body: jsonBody({ role: 'MERCHANT_OWNER', tenantId: '{{tenantId}}' }),
    description: 'SUPER_ADMIN only. Changes role and optionally assigns/removes tenant.',
    events: [statusTest(200)],
  }),

  req({
    name: 'Delete User',
    method: 'DELETE',
    rawUrl: {
      raw: '{{baseUrl}}/admin/users/{{targetUserId}}',
      host: ['{{baseUrl}}'],
      path: ['admin', 'users', '{{targetUserId}}'],
    },
    description: 'SUPER_ADMIN only. Hard delete.',
    events: [statusTest(200)],
  }),

  req({
    name: 'List Tenants',
    method: 'GET',
    rawUrl: {
      raw: '{{baseUrl}}/admin/tenants?page=1&limit=20',
      host: ['{{baseUrl}}'],
      path: ['admin', 'tenants'],
      query: [
        { key: 'page',  value: '1' },
        { key: 'limit', value: '20' },
      ],
    },
    events: [statusTest(200)],
  }),

  req({
    name: 'Get Tenant',
    method: 'GET',
    rawUrl: {
      raw: '{{baseUrl}}/admin/tenants/{{tenantId}}',
      host: ['{{baseUrl}}'],
      path: ['admin', 'tenants', '{{tenantId}}'],
    },
    events: [statusTest(200)],
  }),

  req({
    name: 'Create Tenant',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/admin/tenants', host: ['{{baseUrl}}'], path: ['admin', 'tenants'] },
    body: jsonBody({ name: 'Acme Commerce', slug: 'acme-commerce' }),
    description: 'Creates an isolated tenant namespace.',
    events: [
      test(
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        'const res = pm.response.json();',
        "if (res.id) pm.environment.set('tenantId', res.id);"
      ),
    ],
  }),
]);

// ─── End-to-End Flows ─────────────────────────────────────────────────────────

const e2eFlow1 = folder('⚡ [Flow 1] Platform Setup (SUPER_ADMIN)', `Run these requests top-to-bottom to bootstrap the platform.

Each step auto-saves IDs into environment variables.
Login as SUPER_ADMIN first (run "Login — as SUPER_ADMIN" from the Auth folder).`, [

  req({
    name: '[1/1] Login as SUPER_ADMIN',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/auth/login', host: ['{{baseUrl}}'], path: ['auth', 'login'] },
    body: jsonBody({ email: '{{adminEmail}}', password: '{{adminPassword}}' }),
    auth: noAuth,
    events: [
      test(
        'const res = pm.response.json();',
        "pm.environment.set('accessToken',  res.accessToken);",
        "pm.environment.set('refreshToken', res.refreshToken);",
        "console.log('[Flow 1] Logged in as SUPER_ADMIN');"
      ),
    ],
  }),

  req({
    name: '[1/2] Create Tenant',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/admin/tenants', host: ['{{baseUrl}}'], path: ['admin', 'tenants'] },
    body: jsonBody({ name: 'Demo Commerce', slug: 'demo-commerce' }),
    events: [
      test(
        'const res = pm.response.json();',
        "pm.environment.set('tenantId', res.id);",
        "console.log('[Flow 1] tenantId =', res.id);"
      ),
    ],
  }),

  req({
    name: '[1/3] Create Merchant',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/merchants', host: ['{{baseUrl}}'], path: ['merchants'] },
    body: jsonBody({
      name: 'Demo Retail Ltd',
      email: 'contact@demo-retail.com',
      phone: '+1-555-0100',
      address: '1 Demo Street, NY 10001',
      tenantId: '{{tenantId}}',
    }),
    events: [
      test(
        'const res = pm.response.json();',
        "pm.environment.set('merchantId', res.id);",
        "console.log('[Flow 1] merchantId =', res.id);"
      ),
    ],
  }),

  req({
    name: '[1/4] Create Store',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/stores', host: ['{{baseUrl}}'], path: ['stores'] },
    body: jsonBody({ name: 'Demo Flagship Store', description: 'Primary storefront', merchantId: '{{merchantId}}' }),
    events: [
      test(
        'const res = pm.response.json();',
        "pm.environment.set('storeId', res.id);",
        "console.log('[Flow 1] storeId =', res.id);"
      ),
    ],
  }),

  req({
    name: '[1/5] Create Product',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/products', host: ['{{baseUrl}}'], path: ['products'] },
    body: jsonBody({
      name: 'Classic Hoodie',
      description: 'Heavyweight 400gsm cotton blend',
      price: 59.99,
      category: 'Apparel',
      storeId: '{{storeId}}',
    }),
    events: [
      test(
        'const res = pm.response.json();',
        "pm.environment.set('productId', res.id);",
        "console.log('[Flow 1] productId =', res.id);"
      ),
    ],
  }),

  req({
    name: '[1/6] Save Variants (SKU matrix)',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/products/save-variants', host: ['{{baseUrl}}'], path: ['products', 'save-variants'] },
    body: jsonBody({
      productId: '{{productId}}',
      sizes: ['S', 'M', 'L', 'XL'],
      colors: ['Black', 'Grey'],
      materials: ['Cotton'],
    }),
    events: [
      test(
        'const res = pm.response.json();',
        "const v = res.variants || [];",
        "if (v[0]?.id) pm.environment.set('variantId',  v[0].id);",
        "if (v[1]?.id) pm.environment.set('variantId2', v[1].id);",
        "console.log('[Flow 1] variantId =', v[0]?.id, '— total:', v.length);"
      ),
    ],
  }),

  req({
    name: '[1/7] Stock Up (add 200 units)',
    method: 'POST',
    rawUrl: {
      raw: '{{baseUrl}}/inventory/{{variantId}}/increase',
      host: ['{{baseUrl}}'],
      path: ['inventory', '{{variantId}}', 'increase'],
    },
    body: jsonBody({ quantity: 200 }),
    events: [
      test(
        "pm.test('Stock increased', () => pm.response.to.have.status(200));",
        "console.log('[Flow 1] Inventory loaded');"
      ),
    ],
  }),
]);

const e2eFlow2 = folder('⚡ [Flow 2] Customer Shopping (register → checkout)', `Customer end-to-end flow.

Run Flow 1 first to set up tenantId, storeId, and variantId.
These requests simulate a real customer session.`, [

  req({
    name: '[2/1] Register as Customer',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/auth/register', host: ['{{baseUrl}}'], path: ['auth', 'register'] },
    body: jsonBody({ email: '{{customerEmail}}', password: '{{customerPassword}}', role: 'CUSTOMER' }),
    auth: noAuth,
    events: [
      test(
        'const res = pm.response.json();',
        "if (res.user?.id) pm.environment.set('userId', res.user.id);",
        "console.log('[Flow 2] Registered. Check email for verification token.');"
      ),
    ],
  }),

  req({
    name: '[2/2] Login as Customer',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/auth/login', host: ['{{baseUrl}}'], path: ['auth', 'login'] },
    body: jsonBody({ email: '{{customerEmail}}', password: '{{customerPassword}}' }),
    auth: noAuth,
    description: 'If REQUIRE_EMAIL_VERIFICATION=true, verify email first using the token from the inbox.',
    events: [
      test(
        'const res = pm.response.json();',
        "pm.environment.set('accessToken',  res.accessToken);",
        "pm.environment.set('refreshToken', res.refreshToken);",
        "console.log('[Flow 2] Customer logged in');"
      ),
    ],
  }),

  req({
    name: '[2/3] Browse Products',
    method: 'GET',
    rawUrl: {
      raw: '{{baseUrl}}/products?storeId={{storeId}}&page=1&limit=20',
      host: ['{{baseUrl}}'],
      path: ['products'],
      query: [
        { key: 'storeId', value: '{{storeId}}' },
        { key: 'page',    value: '1' },
        { key: 'limit',   value: '20' },
      ],
    },
    events: [statusTest(200)],
  }),

  req({
    name: '[2/4] Add Item to Cart',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/cart/items', host: ['{{baseUrl}}'], path: ['cart', 'items'] },
    body: jsonBody({ storeId: '{{storeId}}', variantId: '{{variantId}}', quantity: 2 }),
    events: [statusTest(201)],
  }),

  req({
    name: '[2/5] View Cart',
    method: 'GET',
    rawUrl: {
      raw: '{{baseUrl}}/cart?storeId={{storeId}}',
      host: ['{{baseUrl}}'],
      path: ['cart'],
      query: [{ key: 'storeId', value: '{{storeId}}' }],
    },
    events: [
      test(
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Subtotal > 0', () => pm.expect(pm.response.json().subtotal).to.be.above(0));"
      ),
    ],
  }),

  req({
    name: '[2/6] Checkout',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/cart/checkout', host: ['{{baseUrl}}'], path: ['cart', 'checkout'] },
    body: jsonBody({ storeId: '{{storeId}}', notes: 'Leave at door' }),
    events: [
      test(
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        'const res = pm.response.json();',
        "pm.environment.set('orderId', res.id);",
        "pm.test('Order PENDING', () => pm.expect(res.status).to.eql('PENDING'));",
        "console.log('[Flow 2] Order created:', res.orderNumber);"
      ),
    ],
  }),

  req({
    name: '[2/7] View My Order',
    method: 'GET',
    rawUrl: {
      raw: '{{baseUrl}}/orders/{{orderId}}',
      host: ['{{baseUrl}}'],
      path: ['orders', '{{orderId}}'],
    },
    events: [statusTest(200)],
  }),

  req({
    name: '[2/8] Cancel Order',
    method: 'POST',
    rawUrl: {
      raw: '{{baseUrl}}/orders/{{orderId}}/cancel',
      host: ['{{baseUrl}}'],
      path: ['orders', '{{orderId}}', 'cancel'],
    },
    description: 'Customer can cancel their own PENDING orders. Stock is released.',
    events: [
      test(
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "console.log('[Flow 2] Order cancelled, stock released');"
      ),
    ],
  }),
]);

const e2eFlow3 = folder('⚡ [Flow 3] Order Fulfillment (merchant view)', `Merchant processes a customer order through all states.

Run Flow 1 and Flow 2 first. Order must exist in PENDING status.
Login as MERCHANT_OWNER before running these steps.`, [

  req({
    name: '[3/1] Login as MERCHANT_OWNER',
    method: 'POST',
    rawUrl: { raw: '{{baseUrl}}/auth/login', host: ['{{baseUrl}}'], path: ['auth', 'login'] },
    body: jsonBody({ email: '{{merchantEmail}}', password: '{{merchantPassword}}' }),
    auth: noAuth,
    events: [
      test(
        'const res = pm.response.json();',
        "pm.environment.set('accessToken',  res.accessToken);",
        "pm.environment.set('refreshToken', res.refreshToken);",
        "console.log('[Flow 3] Logged in as MERCHANT_OWNER');"
      ),
    ],
  }),

  req({
    name: '[3/2] List Pending Orders',
    method: 'GET',
    rawUrl: {
      raw: '{{baseUrl}}/orders?status=PENDING&page=1&limit=20',
      host: ['{{baseUrl}}'],
      path: ['orders'],
      query: [
        { key: 'status', value: 'PENDING' },
        { key: 'page',   value: '1' },
        { key: 'limit',  value: '20' },
      ],
    },
    events: [
      test(
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "const orders = pm.response.json().orders || [];",
        "if (orders[0]?.id) pm.environment.set('orderId', orders[0].id);",
        "console.log('[Flow 3] Found', orders.length, 'pending orders');"
      ),
    ],
  }),

  req({
    name: '[3/3] Mark as PAID (deducts stock)',
    method: 'PATCH',
    rawUrl: {
      raw: '{{baseUrl}}/orders/{{orderId}}/status',
      host: ['{{baseUrl}}'],
      path: ['orders', '{{orderId}}', 'status'],
    },
    body: jsonBody({ status: 'PAID' }),
    events: [
      test(
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "console.log('[Flow 3] Order marked PAID — stock deducted');"
      ),
    ],
  }),

  req({
    name: '[3/4] Mark as PACKED',
    method: 'PATCH',
    rawUrl: {
      raw: '{{baseUrl}}/orders/{{orderId}}/status',
      host: ['{{baseUrl}}'],
      path: ['orders', '{{orderId}}', 'status'],
    },
    body: jsonBody({ status: 'PACKED' }),
    events: [statusTest(200)],
  }),

  req({
    name: '[3/5] Mark as SHIPPED',
    method: 'PATCH',
    rawUrl: {
      raw: '{{baseUrl}}/orders/{{orderId}}/status',
      host: ['{{baseUrl}}'],
      path: ['orders', '{{orderId}}', 'status'],
    },
    body: jsonBody({ status: 'SHIPPED' }),
    events: [statusTest(200)],
  }),

  req({
    name: '[3/6] Mark as DELIVERED',
    method: 'PATCH',
    rawUrl: {
      raw: '{{baseUrl}}/orders/{{orderId}}/status',
      host: ['{{baseUrl}}'],
      path: ['orders', '{{orderId}}', 'status'],
    },
    body: jsonBody({ status: 'DELIVERED' }),
    events: [
      test(
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Status DELIVERED', () => pm.expect(pm.response.json().status).to.eql('DELIVERED'));",
        "console.log('[Flow 3] Order fully fulfilled!');"
      ),
    ],
  }),

  req({
    name: '[3/7] Check Inventory After Fulfillment',
    method: 'GET',
    rawUrl: {
      raw: '{{baseUrl}}/inventory/{{variantId}}/status',
      host: ['{{baseUrl}}'],
      path: ['inventory', '{{variantId}}', 'status'],
    },
    events: [
      test(
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "const inv = pm.response.json();",
        "console.log('[Flow 3] Stock remaining:', inv.availableStock, '/', inv.stock);"
      ),
    ],
  }),
]);

const e2eFlowsFolder = folder('🔄 End-to-End Flows', `Complete business scenario walkthroughs.

Run in order:
  Flow 1 → Platform Setup (SUPER_ADMIN)
  Flow 2 → Customer Shopping
  Flow 3 → Order Fulfillment (Merchant)

All flows auto-save environment variables as they progress.`, [
  e2eFlow1,
  e2eFlow2,
  e2eFlow3,
]);

// ─── collection root ───────────────────────────────────────────────────────────

const collection = {
  info: {
    _postman_id: 'shopbuilder-collection-v2',
    name: 'ShopBuilder API',
    description: `## ShopBuilder — Enterprise Multi-Tenant E-Commerce API

**Version:** 2.0.0
**Base URL:** {{baseUrl}} (default: http://localhost:3000)
**Docs:** http://localhost:3000/docs

---

### Quick Start

1. Import this collection and the **ShopBuilder — Local** environment
2. Select **ShopBuilder — Local** as the active environment
3. Run **🔄 End-to-End Flows → Flow 1** to bootstrap the platform
4. Then run **Flow 2** for the customer shopping flow

---

### Authentication

All endpoints (except Health, Register, Login, Forgot/Reset Password, Verify Email) require a Bearer token.

The **Login** requests automatically save \`accessToken\` and \`refreshToken\` to the environment.

Token lifetimes:
- Access token: **15 minutes**
- Refresh token: **7 days** (revocable)

---

### Roles

| Role | Description |
|---|---|
| SUPER_ADMIN | Full platform access |
| PLATFORM_ADMIN | Manages merchants and platform config |
| MERCHANT_OWNER | Manages own stores, products, orders |
| STORE_MANAGER | Manages inventory and orders |
| CUSTOMER | Places and views own orders |`,
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: bearerAuth,
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3000', type: 'string' },
  ],
  item: [
    healthFolder,
    authFolder,
    cartFolder,
    productsFolder,
    inventoryFolder,
    ordersFolder,
    merchantsFolder,
    storesFolder,
    adminFolder,
    e2eFlowsFolder,
  ],
};

// ─── output ───────────────────────────────────────────────────────────────────

const outDir = path.resolve(__dirname, '../postman');
fs.mkdirSync(outDir, { recursive: true });

const collectionPath = path.join(outDir, 'ShopBuilder.postman_collection.json');
const envPath = path.join(outDir, 'ShopBuilder.postman_environment.json');

fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2));
fs.writeFileSync(envPath, JSON.stringify(environment, null, 2));

const countRequests = (items) =>
  items.reduce((sum, item) => sum + (item.item ? countRequests(item.item) : 1), 0);

console.log(`✓ Collection written:   ${collectionPath}`);
console.log(`✓ Environment written:  ${envPath}`);
console.log(`  Folders:  ${collection.item.length}`);
console.log(`  Requests: ${countRequests(collection.item)}`);
console.log(`  Env vars: ${environment.values.length}`);
