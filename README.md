# ShopBuilder — Enterprise Multi-Tenant E-Commerce Backend

A production-grade RESTful backend API for multi-tenant e-commerce shop management. Built with Node.js, Express, PostgreSQL (via Prisma), Redis, and BullMQ.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         HTTP Clients                             │
└─────────────────────────────┬────────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────────┐
│                     Express API Server                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │  Routes  │→ │Middleware│→ │  Controllers │→ │  Services   │  │
│  └──────────┘  └──────────┘  └──────────────┘  └──────┬──────┘  │
│                 JWT Auth                                │         │
│                 RBAC                                    │         │
│                 Rate Limiting                           │         │
└─────────────────────────────────────────────────────────┼────────┘
                              ┌──────────────────────────▼────────┐
                              │           Prisma ORM              │
                              └──────────────────────────┬────────┘
         ┌────────────────────┴─────────────────────┐
         ▼                                          ▼
┌──────────────────┐                    ┌────────────────────┐
│   PostgreSQL 15  │                    │      Redis 7       │
│   (Primary DB)   │                    │  Rate Limiter +    │
└──────────────────┘                    │  BullMQ Queues     │
                                        └────────┬───────────┘
                                                 ▼
                                        ┌─────────────────┐
                                        │  Email Worker   │
                                        │  (BullMQ)       │
                                        │  → Nodemailer   │
                                        └─────────────────┘
```

### Key Design Patterns

- **Multi-Tenancy** — All business data is scoped to a `tenantId`. Non-admin users are locked to their JWT tenant. Admins can query across tenants.
- **RBAC** — 5 roles: `SUPER_ADMIN`, `PLATFORM_ADMIN`, `MERCHANT_OWNER`, `STORE_MANAGER`, `CUSTOMER`.
- **Inventory Reservation** — Two-stage stock model: `stock` (physical), `reservedStock` (held for pending orders), `available = stock - reserved`.
- **Order State Machine** — `PENDING → PAID → PACKED → SHIPPED → DELIVERED`, with `CANCELLED` and `REFUNDED` as valid exits.
- **Async Email** — All email is queued via BullMQ (Redis-backed) with 3 retries and exponential backoff.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 |
| Framework | Express 4 |
| Database | PostgreSQL 15 |
| ORM | Prisma 5 |
| Cache / Queue | Redis 7 |
| Job Queue | BullMQ 5 |
| Email | Nodemailer (SMTP — Mailtrap / SendGrid / SES) |
| Auth | JWT (access + refresh tokens) |
| Testing | Jest + Supertest |
| Docs | OpenAPI 3.0 / Swagger UI |
| Containers | Docker + Docker Compose |

---

## Setup & Running

### Option 1 — Docker (recommended)

```bash
# Clone the repo
git clone <repo-url>
cd shopbuilder

# Copy and configure environment
cp .env.example .env
# Edit .env — at minimum set EMAIL_* variables for email sending

# Start everything (postgres, redis, api + email worker)
docker compose up
```

The API is available at: `http://localhost:3000`  
Swagger UI: `http://localhost:3000/docs`

### Option 2 — Local Development

**Prerequisites:** Node.js 20+, PostgreSQL 15, Redis 7

```bash
npm install
cp .env.example .env
# Edit .env with your local connection strings

# Run database migrations
npm run db:migrate

# Generate Prisma client
npm run db:generate

# Start dev server (hot-reload)
npm run dev
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | JWT signing secret (min 32 chars) |
| `REDIS_HOST` | ✅ | Redis hostname |
| `REDIS_PORT` | ✅ | Redis port (default 6379) |
| `PORT` | — | HTTP port (default 3000) |
| `ALLOWED_ORIGINS` | — | Comma-separated CORS origins |
| `NODE_ENV` | — | `development` / `production` / `test` |
| `EMAIL_HOST` | — | SMTP host (e.g. `smtp.mailtrap.io`) |
| `EMAIL_PORT` | — | SMTP port (e.g. `587`) |
| `EMAIL_USER` | — | SMTP username |
| `EMAIL_PASS` | — | SMTP password |
| `EMAIL_FROM` | — | Sender address |
| `FRONTEND_URL` | — | Base URL for email links (default `http://localhost:5173`) |
| `REQUIRE_EMAIL_VERIFICATION` | — | `true` to enforce email verification before login |

---

## API Overview

### Authentication (`/auth`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | No | Register — sends verification email |
| POST | `/auth/verify-email` | No | Verify email from token in email |
| POST | `/auth/login` | No | Login — returns access + refresh tokens |
| POST | `/auth/refresh` | No | Exchange refresh token for new access token |
| POST | `/auth/logout` | Yes | Revoke refresh token |
| GET | `/auth/me` | Yes | Get current user from JWT |
| POST | `/auth/forgot-password` | No | Request password reset email |
| POST | `/auth/reset-password` | No | Reset password via email token |
| PATCH | `/auth/password` | Yes | Change password (revokes all sessions) |

### Cart & Checkout (`/cart`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/cart?storeId=` | Yes | Get cart for a store |
| POST | `/cart/items` | Yes | Add item to cart |
| PATCH | `/cart/items/:variantId` | Yes | Update item quantity |
| DELETE | `/cart/items/:variantId?storeId=` | Yes | Remove item from cart |
| DELETE | `/cart?storeId=` | Yes | Clear entire cart |
| POST | `/cart/checkout` | Yes | Convert cart to order + queue confirmation email |

