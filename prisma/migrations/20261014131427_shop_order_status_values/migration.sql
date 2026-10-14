-- AlterEnum
-- New enum values must be committed before they can be used in the same
-- migration run — kept as its own migration, applied before the one that
-- actually uses PENDING_PAYMENT as the column default.
ALTER TYPE "ShopOrderStatus" ADD VALUE 'PENDING_PAYMENT';
ALTER TYPE "ShopOrderStatus" ADD VALUE 'PAYMENT_FAILED';
