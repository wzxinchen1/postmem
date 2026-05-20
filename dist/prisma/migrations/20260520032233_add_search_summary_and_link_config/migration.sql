-- AlterTable
ALTER TABLE "chat_settings" ADD COLUMN     "search_link_count" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "web_pages" ADD COLUMN     "summary" TEXT;
