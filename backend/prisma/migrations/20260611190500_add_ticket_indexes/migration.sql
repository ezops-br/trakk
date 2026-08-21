-- CreateIndex
CREATE INDEX "activity_logs_ticket_id_created_at_idx" ON "activity_logs"("ticket_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "tickets_project_id_status_column_id_idx" ON "tickets"("project_id", "status_column_id");
