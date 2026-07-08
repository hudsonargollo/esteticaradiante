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
    const reason = status === 'cancelled' ? (prompt('Reason for cancellation (optional)') || undefined) : undefined;
    try {
      await api.patch(`/orders/${id}/status`, { status, reason });
      toast.success(status === 'cancelled' ? 'Ticket cancelled' : 'Service started');
      setSelected(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Update failed');
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Orders</h1>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--secondary)] text-left">
            <tr>
              <th className="p-3">Ticket #</th>
              <th className="p-3">Client</th>
              <th className="p-3">Stylist</th>
              <th className="p-3">Total</th>
              <th className="p-3">Status</th>
              <th className="p-3">Created</th>
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
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[o.status])}>{o.status}</span>
                </td>
                <td className="p-3 text-[var(--muted-foreground)]">{new Date(o.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-[var(--muted-foreground)]">No tickets yet</td>
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
              Payment: {selected.bill?.payment_status || 'unpaid'}
            </div>
            <div className="flex gap-2">
              {selected.status === 'pending' && (
                <Button variant="outline" className="flex-1" onClick={() => updateStatus(selected.id, 'in-service')}>
                  Start service
                </Button>
              )}
              {['pending', 'in-service'].includes(selected.status) && (
                <Button variant="destructive" className="flex-1" onClick={() => updateStatus(selected.id, 'cancelled')}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
