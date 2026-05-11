-- Baseline migration: represents the schema that already exists in the database.
-- This migration is NOT executed against the DB — it is marked as applied via:
--   npx prisma migrate resolve --applied 20240101000000_init

CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

CREATE TABLE "Tenant" (
    "id"        TEXT         NOT NULL,
    "name"      TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
    "id"        TEXT         NOT NULL,
    "email"     TEXT         NOT NULL,
    "password"  TEXT         NOT NULL,
    "role"      "Role"       NOT NULL DEFAULT 'USER',
    "tenantId"  TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Product" (
    "id"        TEXT         NOT NULL,
    "name"      TEXT         NOT NULL,
    "tenantId"  TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Variant" (
    "id"        TEXT         NOT NULL,
    "sku"       TEXT         NOT NULL,
    "size"      TEXT,
    "color"     TEXT,
    "material"  TEXT,
    "stock"     INTEGER      NOT NULL DEFAULT 0,
    "productId" TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Variant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RefreshToken" (
    "id"        TEXT         NOT NULL,
    "token"     TEXT         NOT NULL,
    "userId"    TEXT         NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked"   BOOLEAN      NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key"         ON "User"("email");
CREATE UNIQUE INDEX "Variant_sku_key"        ON "Variant"("sku");
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

ALTER TABLE "User"         ADD CONSTRAINT "User_tenantId_fkey"
    FOREIGN KEY ("tenantId")  REFERENCES "Tenant"("id")  ON DELETE SET NULL  ON UPDATE CASCADE;
ALTER TABLE "Product"      ADD CONSTRAINT "Product_tenantId_fkey"
    FOREIGN KEY ("tenantId")  REFERENCES "Tenant"("id")  ON DELETE RESTRICT  ON UPDATE CASCADE;
ALTER TABLE "Variant"      ADD CONSTRAINT "Variant_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT  ON UPDATE CASCADE;
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey"
    FOREIGN KEY ("userId")    REFERENCES "User"("id")    ON DELETE CASCADE   ON UPDATE CASCADE;
