-- CreateIndex
CREATE INDEX "meetings_ticket_id_start_time_idx" ON "meetings"("ticket_id", "start_time" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "meetings_google_event_id_key" ON "meetings"("google_event_id");
