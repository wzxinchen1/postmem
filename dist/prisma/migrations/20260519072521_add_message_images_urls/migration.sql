-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "images" JSONB DEFAULT '[]',
ADD COLUMN     "urls" JSONB DEFAULT '[]';
