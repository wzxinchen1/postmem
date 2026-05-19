/*
  Warnings:

  - You are about to drop the column `model_type` on the `models` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "models_model_type_idx";

-- AlterTable
ALTER TABLE "models" DROP COLUMN "model_type",
ADD COLUMN     "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[];
