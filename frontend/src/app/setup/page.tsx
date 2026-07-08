'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import toast from 'react-hot-toast';

export default function SetupPage() {
  const { setup } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', business_name: '' });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await setup(form);
      toast.success('Store set up successfully');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Setup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6">
          <h1 className="text-xl font-semibold mb-1">Welcome to FloSalon</h1>
          <p className="text-sm text-[var(--muted-foreground)] mb-6">Create the owner account to get started. No other setup needed.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="business_name">Salon name</Label>
              <Input id="business_name" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} required autoFocus />
            </div>
            <div>
              <Label htmlFor="name">Your name</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Setting up...' : 'Create store'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
