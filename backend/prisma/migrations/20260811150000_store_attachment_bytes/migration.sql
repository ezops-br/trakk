-- AlterTable
ALTER TABLE "ticket_attachments" DROP COLUMN "storage_key",
ADD COLUMN     "bytes" BYTEA;