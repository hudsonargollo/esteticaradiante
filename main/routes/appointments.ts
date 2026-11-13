import { Router, Request, Response } from 'express';
import * as os from 'os';
import QRCode from 'qrcode';
import { getDatabase, now } from '../db';
import {
  createAppointment,
  getAppointment,
  getBookingSettings,
  getSlots,
  isValidDate,
  isValidTime,
  minutesToTime,
  nowInTimezone,
  timeToMinutes,
} from '../services/booking';
import { createOrderFromAppointment } from '../services/order-builder';

const router = Router();

const VALID_STATUSES = ['scheduled', 'confirmed', 'checked-in', 'completed', 'cancelled', 'no-show'];

function getLanIp(): string | null {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const alias of interfaces[name] || []) {
      if (alias.family === 'IPv4' && !alias.internal) return alias.address;
    }
  }
  return null;
}

function bookingUrls(req: Request) {
  const host = req.get('host') || 'localhost:3001';
  const port = host.split(':')[1] || (req.protocol === 'https' ? '443' : '3001');
  const localUrl = `${req.protocol}://${host}/agendar/`;
  const lanIp = getLanIp();
  const lanUrl = lanIp ? `http://${lanIp}:${port}/agendar/` : null;
  const publicBase = process.env.PUBLIC_BOOKING_URL?.replace(/\/+$/, '');
  const url = publicBase ? `${publicBase}/agendar` : (lanUrl || localUrl);
  return { url, local_url: localUrl, lan_url: lanUrl };
}

router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const today = nowInTimezone().date;
    let query = 'SELECT * FROM appointments WHERE 1=1';
    const params: any[] = [];

    if (req.query.date) {
      query += ' AND date = ?';
      params.push(String(req.query.date));
    }
    if (req.query.from) {
      query += ' AND date >= ?';
      params.push(String(req.query.from));
    }
    if (req.query.to) {
      query += ' AND date <= ?';
      params.push(String(req.query.to));
    }
    if (req.query.status) {
      query += ' AND status = ?';
      params.push(String(req.query.status));
    }
    if (req.query.search) {
      query += ' AND (customer_name LIKE ? OR customer_phone LIKE ? OR appointment_number LIKE ?)';
      const term = `%${req.query.search}%`;
      params.push(term, term, term);
    }

    query += ' ORDER BY date, start_time';
    query += ` LIMIT ${Math.min(500, parseInt(String(req.query.per_page || '300'), 10) || 300)}`;

    const rows = db.prepare(query).all(...params) as any[];
    const appointments = rows.map((row) => getAppointment(row.id));

    const active = appointments.filter((a: any) => !['cancelled', 'no-show'].includes(a.status));
    const summary = {
      date: req.query.date || today,
      total: appointments.length,
      confirmed: appointments.filter((a: any) => a.status === 'confirmed' || a.status === 'scheduled').length,
      checked_in: appointments.filter((a: any) => a.status === 'checked-in').length,
      completed: appointments.filter((a: any) => a.status === 'completed').length,
      cancelled: appointments.filter((a: any) => ['cancelled', 'no-show'].includes(a.status)).length,
      expected_revenue: active.reduce((sum: number, a: any) => sum + (Number(a.total_price) || 0), 0),
    };

    res.json({ appointments, summary });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/booking-link', (req: Request, res: Response) => {
  try {
    res.json(bookingUrls(req));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/booking-qr', async (req: Request, res: Response) => {
  try {
    const urls = bookingUrls(req);
    const url = String(req.query.url || urls.url);
    const dataUrl = await QRCode.toDataURL(url, {
      width: 640,
      margin: 1,
      color: { dark: '#3B1F4A', light: '#FFFFFF' },
    });
    res.json({ url, qr: dataUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const { name, phone, date, time, product_ids, services, notes, stylist_id, force } = req.body || {};
    const productIds: string[] = Array.isArray(product_ids)
      ? product_ids
      : Array.isArray(services)
        ? services
        : [];

    const appointment = createAppointment({
      name,
      phone,
      date,
      time,
      productIds,
      notes: notes || null,
      source: 'pos',
      stylistId: stylist_id || null,
      status: 'confirmed',
      skipAvailabilityCheck: Boolean(force),
    });

    res.status(201).json({ appointment });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const appointment = getAppointment(req.params.id);
    if (!appointment) return res.status(404).json({ error: 'Agendamento não encontrado' });
    res.json({ appointment });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id/status', (req: Request, res: Response) => {
  try {
    const { status, reason } = req.body || {};
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status inválido. Use: ${VALID_STATUSES.join(', ')}` });
    }

    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Agendamento não encontrado' });

    db.prepare(`
      UPDATE appointments
      SET status = ?, cancellation_reason = COALESCE(?, cancellation_reason), updated_at = ?
      WHERE id = ?
    `).run(status, reason || null, now(), req.params.id);

    res.json({ appointment: getAppointment(req.params.id) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id/reschedule', (req: Request, res: Response) => {
  try {
    const { date, time } = req.body || {};
    if (!isValidDate(String(date)) || !isValidTime(String(time))) {
      return res.status(400).json({ error: 'Data ou horário inválidos' });
    }

    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Agendamento não encontrado' });
    if (['cancelled', 'completed', 'no-show'].includes(existing.status)) {
      return res.status(400).json({ error: 'Não é possível remarcar este agendamento' });
    }

    const duration = Number(existing.duration_minutes) || 60;
    const slot = getSlots(date, duration, existing.id).find((s) => s.time === time);
    if (!slot || !slot.available) {
      return res.status(400).json({ error: 'Horário indisponível. Escolha outro, por favor.' });
    }

    const endTime = minutesToTime(timeToMinutes(time) + duration);
    db.prepare('UPDATE appointments SET date = ?, start_time = ?, end_time = ?, updated_at = ? WHERE id = ?')
      .run(date, time, endTime, now(), req.params.id);

    res.json({ appointment: getAppointment(req.params.id) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/check-in', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const appointment = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id) as any;
    if (!appointment) return res.status(404).json({ error: 'Agendamento não encontrado' });
    if (['cancelled', 'no-show'].includes(appointment.status)) {
      return res.status(400).json({ error: 'Este agendamento está cancelado' });
    }

    if (appointment.order_id) {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(appointment.order_id);
      return res.json({ appointment: getAppointment(req.params.id), order, already_checked_in: true });
    }

    const order = createOrderFromAppointment(appointment);
    db.prepare("UPDATE appointments SET status = 'checked-in', order_id = ?, updated_at = ? WHERE id = ?")
      .run(order.id, now(), req.params.id);

    res.json({ appointment: getAppointment(req.params.id), order });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export const appointmentRoutes = router;
