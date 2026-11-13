import type { Metadata, Viewport } from 'next';
import './booking.css';

export const metadata: Metadata = {
  title: 'Estética Radiante · Agendamento',
  description: 'Agende seu horário na Estética Radiante com Elis Carvalho. Tratamentos corporais, faciais, depilação e bem-estar.',
};

export const viewport: Viewport = {
  themeColor: '#0e0812',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function BookingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}