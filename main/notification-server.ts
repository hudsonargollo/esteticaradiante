import { EventEmitter } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'http';

import { notify, onNotification, type Notification } from './notification';

let wss: WebSocketServer | null = null;

function genId(): string {
  return `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function broadcast(n: Notification): void {
  if (!wss) return;
  const payload = { ...n, id: genId() };
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(payload));
      } catch {
        // disconnected mid-send; ignore
      }
    }
  });
}

export function startNotificationServer(httpServer: Server): void {
  if (wss) return;
  wss = new WebSocketServer({ server: httpServer });
  wss.on('connection', (ws: WebSocket) => {
    // Send the latest unseen notifications so the admin panel can react
    // immediately after a reconnect.
    const recent = new Map<string, Notification>();
    onNotification((msg: Notification) => {
      recent.set(msg.id, msg);
      // keep at most 200 so memory stays bounded
      if (recent.size > 200) {
        const oldest = recent.keys().next().value;
        if (oldest) recent.delete(oldest);
      }
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'notification-added', payload: msg }));
      }
    });

    // On connect, replay the latest backlog so the panel is never empty.
    for (const msg of recent.values()) {
      ws.send(JSON.stringify({ type: 'notification-added', payload: msg }));
    }

    ws.on('close', () => {
      onNotification((msg: Notification) => {
        recent.delete(msg.id);
      });
    });
  });
}

export interface NotificationStore {
  all: () => Notification[];
  clear: () => void;
}

export function createNotificationStore(): NotificationStore {
  const items: Notification[] = [];
  onNotification((n: Notification) => {
    // Keep the store deduped by id; bounded to 200.
    const existing = items.find((i) => i.id === n.id);
    if (!existing) {
      items.push(n);
      if (items.length > 200) items.shift();
    }
  });
  return {
    all: () => items.slice(),
    clear: () => {
      items.length = 0;
    },
  };
}
