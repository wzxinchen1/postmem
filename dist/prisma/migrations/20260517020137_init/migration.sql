
-- 启用 PGRoonga 扩展（全文检索，TokenBigram 分词器原生支持中日韩文本）
CREATE EXTENSION IF NOT EXISTS "pgroonga";

CREATE EXTENSION IF NOT EXISTS "vector";
-- CreateTable
CREATE TABLE "topics" (
    "id" TEXT NOT NULL,
    "kb_id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memories" (
    "id" TEXT NOT NULL,
    "kb_id" TEXT NOT NULL,
    "topic_id" TEXT,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1024),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "url" VARCHAR(255) NOT NULL,
    "chat_model_class" VARCHAR(100),
    "embedding_model_class" VARCHAR(100),
    "factory_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "api_key" TEXT,
    "base_url" VARCHAR(255) NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "vendor_id" TEXT NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "models" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(150),
    "model_type" VARCHAR(50) NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_bases" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "description" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "kb_id" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'completed',
    "error" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "memoried" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_pages" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "web_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_settings" (
    "id" TEXT NOT NULL,
    "memory_context_threshold" INTEGER NOT NULL DEFAULT 50,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "chat_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_options" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "provider_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "topics_kb_id_idx" ON "topics"("kb_id");

-- CreateIndex
CREATE UNIQUE INDEX "topics_kb_id_name_key" ON "topics"("kb_id", "name");

-- CreateIndex
CREATE INDEX "memories_kb_id_idx" ON "memories"("kb_id");

-- CreateIndex
CREATE INDEX "memories_created_at_idx" ON "memories"("created_at");

-- CreateIndex
CREATE INDEX "memories_topic_id_idx" ON "memories"("topic_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_name_key" ON "vendors"("name");

-- CreateIndex
CREATE INDEX "vendors_is_active_idx" ON "vendors"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "providers_name_key" ON "providers"("name");

-- CreateIndex
CREATE INDEX "providers_is_active_idx" ON "providers"("is_active");

-- CreateIndex
CREATE INDEX "providers_vendor_id_idx" ON "providers"("vendor_id");

-- CreateIndex
CREATE INDEX "models_model_type_idx" ON "models"("model_type");

-- CreateIndex
CREATE INDEX "models_is_active_idx" ON "models"("is_active");

-- CreateIndex
CREATE INDEX "models_is_default_idx" ON "models"("is_default");

-- CreateIndex
CREATE UNIQUE INDEX "models_provider_id_name_key" ON "models"("provider_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_bases_name_key" ON "knowledge_bases"("name");

-- CreateIndex
CREATE INDEX "knowledge_bases_name_idx" ON "knowledge_bases"("name");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE INDEX "conversations_kb_id_idx" ON "conversations"("kb_id");

-- CreateIndex
CREATE INDEX "conversations_created_at_idx" ON "conversations"("created_at");

-- CreateIndex
CREATE INDEX "conversations_status_idx" ON "conversations"("status");

-- CreateIndex
CREATE INDEX "chat_messages_conversation_id_idx" ON "chat_messages"("conversation_id");

-- CreateIndex
CREATE INDEX "chat_messages_created_at_idx" ON "chat_messages"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "web_pages_url_key" ON "web_pages"("url");

-- CreateIndex
CREATE UNIQUE INDEX "provider_options_name_key" ON "provider_options"("name");

-- CreateIndex
CREATE INDEX "provider_options_is_active_idx" ON "provider_options"("is_active");

-- CreateIndex
CREATE INDEX "provider_options_sort_order_idx" ON "provider_options"("sort_order");

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_kb_id_fkey" FOREIGN KEY ("kb_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_kb_id_fkey" FOREIGN KEY ("kb_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers" ADD CONSTRAINT "providers_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "models" ADD CONSTRAINT "models_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_kb_id_fkey" FOREIGN KEY ("kb_id") REFERENCES "knowledge_bases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_options" ADD CONSTRAINT "provider_options_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 创建 PGRoonga 全文索引（Sparse 路：content &@ query 依赖此索引）
CREATE INDEX IF NOT EXISTS "memories_content_pgroonga_idx" ON "memories" USING PGroonga ("content");

-- 给 embedding 列添加维度声明（HNSW 索引必需）
ALTER TABLE "memories" ALTER COLUMN "embedding" TYPE vector(1024);

-- 创建 HNSW 向量索引（Dense 路：embedding <=> 向量 余弦距离检索）
CREATE INDEX IF NOT EXISTS "memories_embedding_hnsw_idx" ON "memories" USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64);
