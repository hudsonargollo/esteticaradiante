import { getDatabase, generateAppointmentNumber, now } from '../db';

export interface BookingSettings {
  enabled: boolean;
  openTime: string;
  closeTime: string;
  interval: number;
  openDays: number[];
  advanceDays: number;
  leadMinutes: number;
  stylistName: string;
  stylistRole: string;
  policies: string[];
}

export interface BookingService {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  category: string;
  categoryColor?: string | null;
  categoryIcon?: string | null;
  image_url?: string | null;
}

export interface AppointmentItemRow {
  id: number;
  appointment_id: string;
  product_id: string | null;
  product_name: string;
  price: number;
  duration_minutes: number;
}

export interface CreateAppointmentInput {
  name: string;
  phone: string;
  date: string;
  time: string;
  productIds: string[];
  notes?: string | null;
  source?: 'online' | 'pos';
  stylistId?: string | null;
  status?: string;
  skipAvailabilityCheck?: boolean;
}

const DEFAULT_POLICIES = [
  'Atendimento no estúdio, com horário marcado.',
  'Chegue com 10 minutos de antecedência.',
  'Cancelamentos com até 24h de antecedência.',
  'Pagamento em Pix, dinheiro ou cartão.',
];

export function getSettings(): Record<string, string> {
  const db = getDatabase();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function getBookingSettings(): BookingSettings {
  const s = getSettings();
  let policies = DEFAULT_POLICIES;
  if (s.booking_policies) {
    try {
      const parsed = JSON.parse(s.booking_policies);
      if (Array.isArray(parsed) && parsed.length > 0) policies = parsed.map(String);
    } catch {
      // keep defaults
    }
  }

  return {
    enabled: s.booking_enabled !== 'false',
    openTime: s.booking_open_time || '09:00',
    closeTime: s.booking_close_time || '19:00',
    interval: Math.max(5, parseInt(s.booking_slot_interval || '30', 10) || 30),
    openDays: (s.booking_open_days || '1,2,3,4,5,6')
      .split(',')
      .map((d) => parseInt(d.trim(), 10))
      .filter((d) => !Number.isNaN(d)),
    advanceDays: Math.max(1, parseInt(s.booking_advance_days || '45', 10) || 45),
    leadMinutes: Math.max(0, parseInt(s.booking_lead_minutes || '120', 10) || 0),
    stylistName: s.booking_stylist_name || 'Elis Carvalho',
    stylistRole: s.booking_stylist_role || 'Esteticista',
    policies,
  };
}

export function getLoyaltyConfig() {
  const s = getSettings();
  return {
    enabled: s.loyalty_enabled !== 'false',
    threshold: Math.max(1, parseInt(s.loyalty_threshold || '10', 10) || 10),
    rewardDescription: s.loyalty_reward || 'Massagem relaxante grátis',
  };
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(`${date}T12:00:00`).getTime());
}

export function isValidTime(time: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(time)) return false;
  const minutes = timeToMinutes(time);
  return minutes >= 0 && minutes < 24 * 60;
}

/** Current date/time in the salon's timezone (defaults to São Paulo). */
export function nowInTimezone(): { date: string; minutes: number } {
  const timezone = getSettings().timezone || 'America/Sao_Paulo';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  const hour = parseInt(get('hour'), 10) % 24;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: hour * 60 + parseInt(get('minute'), 10),
  };
}

export function dayOfWeek(date: string): number {
  // Noon avoids DST edge cases.
  return new Date(`${date}T12:00:00`).getDay();
}

export function normalizePhone(phone: string): string {
  return String(phone || '').replace(/\D/g, '').slice(-13);
}

export function findCustomerByPhone(phone: string): any | null {
  const db = getDatabase();
  const digits = normalizePhone(phone);
  if (!digits) return null;
  return (
    db.prepare(`
      SELECT * FROM customers
      WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') = ?
         OR phone = ?
      LIMIT 1
    `).get(digits, phone) || null
  );
}

export function upsertCustomer(name: string, phone: string): any {
  const db = getDatabase();
  const existing = findCustomerByPhone(phone);
  if (existing) {
    if (name && existing.name !== name) {
      db.prepare('UPDATE customers SET name = ?, updated_at = ? WHERE id = ?').run(name, now(), existing.id);
      existing.name = name;
    }
    return existing;
  }

  const id = 'cust-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
  db.prepare(`
    INSERT INTO customers (id, name, phone, country_code, created_at, updated_at)
    VALUES (?, ?, ?, '+55', ?, ?)
  `).run(id, name, normalizePhone(phone), now(), now());
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
}

export function getCustomerVisits(customerId: string): number {
  const db = getDatabase();
  const orders = db.prepare(
    "SELECT COUNT(*) as count FROM orders WHERE customer_id = ? AND status != 'cancelled'"
  ).get(customerId) as { count: number };
  const appointments = db.prepare(
    "SELECT COUNT(*) as count FROM appointments WHERE customer_id = ? AND status = 'completed' AND order_id IS NULL"
  ).get(customerId) as { count: number };
  return (orders?.count || 0) + (appointments?.count || 0);
}

