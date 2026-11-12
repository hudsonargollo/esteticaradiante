'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import publicApi from '@/lib/public-api';
import type {
  BookingConfig,
  BookingService,
  ClientProfile,
  PublicAppointment,
  TimeSlot,
} from '@/lib/booking-types';
import {
  brl,
  durationLabel,
  formatDateLong,
  formatPhoneInput,
  getUpcomingDates,
} from '@/lib/booking-utils';
import { ServiceCard } from '@/components/booking/service-card';
import { HighlightCard } from '@/components/booking/highlight-card';
import { SmartCart } from '@/components/booking/smart-cart';
import { LoyaltyCard } from '@/components/booking/loyalty-card';

type Step = 'services' | 'calendar' | 'identify' | 'success';

const ABOUT_PHOTOS = [
  '/er/about-1.jpg',
  '/er/about-2.jpg',
  '/er/about-3.jpg',
  '/er/about-4.jpg',
];

const HIGHLIGHT_IMAGES: Record<string, string> = {
  'er-prod-01': '/er/highlight-lipo.jpg',
  'er-prod-02': '/er/about-2.jpg',
  'er-prod-03': '/er/highlight-bambu.jpg',
  'er-prod-04': '/er/highlight-pump.jpg',
};

const FALLBACK_WHATSAPP = '5531995872149';
const FALLBACK_INSTAGRAM = 'clinicaeliscarvalho';

