-- CreateIndex
CREATE INDEX "meetings_organizer_id_start_time_idx" ON "meetings"("organizer_id", "start_time" ASC);
