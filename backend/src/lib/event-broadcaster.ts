import type { ServerResponse } from 'node:http';

// In-memory Server-Sent Events pub/sub keyed by projectId.
//
// SINGLE-INSTANCE CONSTRAINT: This broadcaster keeps subscribers in process
// memory. It only delivers events to clients connected to THIS Node.js
// instance. If Trakk is ever scaled horizontally (multiple backend instances
// behind a load balancer), SSE events will not propagate across instances and
// this must be replaced with a shared bus (e.g. Redis pub/sub or Postgres
// LISTEN/NOTIFY). Every call site of broadcast() is annotated accordingly.

const subscribers = new Map<string, Set<ServerResponse>>();

export function subscribe(projectId: string, res: ServerResponse): void {
  let set = subscribers.get(projectId);
  if (!set) {
    set = new Set<ServerResponse>();
    subscribers.set(projectId, set);
  }
  set.add(res);
}

export function unsubscribe(projectId: string, res: ServerResponse): void {
  const set = subscribers.get(projectId);
  if (!set) {
    return;
  }
  set.delete(res);
  if (set.size === 0) {
    subscribers.delete(projectId);
  }
}

export function broadcast(projectId: string, eventName: string, payload: unknown): void {
  const set = subscribers.get(projectId);
  if (!set || set.size === 0) {
    return;
  }
  // Use the default (unnamed) SSE event so EventSource.onmessage fires.
  // Named events (event: ...) are ignored by onmessage and require separate
  // addEventListener calls per event name.
  const data = `data: ${JSON.stringify({ type: eventName, projectId, payload })}\n\n`;
  for (const res of set) {
    res.write(data);
  }
}
