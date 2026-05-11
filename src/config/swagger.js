const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ShopBuilder API',
      version: '2.0.0',
      description: `
## ShopBuilder — Enterprise Multi-Tenant E-Commerce Platform

A scalable multi-tenant backend supporting multiple merchants, stores, and customers within isolated tenant namespaces.

### Role-Based Access Control (RBAC)

| Role | Description |
|------|-------------|
| \`SUPER_ADMIN\` | Full platform access — manages tenants, users, everything |
| \`PLATFORM_ADMIN\` | Manages merchants and platform configuration |
| \`MERCHANT_OWNER\` | Manages own stores, products, and orders |
| \`STORE_MANAGER\` | Manages inventory and orders for assigned store |
| \`CUSTOMER\` | Places and views own orders |

### Authentication
Include a Bearer token on all protected endpoints:
\`\`\`
Authorization: Bearer <access_token>
\`\`\`

Access tokens expire in **15 minutes**. Use \`POST /auth/refresh\` with your refresh token to get a new one.

### Multi-Tenancy
All business data is scoped to a \`tenantId\`. It is embedded in the JWT and automatically applied.
Admins can override \`tenantId\` via query parameter.
      `,
      contact: {
        name: 'ShopBuilder API Support',
        email: 'api@shopbuilder.io',
      },
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Local development' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT access token from POST /auth/login',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Resource not found' },
          },
        },
        PaginatedMeta: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
            pages: { type: 'integer' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            role: {
              type: 'string',
              enum: ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER', 'STORE_MANAGER', 'CUSTOMER'],
            },
            tenantId: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Tenant: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', example: 'Acme Commerce' },
            slug: { type: 'string', example: 'acme-commerce' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Merchant: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', example: 'Acme Retail Ltd' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string', nullable: true },
            address: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED', 'PENDING'] },
            tenantId: { type: 'string', format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Store: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', example: 'Downtown Flagship' },
            description: { type: 'string', nullable: true },
            merchantId: { type: 'string', format: 'uuid' },
            tenantId: { type: 'string', format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', example: 'Premium Cotton T-Shirt' },
            description: { type: 'string', nullable: true },
            price: { type: 'number', example: 29.99 },
            category: { type: 'string', nullable: true },
            storeId: { type: 'string', format: 'uuid', nullable: true },
            tenantId: { type: 'string', format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Variant: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            sku: { type: 'string', example: 'prod-uuid-S-Black-Cotton' },
            barcode: { type: 'string', nullable: true },
            size: { type: 'string', nullable: true },
            color: { type: 'string', nullable: true },
            material: { type: 'string', nullable: true },
            price: { type: 'number', nullable: true },
            stock: { type: 'integer', example: 100 },
            reservedStock: { type: 'integer', example: 15 },
            productId: { type: 'string', format: 'uuid' },
          },
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            orderNumber: { type: 'string', example: 'ORD-20240115-83421' },
            status: {
              type: 'string',
              enum: ['PENDING', 'PAID', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'],
            },
            totalAmount: { type: 'number', example: 59.98 },
            notes: { type: 'string', nullable: true },
            storeId: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            tenantId: { type: 'string', format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        OrderItem: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            variantId: { type: 'string', format: 'uuid' },
            quantity: { type: 'integer', example: 2 },
            unitPrice: { type: 'number', example: 29.99 },
          },
        },
        CartItem: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            cartId: { type: 'string', format: 'uuid' },
            variantId: { type: 'string', format: 'uuid' },
            quantity: { type: 'integer', example: 2 },
            variant: { $ref: '#/components/schemas/Variant' },
          },
        },
        Cart: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            storeId: { type: 'string', format: 'uuid' },
            tenantId: { type: 'string', format: 'uuid' },
            subtotal: { type: 'number', example: 89.97 },
            store: { $ref: '#/components/schemas/Store' },
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/CartItem' },
            },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
