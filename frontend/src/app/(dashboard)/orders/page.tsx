'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';
import type { Order } from '@/lib/types';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  'in-service': 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  'in-service': 'Em atendimento',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

const PAYMENT_LABELS: Record<string, string> = {
  paid: 'Pago',
  unpaid: 'Não pago',
  partial: 'Parcial',
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);

  async function load() {
    const { data } = await api.get('/orders', { params: { per_page: 100 } });
    setOrders(data.orders);
  }

  useEffect(() => {
    load();
  }, []);

  async function updateStatus(id: number, status: string) {
    const reason = status === 'cancelled' ? (prompt('Motivo do cancelamento (opcional)') || undefined) : undefined;
    try {
      await api.patch(`/orders/${id}/status`, { status, reason });
      toast.success(status === 'cancelled' ? 'Comanda cancelada' : 'Atendimento iniciado');
      setSelected(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Falha ao atualizar');
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Pedidos</h1>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--secondary)] text-left">
            <tr>
              <th className="p-3">Comanda nº</th>
              <th className="p-3">Cliente</th>
              <th className="p-3">Profissional</th>
              <th className="p-3">Total</th>
              <th className="p-3">Status</th>
              <th className="p-3">Criado em</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-[var(--border)] hover:bg-[var(--secondary)] cursor-pointer" onClick={() => setSelected(o)}>
                <td className="p-3 font-medium">{o.order_number}</td>
                <td className="p-3">{o.customer?.name || '—'}</td>
                <td className="p-3">{o.stylist?.name || '—'}</td>
                <td className="p-3">{formatCurrency(o.total)}</td>
                <td className="p-3">
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[o.status])}>{STATUS_LABELS[o.status] || o.status}</span>
                </td>
                <td className="p-3 text-[var(--muted-foreground)]">{new Date(o.created_at).toLocaleString('pt-BR')}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-[var(--muted-foreground)]">Nenhuma comanda ainda</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.order_number || ''}>
        {selected && (
          <div className="space-y-3">
            <div className="space-y-1 text-sm">
              {selected.items?.map((item) => (
                <div key={item.id} className="flex justify-between">
                  <span>{item.product_name} × {item.quantity}</span>
                  <span>{formatCurrency(item.total)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-[var(--border)] pt-2 flex justify-between font-semibold">
              <span>Total</span>
              <span>{formatCurrency(selected.total)}</span>
            </div>
            <div className="text-sm text-[var(--muted-foreground)]">
              Pagamento: {PAYMENT_LABELS[selected.bill?.payment_status || 'unpaid'] || selected.bill?.payment_status || 'Não pago'}
            </div>
            <div className="flex gap-2">
              {selected.status === 'pending' && (
                <Button variant="outline" className="flex-1" onClick={() => updateStatus(selected.id, 'in-service')}>
                  Iniciar atendimento
                </Button>
              )}
              {['pending', 'in-service'].includes(selected.status) && (
                <Button variant="destructive" className="flex-1" onClick={() => updateStatus(selected.id, 'cancelled')}>
                  Cancelar
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}