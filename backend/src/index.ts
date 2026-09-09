import { config } from './config';
import app from './app';
import { rehydrateOverdueTimers } from './services/ticket.service';

app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`Trakk API running on :${config.PORT}`);
  rehydrateOverdueTimers().catch(err =>
    console.warn('rehydrateOverdueTimers failed on startup:', err),
  );
});
