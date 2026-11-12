'use client';

import type { BookingLoyalty } from '@/lib/booking-types';

interface LoyaltyCardProps {
  visits: number;
  totalVisits?: number;
  config: BookingLoyalty;
}

export function LoyaltyCard({ visits, totalVisits, config }: LoyaltyCardProps) {
  if (!config.enabled) return null;

  const currentProgress = visits % config.threshold;
  const remaining = config.threshold - currentProgress;
  const stamps = Array.from({ length: config.threshold }, (_, i) => i + 1);
  const isRewardReady = currentProgress === 0 && (totalVisits ?? visits) > 0;

  return (
    <div
      className="mx-4 mb-6 relative overflow-hidden rounded-2xl"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
      }}
    >
      <div className="p-4">
        <div className="flex justify-between items-center mb-3 gap-3">
          <div>
            <h3 className="font-display text-base font-medium tracking-wide flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--accent-line)' }}>
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              Fidelidade
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {isRewardReady
                ? 'Sua recompensa está liberada!'
                : `Faltam ${remaining} ${remaining === 1 ? 'visita' : 'visitas'} para ganhar`}
            </p>
          </div>
          <div
            className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
            style={{ backgroundColor: 'var(--bg-surface-hover)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
          >
            {totalVisits !== undefined && totalVisits > 0 ? `${totalVisits} visitas` : 'Novo por aqui'}
          </div>
        </div>

        <div className="flex justify-between items-center gap-1 mt-2">
          {stamps.map((num) => {
            const isFilled = num <= currentProgress || isRewardReady;
            return (
              <div
                key={num}
                className="h-1.5 flex-1 rounded-full transition-all duration-500"
                style={{ backgroundColor: isFilled ? 'var(--accent-line)' : 'var(--border-subtle)' }}
              />
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-line)' }}>
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
            <path d="M18 2h-4a4 4 0 0 0-4 4v9h12V6a4 4 0 0 0-4-4Z" />
          </svg>
          <span>A cada {config.threshold} visitas: <strong style={{ color: 'var(--text-primary)' }}>{config.rewardDescription}</strong></span>
        </div>
      </div>
    </div>
  );
}
