import type { Prisma, PrismaClient } from '@prisma/client';

// The activity log is append-only (CLAUDE.md business rules): this service
// exposes only a writer. There is intentionally no update or delete method.

// Accepts either the global Prisma client or a transaction proxy (tx), so the
// write can participate atomically in a surrounding $transaction.
type PrismaLike = PrismaClient | Prisma.TransactionClient;

export interface LogActivityInput {
  ticketId: string;
  userId: string;
  action: string;
  oldValue?: string | null;
  newValue?: string | null;
}

export async function logActivity(
  prismaClient: PrismaLike,
  input: LogActivityInput,
): Promise<void> {
  await prismaClient.activityLog.create({
    data: {
      ticketId: input.ticketId,
      userId: input.userId,
      action: input.action,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
    },
  });
}
