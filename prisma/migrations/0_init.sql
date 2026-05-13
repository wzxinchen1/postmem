-- Create pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create HNSW index for vector similarity search
CREATE INDEX IF NOT EXISTS memories_embedding_idx ON memories 
USING hnsw (embedding vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);
