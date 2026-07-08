'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import type { StaffMember } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';

const EMPTY_FORM = { name: '', email: '', password: '', role: 'cashier', pin: '' };

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  async function load() {
    const { data } = await api.get('/staff');
    setStaff(data.staff);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/staff', form);
      toast.success('Staff member added');
      setOpen(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Save failed');
    }
  }

  async function toggleActive(member: StaffMember) {
    if (member.is_active === 1) {
      await api.delete(`/staff/${member.id}`);
    } else {
      await api.put(`/staff/${member.id}`, { is_active: true });
    }
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Staff</h1>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add staff
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--secondary)] text-left">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Role</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className="border-t border-[var(--border)] hover:bg-[var(--secondary)]">
                <td className="p-3 font-medium">{s.name}</td>
                <td className="p-3">{s.email || '—'}</td>
                <td className="p-3 capitalize">{s.role}</td>
                <td className="p-3">{s.is_active === 1 ? 'Active' : 'Inactive'}</td>
                <td className="p-3 text-right">
                  <button className="text-sm underline" onClick={() => toggleActive(s)}>
                    {s.is_active === 1 ? 'Deactivate' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add staff">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} />
          </div>
          <div>
            <Label>Role</Label>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="stylist">Stylist</option>
              <option value="cashier">Cashier</option>
              <option value="manager">Manager</option>
              <option value="owner">Owner</option>
            </Select>
          </div>
          <div>
            <Label>PIN (optional, for discount overrides)</Label>
            <Input value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} maxLength={6} />
          </div>
          <Button type="submit" className="w-full">Create staff member</Button>
        </form>
      </Modal>
    </div>
  );
}
