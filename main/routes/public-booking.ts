import { Router, Request, Response } from 'express';
import {
  createAppointment,
  findCustomerByPhone,
  getBookingServices,
  getBookingSettings,
  getCustomerVisits,
  getLoyaltyConfig,
  getSettings,
  getSlots,
} from '../services/booking';

const router = Router();

// Very small in-memory guard so the public endpoint isn't trivially spammed.
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(ip: string): boolean {
  const nowMs = Date.now();
  const windowMs = 60 * 60 * 1000;
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt < nowMs) {
    rateBuckets.set(ip, { count: 1, resetAt: nowMs + windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > 25;
}

function groupServices() {
  const services = getBookingServices();
  const categories: { name: string; color?: string | null; icon?: string | null }[] = [];
  for (const service of services) {
    if (!categories.some((c) => c.name === service.category)) {
      categories.push({ name: service.category, color: service.categoryColor, icon: service.categoryIcon });
    }
  }
  return { services, categories };
}

router.get('/config', (_req: Request, res: Response) => {
  try {
    const settings = getSettings();
    const booking = getBookingSettings();
    const loyalty = getLoyaltyConfig();
    const { services, categories } = groupServices();

    res.json({
      booking: {
        enabled: booking.enabled,
        openTime: booking.openTime,
        closeTime: booking.closeTime,
        openDays: booking.openDays,
        advanceDays: booking.advanceDays,
        minimumLeadMinutes: booking.leadMinutes,
        stylist: { name: booking.stylistName, role: booking.stylistRole },
        policies: booking.policies,
      },
      business: {
        name: settings.business_name || 'Estética Radiante',
        tagline: settings.business_tagline || 'Estética & Bem-estar',
        phone: settings.business_phone || settings.phone || '',
        whatsapp: settings.whatsapp || '',
        instagram: settings.instagram || '',
        address: settings.business_address || settings.address || '',
        currencySymbol: settings.currency_symbol || 'R$',
        timezone: settings.timezone || 'America/Sao_Paulo',
      },
      loyalty,
      services,
      categories,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/slots', (req: Request, res: Response) => {
  try {
    const date = String(req.query.date || '');
    const duration = Math.min(360, Math.max(30, parseInt(String(req.query.duration || '60'), 10) || 60));
    const slots = getSlots(date, duration);
    res.json({ date, duration, slots });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/client', (req: Request, res: Response) => {
  try {
    const phone = String(req.query.phone || '');
    const customer = findCustomerByPhone(phone);
    if (!customer) return res.json({ found: false, customer: null });

    const visits = getCustomerVisits(customer.id);
    const loyalty = getLoyaltyConfig();
    res.json({
      found: true,
      customer: {
        id: customer.id,
        name: customer.name,
        visits,
        loyalty_points: customer.loyalty_points || 0,
        progressInCycle: visits % loyalty.threshold,
        loyaltyThreshold: loyalty.threshold,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/appointments', (req: Request, res: Response) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
    }

    const { name, phone, date, time, notes, services, product_ids } = req.body || {};
    const productIds: string[] = Array.isArray(services)
      ? services
      : Array.isArray(product_ids)
        ? product_ids
        : [];

    const appointment = createAppointment({
      name,
      phone,
      date,
      time,
      productIds,
      notes: notes || null,
      source: 'online',
      status: 'confirmed',
    });

    res.status(201).json({ appointment });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Não foi possível concluir o agendamento' });
  }
});

export const publicBookingRoutes = router;
