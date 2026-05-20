/*
  Warnings:

  - You are about to drop the column `kb_id` on the `conversations` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_kb_id_fkey";

-- DropIndex
DROP INDEX "conversations_kb_id_idx";

-- AlterTable
ALTER TABLE "chat_settings" ADD COLUMN     "max_output_tokens" INTEGER;

-- AlterTable
ALTER TABLE "conversations" DROP COLUMN "kb_id";
