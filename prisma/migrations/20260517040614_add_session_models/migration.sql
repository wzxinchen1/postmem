/*
  Warnings:

  - You are about to drop the column `error` on the `conversations` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `conversations` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "conversations_status_idx";

-- DropIndex
DROP INDEX "memories_content_pgroonga_idx";

-- DropIndex
DROP INDEX "memories_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "conversations" DROP COLUMN "error",
DROP COLUMN "status";

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "kb_id" TEXT,
    "model_type" VARCHAR(50) NOT NULL,
    "model_name" VARCHAR(100) NOT NULL,
    "provider" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'completed',
    "error" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessions_kb_id_idx" ON "sessions"("kb_id");

-- CreateIndex
CREATE INDEX "sessions_model_type_idx" ON "sessions"("model_type");

-- CreateIndex
CREATE INDEX "sessions_created_at_idx" ON "sessions"("created_at");

-- CreateIndex
CREATE INDEX "sessions_status_idx" ON "sessions"("status");

-- CreateIndex
CREATE INDEX "session_messages_session_id_idx" ON "session_messages"("session_id");

-- CreateIndex
CREATE INDEX "session_messages_created_at_idx" ON "session_messages"("created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_kb_id_fkey" FOREIGN KEY ("kb_id") REFERENCES "knowledge_bases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_messages" ADD CONSTRAINT "session_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