### Products (`/products`)

| Method | Endpoint | RBAC | Description |
|---|---|---|---|
| GET | `/products` | Auth | List products (paginated, filterable) |
| GET | `/products/:id` | Auth | Get product with variants |
| POST | `/products` | MERCHANT_OWNER+ | Create product |
| PATCH | `/products/:id` | MERCHANT_OWNER+ | Update product |
| DELETE | `/products/:id` | MERCHANT_OWNER+ | Delete product |
| POST | `/products/generate-variants` | Auth | Preview SKU matrix |
| POST | `/products/save-variants` | MERCHANT_OWNER+ | Persist variants |
| PATCH | `/products/variants/:variantId/stock` | MERCHANT_OWNER+ | Update stock delta |

### Orders (`/orders`)

| Method | Endpoint | RBAC | Description |
|---|---|---|---|
| POST | `/orders` | Auth | Create order directly (reserves stock) |
| GET | `/orders` | Auth | List orders (customer-scoped) |
| GET | `/orders/:id` | Auth | Get order detail |
| PATCH | `/orders/:id/status` | MERCHANT_OWNER+ | Advance order status |
| POST | `/orders/:id/cancel` | Auth | Cancel order (releases stock) |

### Admin (`/admin`)

| Method | Endpoint | RBAC | Description |
|---|---|---|---|
| GET | `/admin/stats` | ADMIN | Platform-wide statistics |
| GET | `/admin/users` | ADMIN | List all users |
| PATCH | `/admin/users/:id/role` | SUPER_ADMIN | Change user role/tenant |
| DELETE | `/admin/users/:id` | SUPER_ADMIN | Delete user |
| GET | `/admin/tenants` | ADMIN | List tenants |
| POST | `/admin/tenants` | ADMIN | Create tenant |

---

## Testing

```bash
# Run all tests
npm test
```

Tests use Jest with mocked Prisma and a real Express app via Supertest. No live database or Redis required.

| Test File | Coverage |
|---|---|
| `tests/auth.test.js` | Protected routes, JWT validation |
| `tests/auth-email.test.js` | Email verification, password reset flows |
| `tests/rbac.test.js` | All 5 roles, 403/401 scenarios |
| `tests/cart.test.js` | Cart CRUD, checkout, stock validation |
| `tests/order.test.js` | Order lifecycle, state machine (12 transitions) |
| `tests/inventory.test.js` | Stock operations (increase/decrease/reserve/release/transfer) |
| `tests/sku.test.js` | Cartesian product SKU generation |

---

## Database Migrations

Migrations are in `prisma/migrations/`. Apply with:

```bash
npm run db:migrate
# or: npx prisma migrate deploy
```

| Migration | Description |
|---|---|
| `20240101000000_init` | Baseline schema (User, Tenant, Product, Variant, RefreshToken) |
| `20240101000001_expand_schema` | RBAC enum migration, Merchant, Store, Order, OrderItem |
| `20240101000002_add_email_cart` | Email verification fields on User, Cart, CartItem |

---

## API Documentation

Interactive Swagger UI: `http://localhost:3000/docs`

Export the spec to YAML:

```bash
npm run export:openapi
# outputs: openapi.yaml
```

---

## Email System

Emails are sent **asynchronously** via BullMQ (Redis queue) → Nodemailer worker.

- **Verification email** — sent on registration; token expires in 24h
- **Password reset email** — sent on `/auth/forgot-password`; token expires in 1h
- **Order confirmation** — sent when an order is created or checked out

Configure any SMTP provider (Mailtrap, SendGrid, SES) via `EMAIL_*` env vars.

The BullMQ worker starts automatically with the API server. Jobs are retried up to 3 times with exponential backoff.

---

## Project Structure

```
shopbuilder/
├── prisma/
│   ├── schema.prisma          # ORM schema & models
│   └── migrations/            # SQL migration files
├── src/
│   ├── app.js                 # Express app (middleware, routes)
│   ├── server.js              # Entry point — starts server + workers
│   ├── config/
│   │   ├── database.js        # Prisma client singleton
│   │   ├── email.js           # Nodemailer transporter factory
│   │   ├── redis.js           # ioredis client
│   │   └── swagger.js         # OpenAPI spec (swagger-jsdoc)
│   ├── controllers/           # HTTP request handlers
│   ├── services/              # Business logic layer
│   ├── routes/                # Express routers with Swagger JSDoc
│   ├── middleware/
│   │   ├── auth.middleware.js      # JWT verification
│   │   ├── rbac.middleware.js      # Role-based authorization
│   │   └── rateLimiter.middleware.js  # Redis-backed rate limiting
│   ├── queues/
│   │   └── email.queue.js     # BullMQ email queue
│   ├── workers/
│   │   ├── email.worker.js    # Email job processor
│   │   └── index.js           # Worker startup
│   └── utils/
│       ├── env.js             # Environment variable validation
│       └── rbac.js            # RBAC constants and helpers
├── scripts/
│   └── export-openapi.js      # Generates openapi.yaml
├── tests/                     # Jest unit tests
├── openapi.yaml               # Exported OpenAPI 3.0 spec
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── package.json
```
