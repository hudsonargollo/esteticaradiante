'use client';

import type { BookingService } from '@/lib/booking-types';
import { brl } from '@/lib/booking-utils';

interface HighlightCardProps {
  service: BookingService;
  imageUrl?: string;
  isSelected: boolean;
  onToggle: (service: BookingService) => void;
}

export function HighlightCard({ service, imageUrl, isSelected, onToggle }: HighlightCardProps) {
  return (
    <div
      className="relative flex-none w-[220px] rounded-2xl snap-center cursor-pointer transition-all duration-300 flex flex-col overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: isSelected ? '1.5px solid var(--text-primary)' : '1px solid var(--border-subtle)',
        boxShadow: isSelected ? '0 2px 16px rgba(0,0,0,0.1)' : '0 1px 4px rgba(0,0,0,0.04)',
      }}
      onClick={() => onToggle(service)}
    >
      {imageUrl && (
        <div className="w-full h-36 overflow-hidden flex-shrink-0" style={{ backgroundColor: 'var(--bg-surface-hover)' }}>
          <img src={imageUrl} alt={service.name} className="w-full h-full object-cover" style={{ objectPosition: 'center 30%' }} />
        </div>
      )}

      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-display text-xl font-light leading-tight mb-2" style={{ color: 'var(--text-primary)' }}>
          {service.name}
        </h3>

        <p className="text-xs leading-relaxed flex-1 mb-4 line-clamp-3" style={{ color: 'var(--text-secondary)' }}>
          {service.description}
        </p>

        <div className="pt-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div>
            <div className="font-display text-lg font-light" style={{ color: 'var(--text-primary)' }}>{brl(service.price)}</div>
            <div className="flex items-center gap-1 text-xs mt-0.5" style={{ color: 'var(--text-disabled)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {service.duration} min
            </div>
          </div>

          <button
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300"
            style={isSelected
              ? { backgroundColor: 'var(--text-primary)', color: 'var(--bg-app)', transform: 'scale(1.05)' }
              : { backgroundColor: 'var(--bg-surface-hover)', color: 'var(--text-disabled)', border: '1px solid var(--border-subtle)' }}
            onClick={(event) => { event.stopPropagation(); onToggle(service); }}
            aria-label={isSelected ? 'Remover' : 'Adicionar'}
          >
            {isSelected ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