export default function BookingPage() {
  const [config, setConfig] = useState<BookingConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState('');

  const [isDarkMode, setIsDarkMode] = useState(true);
  const [step, setStep] = useState<Step>('services');
  const [cart, setCart] = useState<BookingService[]>([]);
  const [selectedDateIdx, setSelectedDateIdx] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [customerLookupDone, setCustomerLookupDone] = useState(false);

  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [lastAppointment, setLastAppointment] = useState<PublicAppointment | null>(null);
  const [rewardUnlocked, setRewardUnlocked] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const servicesRef = useRef<HTMLDivElement>(null);

  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigError('');
    try {
      const { data } = await publicApi.get<BookingConfig>('/public/booking/config');
      setConfig(data);
    } catch {
      setConfigError('Não foi possível carregar os serviços. Verifique sua conexão e tente novamente.');
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    const stored = localStorage.getItem('er_booking_theme');
    if (stored === 'light') setIsDarkMode(false);
  }, []);

  useEffect(() => {
    localStorage.setItem('er_booking_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const openDays = config?.booking.openDays ?? [1, 2, 3, 4, 5, 6];
  const upcomingDates = useMemo(() => getUpcomingDates(5, openDays), [config?.booking.openDays]);
  const selectedDate = upcomingDates[selectedDateIdx]?.value ?? '';

  const cartDuration = cart.reduce((sum, service) => sum + service.duration, 0);
  const cartTotal = cart.reduce((sum, service) => sum + service.price, 0);

  const loadSlots = useCallback(async (date: string, duration: number) => {
    setSlotsLoading(true);
    setSelectedSlot(null);
    try {
      const { data } = await publicApi.get('/public/booking/slots', {
        params: { date, duration: Math.max(30, duration) },
      });
      setSlots(data.slots || []);
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (step === 'calendar' && selectedDate) {
      loadSlots(selectedDate, cartDuration);
    }
  }, [step, selectedDate, cartDuration, loadSlots]);

  useEffect(() => {
    if (cart.length === 0 && step !== 'services' && step !== 'success') {
      setStep('services');
    }
  }, [cart, step]);

  useEffect(() => {
    if (!config) return;
    const t1 = setTimeout(() => scrollContainerRef.current?.scrollTo({ left: 0 }), 100);
    const t2 = setTimeout(() => scrollContainerRef.current?.scrollBy({ left: 300, behavior: 'smooth' }), 1500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [config]);

  useEffect(() => {
    const digits = customerPhone.replace(/\D/g, '');
    if (digits.length < 11) {
      setClientProfile(null);
      setCustomerLookupDone(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const { data } = await publicApi.get('/public/booking/client', { params: { phone: digits } });
        if (data.found) {
          setClientProfile(data.customer);
          setCustomerName((current) => current || data.customer.name);
        } else {
          setClientProfile(null);
        }
      } catch {
        setClientProfile(null);
      } finally {
        setCustomerLookupDone(true);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [customerPhone]);

  const toggleService = (service: BookingService) => {
    setCart((prev) => (
      prev.some((item) => item.id === service.id)
        ? prev.filter((item) => item.id !== service.id)
        : [...prev, service]
    ));
  };

  const initiateBooking = () => {
    if (!selectedSlot) return;
    setBookingError('');
    setStep('identify');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const completeBooking = async () => {
    const digits = customerPhone.replace(/\D/g, '');
    if (!customerName.trim() || digits.length < 10 || !selectedSlot || !selectedDate) return;

    setBookingLoading(true);
    setBookingError('');

    try {
      const { data } = await publicApi.post('/public/booking/appointments', {
        name: customerName.trim(),
        phone: digits,
        date: selectedDate,
        time: selectedSlot.time,
        services: cart.map((service) => service.id),
      });

      setLastAppointment(data.appointment);
      const threshold = config?.loyalty.threshold ?? 10;
      const nextVisits = (clientProfile?.visits ?? 0) + 1;
      if (config?.loyalty.enabled && nextVisits % threshold === 0) setRewardUnlocked(true);
      setStep('success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error: any) {
      setBookingError(error?.response?.data?.error || 'Não foi possível concluir o agendamento. Tente novamente.');
    } finally {
      setBookingLoading(false);
    }
  };

  const resetBooking = () => {
    setCart([]);
    setSelectedSlot(null);
    setBookingError('');
    setLastAppointment(null);
    setRewardUnlocked(false);
    setStep('services');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const business = config?.business;
  const whatsappNumber = business?.whatsapp || FALLBACK_WHATSAPP;
  const whatsappUrl = `https://wa.me/${whatsappNumber}`;
  const instagramUrl = `https://instagram.com/${business?.instagram || FALLBACK_INSTAGRAM}`;
  const stylistName = config?.booking.stylist.name || 'Elis Carvalho';
  const phoneDigits = customerPhone.replace(/\D/g, '');

  const highlights = config?.services.filter((service) => service.category === 'Destaques') ?? [];
  const categories = Array.from(
    new Set(config?.services.map((service) => service.category) ?? [])
  ).filter((category) => category !== 'Destaques');

  const themeToggle = (
    <button
      onClick={() => setIsDarkMode(!isDarkMode)}
      className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:opacity-80"
      style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
      aria-label="Alternar tema"
    >
      {isDarkMode ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );

  if (configLoading) {
    return (
      <div className="booking-root" data-theme={isDarkMode ? 'dark' : 'light'}>
        <div className="booking-frame flex flex-col items-center justify-center p-6 text-center">
          <div className="w-24 h-24 mb-6 animate-pulse-soft">
            <img src="/er/logo-radiante.svg" alt="Estética Radiante" className="w-full h-full" />
          </div>
          <p className="text-sm tracking-widest uppercase" style={{ color: 'var(--text-secondary)' }}>Carregando</p>
        </div>
      </div>
    );
  }

  if (configError || !config) {
    return (
      <div className="booking-root" data-theme={isDarkMode ? 'dark' : 'light'}>
        <div className="booking-frame flex flex-col items-center justify-center p-8 text-center">
          <div className="w-20 h-20 mb-6">
            <img src="/er/logo-radiante.svg" alt="Estética Radiante" className="w-full h-full" />
          </div>
          <h1 className="font-display text-3xl font-light mb-3" style={{ color: 'var(--text-primary)' }}>Estética Radiante</h1>
          <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--text-secondary)' }}>{configError || 'Serviços indisponíveis no momento.'}</p>
          <button onClick={loadConfig} className="btn-brand px-8 py-3 rounded-full text-xs font-medium tracking-widest uppercase" style={{ position: 'relative', right: 'auto' }}>
            Tentar novamente
          </button>
          <a
            href={`https://wa.me/${FALLBACK_WHATSAPP}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 text-xs underline underline-offset-4"
            style={{ color: 'var(--text-secondary)' }}
          >
            Falar no WhatsApp
          </a>
        </div>
      </div>
    );
  }

  if (!config.booking.enabled) {
    return (
      <div className="booking-root" data-theme={isDarkMode ? 'dark' : 'light'}>
        <div className="booking-frame flex flex-col items-center justify-center p-8 text-center">
          <div className="w-24 h-24 mb-6">
            <img src="/er/logo-radiante.svg" alt="Estética Radiante" className="w-full h-full" />
          </div>
          <h1 className="font-display text-3xl font-light mb-3" style={{ color: 'var(--text-primary)' }}>Estética Radiante</h1>
          <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--text-secondary)' }}>
            Os agendamentos online estão pausados no momento. Fale com a gente pelo WhatsApp para reservar seu horário.
          </p>
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-brand px-8 py-3 rounded-full text-xs font-medium tracking-widest uppercase">
            Falar no WhatsApp
          </a>
        </div>
      </div>
    );
  }

  // ── Success ────────────────────────────────────────────────────────────
  if (step === 'success') {
    const appointmentDate = lastAppointment?.date || selectedDate;
    return (
      <div className="booking-root" data-theme={isDarkMode ? 'dark' : 'light'}>
        <div className="booking-frame flex flex-col items-center justify-center p-6 text-center animate-fade-in">
          <div className="mb-8">
            <img src="/er/logo-radiante.svg" alt="Estética Radiante" className="w-24 h-24 mx-auto opacity-90" />
          </div>

          <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{ backgroundColor: 'rgba(212,175,55,0.12)', border: '1.5px solid var(--brand-gold)' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--brand-gold)' }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h1 className="font-display text-4xl font-light mb-2" style={{ color: 'var(--text-primary)' }}>Agendado!</h1>
          <p className="text-sm mb-1 max-w-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Olá <strong style={{ color: 'var(--text-primary)' }}>{customerName.split(' ')[0]}</strong>! Seu horário foi confirmado para{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{formatDateLong(appointmentDate)}</strong> às{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{lastAppointment?.start_time || selectedSlot?.time}</strong>.
          </p>
          <p className="text-xs mb-8" style={{ color: 'var(--text-disabled)' }}>
            Com: <span style={{ color: 'var(--text-secondary)' }}>{stylistName}</span>
            {lastAppointment?.appointment_number ? ` · ${lastAppointment.appointment_number}` : ''}
          </p>

          {rewardUnlocked && (
            <div className="w-full max-w-xs rounded-2xl p-4 mb-8" style={{ backgroundColor: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.4)' }}>
              <h3 className="font-display text-xl font-medium mb-1 flex items-center justify-center gap-2" style={{ color: 'var(--brand-gold)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" />
                  <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                  <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                  <path d="M18 2h-4a4 4 0 0 0-4 4v9h12V6a4 4 0 0 0-4-4Z" />
                </svg>
                Recompensa desbloqueada!
              </h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Você completou {clientProfile?.visits ?? 0} visitas! Seu benefício de <strong>{config.loyalty.rewardDescription}</strong> já está liberado.
              </p>
            </div>
          )}

          <button onClick={resetBooking} className="btn-brand px-10 py-3 rounded-full text-sm font-medium tracking-widest uppercase transition-all hover:opacity-90 active:scale-95">
            Novo agendamento
          </button>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 text-xs underline underline-offset-4"
            style={{ color: 'var(--text-secondary)' }}
          >
            Precisa remarcar? Fale no WhatsApp
          </a>
        </div>
      </div>
    );
  }

  // ── Identify ───────────────────────────────────────────────────────────
  if (step === 'identify') {
    return (
      <div className="booking-root" data-theme={isDarkMode ? 'dark' : 'light'}>
        <div className="booking-frame flex flex-col transition-colors duration-300">
          <div className="sticky top-0 backdrop-blur-md z-10 p-4 flex items-center gap-4" style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)', boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
            <button onClick={() => setStep('calendar')} className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:opacity-80" style={{ backgroundColor: 'var(--bg-surface-hover)', border: '1px solid var(--border-subtle)' }} aria-label="Voltar">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-primary)' }}>
                <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
              </svg>
            </button>
            <h2 className="font-display text-xl font-light tracking-wide" style={{ color: 'var(--text-primary)' }}>Identificação</h2>
          </div>

          <div className="p-6 flex-1 flex flex-col max-w-sm mx-auto w-full">
            <div className="mb-8 mt-4 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.25)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--brand-gold)' }}>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <h2 className="font-display text-3xl font-light mb-2" style={{ color: 'var(--text-primary)' }}>Quem é você?</h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Precisamos do seu WhatsApp para confirmar o horário e registrar suas visitas no programa de fidelidade.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="booking-name" className="block text-xs font-medium uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>Seu nome</label>
                <input
                  id="booking-name"
                  type="text"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Ex: Maria Silva"
                  className="w-full px-4 py-3.5 rounded-xl text-sm transition-all"
                  style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label htmlFor="booking-phone" className="block text-xs font-medium uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>WhatsApp</label>
                <div className="relative">
                  <input
                    id="booking-phone"
                    type="tel"
                    inputMode="numeric"
                    value={customerPhone}
                    onChange={(event) => setCustomerPhone(formatPhoneInput(event.target.value))}
                    placeholder="(31) 99587-2149"
                    className="w-full px-4 py-3.5 rounded-xl text-sm transition-all"
                    style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-disabled)' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </div>
                </div>
                {clientProfile && (
                  <p className="text-xs mt-2 px-1" style={{ color: 'var(--accent-line)' }}>
                    Olá de volta, {clientProfile.name}! Você tem {clientProfile.visits} {clientProfile.visits === 1 ? 'visita' : 'visitas'}.
                  </p>
                )}
                {!clientProfile && customerLookupDone && phoneDigits.length === 11 && (
                  <p className="text-xs mt-2 px-1" style={{ color: 'var(--text-secondary)' }}>
                    Primeira vez por aqui? Seja muito bem-vinda!
                  </p>
                )}
              </div>
            </div>

            <div className="mt-8">
              <button
                onClick={completeBooking}
                disabled={!customerName.trim() || phoneDigits.length < 10 || bookingLoading}
                className="w-full btn-brand font-medium text-sm py-4 rounded-xl tracking-widest uppercase transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {bookingLoading ? 'Agendando...' : 'Confirmar agendamento'}
              </button>
              {bookingError && (
                <p className="text-center text-xs mt-3" style={{ color: '#ef4444' }}>{bookingError}</p>
              )}
              <p className="text-center text-xs mt-4" style={{ color: 'var(--text-disabled)' }}>
                Ao continuar, você concorda em receber mensagens sobre o seu agendamento.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Calendar ───────────────────────────────────────────────────────────
  if (step === 'calendar') {
    return (
      <div className="booking-root" data-theme={isDarkMode ? 'dark' : 'light'}>
        <div className="booking-frame min-h-screen pb-32 transition-colors duration-300">
          <div className="sticky top-0 backdrop-blur-md z-10 p-4 flex items-center gap-4" style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)', boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
            <button onClick={() => setStep('services')} className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:opacity-80" style={{ backgroundColor: 'var(--bg-surface-hover)', border: '1px solid var(--border-subtle)' }} aria-label="Voltar">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-primary)' }}>
                <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
              </svg>
            </button>
            <h2 className="font-display text-xl font-light tracking-wide" style={{ color: 'var(--text-primary)' }}>Escolha o horário</h2>
          </div>

          <div className="p-4">
            <div className="mb-6">
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                {upcomingDates.map((date, index) => (
                  <button
                    key={date.value}
                    onClick={() => setSelectedDateIdx(index)}
                    className="px-5 py-2 rounded-full whitespace-nowrap text-xs font-medium tracking-widest uppercase transition-all"
                    style={index === selectedDateIdx
                      ? { backgroundColor: 'var(--slot-selected-bg)', color: 'var(--slot-selected-text)' }
                      : { backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
                  >
                    {date.label}
                  </button>
                ))}
              </div>
            </div>

            {slotsLoading ? (
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 12 }).map((_, index) => (
                  <div key={index} className="py-4 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--bg-surface)' }} />
                ))}
              </div>
            ) : slots.length === 0 ? (
              <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Sem horários disponíveis nesse dia.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {slots.map((slot) => (
                  <button
                    key={slot.id}
                    disabled={!slot.available}
                    onClick={() => setSelectedSlot(slot)}
                    className={`py-4 rounded-lg text-center text-sm font-medium transition-all ${
                      !slot.available ? 'slot-disabled' : selectedSlot?.id === slot.id ? 'slot-selected scale-105 shadow-lg' : 'slot-available hover:scale-[1.02]'
                    }`}
                  >
                    {slot.time}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-8 rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <div className="px-4 py-3 flex justify-between items-center" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Resumo</span>
                <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>{cart.length} {cart.length === 1 ? 'serviço' : 'serviços'}</span>
              </div>

              <div className="p-4 space-y-3">
                {cart.map((item) => (
                  <div key={item.id} className="flex justify-between items-start">
                    <div className="flex-1 pr-4">
                      <div className="text-sm font-medium leading-tight mb-0.5" style={{ color: 'var(--text-primary)' }}>{item.name}</div>
                      <div className="text-xs" style={{ color: 'var(--text-disabled)' }}>{item.duration} min</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{brl(item.price)}</span>
                      <button onClick={() => toggleService(item)} className="p-1 rounded-full transition-colors hover:opacity-70" style={{ color: 'var(--text-disabled)' }} aria-label="Remover item">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="h-px mx-4" style={{ backgroundColor: 'var(--border-subtle)' }} />

              <div className="p-4">
                <div className="flex justify-between items-center mb-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span>Profissional</span>
                  <span style={{ color: 'var(--text-primary)' }}>{stylistName}</span>
                </div>
                <div className="flex justify-between items-center mb-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span>Duração total</span>
                  <span style={{ color: 'var(--text-primary)' }}>{durationLabel(cartDuration)}</span>
                </div>
                <div className="flex justify-between items-center pt-3 font-display text-xl" style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
                  <span>Total</span>
                  <span>{brl(cartTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          {selectedSlot && (
            <SmartCart
              cart={cart}
              onContinue={initiateBooking}
              onRemoveItem={toggleService}
              label={`Agendar às ${selectedSlot.time}`}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Services (main) ────────────────────────────────────────────────────
  return (
    <div className="booking-root" data-theme={isDarkMode ? 'dark' : 'light'}>
      <div className="booking-frame min-h-screen pb-32 transition-colors duration-300">
        <div className="absolute top-3 right-3 z-50 flex items-center gap-2">
          {themeToggle}
          <Link
            href="/auth/login"
            className="h-8 px-3 rounded-full flex items-center transition-all hover:opacity-80 text-[10px] font-medium uppercase tracking-widest"
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            Equipe
          </Link>
        </div>

        <div className="flex flex-col items-center text-center pt-14 pb-6 px-6">
          <div
            className="w-56 h-56 rounded-full mb-5 flex items-center justify-center"
            style={{
              backgroundColor: isDarkMode ? '#120a18' : '#f1e6ed',
              border: isDarkMode ? '1px solid rgba(212,175,55,0.28)' : '1.5px solid rgba(59,31,74,0.12)',
              boxShadow: isDarkMode ? '0 0 50px rgba(124,77,140,0.35)' : '0 6px 32px rgba(59,31,74,0.16)',
              backgroundImage: 'radial-gradient(circle at 50% 42%, rgba(212,175,55,0.16), transparent 62%)',
            }}
          >
            <img src="/er/logo-radiante.svg" alt="Estética Radiante" className="w-36 h-36 object-contain" />
          </div>

          <h1 className="font-display text-4xl font-light tracking-wide mb-1" style={{ color: 'var(--text-primary)' }}>
            Estética Radiante
          </h1>
          <p className="font-display text-lg italic font-light mb-1" style={{ color: 'var(--text-secondary)' }}>
            Elis Carvalho
          </p>
          <p className="text-xs tracking-widest uppercase mb-6" style={{ color: 'var(--text-disabled)' }}>
            Estética &amp; Bem-estar · Minas Gerais
          </p>

          <div className="flex gap-3">
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium tracking-wide transition-all hover:opacity-80"
              style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
              Instagram
            </a>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium tracking-wide transition-all hover:opacity-80"
              style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#25D366' }}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              WhatsApp
            </a>
          </div>
        </div>

        <div className="mx-4 mb-6 rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <div className="grid grid-cols-2" style={{ gap: '2px', backgroundColor: 'var(--border-subtle)' }}>
            {ABOUT_PHOTOS.map((src, index) => (
              <div key={src} style={{ height: '160px', overflow: 'hidden', backgroundColor: 'var(--bg-surface-hover)' }}>
                <img src={src} alt={`Estética Radiante ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 25%', display: 'block' }} />
              </div>
            ))}
          </div>

          <div className="px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-disabled)' }}>Quem sou eu</p>
            <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--text-secondary)' }}>
              Um espaço dedicado a cuidar de você por inteiro. Na <strong style={{ color: 'var(--text-primary)' }}>Estética Radiante</strong>, cada protocolo é pensado para o seu corpo, a sua pele e o seu bem-estar — com atendimento próximo, técnicas atuais e muito cuidado em cada detalhe.
            </p>

            <div className="divider mb-4" />

            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-disabled)' }}>Atendimento</p>
            <div className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <div className="flex items-start gap-2.5">
                <span style={{ color: 'var(--accent-line)', flexShrink: 0 }}>·</span>
                <span>Procedimentos de <strong style={{ color: 'var(--text-primary)' }}>30 min a 1h30</strong></span>
              </div>
              <div className="flex items-start gap-2.5">
                <span style={{ color: 'var(--accent-line)', flexShrink: 0 }}>·</span>
                <span>Atendimento no <strong style={{ color: 'var(--text-primary)' }}>estúdio</strong> — Minas Gerais</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span style={{ color: 'var(--accent-line)', flexShrink: 0 }}>·</span>
                <span>Pagamento: <strong style={{ color: 'var(--text-primary)' }}>Pix</strong>, dinheiro ou <strong style={{ color: 'var(--text-primary)' }}>cartão</strong></span>
              </div>
            </div>
          </div>
        </div>

        <LoyaltyCard
          visits={clientProfile?.progressInCycle ?? 0}
          totalVisits={clientProfile?.visits}
          config={config.loyalty}
        />

        <div className="mx-4 mb-8 rounded-2xl overflow-hidden relative" style={{ height: '200px' }}>
          <img src="/er/cta.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: 'center 20%' }} aria-hidden="true" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(14,8,18,0.92) 42%, rgba(14,8,18,0.15) 100%)' }} />
          <div className="relative z-10 h-full flex flex-col items-start justify-end p-6">
            <p className="font-display text-3xl font-light leading-tight mb-1" style={{ color: '#fff' }}>
              Pronta para se<br />sentir incrível?
            </p>
            <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.62)' }}>
              Escolha um serviço e agende com a Elis.
            </p>
            <button
              onClick={() => servicesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold tracking-widest uppercase transition-all hover:opacity-90 active:scale-95"
              style={{ backgroundColor: '#fff', color: '#0e0812' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Agendar agora
            </button>
          </div>
        </div>

        {highlights.length > 0 && (
          <div className="mb-8 overflow-hidden">
            <div className="flex items-center gap-3 mb-3 px-6">
              <div className="w-px h-4" style={{ backgroundColor: 'var(--accent-line)' }} />
              <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-primary)' }}>Serviços em destaque</h2>
            </div>
            <div ref={scrollContainerRef} className="flex overflow-x-auto gap-4 px-6 pb-6 pt-1 no-scrollbar snap-x scroll-smooth">
              {highlights.map((service, index) => (
                <HighlightCard
                  key={service.id}
                  service={service}
                  imageUrl={HIGHLIGHT_IMAGES[service.id] || ABOUT_PHOTOS[index % ABOUT_PHOTOS.length]}
                  isSelected={cart.some((item) => item.id === service.id)}
                  onToggle={toggleService}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={servicesRef}>
          {categories.map((category) => {
            const categoryServices = config.services.filter((service) => service.category === category);
            if (categoryServices.length === 0) return null;
            const meta = config.categories.find((item) => item.name === category);
            return (
              <div key={category} className="px-4 mb-8">
                <div className="flex items-center gap-3 mb-3 pl-1">
                  <div className="w-px h-4" style={{ backgroundColor: meta?.color || 'var(--accent-line)' }} />
                  <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-primary)' }}>
                    {meta?.icon ? `${meta.icon} ` : ''}{category}
                  </h2>
                </div>
                {categoryServices.map((service) => (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    isSelected={cart.some((item) => item.id === service.id)}
                    onToggle={toggleService}
                  />
                ))}
              </div>
            );
          })}
        </div>

        <div className="px-6 pb-14 text-center">
          <div className="divider mb-5" />
          <p className="font-display text-xl font-light mb-1" style={{ color: 'var(--text-primary)' }}>Estética Radiante</p>
          <p className="text-[10px] uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--text-disabled)' }}>Elis Carvalho</p>
          <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>
            {business?.phone || '(31) 99587-2149'} · @{business?.instagram || FALLBACK_INSTAGRAM}
          </p>
        </div>

        <SmartCart
          cart={cart}
          onContinue={() => {
            setStep('calendar');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onRemoveItem={toggleService}
          label="Agendar agora"
        />

        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`fixed right-4 z-20 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all hover:opacity-90 ${cart.length > 0 ? 'bottom-28' : 'bottom-6'}`}
          style={{ backgroundColor: '#25D366', color: '#fff' }}
          aria-label="Falar no WhatsApp"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.148-.669-1.611-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
            <path d="M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.892c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652c1.746.943 3.71 1.444 5.71 1.445h.006c6.585 0 11.946-5.336 11.949-11.896 0-3.176-1.24-6.165-3.495-8.411zm-8.475 18.29h-.005c-1.78 0-3.526-.477-5.052-1.379l-.363-.214-3.756.98.999-3.648-.236-.375a9.86 9.86 0 0 1-1.516-5.26c.002-5.45 4.458-9.886 9.936-9.886 2.653 0 5.147 1.029 7.023 2.899a9.82 9.82 0 0 1 2.909 6.994c-.003 5.45-4.459 9.889-9.939 9.889z" />
          </svg>
        </a>
      </div>
    </div>
  );
}
