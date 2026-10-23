-- AlterTable
ALTER TABLE "users" ADD COLUMN     "paid_until" TIMESTAMP(3),
ADD COLUMN     "tier" VARCHAR(12) NOT NULL DEFAULT 'free';
