import { config } from './config';
import app from './app';
import { rehydrateMeetingReminders, registerReminderWorker } from './services/meeting.service';
import { startJobQueue } from './lib/job-queue';

app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`Trakk API running on :${config.PORT}`);
  rehydrateMeetingReminders().catch(err =>
    console.warn('rehydrateMeetingReminders failed on startup:', err),
  );
  startJobQueue()
    .then(() => registerReminderWorker())
    .catch(console.error);
});
