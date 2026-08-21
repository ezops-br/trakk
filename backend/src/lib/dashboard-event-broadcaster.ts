import type { ServerResponse } from 'node:http';

// In-memory Server-Sent Events pub/sub keyed by userId.
//
// SINGLE-INSTANCE CONSTRAINT: This broadcaster keeps subscribers in process
// memory. It only delivers events to clients connected to THIS Node.js
// instance. If Trakk is ever scaled horizontally (multiple backend instances
// behind a load balancer), SSE events will not propagate across instances and
// this must be replaced with a shared bus (e.g. Redis pub/sub or Postgres
// LISTEN/NOTIFY).

const dashboardSubscribers = new Map<string, Set<ServerResponse>>();

export function subscribeToDashboard(userId: string, res: ServerResponse): void {
  let set = dashboardSubscribers.get(userId);
  if (!set) {
    set = new Set<ServerResponse>();
    dashboardSubscribers.set(userId, set);
  }
  set.add(res);
}

export function unsubscribeFromDashboard(userId: string, res: ServerResponse): void {
  const set = dashboardSubscribers.get(userId);
  if (!set) {
    return;
  }
  set.delete(res);
  if (set.size === 0) {
    dashboardSubscribers.delete(userId);
  }
}

export function broadcastToDashboard(userId: string, type: string, payload: unknown): void {
  const set = dashboardSubscribers.get(userId);
  if (!set || set.size === 0) {
    return;
  }
  const data = `data: ${JSON.stringify({ type, userId, payload })}\n\n`;
  for (const res of set) {
    try {
      res.write(data);
    } catch {
      // ignore write errors on closed connections
    }
  }
}
