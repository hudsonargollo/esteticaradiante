'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Summary {
  orders: { count: number; total: number };
  bills: { count: number; total: number; collected: number };
  customers: { new: number };
}

interface TopService {
  product_name: string;
  quantity: number;
  revenue: number;
}

interface StaffPerf {
  id: string;
  name: string;
  services_performed: number;
  total_sales: number;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [topServices, setTopServices] = useState<TopService[]>([]);
  const [staffPerf, setStaffPerf] = useState<StaffPerf[]>([]);
  const [runningTickets, setRunningTickets] = useState(0);

  useEffect(() => {
    api.get('/reports/summary').then((res) => setSummary(res.data.summary));
    api.get('/reports/top-services').then((res) => setTopServices(res.data.topServices));
    api.get('/reports/staff-performance').then((res) => setStaffPerf(res.data.performance));
    api.get('/reports/daily-stats').then((res) => setRunningTickets(res.data.runningOrders));
  }, []);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Today's sales" value={formatCurrency(summary?.bills.collected || 0)} />
        <StatCard label="Tickets" value={String(summary?.orders.count ?? '—')} />
        <StatCard label="In service now" value={String(runningTickets)} />
        <StatCard label="New clients" value={String(summary?.customers.new ?? '—')} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Top services today</CardTitle>
          </CardHeader>
          <CardContent>
            {topServices.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">No sales yet today</p>}
            <div className="space-y-2">
              {topServices.map((s) => (
                <div key={s.product_name} className="flex justify-between text-sm">
                  <span>{s.product_name} × {s.quantity}</span>
                  <span className="font-medium">{formatCurrency(s.revenue)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Staff performance today</CardTitle>
          </CardHeader>
          <CardContent>
            {staffPerf.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">No stylists on record</p>}
            <div className="space-y-2">
              {staffPerf.map((s) => (
                <div key={s.id} className="flex justify-between text-sm">
                  <span>{s.name} ({s.services_performed})</span>
                  <span className="font-medium">{formatCurrency(s.total_sales)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-sm text-[var(--muted-foreground)]">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