export function getBookingServices(): BookingService[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT p.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon, c.sort_order AS category_sort
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.deleted_at IS NULL AND p.is_active = 1 AND p.kind = 'service'
    ORDER BY COALESCE(c.sort_order, 999), p.sort_order, p.name
  `).all() as any[];

  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description || '',
    duration: p.service_duration_minutes || 30,
    price: Number(p.price) || 0,
    category: p.category_name || 'Serviços',
    categoryColor: p.category_color,
    categoryIcon: p.category_icon,
  }));
}

function getProductsByIds(productIds: string[]): any[] {
  const db = getDatabase();
  return productIds.map((id) => {
    const product = db.prepare(
      "SELECT * FROM products WHERE id = ? AND deleted_at IS NULL AND is_active = 1 AND kind = 'service'"
    ).get(id) as any;
    if (!product) throw new Error(`Serviço não encontrado: ${id}`);
    return product;
  });
}

export function hasOverlap(date: string, startTime: string, endTime: string, ignoreAppointmentId?: string): boolean {
  const db = getDatabase();
  const params: any[] = [date, endTime, startTime];
  let query = `
    SELECT id FROM appointments
    WHERE date = ? AND status NOT IN ('cancelled', 'no-show')
      AND start_time < ? AND end_time > ?
  `;
  if (ignoreAppointmentId) {
    query += ' AND id != ?';
    params.push(ignoreAppointmentId);
  }
  return Boolean(db.prepare(query).get(...params));
}

export interface Slot {
  id: string;
  time: string;
  available: boolean;
}

export function getSlots(date: string, durationMinutes: number, ignoreAppointmentId?: string): Slot[] {
  const settings = getBookingSettings();
  if (!isValidDate(date)) throw new Error('Data inválida');

  const nowTz = nowInTimezone();
  const duration = Math.max(5, durationMinutes || 30);
  const day = dayOfWeek(date);

  // Outside the booking window — no slots at all.
  if (date < nowTz.date) return [];
  const [nowYear, nowMonth, nowDay] = nowTz.date.split('-').map((n) => parseInt(n, 10));
  const maxDate = new Date(Date.UTC(nowYear, nowMonth - 1, nowDay + settings.advanceDays));
  const maxDateStr = maxDate.toISOString().slice(0, 10);
  if (date > maxDateStr) return [];

  if (!settings.openDays.includes(day)) return [];

  const open = timeToMinutes(settings.openTime);
  const close = timeToMinutes(settings.closeTime);
  const slots: Slot[] = [];

  for (let start = open; start + duration <= close; start += settings.interval) {
    const time = minutesToTime(start);
    const end = minutesToTime(start + duration);
    let available = true;

    if (date === nowTz.date && start < nowTz.minutes + settings.leadMinutes) available = false;
    if (available && hasOverlap(date, time, end, ignoreAppointmentId)) available = false;

    slots.push({ id: `${date}-${time}`, time, available });
  }

  return slots;
}

export function getAppointment(id: string): any | null {
  const db = getDatabase();
  const appointment = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id) as any;
  if (!appointment) return null;
  const items = db.prepare('SELECT * FROM appointment_items WHERE appointment_id = ? ORDER BY id').all(id);
  const customer = appointment.customer_id
    ? db.prepare('SELECT * FROM customers WHERE id = ?').get(appointment.customer_id)
    : null;
  const stylist = appointment.stylist_id
    ? db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(appointment.stylist_id)
    : null;
  const order = appointment.order_id
    ? db.prepare('SELECT id, order_number, status, total FROM orders WHERE id = ?').get(appointment.order_id)
    : null;
  return { ...appointment, items, customer, stylist, order };
}

export function createAppointment(input: CreateAppointmentInput): any {
  const db = getDatabase();
  const name = String(input.name || '').trim();
  const phone = normalizePhone(input.phone || '');
  const date = String(input.date || '');
  const time = String(input.time || '');
  const productIds = (input.productIds || []).filter(Boolean);

  if (name.length < 2) throw new Error('Informe o seu nome completo');
  if (phone.length < 10) throw new Error('Informe um WhatsApp válido');
  if (!isValidDate(date)) throw new Error('Escolha uma data válida');
  if (!isValidTime(time)) throw new Error('Escolha um horário válido');
  if (productIds.length === 0) throw new Error('Escolha pelo menos um serviço');

  const products = getProductsByIds(productIds);
  const duration = Math.max(30, products.reduce((sum, p) => sum + (Number(p.service_duration_minutes) || 0), 0));
  const totalPrice = products.reduce((sum, p) => sum + (Number(p.price) || 0), 0);
  const startMinutes = timeToMinutes(time);
  const endTime = minutesToTime(startMinutes + duration);

  if (!input.skipAvailabilityCheck) {
    const slots = getSlots(date, duration);
    const slot = slots.find((s) => s.time === time);
    if (!slot || !slot.available) {
      throw new Error('Esse horário não está mais disponível. Escolha outro, por favor.');
    }
  }

  const customer = upsertCustomer(name, phone);
  const id = 'appt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  const appointmentNumber = generateAppointmentNumber();
  const status = input.status && ['scheduled', 'confirmed', 'checked-in', 'completed', 'cancelled', 'no-show'].includes(input.status)
    ? input.status
    : 'confirmed';

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO appointments (
        id, appointment_number, customer_id, customer_name, customer_phone, stylist_id,
        date, start_time, end_time, duration_minutes, total_price, status, source, notes,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, appointmentNumber, customer.id, name, phone, input.stylistId || null,
      date, time, endTime, duration, totalPrice, status, input.source || 'online', input.notes || null,
      now(), now()
    );

    const insertItem = db.prepare(`
      INSERT INTO appointment_items (appointment_id, product_id, product_name, price, duration_minutes, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const product of products) {
      insertItem.run(id, product.id, product.name, Number(product.price) || 0, Number(product.service_duration_minutes) || 0, now());
    }
  });
  tx();

  return getAppointment(id);
}
