export function brl(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function durationLabel(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}min`;
  if (hours > 0) return `${hours}h`;
  return `${mins} min`;
}

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface UpcomingDate {
  value: string;
  label: string;
}

export function getUpcomingDates(count: number, openDays: number[]): UpcomingDate[] {
  const dates: UpcomingDate[] = [];
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const weekdayShort = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });

  for (let offset = 0; offset < 60 && dates.length < count; offset++) {
    const day = new Date(today);
    day.setDate(today.getDate() + offset);
    if (openDays.length > 0 && !openDays.includes(day.getDay())) continue;

    let label: string;
    if (offset === 0) label = 'Hoje';
    else if (offset === 1) label = 'Amanhã';
    else {
      const wd = weekdayShort.format(day).replace('.', '');
      label = `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${day.getDate()}`;
    }
    dates.push({ value: toDateStr(day), label });
  }

  return dates;
}

export function formatDateLong(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(`${dateStr}T12:00:00`);
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(date);
}

export function formatShortDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(`${dateStr}T12:00:00`);
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(date).replace('.', '');
}

export function formatPhoneInput(raw: string): string {
  let value = raw.replace(/\D/g, '').slice(0, 11);
  if (value.length > 2) value = `(${value.slice(0, 2)}) ${value.slice(2)}`;
  if (value.length > 9) value = `${value.slice(0, 10)}-${value.slice(10)}`;
  return value;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function addDaysStr(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toDateStr(date);
}
