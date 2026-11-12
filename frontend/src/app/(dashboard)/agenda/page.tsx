'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';
import { durationLabel, formatDateLong, formatPhoneInput, todayStr } from '@/lib/booking-utils';
import type { AgendaAppointment, AgendaSummary, TimeSlot } from '@/lib/booking-types';
import type { Product } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Check,
  CircleSlash,
  Clock,
  Copy,
  Link2,
  MessageCircle,
  Plus,
  QrCode,
  CalendarClock,
  UserX,
  Ticket,
} from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_META: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Agendado', className: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: 'Confirmado', className: 'bg-blue-100 text-blue-800' },
  'checked-in': { label: 'Em atendimento', className: 'bg-purple-100 text-purple-800' },
  completed: { label: 'Concluído', className: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Cancelado', className: 'bg-red-100 text-red-800' },
  'no-show': { label: 'Não compareceu', className: 'bg-gray-200 text-gray-700' },
};

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function displayPhone(raw?: string | null): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  const local = digits.length > 11 ? digits.slice(-11) : digits;
  return formatPhoneInput(local);
}

function whatsappUrl(phone?: string | null): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  const full = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${full}`;
}

export default function AgendaPage() {
  const [date, setDate] = useState(todayStr());
  const [appointments, setAppointments] = useState<AgendaAppointment[]>([]);
  const [summary, setSummary] = useState<AgendaSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const [linkOpen, setLinkOpen] = useState(false);
  const [bookingUrl, setBookingUrl] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);

  const [services, setServices] = useState<Product[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', date: todayStr(), time: '', notes: '', force: false });
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [rescheduling, setRescheduling] = useState<AgendaAppointment | null>(null);
  const [rescheduleSlots, setRescheduleSlots] = useState<TimeSlot[]>([]);
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');

  const load = useCallback(async (day: string) => {
    setLoading(true);
    try {
      const { data } = await api.get('/appointments', { params: { date: day } });
      setAppointments(data.appointments || []);
      setSummary(data.summary || null);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Não foi possível carregar a agenda');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  useEffect(() => {
    const timer = setInterval(() => load(date), 60000);
    return () => clearInterval(timer);
  }, [date, load]);

  useEffect(() => {
    api
      .get('/products', { params: { kind: 'service', active: 'true' } })
      .then((res) => setServices(res.data.products || []))
      .catch(() => undefined);
  }, []);

  const selectedServices = useMemo(
    () => services.filter((service) => selectedServiceIds.includes(service.id)),
    [services, selectedServiceIds]
  );
  const formDuration = selectedServices.reduce(
    (sum, service) => sum + (Number(service.service_duration_minutes) || 30),
    0
  );
  const formTotal = selectedServices.reduce((sum, service) => sum + (Number(service.price) || 0), 0);

  useEffect(() => {
    if (!createOpen) return;
    if (selectedServiceIds.length === 0 || !form.date) {
      setSlots([]);
      return;
    }
    let active = true;
    setSlotsLoading(true);
    api
      .get('/public/booking/slots', { params: { date: form.date, duration: Math.max(30, formDuration) } })
      .then((res) => {
        if (!active) return;
        setSlots(res.data.slots || []);
        setForm((prev) => (prev.time && (res.data.slots || []).some((s: TimeSlot) => s.time === prev.time && s.available) ? prev : { ...prev, time: '' }));
      })
      .catch(() => active && setSlots([]))
      .finally(() => active && setSlotsLoading(false));
    return () => {
      active = false;
    };
  }, [createOpen, form.date, formDuration, selectedServiceIds.length]);

  useEffect(() => {
    if (!rescheduling) return;
    let active = true;
    setRescheduleSlots([]);
    setRescheduleTime('');
    api
      .get('/public/booking/slots', {
        params: { date: rescheduleDate || rescheduling.date, duration: rescheduling.duration_minutes },
      })
      .then((res) => active && setRescheduleSlots(res.data.slots || []))
      .catch(() => active && setRescheduleSlots([]));
    return () => {
      active = false;
    };
  }, [rescheduling, rescheduleDate]);

  async function openCreate() {
    setForm({ name: '', phone: '', date, time: '', notes: '', force: false });
    setSelectedServiceIds([]);
    setSlots([]);
    setCreateOpen(true);
  }

  function toggleService(id: string) {
    setSelectedServiceIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  async function createAppointment(event: React.FormEvent) {
    event.preventDefault();
    if (selectedServiceIds.length === 0) {
      toast.error('Escolha pelo menos um serviço');
      return;
    }
    if (!form.time && !form.force) {
      toast.error('Escolha um horário');
      return;
    }
    setSaving(true);
    try {
      const time = form.time || '09:00';
      await api.post('/appointments', {
        name: form.name,
        phone: form.phone,
        date: form.date,
        time,
        product_ids: selectedServiceIds,
        notes: form.notes || null,
        force: form.force,
      });
      toast.success('Agendamento criado');
      setCreateOpen(false);
      setDate(form.date);
      if (form.date === date) load(date);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Não foi possível criar o agendamento');
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(appointment: AgendaAppointment, status: string) {
    const labels: Record<string, string> = {
      confirmed: 'confirmar',
      completed: 'concluir',
      cancelled: 'cancelar',
      'no-show': 'marcar como não compareceu',
    };
    if (['cancelled', 'no-show'].includes(status) && !confirm(`Deseja realmente ${labels[status]} este agendamento?`)) {
      return;
    }
    try {
      await api.patch(`/appointments/${appointment.id}/status`, { status });
      toast.success('Status atualizado');
      load(date);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Não foi possível atualizar');
    }
  }

  async function checkIn(appointment: AgendaAppointment) {
    try {
      const { data } = await api.post(`/appointments/${appointment.id}/check-in`);
      toast.success(`Comanda ${data.order?.order_number || ''} aberta`);
      load(date);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Não foi possível abrir a comanda');
    }
  }

  async function openBookingLink() {
    setLinkOpen(true);
    if (bookingUrl) return;
    setLinkLoading(true);
    try {
      const [link, qr] = await Promise.all([
        api.get('/appointments/booking-link'),
        api.get('/appointments/booking-qr'),
      ]);
      setBookingUrl(link.data.url);
      setQrCode(qr.data.qr);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Não foi possível gerar o link');
    } finally {
      setLinkLoading(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      toast.success('Link copiado');
    } catch {
      toast.error('Não foi possível copiar');
    }
  }

  async function submitReschedule(event: React.FormEvent) {
    event.preventDefault();
    if (!rescheduling || !rescheduleTime) return;
    try {
      await api.patch(`/appointments/${rescheduling.id}/reschedule`, {
        date: rescheduleDate || rescheduling.date,
        time: rescheduleTime,
      });
      toast.success('Agendamento remarcado');
      setRescheduling(null);
      load(date);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Não foi possível remarcar');
    }
  }

  const isToday = date === todayStr();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold">Agenda</h1>
          <p className="text-sm text-[var(--muted-foreground)] capitalize">{formatDateLong(date)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setDate(shiftDate(date, -1))} aria-label="Dia anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value || todayStr())}
            className="w-40"
          />
          <Button variant="outline" size="icon" onClick={() => setDate(shiftDate(date, 1))} aria-label="Próximo dia">
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isToday && (
            <Button variant="ghost" onClick={() => setDate(todayStr())}>
              Hoje
            </Button>
          )}
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Novo
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <div className="rounded-lg border border-[var(--border)] p-3">
          <div className="text-xs text-[var(--muted-foreground)]">Agendamentos</div>
          <div className="text-xl font-semibold">{summary?.total ?? 0}</div>
        </div>
        <div className="rounded-lg border border-[var(--border)] p-3">
          <div className="text-xs text-[var(--muted-foreground)]">Confirmados</div>
          <div className="text-xl font-semibold">{summary?.confirmed ?? 0}</div>
        </div>
        <div className="rounded-lg border border-[var(--border)] p-3">
          <div className="text-xs text-[var(--muted-foreground)]">Em atendimento</div>
          <div className="text-xl font-semibold">{summary?.checked_in ?? 0}</div>
        </div>
        <div className="rounded-lg border border-[var(--border)] p-3">
          <div className="text-xs text-[var(--muted-foreground)]">Concluídos</div>
          <div className="text-xl font-semibold">{summary?.completed ?? 0}</div>
        </div>
        <div className="rounded-lg border border-[var(--border)] p-3">
          <div className="text-xs text-[var(--muted-foreground)]">Receita prevista</div>
          <div className="text-xl font-semibold">{formatCurrency(summary?.expected_revenue ?? 0)}</div>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-3">
        <div className="flex items-center gap-2 text-sm">
          <Link2 className="h-4 w-4 text-[var(--muted-foreground)]" />
          <span className="text-[var(--muted-foreground)]">Link público de agendamento</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/agendar" target="_blank" className="text-sm underline underline-offset-2">
            Abrir página
          </Link>
          <Button variant="outline" size="sm" onClick={openBookingLink}>
            <QrCode className="h-4 w-4" /> Divulgar
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-[var(--border)] p-10 text-center text-sm text-[var(--muted-foreground)]">
          Carregando agenda...
        </div>
      ) : appointments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] p-12 text-center">
          <CalendarDays className="h-10 w-10 mx-auto mb-3 text-[var(--muted-foreground)]" />
          <p className="font-medium mb-1">Nenhum agendamento neste dia</p>
          <p className="text-sm text-[var(--muted-foreground)] mb-4">
            Crie um horário manualmente ou compartilhe o link público.
          </p>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Novo agendamento
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {appointments.map((appointment) => {
            const meta = STATUS_META[appointment.status] || STATUS_META.scheduled;
            const isActive = ['scheduled', 'confirmed', 'checked-in'].includes(appointment.status);
            const wa = whatsappUrl(appointment.customer_phone);
            return (
              <div
                key={appointment.id}
                className="rounded-lg border border-[var(--border)] p-4 flex flex-col md:flex-row md:items-start gap-4"
              >
                <div className="md:w-28 shrink-0">
                  <div className="text-lg font-semibold">{appointment.start_time.slice(0, 5)}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">
                    até {appointment.end_time.slice(0, 5)} · {durationLabel(appointment.duration_minutes)}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-semibold">{appointment.customer_name}</span>
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', meta.className)}>{meta.label}</span>
                    <span className="text-xs text-[var(--muted-foreground)]">{appointment.appointment_number}</span>
                    {appointment.source === 'online' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide bg-[var(--secondary)]">online</span>
                    )}
                  </div>

                  <div className="text-sm text-[var(--muted-foreground)] mb-2">
                    {appointment.items.map((item) => item.product_name).join(' · ')}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {formatCurrency(appointment.total_price)}
                    </span>
                    {appointment.customer_phone && <span>{displayPhone(appointment.customer_phone)}</span>}
                    {appointment.order && (
                      <span className="inline-flex items-center gap-1">
                        <Ticket className="h-3 w-3" /> {appointment.order.order_number}
                      </span>
                    )}
                    {appointment.notes && <span className="italic">“{appointment.notes}”</span>}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 md:justify-end shrink-0">
                  {['scheduled'].includes(appointment.status) && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus(appointment, 'confirmed')}>
                      <Check className="h-3.5 w-3.5" /> Confirmar
                    </Button>
                  )}
                  {(appointment.status === 'scheduled' || appointment.status === 'confirmed') && (
                    <Button size="sm" onClick={() => checkIn(appointment)}>
                      <Ticket className="h-3.5 w-3.5" /> Check-in
                    </Button>
                  )}
                  {appointment.status === 'checked-in' && (
                    <Button size="sm" onClick={() => updateStatus(appointment, 'completed')}>
                      <Check className="h-3.5 w-3.5" /> Concluir
                    </Button>
                  )}
                  {isActive && (
                    <Button size="sm" variant="outline" onClick={() => {
                      setRescheduling(appointment);
                      setRescheduleDate(appointment.date);
                      setRescheduleTime('');
                    }}>
                      <CalendarClock className="h-3.5 w-3.5" /> Remarcar
                    </Button>
                  )}
                  {isActive && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus(appointment, 'no-show')}>
                      <UserX className="h-3.5 w-3.5" /> Faltou
                    </Button>
                  )}
                  {isActive && (
                    <Button size="sm" variant="ghost" onClick={() => updateStatus(appointment, 'cancelled')}>
                      <CircleSlash className="h-3.5 w-3.5" /> Cancelar
                    </Button>
                  )}
                  {wa && (
                    <Button size="sm" variant="ghost" onClick={() => window.open(wa, '_blank')}>
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Novo agendamento">
        <form onSubmit={createAppointment} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </div>
            <div>
              <Label>WhatsApp</Label>
              <Input
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: formatPhoneInput(event.target.value) })}
                placeholder="(31) 99587-2149"
                required
              />
            </div>
          </div>

          <div>
            <Label>Serviços</Label>
            <div className="max-h-44 overflow-y-auto rounded-md border border-[var(--border)] p-2 space-y-1">
              {services.map((service) => (
                <label key={service.id} className="flex items-start gap-2 text-sm p-1.5 rounded hover:bg-[var(--secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selectedServiceIds.includes(service.id)}
                    onChange={() => toggleService(service.id)}
                  />
                  <span className="flex-1">
                    {service.name}
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {' '}· {service.service_duration_minutes} min · {formatCurrency(service.price)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {selectedServices.length > 0 && (
              <p className="text-xs text-[var(--muted-foreground)] mt-1">
                {selectedServices.length} serviço(s) · {durationLabel(formDuration)} · {formatCurrency(formTotal)}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
                required
              />
            </div>
            <div>
              <Label>Horário</Label>
              <Select
                value={form.time}
                onChange={(event) => setForm({ ...form, time: event.target.value })}
                disabled={form.force || slotsLoading}
              >
                <option value="">{slotsLoading ? 'Carregando...' : 'Escolha'}</option>
                {slots.map((slot) => (
                  <option key={slot.id} value={slot.time} disabled={!slot.available}>
                    {slot.time}{slot.available ? '' : ' — indisponível'}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.force}
              onChange={(event) => setForm({ ...form, force: event.target.checked })}
            />
            Ignorar disponibilidade (encaixe)
          </label>

          {form.force && (
            <div>
              <Label>Horário do encaixe</Label>
              <Input type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} required />
            </div>
          )}

          <div>
            <Label>Observações</Label>
            <Input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </div>

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Salvando...' : 'Criar agendamento'}
          </Button>
        </form>
      </Modal>

      <Modal open={Boolean(rescheduling)} onClose={() => setRescheduling(null)} title="Remarcar agendamento">
        {rescheduling && (
          <form onSubmit={submitReschedule} className="space-y-3">
            <p className="text-sm text-[var(--muted-foreground)]">
              {rescheduling.customer_name} · {rescheduling.items.map((item) => item.product_name).join(' · ')}
            </p>
            <div>
              <Label>Nova data</Label>
              <Input
                type="date"
                value={rescheduleDate}
                onChange={(event) => setRescheduleDate(event.target.value)}
                required
              />
            </div>
            <div>
              <Label>Novo horário</Label>
              <div className="grid grid-cols-4 gap-2">
                {rescheduleSlots.length === 0 && (
                  <p className="col-span-4 text-sm text-[var(--muted-foreground)]">Sem horários disponíveis.</p>
                )}
                {rescheduleSlots.map((slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    disabled={!slot.available}
                    onClick={() => setRescheduleTime(slot.time)}
                    className={cn(
                      'rounded-md border px-2 py-2 text-sm transition-colors',
                      !slot.available
                        ? 'border-[var(--border)] text-[var(--muted-foreground)] line-through cursor-not-allowed'
                        : rescheduleTime === slot.time
                          ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]'
                          : 'border-[var(--border)] hover:bg-[var(--secondary)]'
                    )}
                  >
                    {slot.time}
                  </button>
                ))}
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={!rescheduleTime}>
              Salvar novo horário
            </Button>
          </form>
        )}
      </Modal>

      <Modal open={linkOpen} onClose={() => setLinkOpen(false)} title="Divulgar agendamento online">
        {linkLoading ? (
          <p className="text-sm text-[var(--muted-foreground)]">Gerando...</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-[var(--muted-foreground)]">
              Compartilhe este link com suas clientes ou imprima o QR Code para a recepção.
            </p>
            <div className="flex items-center gap-2">
              <Input readOnly value={bookingUrl} />
              <Button variant="outline" size="icon" onClick={copyLink} aria-label="Copiar link">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            {qrCode && (
              <div className="flex justify-center">
                <img src={qrCode} alt="QR Code do agendamento" className="w-56 h-56 rounded-lg border border-[var(--border)]" />
              </div>
            )}
            <div className="flex justify-center">
              <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline underline-offset-2">
                Abrir página de agendamento
              </a>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
