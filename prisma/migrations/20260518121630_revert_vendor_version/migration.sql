/*
  Warnings:

  - You are about to drop the column `version` on the `vendors` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[name]` on the table `vendors` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "vendors_name_version_key";

-- AlterTable
ALTER TABLE "vendors" DROP COLUMN "version";

-- CreateIndex
CREATE UNIQUE INDEX "vendors_name_key" ON "vendors"("name");
