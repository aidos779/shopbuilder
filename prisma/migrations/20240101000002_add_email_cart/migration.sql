-- ============================================================
-- Migration: add_email_cart
--
-- Adds email verification and password reset to User.
-- Adds Cart and CartItem tables for the checkout flow.
-- All blocks are idempotent (safe to re-run).
-- ============================================================


-- ----------------------------------------------------------------
-- 1. User: email verification fields
-- ----------------------------------------------------------------
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified"           BOOLEAN      NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerificationToken"  TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerificationExpiry" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetToken"      TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetExpiry"     TIMESTAMP(3);

-- Mark all pre-existing users as verified so they are not locked out.
UPDATE "User" SET "emailVerified" = true WHERE "emailVerified" = false;

-- Unique indexes for token lookup
CREATE UNIQUE INDEX IF NOT EXISTS "User_emailVerificationToken_key" ON "User"("emailVerificationToken");
CREATE UNIQUE INDEX IF NOT EXISTS "User_passwordResetToken_key"     ON "User"("passwordResetToken");


-- ----------------------------------------------------------------
-- 2. Cart table
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Cart" (
    "id"        TEXT         NOT NULL,
    "userId"    TEXT         NOT NULL,
    "storeId"   TEXT         NOT NULL,
    "tenantId"  TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Cart_userId_storeId_key" ON "Cart"("userId", "storeId");

DO $$ BEGIN
    ALTER TABLE "Cart" ADD CONSTRAINT "Cart_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "Cart" ADD CONSTRAINT "Cart_storeId_fkey"
        FOREIGN KEY ("storeId") REFERENCES "Store"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "Cart" ADD CONSTRAINT "Cart_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ----------------------------------------------------------------
-- 3. CartItem table
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CartItem" (
    "id"        TEXT         NOT NULL,
    "cartId"    TEXT         NOT NULL,
    "variantId" TEXT         NOT NULL,
    "quantity"  INTEGER      NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CartItem_cartId_variantId_key" ON "CartItem"("cartId", "variantId");

DO $$ BEGIN
    ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey"
        FOREIGN KEY ("cartId") REFERENCES "Cart"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_variantId_fkey"
        FOREIGN KEY ("variantId") REFERENCES "Variant"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
