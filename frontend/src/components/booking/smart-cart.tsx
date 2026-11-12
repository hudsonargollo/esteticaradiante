'use client';

import { useState } from 'react';
import type { BookingService } from '@/lib/booking-types';
import { brl, durationLabel } from '@/lib/booking-utils';

interface SmartCartProps {
  cart: BookingService[];
  onContinue: () => void;
  onRemoveItem?: (service: BookingService) => void;
  label?: string;
}

export function SmartCart({ cart, onContinue, onRemoveItem, label = 'Continuar' }: SmartCartProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (cart.length === 0) return null;

  const totalDuration = cart.reduce((acc, curr) => acc + curr.duration, 0);
  const totalPrice = cart.reduce((acc, curr) => acc + curr.price, 0);
  const count = cart.length;

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 animate-fade-in"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setIsOpen(false)}
        >
          <div
            className="absolute bottom-28 left-4 right-4 max-w-md mx-auto rounded-2xl p-4 shadow-2xl animate-fade-in-up"
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3 pb-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <h3 className="font-display text-base font-light tracking-wide" style={{ color: 'var(--text-primary)' }}>Seus serviços</h3>
              <button onClick={() => setIsOpen(false)} style={{ color: 'var(--text-disabled)' }} className="hover:opacity-70 p-1" aria-label="Fechar">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="space-y-3 max-h-[50vh] overflow-y-auto no-scrollbar">
              {cart.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between items-center p-3 rounded-xl"
                  style={{ backgroundColor: 'var(--bg-surface-hover)', border: '1px solid var(--border-subtle)' }}
                >
                  <div className="flex-1 pr-4">
                    <div className="text-sm font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>{item.name}</div>
                    <div className="text-xs" style={{ color: 'var(--text-disabled)' }}>{item.duration} min</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{brl(item.price)}</span>
                    {onRemoveItem && (
                      <button
                        onClick={() => onRemoveItem(item)}
                        className="p-1 rounded-full transition-colors hover:opacity-70"
                        style={{ color: 'var(--text-disabled)' }}
                        aria-label="Remover"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 flex justify-between items-center font-display text-xl" style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
              <span>Total</span>
              <span>{brl(totalPrice)}</span>
            </div>
          </div>
        </div>
      )}

      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-30 p-4"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-subtle)',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.18)',
        }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 px-4 py-3 rounded-xl transition-all hover:opacity-80"
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
            aria-label="Ver serviços selecionados"
          >
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-app)' }}
            >
              {count}
            </div>
            <div className="text-left">
              <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{brl(totalPrice)}</div>
              <div className="text-[10px]" style={{ color: 'var(--text-disabled)' }}>{durationLabel(totalDuration)}</div>
            </div>
          </button>

          <button
            onClick={onContinue}
            className="flex-1 btn-brand py-3 rounded-xl text-sm font-medium tracking-widest uppercase transition-all hover:opacity-90 active:scale-[0.98]"
          >
            {label}
          </button>
        </div>
      </div>
    </>
  );
}
