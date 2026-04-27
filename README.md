# ShopBuilder Backend

A RESTful backend API for e-commerce shop management, featuring JWT authentication, product variant generation, and a fully containerized development environment.

---

## Tech Stack

- **Runtime**: Node.js with Express
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Cache / Token Store**: Redis
- **Containerization**: Docker & Docker Compose
- **Testing**: Jest

---

## Features

### Authentication

- JWT-based auth with short-lived access tokens and revocable refresh tokens
- Refresh tokens are persisted in the database and can be invalidated on logout
- Protected routes enforced via middleware

### Product Variant Generation

- Cartesian product engine generates all SKU combinations from attribute axes (size, color, material)
- Each generated variant receives a unique SKU and its own inventory record

---

## Getting Started

### Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose installed

### Run

```bash
docker compose up
```

No additional setup is required. The database, cache, and API server start automatically.

The API is available at: `http://localhost:3000`

---

## API Overview

### Authentication

| Method | Endpoint        | Description                          | Auth Required |
|--------|-----------------|--------------------------------------|---------------|
| POST   | /auth/register  | Register a new user                  | No            |
| POST   | /auth/login     | Log in, returns access + refresh tokens | No         |
| POST   | /auth/refresh   | Exchange refresh token for new access token | No     |
| POST   | /auth/logout    | Revoke refresh token                 | Yes           |
| GET    | /auth/me        | Get current authenticated user      | Yes           |

### Products

| Method | Endpoint                   | Description                                      | Auth Required |
|--------|----------------------------|--------------------------------------------------|---------------|
| POST   | /products/generate-variants | Generate SKU variants from size/color/material  | Yes           |

### Interactive Docs

Swagger UI is available at: `http://localhost:3000/docs`

---

## Testing

Tests are written with [Jest](https://jestjs.io/).

```bash
npm test
```

---

## Project Structure

```
.
├── prisma/             # Prisma schema and migrations
├── src/
│   ├── auth/           # Authentication routes and logic
│   ├── products/       # Product and variant logic
│   ├── middleware/     # JWT verification and error handling
│   └── app.ts          # Express app entry point
├── docker-compose.yml
└── package.json
```

---

## License

MIT
