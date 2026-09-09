-- AlterTable
ALTER TABLE "tickets" ADD COLUMN "due_date" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "tickets_project_id_due_date_idx" ON "tickets"("project_id", "due_date");
