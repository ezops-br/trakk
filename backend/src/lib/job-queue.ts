// pg-boss v10 uses `export =` (CJS-style) — use require-style import
import PgBoss = require('pg-boss');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required for job queue');

const pgBoss = new PgBoss({
  connectionString: DATABASE_URL,
  schema: 'pgboss',
});

/**
 * Simplified job-queue interface used by the application.
 * Each named job uses a unique queue name (e.g. "meeting-reminder:<uuid>"),
 * so cancel(name) purges all queued jobs for that meeting.
 */
export const boss = {
  send(name: string, data: object | null, options?: { startAfter?: Date }): Promise<string | null> {
    const opts: PgBoss.SendOptions = {};
    if (options?.startAfter) {
      opts.startAfter = options.startAfter;
    }
    return pgBoss.send(name, data ?? {}, opts);
  },

  cancel(name: string): Promise<void> {
    return pgBoss.purgeQueue(name);
  },

  work<T>(name: string, handler: (job: { data: T }) => Promise<void>): Promise<string> {
    return pgBoss.work<T>(name, async (jobs) => {
      for (const job of jobs) {
        await handler(job);
      }
    });
  },
};

export async function startJobQueue(): Promise<void> {
  await pgBoss.start();
}
