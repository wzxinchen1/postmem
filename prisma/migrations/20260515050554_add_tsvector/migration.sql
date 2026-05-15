/*
  Warnings:

  - Added the required column `ingest_batch` to the `memories` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "memories" ADD COLUMN     "contentTsvector" tsvector,
ADD COLUMN     "ingest_batch" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "memories_ingest_batch_idx" ON "memories"("ingest_batch");

-- 创建 GIN 索引加速全文检索
CREATE INDEX "memories_content_tsvector_idx" ON "memories" USING GIN ("contentTsvector");
