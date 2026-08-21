-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "next_ticket_number" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "tickets_project_id_archived_at_idx" ON "tickets"("project_id", "archived_at");

-- Backfill: the column default of 1 is only correct for projects with no tickets.
-- Existing projects must start the allocator above their highest existing ticket
-- number, otherwise the next created ticket collides with the
-- (project_id, number) unique constraint.
UPDATE "projects" p
SET "next_ticket_number" = COALESCE(
  (SELECT MAX(t."number") FROM "tickets" t WHERE t."project_id" = p."id"),
  0
) + 1;
