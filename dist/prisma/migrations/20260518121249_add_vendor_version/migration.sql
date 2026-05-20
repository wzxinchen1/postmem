/*
  Warnings:

  - A unique constraint covering the columns `[name,version]` on the table `vendors` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "vendors_name_key";

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "version" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "vendors_name_version_key" ON "vendors"("name", "version");
