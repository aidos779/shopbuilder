-- ============================================================
-- Migration: expand_schema
--
-- Safely handles any partial state left by a previously-failed
-- `prisma db push` attempt:
--   • "Role_new" may be a dangling orphan type in the DB
--   • MerchantStatus / OrderStatus may already exist
--   • New tables / columns may already be present
--
-- ADMIN  → SUPER_ADMIN
-- USER   → CUSTOMER
-- ============================================================


-- ----------------------------------------------------------------
-- 1. Clean up dangling "Role_new" created by the failed db push.
-- ----------------------------------------------------------------
DROP TYPE IF EXISTS "Role_new";


-- ----------------------------------------------------------------
-- 2. Create new enum types (idempotent).
-- ----------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE "MerchantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "OrderStatus" AS ENUM (
        'PENDING', 'PAID', 'PACKED', 'SHIPPED',
        'DELIVERED', 'CANCELLED', 'REFUNDED'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ----------------------------------------------------------------
-- 3. Migrate the Role enum: ADMIN → SUPER_ADMIN, USER → CUSTOMER.
--
--    The entire block is conditional so it is a no-op if the old
--    values are already gone (safe for re-runs / container restarts).
--
--    EXECUTE is used for statements that reference "Role_new" or the
--    renamed "Role" type.  PL/pgSQL lazily parses DDL, but EXECUTE
--    forces runtime compilation so the cast is resolved AFTER the
--    CREATE TYPE has committed — removing any ambiguity.
-- ----------------------------------------------------------------
DO $$ BEGIN
    IF EXISTS (
        SELECT 1
        FROM   pg_enum  e
        JOIN   pg_type  t ON e.enumtypid = t.oid
        WHERE  t.typname = 'Role'
          AND  e.enumlabel IN ('ADMIN', 'USER')
    ) THEN
        -- 3a. New enum with only the target values.
        CREATE TYPE "Role_new" AS ENUM (
            'SUPER_ADMIN', 'PLATFORM_ADMIN',
            'MERCHANT_OWNER', 'STORE_MANAGER', 'CUSTOMER'
        );

        -- 3b. Drop the default so the column type can be changed.
        ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

        -- 3c. Re-type the column with a CASE-based data migration.
        --     EXECUTE ensures "Role_new" is resolved at runtime,
        --     not at block-parse time.
        EXECUTE $sql$
            ALTER TABLE "User"
              ALTER COLUMN "role" TYPE "Role_new"
              USING (
                CASE "role"::text
                  WHEN 'ADMIN' THEN 'SUPER_ADMIN'::"Role_new"
                  WHEN 'USER'  THEN 'CUSTOMER'::"Role_new"
                  ELSE              'CUSTOMER'::"Role_new"
                END
              )
        $sql$;

        -- 3d. Replace the old type with the new one.
        DROP TYPE "Role";
        ALTER TYPE "Role_new" RENAME TO "Role";

        -- 3e. Restore the column default using the renamed type.
        EXECUTE $sql$
            ALTER TABLE "User"
              ALTER COLUMN "role" SET DEFAULT 'CUSTOMER'::"Role"
        $sql$;
    END IF;
END $$;


-- ----------------------------------------------------------------
-- 4. Tenant: add slug (required by new schema).
--    Backfill existing rows so NOT NULL constraint can be set.
-- ----------------------------------------------------------------
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "slug" TEXT;

-- Backfill: use the row's own id as a unique slug placeholder.
UPDATE "Tenant" SET "slug" = "id" WHERE "slug" IS NULL;

ALTER TABLE "Tenant" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_slug_key" ON "Tenant"("slug");


-- ----------------------------------------------------------------
-- 5. Product: new columns (all nullable or have defaults).
-- ----------------------------------------------------------------
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "price"       DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "category"    TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "storeId"     TEXT;


-- ----------------------------------------------------------------
-- 6. Variant: new columns + upgrade FK to CASCADE DELETE.
-- ----------------------------------------------------------------
ALTER TABLE "Variant" ADD COLUMN IF NOT EXISTS "barcode"       TEXT;
ALTER TABLE "Variant" ADD COLUMN IF NOT EXISTS "price"         DOUBLE PRECISION;
ALTER TABLE "Variant" ADD COLUMN IF NOT EXISTS "reservedStock" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "Variant_barcode_key" ON "Variant"("barcode");

-- Drop the old FK (no CASCADE) and recreate with ON DELETE CASCADE.
ALTER TABLE "Variant" DROP CONSTRAINT IF EXISTS "Variant_productId_fkey";

DO $$ BEGIN
    ALTER TABLE "Variant" ADD CONSTRAINT "Variant_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ----------------------------------------------------------------
-- 7. Merchant table + FK.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Merchant" (
    "id"        TEXT             NOT NULL,
    "name"      TEXT             NOT NULL,
    "email"     TEXT             NOT NULL,
    "phone"     TEXT,
    "address"   TEXT,
    "status"    "MerchantStatus" NOT NULL DEFAULT 'ACTIVE',
    "tenantId"  TEXT             NOT NULL,
    "createdAt" TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Merchant_email_key" ON "Merchant"("email");

DO $$ BEGIN
    ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ----------------------------------------------------------------
-- 8. Store table + FKs.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Store" (
    "id"          TEXT         NOT NULL,
    "name"        TEXT         NOT NULL,
    "description" TEXT,
    "merchantId"  TEXT         NOT NULL,
    "tenantId"    TEXT         NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "Store" ADD CONSTRAINT "Store_merchantId_fkey"
        FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "Store" ADD CONSTRAINT "Store_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ----------------------------------------------------------------
-- 9. Product → Store FK (Store must exist before this).
-- ----------------------------------------------------------------
DO $$ BEGIN
    ALTER TABLE "Product" ADD CONSTRAINT "Product_storeId_fkey"
        FOREIGN KEY ("storeId") REFERENCES "Store"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ----------------------------------------------------------------
-- 10. Order table + FKs.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Order" (
    "id"          TEXT             NOT NULL,
    "orderNumber" TEXT             NOT NULL,
    "status"      "OrderStatus"    NOT NULL DEFAULT 'PENDING',
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "notes"       TEXT,
    "tenantId"    TEXT             NOT NULL,
    "storeId"     TEXT             NOT NULL,
    "userId"      TEXT             NOT NULL,
    "createdAt"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Order_orderNumber_key" ON "Order"("orderNumber");

DO $$ BEGIN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_storeId_fkey"
        FOREIGN KEY ("storeId") REFERENCES "Store"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ----------------------------------------------------------------
-- 11. OrderItem table + FKs.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "OrderItem" (
    "id"        TEXT             NOT NULL,
    "orderId"   TEXT             NOT NULL,
    "variantId" TEXT             NOT NULL,
    "quantity"  INTEGER          NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey"
        FOREIGN KEY ("orderId") REFERENCES "Order"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey"
        FOREIGN KEY ("variantId") REFERENCES "Variant"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
