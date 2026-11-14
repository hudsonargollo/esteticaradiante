import { EventEmitter } from 'node:events';

export type NotificationKind = 'appointment' | 'reminder' | 'result';

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  level: 'info' | 'warning' | 'success' | 'critical';
  appointmentId: string;
  appointmentNumber: string;
  customerName: string;
  date: string;
  time: string;
  createdAt: string;
  timeoutMs: number;
}

const emitter = new EventEmitter();
let seq = 0;

export function makeNotificationId(): string {
  seq += 1;
  return `notif-${Date.now()}-${seq}`;
}

/** Push a notification into the admin channel. */
export function notify(n: Notification): void {
  emitter.emit('notification-added', n);
  // Best-effort: re-emit for UI wake (once per kind per minute).
  if (n.kind === 'reminder') {
    setTimeout(() => emitter.emit('notification-added', n), 45000);
  }
}

/** Subscribe to notifications. Returns a cleanup function. */
export function onNotification(handler: (n: Notification) => void): () => void {
  emitter.on('notification-added', handler);
  return () => emitter.off('notification-added', handler);
}

export function notifyAppointmentMade(appointment: {
  id: string;
  appointment_number: string;
  customer_name: string;
  date: string;
  start_time: string;
}): Notification {
  const now = new Date().toISOString();
  const n: Notification = {
    id: makeNotificationId(),
    kind: 'appointment',
    title: 'Novo agendamento',
    message: `${appointment.customer_name} — ${appointment.date} às ${appointment.start_time}`,
    level: 'success',
    appointmentId: appointment.id,
    appointmentNumber: appointment.appointment_number,
    customerName: appointment.customer_name,
    date: appointment.date,
    time: appointment.start_time,
    createdAt: now,
    timeoutMs: 30000,
  };
  notify(n);
  return n;
}

export function notifyReminder(appointment: {
  id: string;
  appointment_number: string;
  customer_name: string;
  date: string;
  start_time: string;
}): Notification {
  const now = new Date().toISOString();
  const n: Notification = {
    id: makeNotificationId(),
    kind: 'reminder',
    title: 'Aviso: horário em 30 minutos',
    message: `${appointment.customer_name} — ${appointment.date} às ${appointment.start_time}`,
    level: 'warning',
    appointmentId: appointment.id,
    appointmentNumber: appointment.appointment_number,
    customerName: appointment.customer_name,
    date: appointment.date,
    time: appointment.start_time,
    createdAt: now,
    timeoutMs: 30000,
  };
  notify(n);
  return n;
}
