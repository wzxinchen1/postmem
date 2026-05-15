/*
  Warnings:

  - You are about to drop the column `chunk_index` on the `memories` table. All the data in the column will be lost.
  - You are about to drop the column `ingest_batch` on the `memories` table. All the data in the column will be lost.
  - Added the required column `title` to the `memories` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "memories_content_tsvector_idx";

-- DropIndex
DROP INDEX "memories_ingest_batch_idx";

-- AlterTable
ALTER TABLE "memories" DROP COLUMN "chunk_index",
DROP COLUMN "ingest_batch",
ADD COLUMN     "title" VARCHAR(200) NOT NULL,
ADD COLUMN     "topic_id" INTEGER;

-- CreateTable
CREATE TABLE "topics" (
    "id" SERIAL NOT NULL,
    "kb_id" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "topics_kb_id_idx" ON "topics"("kb_id");

-- CreateIndex
CREATE UNIQUE INDEX "topics_kb_id_name_key" ON "topics"("kb_id", "name");

-- CreateIndex
CREATE INDEX "memories_topic_id_idx" ON "memories"("topic_id");

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_kb_id_fkey" FOREIGN KEY ("kb_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
