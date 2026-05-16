-- 启用 PGRoonga 扩展（全文检索，TokenBigram 分词器原生支持中日韩文本）
CREATE EXTENSION IF NOT EXISTS "pgroonga";

-- 创建 PGRoonga 全文索引（Sparse 路：content &@ query 依赖此索引）
CREATE INDEX IF NOT EXISTS "memories_content_pgroonga_idx" ON "memories" USING PGroonga ("content");

-- 给 embedding 列添加维度声明（HNSW 索引必需）
ALTER TABLE "memories" ALTER COLUMN "embedding" TYPE vector(1024);

-- 创建 HNSW 向量索引（Dense 路：embedding <=> 向量 余弦距离检索）
CREATE INDEX IF NOT EXISTS "memories_embedding_hnsw_idx" ON "memories" USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64);
