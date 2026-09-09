-- CreateEnum
CREATE TYPE "LinkType" AS ENUM ('BLOCKS', 'RELATES_TO', 'DUPLICATES');

-- CreateTable
CREATE TABLE "ticket_links" (
    "id" TEXT NOT NULL,
    "source_ticket_id" TEXT NOT NULL,
    "target_ticket_id" TEXT NOT NULL,
    "type" "LinkType" NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_links_source_ticket_id_idx" ON "ticket_links"("source_ticket_id");

-- CreateIndex
CREATE INDEX "ticket_links_target_ticket_id_idx" ON "ticket_links"("target_ticket_id");

-- AddForeignKey
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_source_ticket_id_fkey" FOREIGN KEY ("source_ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_target_ticket_id_fkey" FOREIGN KEY ("target_ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
