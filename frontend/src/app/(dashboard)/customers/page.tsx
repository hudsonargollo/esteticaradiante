'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import type { Customer } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '' });

  async function load(q?: string) {
    const { data } = await api.get('/customers', { params: q ? { search: q } : {} });
    setCustomers(data.data);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search || undefined), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/customers', form);
      toast.success('Customer added');
      setOpen(false);
      setForm({ name: '', phone: '', email: '', address: '' });
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.response?.data?.error || 'Save failed');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Customers</h1>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add customer
        </Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--muted-foreground)]" />
        <Input placeholder="Search name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--secondary)] text-left">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Visits</th>
              <th className="p-3">Total spent</th>
              <th className="p-3">Loyalty points</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t border-[var(--border)] hover:bg-[var(--secondary)]">
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3">{c.phone || '—'}</td>
                <td className="p-3">{c.visits_count ?? 0}</td>
                <td className="p-3">{formatCurrency(c.total_spent || 0)}</td>
                <td className="p-3">{c.loyalty_points}</td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-[var(--muted-foreground)]">No customers yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add customer">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <Button type="submit" className="w-full">Create customer</Button>
        </form>
      </Modal>
    </div>
  );
}
