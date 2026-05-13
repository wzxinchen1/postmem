-- Create pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "memories" (
    "id" SERIAL NOT NULL,
    "kb_name" VARCHAR(100) NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1024),
    "chunk_index" INTEGER NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "memories_kb_name_idx" ON "memories"("kb_name");

-- CreateIndex
CREATE INDEX "memories_created_at_idx" ON "memories"("created_at");

-- Create HNSW index for vector similarity search
CREATE INDEX "memories_embedding_idx" ON "memories" 
USING hnsw (embedding vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);
