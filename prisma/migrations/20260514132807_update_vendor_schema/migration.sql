/*
  Warnings:

  - You are about to drop the column `type` on the `providers` table. All the data in the column will be lost.
  - Added the required column `vendor_id` to the `providers` table without a default value. This is not possible if the table is not empty.
  - Made the column `base_url` on table `providers` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "providers_type_idx";

-- AlterTable
ALTER TABLE "providers" DROP COLUMN "type",
ADD COLUMN     "vendor_id" INTEGER NOT NULL,
ALTER COLUMN "base_url" SET NOT NULL;

-- CreateTable
CREATE TABLE "vendors" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "chat_model_class" VARCHAR(100),
    "factory_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendors_name_key" ON "vendors"("name");

-- CreateIndex
CREATE INDEX "vendors_is_active_idx" ON "vendors"("is_active");

-- CreateIndex
CREATE INDEX "providers_vendor_id_idx" ON "providers"("vendor_id");

-- AddForeignKey
ALTER TABLE "providers" ADD CONSTRAINT "providers_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
