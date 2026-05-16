/*
  Warnings:

  - You are about to drop the column `contentTsvector` on the `memories` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "memories" DROP COLUMN "contentTsvector";
